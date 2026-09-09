import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';

import { DATA_DIR, STUDENT_PHOTO_DIR, UPLOAD_DIR } from '../config/paths.js';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

const positiveEnvNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};

const DOCUMENT_EXTENSIONS = new Set([
  '.7z', '.csv', '.doc', '.docx', '.gif', '.heic', '.heif', '.hwp', '.hwpx',
  '.ics', '.jpeg', '.jpg', '.json', '.md', '.mp3', '.mp4', '.ods', '.odt',
  '.pdf', '.png', '.ppt', '.pptx', '.rar', '.rtf', '.txt', '.wav', '.webm',
  '.webp', '.xls', '.xlsx', '.xml', '.zip',
]);

const PHOTO_EXTENSIONS = new Set(['.gif', '.jpeg', '.jpg', '.png', '.webp']);

const SAFE_DOCUMENT_MIME_TYPES = new Set([
  'application/haansofthwp',
  'application/json',
  'application/msword',
  'application/octet-stream',
  'application/pdf',
  'application/rtf',
  'application/vnd.hancom.hwp',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/x-7z-compressed',
  'application/x-hwp',
  'application/x-rar-compressed',
  'application/x-zip-compressed',
  'application/zip',
  'audio/mpeg',
  'audio/wav',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/calendar',
  'text/csv',
  'text/markdown',
  'text/plain',
  'text/rtf',
  'text/xml',
  'video/mp4',
  'video/webm',
]);

const PHOTO_MIME_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);

const policy = (maxFileSize, maxOwnerBytes, allowedExtensions, allowedMimeTypes) => Object.freeze({
  maxFileSize,
  maxOwnerBytes,
  allowedExtensions,
  allowedMimeTypes,
});

export const UPLOAD_POLICIES = Object.freeze({
  attachment: policy(
    positiveEnvNumber('ATTACHMENT_MAX_FILE_SIZE_BYTES', 50 * MIB),
    positiveEnvNumber('UPLOAD_USER_QUOTA_BYTES', 5 * GIB),
    DOCUMENT_EXTENSIONS,
    SAFE_DOCUMENT_MIME_TYPES,
  ),
  library: policy(
    positiveEnvNumber('LIBRARY_MAX_FILE_SIZE_BYTES', 512 * MIB),
    positiveEnvNumber('UPLOAD_USER_QUOTA_BYTES', 5 * GIB),
    DOCUMENT_EXTENSIONS,
    SAFE_DOCUMENT_MIME_TYPES,
  ),
  photo: policy(
    positiveEnvNumber('STUDENT_PHOTO_MAX_FILE_SIZE_BYTES', 10 * MIB),
    positiveEnvNumber('STUDENT_PHOTO_USER_QUOTA_BYTES', 200 * MIB),
    PHOTO_EXTENSIONS,
    PHOTO_MIME_TYPES,
  ),
});

const MIN_FREE_DISK_BYTES = positiveEnvNumber('UPLOAD_MIN_FREE_DISK_BYTES', 512 * MIB);

