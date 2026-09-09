import fs from 'fs';
import path from 'path';
import { inspectSqlite } from './sqlite-backup-utils.mjs';

const dataDir = path.resolve(process.env.DATA_DIR || path.resolve(process.cwd(), '.data'));
const sqlitePath = path.resolve(process.env.SQLITE_PATH || path.join(dataDir, 'local.db'));
const markerPath = path.resolve(process.env.DATA_VOLUME_MARKER_PATH || path.join(dataDir, '.teacher-notebook-volume.json'));
const requireMarker = String(process.env.DATA_VOLUME_REQUIRE_MARKER || 'false').toLowerCase() === 'true';
const initializeExisting = process.argv.includes('--initialize-existing');
const initializeNew = process.argv.includes('--initialize-new');

if (initializeExisting && initializeNew) throw new Error('Choose only one initialization mode');
if ([path.parse(dataDir).root, '/app', '/app/apps', '/app/apps/api'].includes(dataDir)) {
  throw new Error(`Unsafe DATA_DIR refused: ${dataDir}`);
}
for (const candidate of [sqlitePath, markerPath]) {
  const relative = path.relative(dataDir, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Runtime path must be inside DATA_DIR: ${candidate}`);
  }
}

if (!fs.existsSync(dataDir)) {
  if (!initializeNew) throw new Error(`Data directory not found: ${dataDir}`);
  fs.mkdirSync(dataDir, { recursive: true });
}
fs.accessSync(dataDir, fs.constants.R_OK | fs.constants.W_OK);

if (initializeExisting && !fs.existsSync(sqlitePath)) {
  throw new Error(`Existing-volume initialization requires a database: ${sqlitePath}`);
}
if (initializeNew && fs.existsSync(sqlitePath)) {
  throw new Error(`New-volume initialization refused because a database already exists: ${sqlitePath}`);
}
if (initializeNew) {
  const unexpectedEntries = fs.readdirSync(dataDir).filter((name) => !['lost+found', '.DS_Store'].includes(name));
  if (unexpectedEntries.length) {
    throw new Error(`New-volume initialization requires an empty directory; found: ${unexpectedEntries.join(', ')}`);
  }
}

let database = null;
if (fs.existsSync(sqlitePath)) database = inspectSqlite(sqlitePath, { fullIntegrity: false, includeCounts: false });

if (initializeExisting || initializeNew) {
  if (fs.existsSync(markerPath)) throw new Error(`Volume marker already exists: ${markerPath}`);
  const marker = {
    format: 'teacher-notebook-data-volume/v1',
    initializedAt: new Date().toISOString(),
    mode: initializeExisting ? 'existing' : 'new',
    databaseFile: path.basename(sqlitePath),
  };
  const tempPath = `${markerPath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(marker, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(tempPath, markerPath);
}

if (requireMarker && !fs.existsSync(markerPath)) {
  throw new Error(`Data-volume marker missing: ${markerPath}. Initialize the verified NAS volume before starting the API.`);
}

let marker = null;
if (fs.existsSync(markerPath)) {
  marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  if (marker.format !== 'teacher-notebook-data-volume/v1') throw new Error(`Unsupported volume marker: ${marker.format}`);
  if (marker.databaseFile !== path.basename(sqlitePath)) throw new Error('Volume marker database filename does not match SQLITE_PATH');
}

console.log(JSON.stringify({ ok: true, dataDir, sqlitePath, markerPath, marker, database }));
