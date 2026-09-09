import path from 'path';
import { backupDir, findLatestBackup, verifyBackup } from './sqlite-backup-utils.mjs';

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
};
const positional = process.argv.slice(2).find((value) => !value.startsWith('--'));
const requested = valueAfter('--backup') || positional;
const backupPath = requested ? path.resolve(requested) : findLatestBackup(backupDir);
const result = await verifyBackup(backupPath, { fullIntegrity: true });

console.log(JSON.stringify({
  ok: true,
  backup: result.backupPath,
  bytes: result.bytes,
  sha256: result.sha256,
  integrityCheck: result.inspection.integrityCheck,
  tables: Object.keys(result.inspection.tableCounts).length,
}));
