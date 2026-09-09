import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { fileURLToPath } from 'url';
import {
  inspectSqlite,
  sha256File,
  timestampForFile,
  verifyBackup,
  writeJsonAtomic,
} from './sqlite-backup-utils.mjs';

export const DATA_BUNDLE_FORMAT = 'teacher-notebook-data-bundle/v1';
export const DATA_BUNDLE_MANIFEST = 'manifest.json';
export const DATA_BUNDLE_MANIFEST_SHA256 = 'manifest.sha256';

const DATA_BUNDLE_METADATA_FILES = new Set([
  DATA_BUNDLE_MANIFEST,
  DATA_BUNDLE_MANIFEST_SHA256,
]);

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.dirname(SCRIPT_DIR);
const ONLINE_BACKUP_SCRIPT = path.join(SCRIPT_DIR, 'backup-sqlite.mjs');
const MANIFEST_MAX_BYTES = 64 * 1024 * 1024;
const MAX_MANIFEST_FILES = 1_000_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const pathKey = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
const statFingerprint = (stat) => `${stat.size}:${stat.mtimeMs}`;

export const valueAfter = (flag, argv = process.argv) => {
  const index = argv.indexOf(flag);
  return index >= 0 ? String(argv[index + 1] || '') : '';
};

export const sanitizeLabel = (value, fallback = 'manual') => {
  const sanitized = String(value || fallback).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 48);
  return sanitized || fallback;
};

export const isPathInside = (rootPath, candidatePath, { allowRoot = false } = {}) => {
  const root = path.resolve(rootPath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(root, candidate);
  if (!relative) return allowRoot;
  return !relative.startsWith('..') && !path.isAbsolute(relative);
};

export const assertPathInside = (rootPath, candidatePath, label, options = {}) => {
  if (!isPathInside(rootPath, candidatePath, options)) {
    throw new Error(`${label} must stay inside ${path.resolve(rootPath)}: ${path.resolve(candidatePath)}`);
  }
  return path.resolve(candidatePath);
};

export const assertNoSymlinkComponents = (targetPath, { allowMissing = false } = {}) => {
  const resolved = path.resolve(targetPath);
  const parsed = path.parse(resolved);
  const parts = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;

  for (const part of parts) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) {
      if (allowMissing) return resolved;
      throw new Error(`Path does not exist: ${current}`);
    }
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${current}`);
  }
  return resolved;
};

export const assertSafeDirectory = (directoryPath, label, { allowCreate = false } = {}) => {
  const resolved = path.resolve(directoryPath);
  if (resolved === path.parse(resolved).root) throw new Error(`${label} cannot be a filesystem root: ${resolved}`);

  if (!fs.existsSync(resolved)) {
    if (!allowCreate) throw new Error(`${label} not found: ${resolved}`);
    assertNoSymlinkComponents(resolved, { allowMissing: true });
    fs.mkdirSync(resolved, { recursive: true });
  }
  assertNoSymlinkComponents(resolved);
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory()) throw new Error(`${label} is not a directory: ${resolved}`);
  return resolved;
};

export const resolveDataLayout = ({ dataDir, sqlitePath, uploadDir, studentPhotoDir } = {}) => {
  const root = assertSafeDirectory(dataDir, 'DATA_DIR');
  const layout = {
    dataDir: root,
    sqlitePath: path.resolve(sqlitePath || path.join(root, 'local.db')),
    uploadDir: path.resolve(uploadDir || path.join(root, 'uploads')),
    studentPhotoDir: path.resolve(studentPhotoDir || path.join(root, 'student-photos')),
  };

  for (const [label, candidate] of [
    ['SQLite database', layout.sqlitePath],
    ['uploads directory', layout.uploadDir],
    ['student-photos directory', layout.studentPhotoDir],
  ]) {
    assertPathInside(root, candidate, label);
  }

  if (!fs.existsSync(layout.sqlitePath)) throw new Error(`SQLite database not found: ${layout.sqlitePath}`);
  assertNoSymlinkComponents(layout.sqlitePath);
  if (!fs.lstatSync(layout.sqlitePath).isFile()) throw new Error(`SQLite database is not a regular file: ${layout.sqlitePath}`);

  for (const directory of [layout.uploadDir, layout.studentPhotoDir]) {
    if (!fs.existsSync(directory)) continue;
    assertNoSymlinkComponents(directory);
    if (!fs.lstatSync(directory).isDirectory()) throw new Error(`Asset path is not a directory: ${directory}`);
  }

  const realRoot = fs.realpathSync.native(root);
  for (const candidate of [layout.sqlitePath, layout.uploadDir, layout.studentPhotoDir]) {
    if (!fs.existsSync(candidate)) continue;
    const realCandidate = fs.realpathSync.native(candidate);
    assertPathInside(realRoot, realCandidate, 'Resolved runtime path');
  }
  return layout;
};

export const validateManifestRelativePath = (value) => {
  const relativePath = String(value || '');
  if (!relativePath || relativePath.includes('\\') || relativePath.includes('\0')) {
    throw new Error(`Invalid bundle relative path: ${JSON.stringify(relativePath)}`);
  }
  if (path.posix.isAbsolute(relativePath) || path.posix.normalize(relativePath) !== relativePath) {
    throw new Error(`Unsafe bundle relative path: ${relativePath}`);
  }
  const parts = relativePath.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe bundle relative path: ${relativePath}`);
  }
  return relativePath;
};

