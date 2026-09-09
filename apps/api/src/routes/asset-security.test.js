import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import express from 'express';

import { registerPhase1Routes } from './phase1-routes.js';
import { registerPhase2Routes } from './phase2-routes.js';
import {
  createDiskUpload,
  normalizeStudentPhotoUrlForUser,
  normalizeUploadedOriginalName,
  removeStudentPhotoFileByUrl,
} from '../utils/uploadAssets.js';

const withServer = async (app, callback) => {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const listFilesRecursively = (directory) => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? listFilesRecursively(target) : [target];
  });
};

const makeAuth = () => (req, res, next) => {
  const token = String(req.headers.authorization || '');
  if (token === 'Bearer owner-1') {
    req.user = { id: 1, username: 'owner1' };
    return next();
  }
  if (token === 'Bearer owner-2') {
    req.user = { id: 2, username: 'owner2' };
    return next();
  }
  return res.status(401).json({ error: 'unauthorized' });
};

const makePhase1Store = () => {
  const rows = new Map();
  return {
    rows,
    getSettings: () => ({}),
    putSettings: () => null,
    putResourceLinks: () => null,
    listTaskMemos: () => [],
    createTaskMemo: () => ({}),
    updateTaskMemo: () => null,
    deleteTaskMemo: () => null,
    listFiles: (ownerId, { includeAttachments = false } = {}) => [...rows.values()]
      .filter((row) => row.owner_id === ownerId && (includeAttachments || row.scope === 'library')),
    getFile: (ownerId, id) => {
      const row = rows.get(id);
      return row?.owner_id === ownerId ? row : null;
    },
    createFile: (ownerId, row) => {
      const saved = { ...row, owner_id: ownerId };
      rows.set(saved.id, saved);
      return saved;
    },
    updateFileName: (ownerId, id, name) => {
      const row = rows.get(id);
      if (!row || row.owner_id !== ownerId) return null;
      const saved = { ...row, name };
      rows.set(id, saved);
      return saved;
    },
    deleteFile: (ownerId, id) => {
      const row = rows.get(id);
      if (!row || row.owner_id !== ownerId) return null;
      rows.delete(id);
      return row;
    },
    listActivityLogs: () => [],
    createActivityLog: () => ({}),
    deleteActivityLog: () => null,
    deleteAllActivityLogs: () => null,
  };
};