export class UploadSecurityError extends Error {
  constructor(message, { statusCode = 400, code = 'UPLOAD_REJECTED' } = {}) {
    super(message);
    this.name = 'UploadSecurityError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const uploadError = (message, statusCode, code) => new UploadSecurityError(message, { statusCode, code });

const safeOwnerId = (userId) => {
  const value = Number(userId);
  if (!Number.isInteger(value) || value <= 0) throw uploadError('invalid file owner', 400, 'INVALID_OWNER');
  return String(value);
};

const isInside = (root, target) => {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const normalizedPathname = (rawUrl = '') => {
  try {
    return decodeURIComponent(new URL(String(rawUrl || '').trim(), 'http://local').pathname || '');
  } catch {
    return '';
  }
};

const normalizeMimeType = (value = '') => String(value || 'application/octet-stream')
  .split(';')[0]
  .trim()
  .toLowerCase() || 'application/octet-stream';

export const sanitizeOriginalFilename = (value = 'file') => {
  const base = path.basename(String(value || 'file').replaceAll('\\', '/'));
  const cleaned = base
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim()
    .replace(/[. ]+$/g, '');
  return (cleaned || 'file').slice(0, 180);
};

export const normalizeUploadedOriginalName = (file) => {
  const raw = String(file?.originalname || '').trim();
  if (!raw) return '';

  let decoded = raw;
  try {
    const candidate = Buffer.from(raw, 'latin1').toString('utf8');
    const replacementCount = (value) => (String(value).match(/\uFFFD/g) || []).length;
    const hangulCount = (value) => (String(value).match(/[\uAC00-\uD7A3]/g) || []).length;
    if (replacementCount(candidate) < replacementCount(raw) || hangulCount(candidate) > hangulCount(raw)) {
      decoded = candidate;
    }
  } catch {
    decoded = raw;
  }

  return sanitizeOriginalFilename(decoded);
};

export const getUploadPolicy = (profile = 'library') => {
  const selected = UPLOAD_POLICIES[String(profile || 'library')];
  if (!selected) throw uploadError('unknown upload profile', 400, 'INVALID_UPLOAD_PROFILE');
  return selected;
};

export const getOwnerUploadDirectory = (rootDir, userId) => path.join(path.resolve(rootDir), 'users', safeOwnerId(userId));

export const getStudentPhotoDirectory = (rootDir, userId) => path.join(path.resolve(rootDir), safeOwnerId(userId));

const makeStoredFilename = (originalName) => {
  const extension = path.extname(sanitizeOriginalFilename(originalName)).toLowerCase();
  return `${Date.now()}_${crypto.randomUUID()}${extension}`;
};

export const validateUploadMetadata = (file, profile = 'library') => {
  const selected = getUploadPolicy(profile);
  const name = normalizeUploadedOriginalName(file) || sanitizeOriginalFilename(file?.originalname || 'file');
  const extension = path.extname(name).toLowerCase();
  const mimeType = normalizeMimeType(file?.mimetype);

  if (!extension || !selected.allowedExtensions.has(extension)) {
    throw uploadError(`허용되지 않는 파일 확장자입니다: ${extension || '(없음)'}`, 415, 'UNSUPPORTED_EXTENSION');
  }
  if (!selected.allowedMimeTypes.has(mimeType)) {
    throw uploadError(`허용되지 않는 파일 형식입니다: ${mimeType}`, 415, 'UNSUPPORTED_MIME_TYPE');
  }
  return { name, extension, mimeType, policy: selected };
};

const readFileHeader = (filePath, length = 16) => {
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(descriptor, buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
};

const startsWithBytes = (buffer, bytes) => bytes.every((value, index) => buffer[index] === value);

const hasPhotoSignature = (extension, header) => {
  if (extension === '.jpg' || extension === '.jpeg') return startsWithBytes(header, [0xff, 0xd8, 0xff]);
  if (extension === '.png') return startsWithBytes(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (extension === '.gif') return header.subarray(0, 6).toString('ascii') === 'GIF87a' || header.subarray(0, 6).toString('ascii') === 'GIF89a';
  if (extension === '.webp') return header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
};

export const validateUploadContent = (file, profile = 'library') => {
  const metadata = validateUploadMetadata(file, profile);
  const size = Number(file?.size || 0);
  if (!file?.path || !fs.existsSync(file.path)) throw uploadError('업로드 파일을 찾을 수 없습니다.', 400, 'UPLOAD_FILE_MISSING');
  if (!Number.isFinite(size) || size <= 0) throw uploadError('빈 파일은 업로드할 수 없습니다.', 400, 'EMPTY_UPLOAD');
  if (size > metadata.policy.maxFileSize) {
    throw uploadError('파일 크기 제한을 초과했습니다.', 413, 'FILE_TOO_LARGE');
  }

  const header = readFileHeader(file.path);
  if (startsWithBytes(header, [0x4d, 0x5a]) || startsWithBytes(header, [0x7f, 0x45, 0x4c, 0x46])) {
    throw uploadError('실행 파일은 업로드할 수 없습니다.', 415, 'EXECUTABLE_CONTENT');
  }
  if (profile === 'photo' && !hasPhotoSignature(metadata.extension, header)) {
    throw uploadError('이미지 내용과 확장자가 일치하지 않습니다.', 415, 'INVALID_IMAGE_CONTENT');
  }
  if (metadata.extension === '.pdf' && header.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw uploadError('PDF 내용과 확장자가 일치하지 않습니다.', 415, 'INVALID_PDF_CONTENT');
  }

  return metadata;
};

const availableDiskBytes = (rootDir) => {
  if (typeof fs.statfsSync !== 'function') return Number.POSITIVE_INFINITY;
  const stats = fs.statfsSync(rootDir);
  const blockSize = BigInt(stats.bsize || stats.frsize || 0);
  const availableBlocks = BigInt(stats.bavail || 0);
  const value = blockSize * availableBlocks;
  return value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(value);
};

export const assertUploadCapacity = ({
  profile = 'library',
  rootDir,
  existingBytes = 0,
  incomingBytes = 0,
} = {}) => {
  const selected = getUploadPolicy(profile);
  const existing = Math.max(0, Number(existingBytes) || 0);
  const incoming = Math.max(0, Number(incomingBytes) || 0);

  if (incoming > selected.maxFileSize + (2 * MIB)) {
    throw uploadError('파일 크기 제한을 초과했습니다.', 413, 'FILE_TOO_LARGE');
  }
  if (existing + incoming > selected.maxOwnerBytes) {
    throw uploadError('사용자 저장공간 한도를 초과했습니다.', 413, 'USER_QUOTA_EXCEEDED');
  }
  if (rootDir && availableDiskBytes(rootDir) < MIN_FREE_DISK_BYTES + incoming) {
    throw uploadError('서버 저장공간이 부족해 업로드를 중단했습니다.', 507, 'INSUFFICIENT_STORAGE');
  }
};

export const getDirectorySizeBytes = (directory) => {
  if (!directory || !fs.existsSync(directory)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) total += getDirectorySizeBytes(target);
    else if (entry.isFile()) total += Number(fs.statSync(target).size || 0);
  }
  return total;
};

export const sumStoredFileSizes = (rows = []) => (Array.isArray(rows) ? rows : [])
  .reduce((sum, row) => sum + Math.max(0, Number(row?.size || 0)), 0);

export const createDiskUpload = (destinationResolver, { profile = 'library' } = {}) => {
  const selected = getUploadPolicy(profile);
  return multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        try {
          const destination = typeof destinationResolver === 'function' ? destinationResolver(req) : destinationResolver;
          if (!destination) throw uploadError('업로드 경로를 확인할 수 없습니다.', 500, 'UPLOAD_PATH_MISSING');
          fs.mkdirSync(destination, { recursive: true });
          cb(null, destination);
        } catch (error) {
          cb(error);
        }
      },
      filename: (_req, file, cb) => cb(null, makeStoredFilename(normalizeUploadedOriginalName(file) || file.originalname)),
    }),
    fileFilter: (_req, file, cb) => {
      try {
        validateUploadMetadata(file, profile);
        cb(null, true);
      } catch (error) {
        cb(error);
      }
    },
    limits: {
      fileSize: selected.maxFileSize,
      files: 1,
      fields: 12,
      fieldNameSize: 120,
      fieldSize: MIB,
    },
  });
};

