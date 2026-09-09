import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { inspectSqlite } from './sqlite-backup-utils.mjs';

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
};
const url = valueAfter('--url') || 'http://127.0.0.1:4000/health';
const sqlitePath = path.resolve(process.env.SQLITE_PATH || path.join(process.env.DATA_DIR || '.data', 'local.db'));

const volumeCheck = spawnSync(process.execPath, ['scripts/verify-data-volume.mjs'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'ignore',
});
if (volumeCheck.status !== 0) throw new Error('Data-volume check failed');
if (!fs.existsSync(sqlitePath)) throw new Error(`SQLite database not found: ${sqlitePath}`);
inspectSqlite(sqlitePath, { fullIntegrity: false, includeCounts: false });

const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
if (!response.ok) throw new Error(`Health endpoint returned ${response.status}`);
const health = await response.json();
if (!health?.ok) throw new Error('Health endpoint did not return ok=true');
console.log(JSON.stringify({ ok: true, url }));
