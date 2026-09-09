const MAX_DRAFT_BYTES = 1024 * 1024;

const normalizeDraftKey = (value) => {
  const key = String(value || '').trim();
  if (!key || key.length > 160 || !/^[a-z0-9:_-]+$/i.test(key)) return '';
  return key;
};

export const registerDraftRoutes = ({ app, auth, draftsStore }) => {
  app.get('/api/drafts', auth, (req, res) => {
    res.json(draftsStore.list(req.user.id));
  });

  app.get('/api/drafts/:key', auth, (req, res) => {
    const key = normalizeDraftKey(req.params.key);
    if (!key) return res.status(400).json({ error: 'invalid draft key' });
    return res.json(draftsStore.get(req.user.id, key));
  });

  app.put('/api/drafts/:key', auth, (req, res) => {
    const key = normalizeDraftKey(req.params.key);
    if (!key) return res.status(400).json({ error: 'invalid draft key' });
    const payload = req.body?.payload ?? {};
    const encoded = JSON.stringify(payload);
    if (Buffer.byteLength(encoded, 'utf8') > MAX_DRAFT_BYTES) {
      return res.status(413).json({ error: 'draft is too large' });
    }
    return res.json(draftsStore.upsert(req.user.id, key, payload));
  });

  app.delete('/api/drafts/:key', auth, (req, res) => {
    const key = normalizeDraftKey(req.params.key);
    if (!key) return res.status(400).json({ error: 'invalid draft key' });
    draftsStore.remove(req.user.id, key);
    return res.json({ ok: true });
  });
};