export const pathFromManifest = (rootPath, relativePath) => {
  const safeRelativePath = validateManifestRelativePath(relativePath);
  const candidate = path.resolve(rootPath, ...safeRelativePath.split('/'));
  return assertPathInside(rootPath, candidate, 'Bundle entry');
};

const walkFiles = (rootPath, relativePrefix = '') => {
  if (!fs.existsSync(rootPath)) return [];
  assertNoSymlinkComponents(rootPath);
  if (!fs.lstatSync(rootPath).isDirectory()) throw new Error(`Expected a directory: ${rootPath}`);

  const output = [];
  const visit = (directoryPath, parentRelative) => {
    const entries = fs.readdirSync(directoryPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const absolutePath = path.join(directoryPath, entry.name);
      const relativePath = parentRelative ? `${parentRelative}/${entry.name}` : entry.name;
      validateManifestRelativePath(relativePath);
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink() || entry.isSymbolicLink()) {
        throw new Error(`Symbolic links are not allowed: ${absolutePath}`);
      }
      if (stat.isDirectory()) {
        visit(absolutePath, relativePath);
      } else if (stat.isFile()) {
        output.push({
          absolutePath,
          relativePath,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          fingerprint: statFingerprint(stat),
        });
      } else {
        throw new Error(`Only regular files and directories are allowed: ${absolutePath}`);
      }
    }
  };

  visit(rootPath, relativePrefix);
  return output;
};

const assertInventoriesEqual = (before, after, label) => {
  const beforeMap = new Map(before.map((entry) => [entry.relativePath, entry.fingerprint]));
  const afterMap = new Map(after.map((entry) => [entry.relativePath, entry.fingerprint]));
  if (beforeMap.size !== afterMap.size) throw new Error(`${label} changed while the bundle was being created`);
  for (const [relativePath, fingerprint] of beforeMap) {
    if (afterMap.get(relativePath) !== fingerprint) {
      throw new Error(`${label} changed while the bundle was being created: ${relativePath}`);
    }
  }
};