export const uploadErrorResponse = (error) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return { statusCode: 413, error: '파일 크기 제한을 초과했습니다.', code: error.code };
    return { statusCode: 400, error: '잘못된 업로드 요청입니다.', code: error.code || 'MULTER_ERROR' };
  }
  if (error instanceof UploadSecurityError) {
    return { statusCode: error.statusCode, error: error.message, code: error.code };
  }
  return { statusCode: 500, error: '파일 업로드 처리에 실패했습니다.', code: 'UPLOAD_FAILED' };
};

export const createSingleUploadMiddleware = (upload, fieldName = 'file') => (req, res, next) => {
  upload.single(fieldName)(req, res, (error) => {
    if (!error) return next();
    const response = uploadErrorResponse(error);
    return res.status(response.statusCode).json({ error: response.error, code: response.code });
  });
};

export const toStorageKey = (rootDir, absolutePath) => {
  const root = path.resolve(rootDir);
  const target = path.resolve(absolutePath);
  if (!isInside(root, target) || target === root) throw uploadError('invalid upload path', 400, 'INVALID_UPLOAD_PATH');
  return path.relative(root, target).split(path.sep).join('/');
};

const allowedOwnedCandidate = ({ root, ownerId, target, kind }) => {
  if (!isInside(root, target) || target === root) return false;
  const relative = path.relative(root, target);
  const segments = relative.split(path.sep).filter(Boolean);
  if (kind === 'photo') return segments.length === 2 && segments[0] === ownerId;
  if (segments[0] === 'users') return segments.length >= 3 && segments[1] === ownerId;
  if (/^\d+$/.test(segments[0] || '')) return segments.length >= 2 && segments[0] === ownerId;
  return segments.length === 1;
};

