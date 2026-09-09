import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { setTimeout as delay } from 'timers/promises';

const apiCwd = path.resolve(process.cwd());
const port = Number(process.env.HEALTHCHECK_PORT || 4127);
const baseUrl = `http://127.0.0.1:${port}`;
const tempRoot = path.join(os.tmpdir(), `teacher-notebook-health-${Date.now()}`);
const tempDataDir = path.join(tempRoot, 'data');
const tempUploadDir = path.join(tempDataDir, 'uploads');
const tempPhotoDir = path.join(tempDataDir, 'student-photos');
const tempDbPath = path.join(tempDataDir, 'local.db');

[tempDataDir, tempUploadDir, tempPhotoDir].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

const child = spawn(process.execPath, ['src/index-local.js'], {
  cwd: apiCwd,
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: tempDataDir,
    SQLITE_PATH: tempDbPath,
    BACKUP_DIR: path.join(tempDataDir, 'backups'),
    UPLOAD_DIR: tempUploadDir,
    STUDENT_PHOTO_DIR: tempPhotoDir,
    DATA_VOLUME_REQUIRE_MARKER: 'false',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += String(chunk); });
child.stderr.on('data', (chunk) => { stderr += String(chunk); });

const stopChild = async () => {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await delay(500);
  if (child.exitCode === null) child.kill('SIGKILL');
};

const waitForJson = async (url, attempts = 30) => {
  for (let index = 0; index < attempts; index += 1) {
    if (child.exitCode !== null) throw new Error(`API exited before becoming healthy (${child.exitCode})`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return await response.json();
    } catch {}
    await delay(500);
  }
  throw new Error(`Health check timeout for ${url}`);
};

try {
  const health = await waitForJson(`${baseUrl}/health`);
  const meta = await waitForJson(`${baseUrl}/api/meta`);
  if (!health?.ok || !meta?.name) throw new Error('Health or metadata payload is incomplete');

  const authRes = await fetch(`${baseUrl}/api/auth/me`, { signal: AbortSignal.timeout(2000) });
  if (authRes.status !== 401) throw new Error(`/api/auth/me expected 401, received ${authRes.status}`);

  const sqlite = new Database(tempDbPath, { readonly: true, fileMustExist: true });
  const quickCheck = String(Object.values(sqlite.pragma('quick_check')[0] || {})[0] || '');
  sqlite.close();
  if (quickCheck !== 'ok') throw new Error(`SQLite quick_check failed: ${quickCheck}`);

  console.log(JSON.stringify({ ok: true, health: { ok: health.ok, db: health.db }, meta, quickCheck }));
} catch (error) {
  console.error('[check-api-health] failed');
  console.error(String(error?.message || error));
  if (stdout.trim()) console.error(`[stdout]\n${stdout}`);
  if (stderr.trim()) console.error(`[stderr]\n${stderr}`);
  process.exitCode = 1;
} finally {
  await stopChild();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