const writeTextAtomic = (filePath, content) => {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, content, { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(tempPath, filePath);
};

const copyFileWithHash = async (sourcePath, destinationPath, { sourceRoot, destinationRoot } = {}) => {
  const source = path.resolve(sourcePath);
  const destination = path.resolve(destinationPath);
  if (sourceRoot) assertPathInside(sourceRoot, source, 'Copy source');
  if (destinationRoot) assertPathInside(destinationRoot, destination, 'Copy destination');
  assertNoSymlinkComponents(source);

  const before = fs.lstatSync(source);
  if (!before.isFile()) throw new Error(`Copy source is not a regular file: ${source}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  assertNoSymlinkComponents(path.dirname(destination));
  if (fs.existsSync(destination)) throw new Error(`Copy destination already exists: ${destination}`);

  const hash = crypto.createHash('sha256');
  const hashingTransform = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(
    fs.createReadStream(source),
    hashingTransform,
    fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
  );

  const after = fs.lstatSync(source);
  if (!after.isFile() || statFingerprint(before) !== statFingerprint(after)) {
    throw new Error(`Source file changed while it was being copied: ${source}`);
  }
  const destinationStat = fs.lstatSync(destination);
  if (!destinationStat.isFile() || destinationStat.size !== before.size) {
    throw new Error(`Copied file size mismatch: ${destination}`);
  }
  return { bytes: destinationStat.size, sha256: hash.digest('hex') };
};

const copyAssetRoot = async ({ sourceRoot, bundleRoot, relativeRoot, type }) => {
  const before = walkFiles(sourceRoot, relativeRoot);
  const files = [];
  fs.mkdirSync(pathFromManifest(bundleRoot, relativeRoot), { recursive: true });

  for (const sourceEntry of before) {
    const destinationPath = pathFromManifest(bundleRoot, sourceEntry.relativePath);
    const copied = await copyFileWithHash(sourceEntry.absolutePath, destinationPath, {
      sourceRoot,
      destinationRoot: bundleRoot,
    });
    files.push({
      path: sourceEntry.relativePath,
      bytes: copied.bytes,
      sha256: copied.sha256,
      type,
    });
  }

  const after = walkFiles(sourceRoot, relativeRoot);
  assertInventoriesEqual(before, after, relativeRoot);
  return { sourceInventory: before, files };
};

const parseLastJsonLine = (stdout, label) => {
  const lines = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    try {
      return JSON.parse(line);
    } catch {
      // Keep looking for the final JSON status line.
    }
  }
  throw new Error(`${label} did not return a JSON result`);
};

const createOnlineSqliteBackup = async ({ layout, stagingRoot, workingRoot, label }) => {
  const temporaryBackupDir = path.join(workingRoot, `.db-${process.pid}-${Date.now().toString(36)}`);
  fs.mkdirSync(temporaryBackupDir, { recursive: false });
  try {
    const result = spawnSync(process.execPath, [ONLINE_BACKUP_SCRIPT, '--label', label], {
      cwd: API_DIR,
      env: {
        ...process.env,
        DATA_DIR: layout.dataDir,
        SQLITE_PATH: layout.sqlitePath,
        BACKUP_DIR: temporaryBackupDir,
        BACKUP_RETAIN_COUNT: '1',
        BACKUP_RETENTION_DAYS: '36500',
      },
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.status !== 0) {
      throw new Error(`Online SQLite backup failed\n${result.stdout || ''}\n${result.stderr || ''}`.trim());
    }

    const status = parseLastJsonLine(result.stdout, 'Online SQLite backup');
    if (!status.ok || !status.backup || !status.manifest) throw new Error('Online SQLite backup returned an invalid result');
    const sourceBackup = assertPathInside(temporaryBackupDir, status.backup, 'SQLite backup');
    const sourceManifest = assertPathInside(temporaryBackupDir, status.manifest, 'SQLite backup manifest');
    assertNoSymlinkComponents(sourceBackup);
    assertNoSymlinkComponents(sourceManifest);
    const verification = await verifyBackup(sourceBackup, { fullIntegrity: true });

    const databaseDir = path.join(stagingRoot, 'database');
    fs.mkdirSync(databaseDir, { recursive: false });
    const backupRelativePath = 'database/local.db.sqlite3';
    const manifestRelativePath = 'database/local.db.sqlite3.manifest.json';
    const backupPath = pathFromManifest(stagingRoot, backupRelativePath);
    const manifestPath = pathFromManifest(stagingRoot, manifestRelativePath);
    fs.renameSync(sourceBackup, backupPath);
    const sqliteManifest = JSON.parse(fs.readFileSync(sourceManifest, 'utf8'));
    sqliteManifest.backupFile = path.basename(backupPath);
    writeJsonAtomic(manifestPath, sqliteManifest);
    fs.rmSync(sourceManifest, { force: true });

    return {
      backupPath,
      backupRelativePath,
      manifestPath,
      manifestRelativePath,
      inspection: verification.inspection,
    };
  } finally {
    fs.rmSync(temporaryBackupDir, { recursive: true, force: true });
  }
};

const entryForExistingFile = async (bundleRoot, relativePath, type) => {
  const filePath = pathFromManifest(bundleRoot, relativePath);
  assertNoSymlinkComponents(filePath);
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile()) throw new Error(`Bundle entry is not a regular file: ${filePath}`);
  return { path: relativePath, bytes: stat.size, sha256: await sha256File(filePath), type };
};

const assertUniqueManifestPaths = (files) => {
  const exact = new Set();
  const folded = new Map();
  for (const entry of files) {
    const relativePath = validateManifestRelativePath(entry.path);
    if (exact.has(relativePath)) throw new Error(`Duplicate bundle path: ${relativePath}`);
    exact.add(relativePath);
    const foldedPath = relativePath.toLowerCase();
    const previous = folded.get(foldedPath);
    if (previous && previous !== relativePath) {
      throw new Error(`Case-conflicting bundle paths are not cross-platform safe: ${previous}, ${relativePath}`);
    }
    folded.set(foldedPath, relativePath);
  }
};

const verifyBundledSqlite = async ({
  bundleRoot,
  databaseRelativePath,
  databaseManifestRelativePath,
  databaseEntry,
  databaseManifestEntry,
}) => {
  // Opening a WAL-mode database can create -wal/-shm files even in readonly mode.
  // Verify an isolated copy so verification never mutates the immutable bundle.
  const verificationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-notebook-bundle-verify-'));
  try {
    assertNoSymlinkComponents(verificationRoot);
    const temporaryDatabasePath = path.join(verificationRoot, path.basename(databaseRelativePath));
    const temporaryManifestPath = `${temporaryDatabasePath}.manifest.json`;
    const copiedDatabase = await copyFileWithHash(
      pathFromManifest(bundleRoot, databaseRelativePath),
      temporaryDatabasePath,
      { sourceRoot: bundleRoot, destinationRoot: verificationRoot },
    );
    const copiedManifest = await copyFileWithHash(
      pathFromManifest(bundleRoot, databaseManifestRelativePath),
      temporaryManifestPath,
      { sourceRoot: bundleRoot, destinationRoot: verificationRoot },
    );
    if (
      copiedDatabase.bytes !== databaseEntry.bytes
      || copiedDatabase.sha256 !== databaseEntry.sha256
      || copiedManifest.bytes !== databaseManifestEntry.bytes
      || copiedManifest.sha256 !== databaseManifestEntry.sha256
    ) {
      throw new Error('Bundle database changed while it was being isolated for verification');
    }
    return await verifyBackup(temporaryDatabasePath, { fullIntegrity: true });
  } finally {
    fs.rmSync(verificationRoot, { recursive: true, force: true });
  }
};

export const createDataBundle = async ({
  dataDir,
  sqlitePath,
  uploadDir,
  studentPhotoDir,
  outputRoot,
  label = 'manual',
} = {}) => {
  const layout = resolveDataLayout({ dataDir, sqlitePath, uploadDir, studentPhotoDir });
  const safeLabel = sanitizeLabel(label);
  const destinationRoot = assertSafeDirectory(
    outputRoot || path.join(layout.dataDir, 'backups', 'data-bundles'),
    'Bundle output root',
    { allowCreate: true },
  );
  for (const assetRoot of [layout.uploadDir, layout.studentPhotoDir]) {
    if (isPathInside(assetRoot, destinationRoot, { allowRoot: true })) {
      throw new Error(`Bundle output cannot be inside an asset source: ${destinationRoot}`);
    }
  }

  const stamp = timestampForFile();
  const bundleName = `teacher-notebook-data-${stamp}-${safeLabel}`;
  const finalBundleDir = path.join(destinationRoot, bundleName);
  const stagingRoot = path.join(destinationRoot, `.bundle-${process.pid}-${Date.now().toString(36)}`);
  if (fs.existsSync(finalBundleDir) || fs.existsSync(stagingRoot)) {
    throw new Error(`Bundle destination already exists: ${finalBundleDir}`);
  }
  fs.mkdirSync(stagingRoot, { recursive: false });
  let published = false;

  try {
    const uploads = await copyAssetRoot({
      sourceRoot: layout.uploadDir,
      bundleRoot: stagingRoot,
      relativeRoot: 'uploads',
      type: 'upload',
    });
    const studentPhotos = await copyAssetRoot({
      sourceRoot: layout.studentPhotoDir,
      bundleRoot: stagingRoot,
      relativeRoot: 'student-photos',
      type: 'student-photo',
    });
    const database = await createOnlineSqliteBackup({
      layout,
      stagingRoot,
      workingRoot: destinationRoot,
      label: 'bundle',
    });

    assertInventoriesEqual(uploads.sourceInventory, walkFiles(layout.uploadDir, 'uploads'), 'uploads');
    assertInventoriesEqual(studentPhotos.sourceInventory, walkFiles(layout.studentPhotoDir, 'student-photos'), 'student-photos');

    const files = [
      await entryForExistingFile(stagingRoot, database.backupRelativePath, 'sqlite'),
      await entryForExistingFile(stagingRoot, database.manifestRelativePath, 'sqlite-manifest'),
      ...uploads.files,
      ...studentPhotos.files,
    ].sort((left, right) => left.path.localeCompare(right.path, 'en'));
    assertUniqueManifestPaths(files);

    const sumForType = (type) => {
      const selected = files.filter((entry) => entry.type === type);
      return {
        files: selected.length,
        bytes: selected.reduce((sum, entry) => sum + entry.bytes, 0),
      };
    };
    const manifest = {
      format: DATA_BUNDLE_FORMAT,
      createdAt: new Date().toISOString(),
      label: safeLabel,
      database: {
        relativePath: database.backupRelativePath,
        backupManifestRelativePath: database.manifestRelativePath,
        quickCheck: database.inspection.quickCheck,
        integrityCheck: database.inspection.integrityCheck,
        schemaVersion: database.inspection.schemaVersion,
        userVersion: database.inspection.userVersion,
        tableCounts: database.inspection.tableCounts,
      },
      assetRoots: {
        uploads: sumForType('upload'),
        studentPhotos: sumForType('student-photo'),
      },
      files,
      totals: {
        files: files.length,
        bytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
      },
    };

    const manifestPath = path.join(stagingRoot, DATA_BUNDLE_MANIFEST);
    writeJsonAtomic(manifestPath, manifest);
    const manifestSha256 = await sha256File(manifestPath);
    writeTextAtomic(
      path.join(stagingRoot, DATA_BUNDLE_MANIFEST_SHA256),
      `${manifestSha256}  ${DATA_BUNDLE_MANIFEST}\n`,
    );

    await verifyDataBundle(stagingRoot);
    fs.renameSync(stagingRoot, finalBundleDir);
    published = true;
    const verification = await verifyDataBundle(finalBundleDir);
    return {
      ok: true,
      bundle: finalBundleDir,
      manifest: path.join(finalBundleDir, DATA_BUNDLE_MANIFEST),
      files: verification.files,
      bytes: verification.bytes,
      database: verification.database,
      assetRoots: verification.assetRoots,
    };
  } catch (error) {
    if (fs.existsSync(stagingRoot)) fs.rmSync(stagingRoot, { recursive: true, force: true });
    if (published && fs.existsSync(finalBundleDir)) {
      fs.rmSync(assertPathInside(destinationRoot, finalBundleDir, 'Failed bundle cleanup'), {
        recursive: true,
        force: true,
      });
    }
    throw error;
  }
};

const readBundleManifest = async (bundleRoot) => {
  const manifestPath = path.join(bundleRoot, DATA_BUNDLE_MANIFEST);
  const checksumPath = path.join(bundleRoot, DATA_BUNDLE_MANIFEST_SHA256);
  for (const candidate of [manifestPath, checksumPath]) {
    if (!fs.existsSync(candidate)) throw new Error(`Bundle metadata not found: ${candidate}`);
    assertNoSymlinkComponents(candidate);
    if (!fs.lstatSync(candidate).isFile()) throw new Error(`Bundle metadata is not a regular file: ${candidate}`);
  }
  const manifestStat = fs.statSync(manifestPath);
  if (manifestStat.size > MANIFEST_MAX_BYTES) throw new Error(`Bundle manifest is too large: ${manifestStat.size}`);
  const expectedManifestHash = fs.readFileSync(checksumPath, 'utf8').trim().split(/\s+/)[0]?.toLowerCase();
  if (!SHA256_PATTERN.test(expectedManifestHash || '')) throw new Error('Invalid manifest SHA-256 file');
  const actualManifestHash = await sha256File(manifestPath);
  if (actualManifestHash !== expectedManifestHash) throw new Error('Bundle manifest SHA-256 mismatch');

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid bundle manifest JSON: ${error.message}`);
  }
  if (manifest?.format !== DATA_BUNDLE_FORMAT) throw new Error(`Unsupported data bundle format: ${manifest?.format}`);
  if (!Array.isArray(manifest.files) || manifest.files.length > MAX_MANIFEST_FILES) {
    throw new Error('Bundle manifest has an invalid file list');
  }
  return { manifest, manifestPath, checksumPath, manifestSha256: actualManifestHash };
};

