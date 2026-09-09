import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-notebook-backup-test-'));
const source = path.join(root, 'source.db');
const restored = path.join(root, 'restored.db');
const backups = path.join(root, 'backups');
const env = {
  ...process.env,
  DATA_DIR: root,
  SQLITE_PATH: source,
  BACKUP_DIR: backups,
  BACKUP_RETAIN_COUNT: '3',
  BACKUP_RETENTION_DAYS: '30',
};

const run = (script, args = []) => {
  const result = spawnSync(process.execPath, [`scripts/${script}`, ...args], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`${script} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
};

try {
  const db = new Database(source);
  db.exec('CREATE TABLE smoke_rows (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
  db.prepare('INSERT INTO smoke_rows(value) VALUES (?)').run('roundtrip-ok');
  db.close();

  run('backup-sqlite.mjs', ['--label', 'roundtrip']);
  const backup = fs.readdirSync(backups).find((name) => name.endsWith('.sqlite3'));
  if (!backup) throw new Error('Backup was not created');
  const backupPath = path.join(backups, backup);
  run('verify-sqlite-backup.mjs', ['--backup', backupPath]);
  run('restore-sqlite-backup.mjs', ['--backup', backupPath, '--target', restored, '--confirm-restore']);

  const restoredDb = new Database(restored, { readonly: true, fileMustExist: true });
  const row = restoredDb.prepare('SELECT value FROM smoke_rows WHERE id = 1').get();
  restoredDb.close();
  if (row?.value !== 'roundtrip-ok') throw new Error('Restored row did not match source');
  console.log(JSON.stringify({ ok: true, test: 'sqlite-backup-roundtrip' }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
