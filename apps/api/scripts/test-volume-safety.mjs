import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-notebook-volume-test-'));
const run = (dataDir, args, expectedStatus = 0) => {
  const result = spawnSync(process.execPath, ['scripts/verify-data-volume.mjs', ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      SQLITE_PATH: path.join(dataDir, 'local.db'),
      DATA_VOLUME_REQUIRE_MARKER: 'true',
    },
    encoding: 'utf8',
  });
  if (result.status !== expectedStatus && !(expectedStatus !== 0 && result.status !== 0)) {
    throw new Error(`Unexpected status ${result.status} for ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  }
};

try {
  const existingDir = path.join(root, 'existing');
  fs.mkdirSync(existingDir);
  const db = new Database(path.join(existingDir, 'local.db'));
  db.exec('CREATE TABLE smoke_rows (id INTEGER PRIMARY KEY)');
  db.close();
  run(existingDir, ['--initialize-existing']);
  run(existingDir, []);

  const wrongExistingDir = path.join(root, 'wrong-existing');
  fs.mkdirSync(wrongExistingDir);
  run(wrongExistingDir, ['--initialize-existing'], 1);

  const newDir = path.join(root, 'new');
  fs.mkdirSync(newDir);
  run(newDir, ['--initialize-new']);

  const nonEmptyNewDir = path.join(root, 'non-empty-new');
  fs.mkdirSync(nonEmptyNewDir);
  fs.writeFileSync(path.join(nonEmptyNewDir, 'unexpected.txt'), 'do-not-initialize');
  run(nonEmptyNewDir, ['--initialize-new'], 1);

  console.log(JSON.stringify({ ok: true, test: 'data-volume-safety' }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