export const resolveStoredUploadPath = ({
  rootDir,
  ownerId: rawOwnerId,
  storedPath = '',
  storedUrl = '',
  kind = 'file',
} = {}) => {
  const root = path.resolve(rootDir);
  const ownerId = safeOwnerId(rawOwnerId);
  const candidates = [];
  const addCandidate = (candidate) => {
    if (!candidate) return;
    const target = path.resolve(candidate);
    if (allowedOwnedCandidate({ root, ownerId, target, kind }) && !candidates.includes(target)) candidates.push(target);
  };

  const rawPath = String(storedPath || '').trim();
  if (rawPath) {
    if (path.isAbsolute(rawPath)) addCandidate(rawPath);
    else addCandidate(path.join(root, rawPath.replace(/[\\/]+/g, path.sep)));
  }

  const pathname = normalizedPathname(storedUrl);
  const prefixes = kind === 'photo' ? ['/student-photos/'] : ['/uploads/'];
  for (const prefix of prefixes) {
    if (pathname.startsWith(prefix)) addCandidate(path.join(root, pathname.slice(prefix.length).replace(/[\\/]+/g, path.sep)));
  }

  const legacyName = sanitizeOriginalFilename(path.basename(rawPath || pathname || ''));
  if (legacyName && legacyName !== 'file') {
    if (kind === 'photo') addCandidate(path.join(root, ownerId, legacyName));
    else {
      addCandidate(path.join(root, 'users', ownerId, legacyName));
      addCandidate(path.join(root, ownerId, legacyName));
      addCandidate(path.join(root, legacyName));
    }
  }

  const absolutePath = candidates.find((candidate) => {
    try { return fs.statSync(candidate).isFile(); } catch { return false; }
  });
  return absolutePath ? { absolutePath, storageKey: toStorageKey(root, absolutePath) } : null;
};

export const deleteStoredUploadAsset = (options = {}) => {
  const resolved = resolveStoredUploadPath(options);
  if (!resolved) return false;
  try {
    fs.unlinkSync(resolved.absolutePath);
    return true;
  } catch {
    return false;
  }
};

const removeEmptyParents = (directory, rootDirectory) => {
  const root = path.resolve(rootDirectory);
  let current = path.resolve(directory);
  while (current !== root && isInside(root, current)) {
    try {
      if (!fs.existsSync(current) || fs.readdirSync(current).length > 0) break;
      fs.rmdirSync(current);
      current = path.dirname(current);
    } catch {
      break;
    }
  }
};

export const rollbackUploadedFile = (filePath, rootDir) => {
  const root = path.resolve(rootDir);
  const target = path.resolve(String(filePath || ''));
  if (!filePath || !isInside(root, target) || target === root) return false;
  try {
    if (!fs.statSync(target).isFile()) return false;
    fs.unlinkSync(target);
    removeEmptyParents(path.dirname(target), root);
    return true;
  } catch {
    return false;
  }
};

