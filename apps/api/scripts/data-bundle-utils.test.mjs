import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import {
  DATA_BUNDLE_MANIFEST,
  DATA_BUNDLE_MANIFEST_SHA256,
  verifyDataBundle,
} from './data-bundle-utils.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.dirname(SCRIPT_DIR);
const BACKUP_SCRIPT = path.join(SCRIPT_DIR, 'backup-data-bundle.mjs');
const VERIFY_SCRIPT = path.join(SCRIPT_DIR, 'verify-data-bundle.mjs');
const RESTORE_SCRIPT = path.join(SCRIPT_DIR, 'restore-data-bundle.mjs');

const makeTempDir = (label) => fs.mkdtempSync(path.join(os.tmpdir(), `teacher-notebook-${label}-`));

const createDataFixture = (root, {
  rowValue = '원본 데이터',
  withAssets = true,
  createExistingBundle = false,
} = {}) => {
  fs.mkdirSync(path.join(root, 'uploads'), { recursive: true });
  fs.mkdirSync(path.join(root, 'student-photos'), { recursive: true });

  const databasePath = path.join(root, 'local.db');
  const database = new Database(databasePath);
  try {
    assert.equal(database.pragma('journal_mode = WAL', { simple: true }), 'wal');
    database.exec('CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
    database.prepare('INSERT INTO sample (value) VALUES (?)').run(rowValue);
    database.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    database.close();
  }

  if (withAssets) {
    const uploadPath = path.join(root, 'uploads', '교사 자료', '상담 기록 한글.txt');
    const photoPath = path.join(root, 'student-photos', '1', '홍길동 사진.jpg');
    fs.mkdirSync(path.dirname(uploadPath), { recursive: true });
    fs.mkdirSync(path.dirname(photoPath), { recursive: true });
    fs.writeFileSync(uploadPath, '한글 첨부파일', 'utf8');
    fs.writeFileSync(photoPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  }

  if (createExistingBundle) {
    const decoy = path.join(root, 'backups', 'data-bundles', 'existing-bundle', '재귀포함금지.txt');
    fs.mkdirSync(path.dirname(decoy), { recursive: true });
    fs.writeFileSync(decoy, 'must not be included', 'utf8');
  }
  return databasePath;
};

const parseLastJsonLine = (stdout) => {
  const lines = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    try {
      return JSON.parse(line);
    } catch {
      // Continue to the final machine-readable status line.
    }
  }
  throw new Error(`No JSON status line found:\n${stdout}`);
};

const runScript = (scriptPath, args) => {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: API_DIR,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${path.basename(scriptPath)} failed\n${result.stdout}\n${result.stderr}`);
  return parseLastJsonLine(result.stdout);
};

const listRelativeFiles = (root) => {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      if (entry.isFile()) files.push(path.relative(root, absolutePath).split(path.sep).join('/'));
    }
  };
  visit(root);
  return files.sort();
};

const rewriteManifestChecksum = (bundleRoot) => {
  const manifestPath = path.join(bundleRoot, DATA_BUNDLE_MANIFEST);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
  fs.writeFileSync(
    path.join(bundleRoot, DATA_BUNDLE_MANIFEST_SHA256),
    `${hash}  ${DATA_BUNDLE_MANIFEST}\n`,
    'utf8',
  );
};

test('default DATA_DIR output handles WAL databases without metadata or self-inclusion', async () => {
  const dataDir = makeTempDir('bundle-default');
  try {
    createDataFixture(dataDir, { createExistingBundle: true });
    const backup = runScript(BACKUP_SCRIPT, ['--data-dir', dataDir, '--label', 'default-root']);
    const expectedRoot = path.join(dataDir, 'backups', 'data-bundles');
    assert.equal(path.relative(expectedRoot, backup.bundle).startsWith('..'), false);

    const firstVerification = runScript(VERIFY_SCRIPT, ['--bundle', backup.bundle]);
    const secondVerification = await verifyDataBundle(backup.bundle);
    assert.equal(firstVerification.files, 4);
    assert.equal(secondVerification.files, 4);

    const files = listRelativeFiles(backup.bundle);
    assert.deepEqual(files, [
      'database/local.db.sqlite3',
      'database/local.db.sqlite3.manifest.json',
      'manifest.json',
      'manifest.sha256',
      'student-photos/1/홍길동 사진.jpg',
      'uploads/교사 자료/상담 기록 한글.txt',
    ]);
    assert.equal(files.some((entry) => entry.endsWith('-wal') || entry.endsWith('-shm')), false);
    assert.equal(files.some((entry) => entry.includes('existing-bundle')), false);
    assert.equal(files.some((entry) => entry.includes('.bundle-')), false);
    assert.equal(fs.readFileSync(path.join(backup.bundle, 'uploads', '교사 자료', '상담 기록 한글.txt'), 'utf8'), '한글 첨부파일');
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('explicit output root inside DATA_DIR handles an empty WAL asset set repeatedly', async () => {
  const dataDir = makeTempDir('bundle-internal-empty');
  try {
    createDataFixture(dataDir, { withAssets: false });
    const outputRoot = path.join(dataDir, 'bundle-test');
    const backup = runScript(BACKUP_SCRIPT, [
      '--data-dir', dataDir,
      '--output-root', outputRoot,
      '--label', 'dry-run',
    ]);
    assert.equal(backup.files, 2);
    assert.equal((await verifyDataBundle(backup.bundle)).files, 2);
    assert.equal((await verifyDataBundle(backup.bundle)).files, 2);
    assert.deepEqual(listRelativeFiles(backup.bundle), [
      'database/local.db.sqlite3',
      'database/local.db.sqlite3.manifest.json',
      'manifest.json',
      'manifest.sha256',
    ]);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('explicit external output root preserves DB, uploads, photos, and Korean names', async () => {
  const dataDir = makeTempDir('bundle-source');
  const outputRoot = makeTempDir('bundle-external');
  try {
    createDataFixture(dataDir);
    const backup = runScript(BACKUP_SCRIPT, [
      '--data-dir', dataDir,
      '--output-root', outputRoot,
      '--label', 'external-root',
    ]);
    assert.equal(path.dirname(backup.bundle), outputRoot);
    const verification = await verifyDataBundle(backup.bundle);
    assert.equal(verification.database.tableCounts.sample, 1);
    assert.deepEqual(verification.assetRoots, {
      uploads: { files: 1, bytes: Buffer.byteLength('한글 첨부파일') },
      studentPhotos: { files: 1, bytes: 4 },
    });
    assert.equal(fs.existsSync(path.join(backup.bundle, 'uploads', '교사 자료', '상담 기록 한글.txt')), true);
    assert.equal(fs.existsSync(path.join(backup.bundle, 'student-photos', '1', '홍길동 사진.jpg')), true);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('verification rejects payload tampering, traversal manifests, and symbolic links', async () => {
  const dataDir = makeTempDir('bundle-security-source');
  const outputRoot = makeTempDir('bundle-security-output');
  const clonesRoot = makeTempDir('bundle-security-clones');
  try {
    createDataFixture(dataDir);
    const backup = runScript(BACKUP_SCRIPT, [
      '--data-dir', dataDir,
      '--output-root', outputRoot,
      '--label', 'security',
    ]);

    const tamperedBundle = path.join(clonesRoot, 'tampered');
    fs.cpSync(backup.bundle, tamperedBundle, { recursive: true, errorOnExist: true });
    fs.appendFileSync(path.join(tamperedBundle, 'uploads', '교사 자료', '상담 기록 한글.txt'), '변조', 'utf8');
    await assert.rejects(() => verifyDataBundle(tamperedBundle), /size mismatch|SHA-256 mismatch/);

    const traversalBundle = path.join(clonesRoot, 'traversal');
    fs.cpSync(backup.bundle, traversalBundle, { recursive: true, errorOnExist: true });
    const traversalManifestPath = path.join(traversalBundle, DATA_BUNDLE_MANIFEST);
    const traversalManifest = JSON.parse(fs.readFileSync(traversalManifestPath, 'utf8'));
    traversalManifest.files[0].path = '../outside';
    fs.writeFileSync(traversalManifestPath, `${JSON.stringify(traversalManifest, null, 2)}\n`, 'utf8');
    rewriteManifestChecksum(traversalBundle);
    await assert.rejects(() => verifyDataBundle(traversalBundle), /Unsafe bundle relative path/);

    const symlinkBundle = path.join(clonesRoot, 'symlink');
    const linkedUploads = path.join(clonesRoot, 'linked-uploads');
    fs.cpSync(backup.bundle, symlinkBundle, { recursive: true, errorOnExist: true });
    fs.cpSync(path.join(backup.bundle, 'uploads'), linkedUploads, { recursive: true, errorOnExist: true });
    fs.rmSync(path.join(symlinkBundle, 'uploads'), { recursive: true, force: true });
    fs.symlinkSync(linkedUploads, path.join(symlinkBundle, 'uploads'), 'junction');
    await assert.rejects(() => verifyDataBundle(symlinkBundle), /Symbolic links are not allowed/);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(outputRoot, { recursive: true, force: true });
    fs.rmSync(clonesRoot, { recursive: true, force: true });
  }
});

test('restore wrapper roundtrips DB and assets while retaining a verified safety bundle', async () => {
  const sourceDataDir = makeTempDir('bundle-restore-source');
  const targetDataDir = makeTempDir('bundle-restore-target');
  const outputRoot = makeTempDir('bundle-restore-output');
  const safetyRoot = makeTempDir('bundle-restore-safety');
  const safetyInspectionRoot = makeTempDir('bundle-restore-inspection');
  try {
    createDataFixture(sourceDataDir, { rowValue: '복원할 데이터' });
    createDataFixture(targetDataDir, { rowValue: '교체 전 데이터' });
    fs.writeFileSync(path.join(targetDataDir, 'uploads', '기존 파일.txt'), 'old', 'utf8');

    const backup = runScript(BACKUP_SCRIPT, [
      '--data-dir', sourceDataDir,
      '--output-root', outputRoot,
      '--label', 'roundtrip',
    ]);
    const restored = runScript(RESTORE_SCRIPT, [
      '--confirm-restore',
      '--bundle', backup.bundle,
      '--target-data-dir', targetDataDir,
      '--safety-backup-root', safetyRoot,
    ]);

    const restoredDb = new Database(path.join(targetDataDir, 'local.db'), { readonly: true, fileMustExist: true });
    try {
      assert.equal(restoredDb.prepare('SELECT value FROM sample').get().value, '복원할 데이터');
    } finally {
      restoredDb.close();
    }
    assert.equal(fs.existsSync(path.join(targetDataDir, 'uploads', '교사 자료', '상담 기록 한글.txt')), true);
    assert.equal(fs.existsSync(path.join(targetDataDir, 'student-photos', '1', '홍길동 사진.jpg')), true);
    assert.equal(fs.existsSync(path.join(targetDataDir, 'uploads', '기존 파일.txt')), false);

    const safetyVerification = await verifyDataBundle(restored.safetyBackup);
    assert.equal(safetyVerification.database.tableCounts.sample, 1);
    const safetyInspectionPath = path.join(safetyInspectionRoot, 'local.db');
    fs.copyFileSync(
      path.join(restored.safetyBackup, safetyVerification.manifest.database.relativePath),
      safetyInspectionPath,
    );
    const safetyDb = new Database(safetyInspectionPath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(safetyDb.prepare('SELECT value FROM sample').get().value, '교체 전 데이터');
    } finally {
      safetyDb.close();
    }
  } finally {
    fs.rmSync(sourceDataDir, { recursive: true, force: true });
    fs.rmSync(targetDataDir, { recursive: true, force: true });
    fs.rmSync(outputRoot, { recursive: true, force: true });
    fs.rmSync(safetyRoot, { recursive: true, force: true });
    fs.rmSync(safetyInspectionRoot, { recursive: true, force: true });
  }
});
