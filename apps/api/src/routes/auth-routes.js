import {
  LEGACY_MASTER_ADMIN_USERNAME,
  secureCompare,
  validateNewPassword,
} from '../utils/authSecurity.js';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const DUMMY_PASSWORD_SALT = 'teacher-notebook-invalid-login';

const normalizeRememberMe = (value) => value === true || value === 1 || value === '1' || value === 'true';
const toPublicUser = (user) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  role: user.role,
});

const createLoginAttemptTracker = () => {
  const attempts = new Map();

  const getKey = (req, username) => `${String(req.socket?.remoteAddress || req.ip || 'unknown')}|${username}`;
  const getBlockSeconds = (req, username) => {
    const key = getKey(req, username);
    const entry = attempts.get(key);
    if (!entry) return 0;
    const now = Date.now();
    if (entry.blockedUntil > now) return Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000));
    if (now - entry.firstFailureAt > LOGIN_WINDOW_MS) attempts.delete(key);
    return 0;
  };
  const recordFailure = (req, username) => {
    const key = getKey(req, username);
    const now = Date.now();
    const current = attempts.get(key);
    const entry = !current || now - current.firstFailureAt > LOGIN_WINDOW_MS
      ? { count: 0, firstFailureAt: now, blockedUntil: 0 }
      : current;
    entry.count += 1;
    if (entry.count >= LOGIN_MAX_FAILURES) entry.blockedUntil = now + LOGIN_BLOCK_MS;
    attempts.set(key, entry);

    if (attempts.size > 1000) {
      for (const [attemptKey, value] of attempts.entries()) {
        if (value.blockedUntil <= now && now - value.firstFailureAt > LOGIN_WINDOW_MS) attempts.delete(attemptKey);
      }
    }
  };
  const clear = (req, username) => attempts.delete(getKey(req, username));

  return { getBlockSeconds, recordFailure, clear };
};

export const createDeleteUserCascade = ({
  phase1Store,
  phase2Store,
  phase3Store,
  phase4Store,
  phase6Store,
  draftStore,
  trashStore,
  removeOwnedUploadRows,
  removeUserDirectories,
  runOwnerDeletionTransaction,
}) => (userId) => {
  const ownerId = Number(userId);
  const ownedUploadRows = phase1Store.listFiles(ownerId, { includeAttachments: true });
  const deleteDatabaseRows = () => {
    draftStore?.deleteOwnerData?.(ownerId);
    trashStore?.deleteOwnerData?.(ownerId);
    phase6Store?.deleteOwnerPhase6Data?.(ownerId);
    phase3Store.deleteOwnerPhase3Data(ownerId);
    phase2Store.deleteOwnerPhase2Data(ownerId);
    phase1Store.deleteOwnerPhase1Data(ownerId);
    phase4Store.deleteOwnerPhase4Data(ownerId);
  };

  if (typeof runOwnerDeletionTransaction === 'function') runOwnerDeletionTransaction(deleteDatabaseRows);
  else deleteDatabaseRows();

  const removedFiles = typeof removeOwnedUploadRows === 'function'
    ? removeOwnedUploadRows(ownerId, ownedUploadRows)
    : 0;
  removeUserDirectories?.(ownerId);
  return { removedFiles, fileRows: ownedUploadRows.length };
};

