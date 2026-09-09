import fs from 'fs';
import path from 'path';
import {
  backupDir,
  findLatestBackup,
  inspectSqlite,
  sqlitePath,
  timestampForFile,
  verifyBackup,
} from './sqlite-backup-utils.mjs';

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
};
if (!process.argv.includes('--confirm-restore')) {
  throw new Error('Restore refused. Stop the API and add --confirm-restore after verifying the paths.');
}

const requestedBackup = valueAfter('--backup');
const backupPath = requestedBackup ? path.resolve(requestedBackup) : findLatestBackup(backupDir);
const targetPath = path.resolve(valueAfter('--target') || sqlitePath);
const verified = await verifyBackup(backupPath, { fullIntegrity: true });

for (const suffix of ['-wal', '-shm']) {
  if (fs.existsSync(`${targetPath}${suffix}`)) {
    throw new Error(`Restore refused while SQLite sidecar exists: ${targetPath}${suffix}. Stop the API cleanly first.`);
  }
}

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
const stagedPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.restore-${process.pid}.tmp`);
const previousPath = fs.existsSync(targetPath) ? `${targetPath}.pre-restore-${timestampForFile()}` : '';
fs.copyFileSync(verified.backupPath, stagedPath, fs.constants.COPYFILE_EXCL);
inspectSqlite(stagedPath, { fullIntegrity: true, includeCounts: true });

try {
  if (previousPath) fs.renameSync(targetPath, previousPath);
  fs.renameSync(stagedPath, targetPath);
} catch (error) {
  fs.rmSync(stagedPath, { force: true });
  if (previousPath && !fs.existsSync(targetPath) && fs.existsSync(previousPath)) fs.renameSync(previousPath, targetPath);
  throw error;
}

console.log(JSON.stringify({
  ok: true,
  restoredFrom: verified.backupPath,
  restoredTo: targetPath,
  previousDatabase: previousPath || null,
}));
