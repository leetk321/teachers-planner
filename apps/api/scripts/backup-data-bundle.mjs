import path from 'path';
import { createDataBundle, valueAfter } from './data-bundle-utils.mjs';

const requestedDataDir = path.resolve(
  valueAfter('--data-dir') || process.env.DATA_DIR || path.resolve(process.cwd(), '.data'),
);
const result = await createDataBundle({
  dataDir: requestedDataDir,
  sqlitePath: valueAfter('--sqlite') || process.env.SQLITE_PATH || path.join(requestedDataDir, 'local.db'),
  uploadDir: valueAfter('--uploads') || process.env.UPLOAD_DIR || path.join(requestedDataDir, 'uploads'),
  studentPhotoDir: valueAfter('--student-photos')
    || process.env.STUDENT_PHOTO_DIR
    || path.join(requestedDataDir, 'student-photos'),
  outputRoot: valueAfter('--output-root') || path.join(requestedDataDir, 'backups', 'data-bundles'),
  label: valueAfter('--label') || 'manual',
});

console.log(JSON.stringify(result));
