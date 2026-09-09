import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  UPLOAD_POLICIES,
  assertUploadCapacity,
  buildContentDisposition,
  getOwnerUploadDirectory,
  normalizeUploadedOriginalName,
  resolveStoredUploadPath,
  sanitizeOriginalFilename,
  toStorageKey,
  validateUploadContent,
  validateUploadMetadata,
} from './uploadAssets.js';

const withTempDirectory = (callback) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-notebook-upload-'));
  try {
    return callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
};

test('normalizes UTF-8 Korean filenames received through latin1 multipart decoding', () => {
  const expected = '상담기록 1차.pdf';
  const multipartName = Buffer.from(expected, 'utf8').toString('latin1');
  assert.equal(normalizeUploadedOriginalName({ originalname: multipartName }), expected);
});

test('sanitizes path and control characters without losing Korean or English text', () => {
  assert.equal(sanitizeOriginalFilename('../상담\r\nreport.pdf'), '상담report.pdf');
  assert.equal(sanitizeOriginalFilename('..\\..\\report.xlsx'), 'report.xlsx');
});

test('builds a safe RFC 5987 Content-Disposition header', () => {
  const header = buildContentDisposition('학생 상담기록.pdf');
  assert.match(header, /^attachment; filename="/);
  assert.match(header, /filename\*=UTF-8''%ED%95%99%EC%83%9D/);
  assert.doesNotMatch(header, /[\r\n]/);
});

test('rejects executable extensions and photo MIME mismatches', () => {
  assert.throws(
    () => validateUploadMetadata({ originalname: 'payload.exe', mimetype: 'application/octet-stream' }, 'library'),
    (error) => error.code === 'UNSUPPORTED_EXTENSION' && error.statusCode === 415,
  );
  assert.throws(
    () => validateUploadMetadata({ originalname: 'photo.jpg', mimetype: 'text/plain' }, 'photo'),
    (error) => error.code === 'UNSUPPORTED_MIME_TYPE' && error.statusCode === 415,
  );
});

test('validates image signatures and blocks disguised executable content', () => withTempDirectory((directory) => {
  const pngPath = path.join(directory, 'photo.png');
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  fs.writeFileSync(pngPath, pngHeader);
  assert.equal(validateUploadContent({
    originalname: '학생.png',
    mimetype: 'image/png',
    path: pngPath,
    size: pngHeader.length,
  }, 'photo').extension, '.png');

  const fakePdfPath = path.join(directory, 'fake.pdf');
  fs.writeFileSync(fakePdfPath, Buffer.from([0x4d, 0x5a, 0x90, 0x00]));
  assert.throws(
    () => validateUploadContent({
      originalname: 'fake.pdf',
      mimetype: 'application/pdf',
      path: fakePdfPath,
      size: 4,
    }, 'attachment'),
    (error) => error.code === 'EXECUTABLE_CONTENT',
  );
}));

test('resolves new relative keys and relocated legacy absolute paths inside the storage root', () => withTempDirectory((root) => {
  const ownerDirectory = getOwnerUploadDirectory(root, 7);
  fs.mkdirSync(ownerDirectory, { recursive: true });
  const newFile = path.join(ownerDirectory, 'new.pdf');
  fs.writeFileSync(newFile, '%PDF-new');

  const storageKey = toStorageKey(root, newFile);
  assert.equal(storageKey.replaceAll('\\', '/'), 'users/7/new.pdf');
  assert.equal(resolveStoredUploadPath({
    rootDir: root,
    ownerId: 7,
    storedPath: storageKey,
  })?.absolutePath, newFile);

  const legacyFile = path.join(root, 'legacy.pdf');
  fs.writeFileSync(legacyFile, '%PDF-legacy');
  assert.equal(resolveStoredUploadPath({
    rootDir: root,
    ownerId: 7,
    storedPath: '/app/apps/api/.data/uploads/legacy.pdf',
    storedUrl: '/uploads/legacy.pdf',
  })?.absolutePath, legacyFile);
}));

test('does not resolve another owner path or traversal outside the storage root', () => withTempDirectory((root) => {
  const otherDirectory = getOwnerUploadDirectory(root, 8);
  fs.mkdirSync(otherDirectory, { recursive: true });
  const otherFile = path.join(otherDirectory, 'private.pdf');
  fs.writeFileSync(otherFile, '%PDF-private');

  assert.equal(resolveStoredUploadPath({
    rootDir: root,
    ownerId: 7,
    storedPath: toStorageKey(root, otherFile),
  }), null);
  assert.equal(resolveStoredUploadPath({
    rootDir: root,
    ownerId: 7,
    storedUrl: '/uploads/../private.pdf',
  }), null);
}));

test('enforces per-file and per-owner quota limits', () => {
  assert.throws(
    () => assertUploadCapacity({
      profile: 'attachment',
      existingBytes: UPLOAD_POLICIES.attachment.maxOwnerBytes,
      incomingBytes: 1,
    }),
    (error) => error.code === 'USER_QUOTA_EXCEEDED' && error.statusCode === 413,
  );
  assert.throws(
    () => assertUploadCapacity({
      profile: 'photo',
      incomingBytes: UPLOAD_POLICIES.photo.maxFileSize + (3 * 1024 * 1024),
    }),
    (error) => error.code === 'FILE_TOO_LARGE' && error.statusCode === 413,
  );
});