export const registerAuthRoutes = ({
  app,
  auth,
  phase1Store,
  phase2Store,
  phase3Store,
  phase4Store,
  phase6Store,
  draftStore,
  trashStore,
  removeOwnedUploadRows,
  removeUserDirectories,
  runOwnerDeletionTransaction,
  hashPassword,
  isMasterAdmin,
  makeSalt,
  makeToken,
  normalizeUsername,
}) => {
  const loginAttempts = createLoginAttemptTracker();
  const deleteUserCascade = createDeleteUserCascade({
    phase1Store,
    phase2Store,
    phase3Store,
    phase4Store,
    phase6Store,
    draftStore,
    trashStore,
    removeOwnedUploadRows,
    removeUserDirectories,
    runOwnerDeletionTransaction,
  });

  app.post('/api/auth/bootstrap-admin', (req, res) => {
    const expectedToken = String(process.env.TEACHER_NOTEBOOK_ADMIN_BOOTSTRAP_TOKEN || '');
    if (!expectedToken) return res.status(404).json({ error: 'admin bootstrap is disabled' });
    if (phase4Store.hasAdmin()) return res.status(409).json({ error: 'admin already exists' });

    const { bootstrapToken = '', name = '', username = '', userId = '', password = '' } = req.body || {};
    if (!secureCompare(bootstrapToken, expectedToken)) return res.status(403).json({ error: 'invalid bootstrap token' });

    const finalUsername = normalizeUsername(username || userId);
    const passwordError = validateNewPassword(password);
    if (!String(name || '').trim() || !finalUsername || !password) return res.status(400).json({ error: 'name/username/password required' });
    if (!/^\S{3,30}$/.test(finalUsername)) return res.status(400).json({ error: 'username must be 3-30 chars (no spaces)' });
    if (passwordError) return res.status(400).json({ error: passwordError });

    const existing = phase4Store.findUserByUsername(finalUsername);
    if (existing) {
      const candidateHash = hashPassword(password, existing.salt);
      if (!secureCompare(candidateHash, existing.password_hash)) return res.status(401).json({ error: 'invalid credentials' });
      const promoted = phase4Store.setUserRole(existing.id, 'admin');
      return res.status(200).json({ ok: true, user: toPublicUser(promoted) });
    }

    const salt = makeSalt();
    const user = phase4Store.createUser({
      name: String(name || '').trim(),
      username: finalUsername,
      salt,
      passwordHash: hashPassword(password, salt),
      role: 'admin',
    });
    return res.status(201).json({ ok: true, user: toPublicUser(user) });
  });

  app.post('/api/auth/register', (req, res) => {
    const { name = '', username = '', userId = '', password = '' } = req.body || {};
    const finalUsername = normalizeUsername(username || userId);
    const passwordError = validateNewPassword(password);
    if (!String(name || '').trim() || !finalUsername || !password) return res.status(400).json({ error: 'name/username/password required' });
    if (!/^\S{3,30}$/.test(finalUsername)) return res.status(400).json({ error: 'username must be 3-30 chars (no spaces)' });
    if (finalUsername === LEGACY_MASTER_ADMIN_USERNAME) return res.status(409).json({ error: 'reserved username' });
    if (passwordError) return res.status(400).json({ error: passwordError });
    if (phase4Store.findUserByUsername(finalUsername)) return res.status(409).json({ error: 'username already exists' });

    const salt = makeSalt();
    phase4Store.createUser({
      name: String(name || '').trim(),
      username: finalUsername,
      salt,
      passwordHash: hashPassword(password, salt),
      role: 'user',
    });
    return res.status(201).json({ ok: true });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username = '', userId = '', password = '', rememberMe = false } = req.body || {};
    const finalUsername = normalizeUsername(username || userId);
    if (!finalUsername || String(password || '').length > 256) return res.status(401).json({ error: 'invalid credentials' });
    const blockedSeconds = loginAttempts.getBlockSeconds(req, finalUsername);
    if (blockedSeconds > 0) {
      res.setHeader('Retry-After', String(blockedSeconds));
      return res.status(429).json({ error: 'too many login attempts', retryAfter: blockedSeconds });
    }

    const user = phase4Store.findUserByLogin(finalUsername);
    const candidateHash = hashPassword(password, user?.salt || DUMMY_PASSWORD_SALT);
    if (!user || !secureCompare(candidateHash, user.password_hash)) {
      loginAttempts.recordFailure(req, finalUsername);
      return res.status(401).json({ error: 'invalid credentials' });
    }

    loginAttempts.clear(req, finalUsername);
    const token = makeToken();
    const shouldRemember = normalizeRememberMe(rememberMe);
    const session = phase4Store.createSession(user.id, token, { rememberMe: shouldRemember });
    return res.json({
      token,
      user: toPublicUser(user),
      expiresAt: session.expires_at,
      rememberMe: Boolean(session.remember_me),
    });
  });

  app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user, session: req.session }));

  app.post('/api/auth/logout', auth, (req, res) => {
    phase4Store.revokeSessionByToken(req.token);
    return res.json({ ok: true });
  });

  app.post('/api/auth/change-password', auth, (req, res) => {
    const { currentPassword = '', newPassword = '' } = req.body || {};
    const passwordError = validateNewPassword(newPassword);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const me = phase4Store.getUserById(req.user.id);
    if (!me) return res.status(404).json({ error: 'user not found' });

    const hashedCurrent = hashPassword(String(currentPassword || ''), me.salt);
    if (!secureCompare(hashedCurrent, me.password_hash)) return res.status(401).json({ error: 'current password mismatch' });

    phase4Store.updatePassword(me.id, hashPassword(String(newPassword || ''), me.salt));
    const revokedOtherSessions = phase4Store.revokeSessionsForUser(me.id, { exceptToken: req.token });
    return res.json({ ok: true, revokedOtherSessions });
  });

  app.get('/api/admin/users', auth, (req, res) => {
    if (!isMasterAdmin(req.user)) return res.status(403).json({ error: 'forbidden' });
    const out = phase4Store.listUsers().map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      created_at: user.created_at || null,
      updated_at: user.updated_at || null,
    }));
    return res.json(out);
  });

  app.post('/api/admin/users/:id/change-password', auth, (req, res) => {
    if (!isMasterAdmin(req.user)) return res.status(403).json({ error: 'forbidden' });
    const { newPassword = '' } = req.body || {};
    const passwordError = validateNewPassword(newPassword);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const target = phase4Store.getUserById(Number(req.params.id));
    if (!target) return res.status(404).json({ error: 'user not found' });

    phase4Store.updatePassword(target.id, hashPassword(String(newPassword || ''), target.salt));
    const revokedSessions = phase4Store.revokeSessionsForUser(target.id);
    return res.json({ ok: true, revokedSessions });
  });

  app.delete('/api/admin/users/:id', auth, (req, res) => {
    if (!isMasterAdmin(req.user)) return res.status(403).json({ error: 'forbidden' });
    const targetId = Number(req.params.id);
    if (!Number.isFinite(targetId)) return res.status(400).json({ error: 'invalid user id' });
    if (targetId === req.user.id) return res.status(400).json({ error: 'cannot delete self' });

    const exists = phase4Store.getUserById(targetId);
    if (!exists) return res.status(404).json({ error: 'user not found' });
    if (exists.role === 'admin' && phase4Store.countAdmins() <= 1) return res.status(409).json({ error: 'cannot delete the last admin' });

    deleteUserCascade(targetId);
    return res.json({ ok: true });
  });

  app.delete('/api/auth/delete-account', auth, (req, res) => {
    const { username = '' } = req.body || {};
    const typed = normalizeUsername(username);
    const me = phase4Store.getUserById(req.user.id);
    if (!me) return res.status(404).json({ error: 'user not found' });

    const myUsername = normalizeUsername(me.username || me.email || '');
    if (!typed || typed !== myUsername) return res.status(400).json({ error: 'username confirmation mismatch' });
    if (me.role === 'admin' && phase4Store.countAdmins() <= 1) return res.status(409).json({ error: 'cannot delete the last admin' });

    deleteUserCascade(req.user.id);
    return res.json({ ok: true });
  });
};