test('file routes require ownership and preserve Korean and English download filenames', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-notebook-files-'));
  try {
    const app = express();
    app.use(express.json());
    const phase1Store = makePhase1Store();
    registerPhase1Routes({
      app,
      auth: makeAuth(),
      express,
      fs,
      UPLOAD_DIR: root,
      phase1Store,
      createDiskUpload,
      normalizeUploadedOriginalName,
    });

    await withServer(app, async (baseUrl) => {
      const uploadAndDownload = async ({ filename, scope }) => {
        const form = new FormData();
        form.append('file', new Blob([Buffer.from('%PDF-1.4\nsecure')], { type: 'application/pdf' }), filename);
        const uploadResponse = await fetch(`${baseUrl}/api/files/upload?scope=${scope}`, {
          method: 'POST',
          headers: { Authorization: 'Bearer owner-1' },
          body: form,
        });
        assert.equal(uploadResponse.status, 201);
        const uploaded = await uploadResponse.json();
        assert.equal(uploaded.name, filename);
        assert.equal(phase1Store.rows.get(uploaded.id)?.name, filename);
        assert.equal(uploaded.path, undefined);
        assert.equal(uploaded.url, `/api/files/${uploaded.id}/download`);

        assert.equal((await fetch(`${baseUrl}${uploaded.url}`)).status, 401);
        assert.equal((await fetch(`${baseUrl}${uploaded.url}`, { headers: { Authorization: 'Bearer owner-2' } })).status, 404);

        const download = await fetch(`${baseUrl}${uploaded.url}`, { headers: { Authorization: 'Bearer owner-1' } });
        assert.equal(download.status, 200);
        assert.equal(await download.text(), '%PDF-1.4\nsecure');
        assert.match(download.headers.get('content-disposition') || '', new RegExp(`filename\\*=UTF-8''${encodeURIComponent(filename)}`));
        assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
      };

      await uploadAndDownload({ filename: '학생 상담기록.pdf', scope: 'attachment' });
      await uploadAndDownload({ filename: 'English Report 2026.pdf', scope: 'library' });
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('file upload removes the physical file when the database row cannot be saved', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-notebook-file-rollback-'));
  try {
    const app = express();
    app.use(express.json());
    const phase1Store = makePhase1Store();
    phase1Store.createFile = () => { throw new Error('forced database failure'); };
    registerPhase1Routes({
      app,
      auth: makeAuth(),
      express,
      fs,
      UPLOAD_DIR: root,
      phase1Store,
      createDiskUpload,
      normalizeUploadedOriginalName,
    });

    await withServer(app, async (baseUrl) => {
      for (const [scope, filename] of [['attachment', '실패 rollback.pdf'], ['library', 'Failed resource.pdf']]) {
        const form = new FormData();
        form.append('file', new Blob([Buffer.from('%PDF-1.4\nrollback')], { type: 'application/pdf' }), filename);
        const response = await fetch(`${baseUrl}/api/files/upload?scope=${scope}`, {
          method: 'POST',
          headers: { Authorization: 'Bearer owner-1' },
          body: form,
        });
        assert.equal(response.status, 500);
        assert.match((await response.json()).error, /forced database failure/);
        assert.deepEqual(listFilesRecursively(root), []);
      }
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const makePhase2Store = () => {
  const students = new Map([
    [1, { id: 1, owner_id: 1, name: '학생', photo_url: '', photo_updated_at: '' }],
  ]);
  const ownedStudent = (ownerId, studentId) => {
    const row = students.get(Number(studentId));
    return row?.owner_id === ownerId ? row : null;
  };
  return {
    students,
    listStudents: (ownerId) => [...students.values()].filter((row) => row.owner_id === ownerId),
    getStudent: ownedStudent,
    createStudent: () => ({}),
    bulkUpsertStudents: () => [],
    updateStudent: () => null,
    deleteStudent: () => null,
    findStudentBySlug: () => null,
    listNotes: () => [],
    createNote: () => ({}),
    updateNote: () => null,
    deleteNote: () => null,
    listSchedules: () => [],
    createSchedule: () => ({}),
    updateSchedule: () => null,
    toggleSchedule: () => null,
    deleteSchedule: () => null,
    updateStudentPhoto: (ownerId, studentId, url, updatedAt) => {
      const row = ownedStudent(ownerId, studentId);
      if (!row) return null;
      const saved = { ...row, photo_url: url, photo_updated_at: updatedAt };
      students.set(Number(studentId), saved);
      return saved;
    },
    syncStudentPhotos: () => [],
    clearStudentPhotoById: () => null,
    clearStudentPhotoByUrl: () => null,
  };
};

test('student photo routes require the owning session and return no-sniff inline images', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-notebook-photos-'));
  try {
    const app = express();
    app.use(express.json());
    const phase2Store = makePhase2Store();
    registerPhase2Routes({
      app,
      auth: makeAuth(),
      express,
      fs,
      path,
      STUDENT_PHOTO_DIR: root,
      phase2Store,
      phase3Store: { removeStudentFromClubs: () => null },
      createDiskUpload,
      normalizeStudentPhotoUrlForUser,
      normalizeUploadedOriginalName,
      removeStudentPhotoFileByUrl: (ownerId, rawUrl) => removeStudentPhotoFileByUrl(ownerId, rawUrl),
    });

    await withServer(app, async (baseUrl) => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const form = new FormData();
      form.append('studentId', '1');
      form.append('file', new Blob([png], { type: 'image/png' }), '학생사진.png');
      const uploadResponse = await fetch(`${baseUrl}/api/student-photos/upload`, {
        method: 'POST',
        headers: { Authorization: 'Bearer owner-1' },
        body: form,
      });
      assert.equal(uploadResponse.status, 201);
      const uploaded = await uploadResponse.json();
      assert.equal(uploaded.url, '/api/student-photos/1');

      assert.equal((await fetch(`${baseUrl}${uploaded.url}`)).status, 401);
      assert.equal((await fetch(`${baseUrl}${uploaded.url}`, { headers: { Authorization: 'Bearer owner-2' } })).status, 404);

      const photoResponse = await fetch(`${baseUrl}${uploaded.url}`, { headers: { Authorization: 'Bearer owner-1' } });
      assert.equal(photoResponse.status, 200);
      assert.equal(photoResponse.headers.get('x-content-type-options'), 'nosniff');
      assert.match(photoResponse.headers.get('content-disposition') || '', /^inline;/);
      assert.deepEqual(Buffer.from(await photoResponse.arrayBuffer()), png);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('student photo upload removes the physical file when the student update fails', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-notebook-photo-rollback-'));
  try {
    const app = express();
    app.use(express.json());
    const phase2Store = makePhase2Store();
    phase2Store.updateStudentPhoto = () => { throw new Error('forced photo database failure'); };
    registerPhase2Routes({
      app,
      auth: makeAuth(),
      express,
      fs,
      path,
      STUDENT_PHOTO_DIR: root,
      phase2Store,
      phase3Store: { removeStudentFromClubs: () => null },
      createDiskUpload,
      normalizeStudentPhotoUrlForUser,
      normalizeUploadedOriginalName,
      removeStudentPhotoFileByUrl,
    });

    await withServer(app, async (baseUrl) => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const form = new FormData();
      form.append('studentId', '1');
      form.append('file', new Blob([png], { type: 'image/png' }), '학생사진.png');
      const response = await fetch(`${baseUrl}/api/student-photos/upload`, {
        method: 'POST',
        headers: { Authorization: 'Bearer owner-1' },
        body: form,
      });
      assert.equal(response.status, 500);
      assert.deepEqual(listFilesRecursively(root), []);
      assert.equal(phase2Store.students.get(1).photo_url, '');
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