export const verifyDataBundle = async (bundleDir) => {
  const bundleRoot = assertSafeDirectory(bundleDir, 'Data bundle');
  const { manifest, manifestPath, checksumPath, manifestSha256 } = await readBundleManifest(bundleRoot);
  assertUniqueManifestPaths(manifest.files);

  const expected = new Map();
  let totalBytes = 0;
  for (const entry of manifest.files) {
    const relativePath = validateManifestRelativePath(entry.path);
    if (DATA_BUNDLE_METADATA_FILES.has(relativePath)) {
      throw new Error(`Bundle metadata cannot be listed as payload: ${relativePath}`);
    }
    const bytes = Number(entry.bytes);
    const sha256 = String(entry.sha256 || '').toLowerCase();
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error(`Invalid file size in manifest: ${relativePath}`);
    if (!SHA256_PATTERN.test(sha256)) throw new Error(`Invalid file SHA-256 in manifest: ${relativePath}`);
    if (!['sqlite', 'sqlite-manifest', 'upload', 'student-photo'].includes(entry.type)) {
      throw new Error(`Unsupported bundle file type for ${relativePath}: ${entry.type}`);
    }
    expected.set(pathKey(relativePath), { ...entry, path: relativePath, bytes, sha256 });
    totalBytes += bytes;
  }

  const actualFiles = walkFiles(bundleRoot, '')
    .filter((entry) => !DATA_BUNDLE_METADATA_FILES.has(entry.relativePath));
  if (actualFiles.length !== expected.size) {
    throw new Error(`Bundle file-count mismatch: expected ${expected.size}, received ${actualFiles.length}`);
  }
  for (const actual of actualFiles) {
    const entry = expected.get(pathKey(actual.relativePath));
    if (!entry || entry.path !== actual.relativePath) throw new Error(`Unlisted file in data bundle: ${actual.relativePath}`);
    if (entry.bytes !== actual.size) {
      throw new Error(`Bundle file size mismatch for ${actual.relativePath}: expected ${entry.bytes}, received ${actual.size}`);
    }
    const actualSha256 = await sha256File(actual.absolutePath);
    if (entry.sha256 !== actualSha256) throw new Error(`Bundle file SHA-256 mismatch: ${actual.relativePath}`);
  }

  if (Number(manifest.totals?.files) !== expected.size || Number(manifest.totals?.bytes) !== totalBytes) {
    throw new Error('Bundle totals do not match the file manifest');
  }
  const databaseRelativePath = validateManifestRelativePath(manifest.database?.relativePath);
  const databaseManifestRelativePath = validateManifestRelativePath(manifest.database?.backupManifestRelativePath);
  const databaseEntry = expected.get(pathKey(databaseRelativePath));
  const databaseManifestEntry = expected.get(pathKey(databaseManifestRelativePath));
  if (databaseEntry?.type !== 'sqlite' || databaseManifestEntry?.type !== 'sqlite-manifest') {
    throw new Error('Bundle database entries are missing or invalid');
  }
  if (databaseManifestRelativePath !== `${databaseRelativePath}.manifest.json`) {
    throw new Error('SQLite backup manifest is not adjacent to its database backup');
  }

  const databaseVerification = await verifyBundledSqlite({
    bundleRoot,
    databaseRelativePath,
    databaseManifestRelativePath,
    databaseEntry,
    databaseManifestEntry,
  });
  if (databaseVerification.sha256 !== databaseEntry.sha256 || databaseVerification.bytes !== databaseEntry.bytes) {
    throw new Error('SQLite verification result does not match the bundle manifest');
  }

  const summaryFor = (type) => {
    const selected = [...expected.values()].filter((entry) => entry.type === type);
    return { files: selected.length, bytes: selected.reduce((sum, entry) => sum + entry.bytes, 0) };
  };
  const assetRoots = {
    uploads: summaryFor('upload'),
    studentPhotos: summaryFor('student-photo'),
  };
  if (
    Number(manifest.assetRoots?.uploads?.files) !== assetRoots.uploads.files
    || Number(manifest.assetRoots?.uploads?.bytes) !== assetRoots.uploads.bytes
    || Number(manifest.assetRoots?.studentPhotos?.files) !== assetRoots.studentPhotos.files
    || Number(manifest.assetRoots?.studentPhotos?.bytes) !== assetRoots.studentPhotos.bytes
  ) {
    throw new Error('Bundle asset totals do not match the file manifest');
  }

  return {
    ok: true,
    bundle: bundleRoot,
    manifestPath,
    checksumPath,
    manifestSha256,
    manifest,
    files: expected.size,
    bytes: totalBytes,
    database: {
      relativePath: databaseRelativePath,
      quickCheck: databaseVerification.inspection.quickCheck,
      integrityCheck: databaseVerification.inspection.integrityCheck,
      tables: Object.keys(databaseVerification.inspection.tableCounts).length,
      tableCounts: databaseVerification.inspection.tableCounts,
    },
    assetRoots,
  };
};

