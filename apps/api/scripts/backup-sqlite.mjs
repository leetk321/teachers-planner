import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import {
  backupDir,
  inspectSqlite,
  sha256File,
  sqlitePath,
  timestampForFile,
  writeJsonAtomic,
} from './sqlite-backup-utils.mjs';

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
};
const label = String(valueAfter('--label') || 'scheduled').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 48);
const retainCount = Math.max(1, Number(process.env.BACKUP_RETAIN_COUNT || 30));
const retentionDays = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS || 90));

if (!fs.existsSync(sqlitePath)) throw new Error(`SQLite database not found: ${sqlitePath}`);
fs.mkdirSync(backupDir, { recursive: true });

const lockPath = path.join(backupDir, '.backup.lock');
let lockHandle;
let partialPath = '';

try {
  if (fs.existsSync(lockPath)) {
    const lockAgeMs = Date.now() - fs.statSync(lockPath).mtimeMs;
    if (lockAgeMs < 6 * 60 * 60 * 1000) throw new Error(`Another backup appears to be running: ${lockPath}`);
    fs.rmSync(lockPath, { force: true });
  }
  lockHandle = fs.openSync(lockPath, 'wx');
  fs.writeFileSync(lockHandle, `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`);

  const stamp = timestampForFile();
  const finalPath = path.join(backupDir, `teacher-notebook-${stamp}-${label}.sqlite3`);
  partialPath = `${finalPath}.partial-${process.pid}`;

  const sourceInspection = inspectSqlite(sqlitePath, { fullIntegrity: false, includeCounts: false });
  const sourceDb = new Database(sqlitePath, { fileMustExist: true });
  try {
    await sourceDb.backup(partialPath);
  } finally {
    sourceDb.close();
  }

  const database = inspectSqlite(partialPath, { fullIntegrity: true, includeCounts: true });
  const sha256 = await sha256File(partialPath);
  const bytes = fs.statSync(partialPath).size;
  fs.renameSync(partialPath, finalPath);
  partialPath = '';

  const manifest = {
    format: 'teacher-notebook-sqlite-backup/v1',
    createdAt: new Date().toISOString(),
    label,
    sourceFile: path.basename(sqlitePath),
    backupFile: path.basename(finalPath),
    bytes,
    sha256,
    sourceQuickCheck: sourceInspection.quickCheck,
    database,
  };
  writeJsonAtomic(`${finalPath}.manifest.json`, manifest);

  const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
  const backups = fs.readdirSync(backupDir)
    .filter((name) => /^teacher-notebook-.*\.sqlite3$/.test(name))
    .map((name) => path.join(backupDir, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  const removed = [];
  backups.forEach((candidate, index) => {
    if (index < retainCount && fs.statSync(candidate).mtimeMs >= cutoff) return;
    fs.rmSync(candidate, { force: true });
    fs.rmSync(`${candidate}.manifest.json`, { force: true });
    removed.push(path.basename(candidate));
  });

  console.log(JSON.stringify({ ok: true, backup: finalPath, manifest: `${finalPath}.manifest.json`, bytes, sha256, removed }));
} finally {
  if (partialPath) fs.rmSync(partialPath, { force: true });
  if (lockHandle !== undefined) {
    fs.closeSync(lockHandle);
    fs.rmSync(lockPath, { force: true });
  }
}
