import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const PHASE4_MIGRATION_NAME = '20260328_phase4_auth_entities';
const AUTH_SECURITY_MIGRATION_NAME = '20260722_phase4_auth_security';

export const DEFAULT_SESSION_TTL_MS = 60 * 60 * 1000;
export const REMEMBERED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const SESSION_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const REVOKED_SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;
const LEGACY_MASTER_ADMIN_USERNAME = 'leetk321';

const normalizeLoginValue = (value = '') => String(value || '').trim().toLowerCase();
const normalizeRole = (value = '') => (String(value || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user');
const hashSessionToken = (token = '') => crypto.createHash('sha256').update(String(token || '')).digest('hex');

const toValidIso = (value, fallback) => {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
};

const normalizeUserRow = (row = {}) => ({
  id: Number(row?.id || 0),
  name: String(row?.name || '').trim(),
  username: normalizeLoginValue(row?.username || row?.email || ''),
  email: normalizeLoginValue(row?.email || ''),
  salt: String(row?.salt || ''),
  password_hash: String(row?.password_hash || ''),
  role: normalizeRole(row?.role),
  created_at: String(row?.created_at || ''),
  updated_at: String(row?.updated_at || ''),
});

const normalizeSessionRow = (row = {}) => {
  const createdAt = toValidIso(row?.created_at, new Date().toISOString());
  return {
    token: String(row?.token || ''),
    user_id: Number(row?.user_id || 0),
    created_at: createdAt,
    expires_at: toValidIso(row?.expires_at, new Date(Date.parse(createdAt) + DEFAULT_SESSION_TTL_MS).toISOString()),
    last_seen_at: toValidIso(row?.last_seen_at, createdAt),
    revoked_at: row?.revoked_at ? toValidIso(row.revoked_at, createdAt) : '',
    remember_me: Number(row?.remember_me || 0) === 1 ? 1 : 0,
  };
};

const ensureBackupFile = (dataDir, legacyDb) => {
  const backupDir = path.join(dataDir, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${PHASE4_MIGRATION_NAME}.json`);
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, JSON.stringify(legacyDb, null, 2), 'utf8');
  }
};

const getTableColumns = (sqlite, tableName) => new Set(
  sqlite.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => String(row.name || '')),
);

const addColumnIfMissing = (sqlite, tableName, columnName, definition) => {
  if (!getTableColumns(sqlite, tableName).has(columnName)) {
    sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
};

const ensurePhase4Tables = (sqlite) => {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS tn_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_rows (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_rows (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL DEFAULT '',
  last_seen_at TEXT NOT NULL DEFAULT '',
  revoked_at TEXT NOT NULL DEFAULT '',
  remember_me INTEGER NOT NULL DEFAULT 0
);
`);

  addColumnIfMissing(sqlite, 'user_rows', 'role', "TEXT NOT NULL DEFAULT 'user'");
  addColumnIfMissing(sqlite, 'session_rows', 'expires_at', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(sqlite, 'session_rows', 'last_seen_at', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(sqlite, 'session_rows', 'revoked_at', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(sqlite, 'session_rows', 'remember_me', 'INTEGER NOT NULL DEFAULT 0');

  sqlite.exec(`
CREATE INDEX IF NOT EXISTS idx_user_rows_username ON user_rows(username);
CREATE INDEX IF NOT EXISTS idx_user_rows_email ON user_rows(email);
CREATE INDEX IF NOT EXISTS idx_user_rows_role ON user_rows(role, id);
CREATE INDEX IF NOT EXISTS idx_session_rows_user_id ON session_rows(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_rows_expiry ON session_rows(expires_at);
`);
};

export const createPhase4Store = ({ sqlite, dataDir, readLegacySnapshot, sequenceStore }) => {
  ensurePhase4Tables(sqlite);

  const getMigrationRowStmt = sqlite.prepare('SELECT name FROM tn_migrations WHERE name = ?');
  const insertMigrationStmt = sqlite.prepare('INSERT INTO tn_migrations(name, applied_at) VALUES(?, ?)');

  const upsertUserStmt = sqlite.prepare(`
    INSERT INTO user_rows(id, name, username, email, salt, password_hash, role, created_at, updated_at)
    VALUES(@id, @name, @username, @email, @salt, @password_hash, @role, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      username = excluded.username,
      email = excluded.email,
      salt = excluded.salt,
      password_hash = excluded.password_hash,
      role = excluded.role,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);
  const getUserByIdStmt = sqlite.prepare('SELECT * FROM user_rows WHERE id = ? LIMIT 1');
  const findUserByUsernameStmt = sqlite.prepare('SELECT * FROM user_rows WHERE username = ? LIMIT 1');
  const findUserByEmailStmt = sqlite.prepare("SELECT * FROM user_rows WHERE email = ? AND email <> '' LIMIT 1");
  const listUserRowsStmt = sqlite.prepare('SELECT * FROM user_rows ORDER BY id ASC');
  const countAdminsStmt = sqlite.prepare("SELECT COUNT(*) AS count FROM user_rows WHERE role = 'admin'");
  const deleteUserStmt = sqlite.prepare('DELETE FROM user_rows WHERE id = ?');
  const updateUserRoleStmt = sqlite.prepare('UPDATE user_rows SET role = ?, updated_at = ? WHERE id = ?');

  const upsertSessionStmt = sqlite.prepare(`
    INSERT INTO session_rows(token, user_id, created_at, expires_at, last_seen_at, revoked_at, remember_me)
    VALUES(@token, @user_id, @created_at, @expires_at, @last_seen_at, @revoked_at, @remember_me)
    ON CONFLICT(token) DO UPDATE SET
      user_id = excluded.user_id,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at,
      last_seen_at = excluded.last_seen_at,
      revoked_at = excluded.revoked_at,
      remember_me = excluded.remember_me
  `);
  const getSessionByTokenHashStmt = sqlite.prepare('SELECT * FROM session_rows WHERE token = ? LIMIT 1');
  const touchSessionStmt = sqlite.prepare("UPDATE session_rows SET last_seen_at = ? WHERE token = ? AND revoked_at = ''");
  const revokeSessionStmt = sqlite.prepare("UPDATE session_rows SET revoked_at = ? WHERE token = ? AND revoked_at = ''");
  const revokeSessionsForUserStmt = sqlite.prepare("UPDATE session_rows SET revoked_at = ? WHERE user_id = ? AND revoked_at = ''");
  const revokeOtherSessionsForUserStmt = sqlite.prepare("UPDATE session_rows SET revoked_at = ? WHERE user_id = ? AND token <> ? AND revoked_at = ''");
  const deleteSessionByTokenHashStmt = sqlite.prepare('DELETE FROM session_rows WHERE token = ?');
  const deleteSessionsForUserStmt = sqlite.prepare('DELETE FROM session_rows WHERE user_id = ?');
  const cleanupExpiredSessionsStmt = sqlite.prepare(`
    DELETE FROM session_rows
    WHERE (expires_at <> '' AND expires_at <= ?)
       OR (revoked_at <> '' AND revoked_at <= ?)
  `);

  const runLegacyMigration = sqlite.transaction(() => {
    if (getMigrationRowStmt.get(PHASE4_MIGRATION_NAME)) return;
    const legacyDb = readLegacySnapshot(sqlite);
    ensureBackupFile(dataDir, legacyDb);

    legacyDb.users.forEach((row) => upsertUserStmt.run(normalizeUserRow(row)));
    legacyDb.sessions.forEach((row) => upsertSessionStmt.run(normalizeSessionRow(row)));

    insertMigrationStmt.run(PHASE4_MIGRATION_NAME, new Date().toISOString());
  });

  const runSecurityMigration = sqlite.transaction(() => {
    if (getMigrationRowStmt.get(AUTH_SECURITY_MIGRATION_NAME)) return;

    const adminCount = Number(countAdminsStmt.get()?.count || 0);
    if (adminCount === 0) {
      const legacyAdmin = findUserByUsernameStmt.get(LEGACY_MASTER_ADMIN_USERNAME);
      if (legacyAdmin) updateUserRoleStmt.run('admin', new Date().toISOString(), Number(legacyAdmin.id));
    }

    const sessions = sqlite.prepare('SELECT * FROM session_rows').all();
    const replaceTokenStmt = sqlite.prepare(`
      UPDATE session_rows
      SET token = ?, expires_at = ?, last_seen_at = ?, revoked_at = ?, remember_me = ?
      WHERE token = ?
    `);
    sessions.forEach((rawRow) => {
      const row = normalizeSessionRow(rawRow);
      replaceTokenStmt.run(
        hashSessionToken(row.token),
        row.expires_at,
        row.last_seen_at,
        row.revoked_at,
        row.remember_me,
        row.token,
      );
    });

    insertMigrationStmt.run(AUTH_SECURITY_MIGRATION_NAME, new Date().toISOString());
  });

  runLegacyMigration();
  runSecurityMigration();

  const getUserById = (id) => {
    const row = getUserByIdStmt.get(Number(id));
    return row ? normalizeUserRow(row) : null;
  };

  const findUserByUsername = (username) => {
    const row = findUserByUsernameStmt.get(normalizeLoginValue(username));
    return row ? normalizeUserRow(row) : null;
  };

  const findUserByLogin = (login) => {
    const normalized = normalizeLoginValue(login);
    const userByUsername = findUserByUsernameStmt.get(normalized);
    if (userByUsername) return normalizeUserRow(userByUsername);
    const userByEmail = findUserByEmailStmt.get(normalized);
    return userByEmail ? normalizeUserRow(userByEmail) : null;
  };

  const listUsers = () => listUserRowsStmt.all().map(normalizeUserRow);
  const countAdmins = () => Number(countAdminsStmt.get()?.count || 0);
  const hasAdmin = () => countAdmins() > 0;

  const createUser = sqlite.transaction(({ name, username, email = '', salt, passwordHash, role = 'user' }) => {
    const now = new Date().toISOString();
    const id = Number(sequenceStore.next('user'));

    const row = normalizeUserRow({
      id,
      name,
      username,
      email,
      salt,
      password_hash: passwordHash,
      role,
      created_at: now,
      updated_at: now,
    });

    upsertUserStmt.run(row);
    return row;
  });

  const updatePassword = sqlite.transaction((userId, passwordHash) => {
    const current = getUserById(userId);
    if (!current) return null;

    const next = normalizeUserRow({
      ...current,
      password_hash: String(passwordHash || ''),
      updated_at: new Date().toISOString(),
    });

    upsertUserStmt.run(next);
    return next;
  });

  const setUserRole = sqlite.transaction((userId, role) => {
    const current = getUserById(userId);
    if (!current) return null;
    const normalizedRole = normalizeRole(role);
    updateUserRoleStmt.run(normalizedRole, new Date().toISOString(), current.id);
    return getUserById(current.id);
  });

  let lastCleanupAt = 0;
  const cleanupExpiredSessions = (now = new Date()) => {
    const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now || ''));
    const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
    const nowIso = new Date(safeNowMs).toISOString();
    const revokedBeforeIso = new Date(safeNowMs - REVOKED_SESSION_RETENTION_MS).toISOString();
    const result = cleanupExpiredSessionsStmt.run(nowIso, revokedBeforeIso);
    lastCleanupAt = safeNowMs;
    return Number(result.changes || 0);
  };

  const maybeCleanupExpiredSessions = (nowMs) => {
    if (nowMs - lastCleanupAt >= SESSION_CLEANUP_INTERVAL_MS) cleanupExpiredSessions(new Date(nowMs));
  };

  const getSessionByToken = (token) => {
    const rawToken = String(token || '');
    if (!rawToken) return null;

    const nowMs = Date.now();
    maybeCleanupExpiredSessions(nowMs);

    const tokenHash = hashSessionToken(rawToken);
    const row = getSessionByTokenHashStmt.get(tokenHash);
    if (!row) return null;

    const session = normalizeSessionRow(row);
    const expiresAtMs = Date.parse(session.expires_at);
    if (session.revoked_at || !Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
      if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) deleteSessionByTokenHashStmt.run(tokenHash);
      return null;
    }

    const lastSeenMs = Date.parse(session.last_seen_at);
    if (!Number.isFinite(lastSeenMs) || nowMs - lastSeenMs >= SESSION_TOUCH_INTERVAL_MS) {
      session.last_seen_at = new Date(nowMs).toISOString();
      touchSessionStmt.run(session.last_seen_at, tokenHash);
    }
    return session;
  };

  const createSession = sqlite.transaction((userId, token, options = {}) => {
    const rememberMe = options?.rememberMe === true;
    const now = new Date();
    const requestedTtl = Number(options?.ttlMs);
    const ttlMs = Number.isFinite(requestedTtl) && requestedTtl > 0
      ? requestedTtl
      : (rememberMe ? REMEMBERED_SESSION_TTL_MS : DEFAULT_SESSION_TTL_MS);
    const expiresAt = options?.expiresAt
      ? toValidIso(options.expiresAt, new Date(now.getTime() + ttlMs).toISOString())
      : new Date(now.getTime() + ttlMs).toISOString();
    const row = normalizeSessionRow({
      token: hashSessionToken(token),
      user_id: userId,
      created_at: now.toISOString(),
      expires_at: expiresAt,
      last_seen_at: now.toISOString(),
      revoked_at: '',
      remember_me: rememberMe ? 1 : 0,
    });
    upsertSessionStmt.run(row);
    return row;
  });

  const revokeSessionByToken = sqlite.transaction((token) => {
    const rawToken = String(token || '');
    if (!rawToken) return 0;
    const result = revokeSessionStmt.run(new Date().toISOString(), hashSessionToken(rawToken));
    return Number(result.changes || 0);
  });

  const deleteSessionByToken = sqlite.transaction((token) => {
    const rawToken = String(token || '');
    if (!rawToken) return 0;
    const result = deleteSessionByTokenHashStmt.run(hashSessionToken(rawToken));
    return Number(result.changes || 0);
  });

  const revokeSessionsForUser = sqlite.transaction((userId, { exceptToken = '' } = {}) => {
    const ownerId = Number(userId);
    const revokedAt = new Date().toISOString();
    const result = exceptToken
      ? revokeOtherSessionsForUserStmt.run(revokedAt, ownerId, hashSessionToken(exceptToken))
      : revokeSessionsForUserStmt.run(revokedAt, ownerId);
    return Number(result.changes || 0);
  });

  const deleteOwnerPhase4Data = sqlite.transaction((userId) => {
    const ownerId = Number(userId);
    deleteSessionsForUserStmt.run(ownerId);
    deleteUserStmt.run(ownerId);
  });

  cleanupExpiredSessions();

  return {
    getUserById,
    findUserByUsername,
    findUserByLogin,
    listUsers,
    countAdmins,
    hasAdmin,
    createUser,
    updatePassword,
    setUserRole,
    getSessionByToken,
    createSession,
    revokeSessionByToken,
    revokeSessionsForUser,
    cleanupExpiredSessions,
    deleteSessionByToken,
    deleteOwnerPhase4Data,
  };
};