const copyVerifiedBundleToStage = async (verification, stageRoot) => {
  fs.mkdirSync(stageRoot, { recursive: false });
  fs.mkdirSync(path.join(stageRoot, 'uploads'), { recursive: false });
  fs.mkdirSync(path.join(stageRoot, 'student-photos'), { recursive: false });
  const databaseRelativePath = verification.manifest.database.relativePath;

  for (const entry of verification.manifest.files) {
    let destinationRelativePath = '';
    if (entry.type === 'sqlite') destinationRelativePath = 'local.db';
    if (entry.type === 'upload' || entry.type === 'student-photo') destinationRelativePath = entry.path;
    if (!destinationRelativePath) continue;

    const sourcePath = pathFromManifest(verification.bundle, entry.path);
    const destinationPath = pathFromManifest(stageRoot, destinationRelativePath);
    const copied = await copyFileWithHash(sourcePath, destinationPath, {
      sourceRoot: verification.bundle,
      destinationRoot: stageRoot,
    });
    if (copied.bytes !== Number(entry.bytes) || copied.sha256 !== entry.sha256) {
      throw new Error(`Staged restore file failed verification: ${entry.path}`);
    }
  }

  if (!verification.manifest.files.some((entry) => entry.type === 'sqlite' && entry.path === databaseRelativePath)) {
    throw new Error('Verified bundle database file was not staged');
  }
  inspectSqlite(path.join(stageRoot, 'local.db'), { fullIntegrity: true, includeCounts: true });
};

