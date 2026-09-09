import crypto from 'crypto';

export const LEGACY_MASTER_ADMIN_USERNAME = 'leetk321';

export const normalizeUsername = (value = '') => String(value || '').trim().toLowerCase();

export const hashPassword = (password, salt) => crypto.scryptSync(String(password || ''), String(salt || ''), 64).toString('hex');

export const makeSalt = () => crypto.randomBytes(16).toString('hex');

export const makeToken = () => crypto.randomBytes(32).toString('hex');

export const secureCompare = (left, right) => {
  const leftDigest = crypto.createHash('sha256').update(String(left || ''), 'utf8').digest();
  const rightDigest = crypto.createHash('sha256').update(String(right || ''), 'utf8').digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
};

export const validateNewPassword = (password) => {
  const value = String(password || '');
  if (value.length < 8) return 'password must be at least 8 characters';
  if (value.length > 256) return 'password must be 256 characters or fewer';
  return '';
};

export const isMasterAdmin = (user) => String(user?.role || '').trim().toLowerCase() === 'admin';
