export const buildAuthMiddleware = ({ phase4Store }) => (req, res, next) => {
  const raw = req.headers.authorization || '';
  const match = raw.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: 'unauthorized' });

  const token = match[1];
  const session = phase4Store.getSessionByToken(token);
  if (!session) return res.status(401).json({ error: 'session expired or invalid', code: 'SESSION_INVALID' });

  const user = phase4Store.getUserById(session.user_id);
  if (!user) return res.status(401).json({ error: 'user not found' });

  req.user = { id: user.id, name: user.name, username: user.username, role: user.role };
  req.session = {
    expiresAt: session.expires_at,
    lastSeenAt: session.last_seen_at,
    rememberMe: Boolean(session.remember_me),
  };
  req.token = token;
  next();
};