const verifyInstalledData = async (targetDataDir, verification) => {
  const databaseEntry = verification.manifest.files.find((entry) => entry.type === 'sqlite');
  const databasePath = path.join(targetDataDir, 'local.db');
  const databaseStat = fs.lstatSync(databasePath);
  if (!databaseStat.isFile() || databaseStat.size !== Number(databaseEntry.bytes)) {
    throw new Error('Restored SQLite file size mismatch');
  }
  if (await sha256File(databasePath) !== databaseEntry.sha256) throw new Error('Restored SQLite SHA-256 mismatch');
  inspectSqlite(databasePath, { fullIntegrity: true, includeCounts: true });

  for (const [relativeRoot, type] of [['uploads', 'upload'], ['student-photos', 'student-photo']]) {
    const expected = verification.manifest.files.filter((entry) => entry.type === type);
    const actual = walkFiles(path.join(targetDataDir, relativeRoot), relativeRoot);
    if (actual.length !== expected.length) throw new Error(`Restored ${relativeRoot} file-count mismatch`);
    const actualMap = new Map(actual.map((entry) => [entry.relativePath, entry]));
    for (const entry of expected) {
      const restored = actualMap.get(entry.path);
      if (!restored || restored.size !== Number(entry.bytes)) throw new Error(`Restored file mismatch: ${entry.path}`);
      if (await sha256File(restored.absolutePath) !== entry.sha256) throw new Error(`Restored file SHA-256 mismatch: ${entry.path}`);
    }
  }
};

