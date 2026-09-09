import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

export const dataDir = path.resolve(process.env.DATA_DIR || path.resolve(process.cwd(), '.data'));
export const sqlitePath = path.resolve(process.env.SQLITE_PATH || path.join(dataDir, 'local.db'));
export const backupDir = path.resolve(process.env.BACKUP_DIR || path.join(dataDir, 'backups'));

const pragmaValue = (rows) => String(Object.values(rows?.[0] || {})[0] || '');
const quoteIdentifier = (value) => `"${String(value).replaceAll('"', '""')}"`;

export const timestampForFile = (date = new Date()) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export const sha256File = (filePath) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  stream.on('error', reject);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('end', () => resolve(hash.digest('hex')));
});

export const writeJsonAtomic = (filePath, value) => {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(tempPath, filePath);
};

export const inspectSqlite = (filePath, { fullIntegrity = true, includeCounts = true } = {}) => {
  if (!fs.existsSync(filePath)) throw new Error(`SQLite database not found: ${filePath}`);
  if (fs.statSync(filePath).size === 0) throw new Error(`SQLite database is empty: ${filePath}`);

  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const quickCheck = pragmaValue(db.pragma('quick_check'));
    if (quickCheck !== 'ok') throw new Error(`SQLite quick_check failed: ${quickCheck}`);

    let integrityCheck = 'not-run';
    if (fullIntegrity) {
      integrityCheck = pragmaValue(db.pragma('integrity_check'));
      if (integrityCheck !== 'ok') throw new Error(`SQLite integrity_check failed: ${integrityCheck}`);
    }

    const tableCounts = {};
    if (includeCounts) {
      const tables = db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `).all();
      for (const row of tables) {
        tableCounts[row.name] = Number(db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(row.name)}`).get().count);
      }
    }

    return {
      quickCheck,
      integrityCheck,
      schemaVersion: Number(db.pragma('schema_version', { simple: true }) || 0),
      userVersion: Number(db.pragma('user_version', { simple: true }) || 0),
      pageCount: Number(db.pragma('page_count', { simple: true }) || 0),
      pageSize: Number(db.pragma('page_size', { simple: true }) || 0),
      tableCounts,
    };
  } finally {
    db.close();
  }
};

export const findLatestBackup = (directory = backupDir) => {
  if (!fs.existsSync(directory)) throw new Error(`Backup directory not found: ${directory}`);
  const candidates = fs.readdirSync(directory)
    .filter((name) => /^teacher-notebook-.*\.sqlite3$/.test(name))
    .map((name) => path.join(directory, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  if (!candidates.length) throw new Error(`No SQLite backups found in ${directory}`);
  return candidates[0];
};

export const verifyBackup = async (backupPath, { fullIntegrity = true } = {}) => {
  const resolvedBackup = path.resolve(backupPath);
  const manifestPath = `${resolvedBackup}.manifest.json`;
  if (!fs.existsSync(manifestPath)) throw new Error(`Backup manifest not found: ${manifestPath}`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const actualBytes = fs.statSync(resolvedBackup).size;
  const actualSha256 = await sha256File(resolvedBackup);
  if (Number(manifest.bytes) !== actualBytes) {
    throw new Error(`Backup size mismatch: expected ${manifest.bytes}, received ${actualBytes}`);
  }
  if (String(manifest.sha256) !== actualSha256) throw new Error('Backup SHA-256 mismatch');

  const inspection = inspectSqlite(resolvedBackup, { fullIntegrity, includeCounts: true });
  const expectedCounts = manifest.database?.tableCounts || {};
  for (const [table, expected] of Object.entries(expectedCounts)) {
    if (inspection.tableCounts[table] !== Number(expected)) {
      throw new Error(`Backup row-count mismatch for ${table}: expected ${expected}, received ${inspection.tableCounts[table]}`);
    }
  }

  return { backupPath: resolvedBackup, manifestPath, manifest, inspection, sha256: actualSha256, bytes: actualBytes };
};