export const deleteUploadedAssetByUrl = (baseUrl, baseDir, rawUrl) => {
  const pathname = normalizedPathname(rawUrl);
  if (!pathname.startsWith(`${baseUrl}/`)) return false;
  const filename = sanitizeOriginalFilename(path.basename(pathname));
  const root = path.resolve(baseDir);
  const target = path.resolve(baseDir, filename);
  if (!filename || !isInside(root, target) || target === root) return false;
  try {
    if (!fs.statSync(target).isFile()) return false;
    fs.unlinkSync(target);
    return true;
  } catch {
    return false;
  }
};

export const normalizeStudentPhotoUrlForUser = (userId, rawUrl = '') => {
  const pathname = normalizedPathname(rawUrl);
  return pathname.startsWith(`/student-photos/${safeOwnerId(userId)}/`) ? pathname : '';
};

export const removeStudentPhotoFileByUrl = (userId, rawUrl = '') => deleteStoredUploadAsset({
  rootDir: STUDENT_PHOTO_DIR,
  ownerId: userId,
  storedUrl: rawUrl,
  kind: 'photo',
});

export const removeOwnedUploadRows = (userId, rows = [], { uploadDir = UPLOAD_DIR } = {}) => {
  let removed = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (Number(row?.owner_id || userId) !== Number(userId)) continue;
    if (deleteStoredUploadAsset({
      rootDir: uploadDir,
      ownerId: userId,
      storedPath: row?.path,
      storedUrl: row?.url,
      kind: 'file',
    })) removed += 1;
  }
  return removed;
};

const removeDirectory = (directory) => {
  try {
    if (!fs.existsSync(directory)) return false;
    fs.rmSync(directory, { recursive: true, force: true });
    return !fs.existsSync(directory);
  } catch {
    return false;
  }
};

export const removeUserDirectories = (userId, {
  dataDir = DATA_DIR,
  uploadDir = UPLOAD_DIR,
  studentPhotoDir = STUDENT_PHOTO_DIR,
  draftDir = path.join(dataDir, 'drafts'),
  trashDir = path.join(dataDir, 'trash'),
} = {}) => {
  const ownerId = safeOwnerId(userId);
  const targets = Array.from(new Set([
    path.join(studentPhotoDir, ownerId),
    path.join(uploadDir, 'users', ownerId),
    path.join(uploadDir, ownerId),
    path.join(draftDir, ownerId),
    path.join(trashDir, ownerId),
  ].map((item) => path.resolve(item))));
  const removed = targets.filter((directory) => removeDirectory(directory));
  return { targets, removed };
};

export const sanitizeDownloadFilename = (value = 'download') => sanitizeOriginalFilename(value || 'download');

const encodeRfc5987 = (value) => encodeURIComponent(value).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

export const buildContentDisposition = (filename, disposition = 'attachment') => {
  const safeName = sanitizeDownloadFilename(filename);
  const asciiFallback = safeName
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_') || 'download';
  const mode = disposition === 'inline' ? 'inline' : 'attachment';
  return `${mode}; filename="${asciiFallback}"; filename*=UTF-8''${encodeRfc5987(safeName)}`;
};

export const inferSafeMimeType = (filename, fallback = 'application/octet-stream') => {
  const extension = path.extname(String(filename || '')).toLowerCase();
  const known = {
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp',
  };
  return known[extension] || (SAFE_DOCUMENT_MIME_TYPES.has(normalizeMimeType(fallback)) ? normalizeMimeType(fallback) : 'application/octet-stream');
};

export const sendSecureAsset = (res, absolutePath, {
  filename = 'download',
  contentType = 'application/octet-stream',
  disposition = 'attachment',
} = {}) => {
  const stats = fs.statSync(absolutePath);
  res.setHeader('Content-Type', inferSafeMimeType(filename, contentType));
  res.setHeader('Content-Length', String(stats.size));
  res.setHeader('Content-Disposition', buildContentDisposition(filename, disposition));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');

  const stream = fs.createReadStream(absolutePath);
  stream.on('error', (error) => {
    if (!res.headersSent) res.status(500).json({ error: 'file read failed' });
    else res.destroy(error);
  });
  stream.pipe(res);
};
