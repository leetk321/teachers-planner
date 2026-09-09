import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const writeAtomic = (targetPath, content) => {
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(tempPath, 'wx');
    fs.writeFileSync(descriptor, content, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(tempPath, targetPath);
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try { fs.unlinkSync(tempPath); } catch {}
    throw error;
  }
};

const parseBackup = (backupPath, raw) => {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`migration backup is not valid JSON: ${backupPath}: ${error.message}`);
  }
};

export const verifyJsonBackup = (backupPath, { requireChecksum = false } = {}) => {
  if (!fs.existsSync(backupPath)) throw new Error(`migration backup not found: ${backupPath}`);
  const raw = fs.readFileSync(backupPath, 'utf8');
  const payload = parseBackup(backupPath, raw);
  const actualChecksum = sha256(raw);
  const checksumPath = `${backupPath}.sha256`;

  if (fs.existsSync(checksumPath)) {
    const expectedChecksum = String(fs.readFileSync(checksumPath, 'utf8')).trim().split(/\s+/)[0];
    if (expectedChecksum !== actualChecksum) {
      throw new Error(`migration backup checksum mismatch: ${backupPath}`);
    }
  } else if (requireChecksum) {
    throw new Error(`migration backup checksum not found: ${checksumPath}`);
  }

  return { payload, checksum: actualChecksum, backupPath, checksumPath };
};

export const writeVerifiedJsonBackup = ({ dataDir, fileName, payload }) => {
  const backupDir = path.join(dataDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, fileName);

  if (!fs.existsSync(backupPath)) {
    const serialized = `${JSON.stringify(payload, null, 2)}\n`;
    writeAtomic(backupPath, serialized);
  }

  const verified = verifyJsonBackup(backupPath);
  if (!fs.existsSync(verified.checksumPath)) {
    writeAtomic(verified.checksumPath, `${verified.checksum}  ${path.basename(backupPath)}\n`);
  }
  return verifyJsonBackup(backupPath, { requireChecksum: true });
};