const removeInside = (rootPath, candidatePath) => {
  const safePath = assertPathInside(rootPath, candidatePath, 'Removal target');
  if (fs.existsSync(safePath)) fs.rmSync(safePath, { recursive: true, force: true });
};

export const restoreDataBundle = async ({ bundleDir, targetDataDir, safetyOutputRoot } = {}) => {
  if (!targetDataDir) throw new Error('An explicit target DATA_DIR is required');
  const targetRoot = assertSafeDirectory(targetDataDir, 'Target DATA_DIR');
  const targetLayout = resolveDataLayout({ dataDir: targetRoot });
  const verification = await verifyDataBundle(bundleDir);

  if (isPathInside(verification.bundle, targetRoot, { allowRoot: true })) {
    throw new Error('Target DATA_DIR cannot be located inside the restore bundle');
  }

  for (const assetRoot of [targetLayout.uploadDir, targetLayout.studentPhotoDir]) {
    if (isPathInside(assetRoot, verification.bundle, { allowRoot: true })) {
      throw new Error('Restore bundle cannot be stored inside a managed asset directory');
    }
  }
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${targetLayout.sqlitePath}${suffix}`;
    if (fs.existsSync(sidecar)) {
      throw new Error(`Restore refused while SQLite sidecar exists: ${sidecar}. Stop the API cleanly first.`);
    }
  }

  const safetyRoot = assertSafeDirectory(
    safetyOutputRoot || path.join(targetRoot, 'backups', 'restore-safety'),
    'Restore safety backup root',
    { allowCreate: true },
  );
  for (const assetRoot of [targetLayout.uploadDir, targetLayout.studentPhotoDir]) {
    if (isPathInside(assetRoot, safetyRoot, { allowRoot: true })) {
      throw new Error('Restore safety backup cannot be stored inside a managed asset directory');
    }
  }
  if (isPathInside(verification.bundle, safetyRoot, { allowRoot: true })) {
    throw new Error('Restore safety backup root cannot be located inside the restore bundle');
  }
  const safetyBackup = await createDataBundle({
    ...targetLayout,
    outputRoot: safetyRoot,
    label: 'pre-restore',
  });
  await verifyDataBundle(safetyBackup.bundle);

  const stamp = timestampForFile();
  const stageRoot = path.join(targetRoot, `.data-restore-stage-${stamp}-${process.pid}`);
  const rollbackRoot = path.join(targetRoot, `.data-restore-rollback-${stamp}-${process.pid}`);
  if (fs.existsSync(stageRoot) || fs.existsSync(rollbackRoot)) throw new Error('Restore staging path already exists');

  const managed = [
    { name: 'local.db', source: path.join(stageRoot, 'local.db'), target: targetLayout.sqlitePath },
    { name: 'uploads', source: path.join(stageRoot, 'uploads'), target: targetLayout.uploadDir },
    { name: 'student-photos', source: path.join(stageRoot, 'student-photos'), target: targetLayout.studentPhotoDir },
  ];
  const movedExisting = [];
  const installed = [];

  try {
    await copyVerifiedBundleToStage(verification, stageRoot);
    fs.mkdirSync(rollbackRoot, { recursive: false });

    for (const item of managed) {
      assertPathInside(targetRoot, item.target, 'Managed restore target');
      if (!fs.existsSync(item.target)) continue;
      assertNoSymlinkComponents(item.target);
      const rollbackPath = path.join(rollbackRoot, item.name);
      fs.renameSync(item.target, rollbackPath);
      movedExisting.push({ ...item, rollbackPath });
    }
    for (const item of managed) {
      if (!fs.existsSync(item.source)) throw new Error(`Staged restore item is missing: ${item.source}`);
      fs.renameSync(item.source, item.target);
      installed.push(item);
    }

    await verifyInstalledData(targetRoot, verification);
    removeInside(targetRoot, rollbackRoot);
    removeInside(targetRoot, stageRoot);
    return {
      ok: true,
      restoredFrom: verification.bundle,
      restoredTo: targetRoot,
      safetyBackup: safetyBackup.bundle,
      files: verification.files,
      bytes: verification.bytes,
      database: verification.database,
      assetRoots: verification.assetRoots,
    };
  } catch (error) {
    const rollbackErrors = [];
    for (const item of [...installed].reverse()) {
      try {
        removeInside(targetRoot, item.target);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError.message);
      }
    }
    for (const item of [...movedExisting].reverse()) {
      try {
        if (fs.existsSync(item.rollbackPath) && !fs.existsSync(item.target)) fs.renameSync(item.rollbackPath, item.target);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError.message);
      }
    }
    if (!rollbackErrors.length) {
      removeInside(targetRoot, rollbackRoot);
      removeInside(targetRoot, stageRoot);
    }
    if (rollbackErrors.length) {
      throw new Error(`${error.message}; rollback requires manual attention: ${rollbackErrors.join('; ')}`);
    }
    throw error;
  }
};
