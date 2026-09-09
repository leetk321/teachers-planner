import fs from 'fs';
import path from 'path';

const DEFAULT_DATA_DIR = path.resolve(process.cwd(), '.data');

export const DATA_DIR = process.env.DATA_DIR || DEFAULT_DATA_DIR;
export const SQLITE_PATH = process.env.SQLITE_PATH || path.join(DATA_DIR, 'local.db');
export const LEGACY_JSON_PATH = process.env.LEGACY_JSON_PATH || path.join(DATA_DIR, 'local-db.json');
export const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
export const STUDENT_PHOTO_DIR = process.env.STUDENT_PHOTO_DIR || path.join(path.dirname(UPLOAD_DIR), 'student-photos');
export const DATA_SENTINEL_PATH = path.join(DATA_DIR, '.teacher-notebook-data-root');
export const DATA_VOLUME_MARKER_PATH = process.env.DATA_VOLUME_MARKER_PATH || path.join(DATA_DIR, '.teacher-notebook-volume.json');

const hasVerifiedVolumeMarker = () => {
  if (!fs.existsSync(DATA_VOLUME_MARKER_PATH)) return false;
  try {
    const marker = JSON.parse(fs.readFileSync(DATA_VOLUME_MARKER_PATH, 'utf8'));
    return marker?.format === 'teacher-notebook-data-volume/v1'
      && marker?.databaseFile === path.basename(SQLITE_PATH);
  } catch {
    return false;
  }
};

export const ensureRuntimeDirectories = () => {
  [DATA_DIR, BACKUP_DIR, UPLOAD_DIR, STUDENT_PHOTO_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  if (!fs.existsSync(DATA_SENTINEL_PATH)) {
    const hasExistingData = fs.existsSync(SQLITE_PATH) || fs.existsSync(LEGACY_JSON_PATH);
    const allowInitialization = process.env.TEACHER_NOTEBOOK_ALLOW_DATA_INIT === '1'
      || process.env.NODE_ENV !== 'production'
      || hasVerifiedVolumeMarker();
    if (!hasExistingData && !allowInitialization) {
      throw new Error('DATA_DIR is empty or not mounted. Set TEACHER_NOTEBOOK_ALLOW_DATA_INIT=1 only for the first production start.');
    }
    fs.writeFileSync(DATA_SENTINEL_PATH, `teacher-notebook-data\ncreated_at=${new Date().toISOString()}\n`, { encoding: 'utf8', flag: 'wx' });
  }

  const probePath = path.join(DATA_DIR, `.write-probe-${process.pid}`);
  fs.writeFileSync(probePath, 'ok', 'utf8');
  fs.unlinkSync(probePath);
};
