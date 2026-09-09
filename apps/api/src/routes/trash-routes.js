const parseBoolean = (value) => ['1', 'true', 'yes'].includes(String(value || '').toLowerCase());
const parseTrashId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export const sendTrashError = (res, error) => {
  const message = String(error?.message || error || 'trash operation failed');
  const statusCode = Number(error?.statusCode || 0);
  if ([400, 404, 409].includes(statusCode)) {
    return res.status(statusCode).json({ error: message, code: String(error?.code || 'TRASH_OPERATION_FAILED') });
  }
  if (message.includes('UNIQUE constraint failed') || message.includes('already in use') || message.includes('changed')) {
    return res.status(409).json({ error: message, code: 'TRASH_RESTORE_CONFLICT' });
  }
  if (message.includes('not supported') || message.includes('already restored')) {
    return res.status(409).json({ error: message, code: 'TRASH_STATE_CONFLICT' });
  }
  if (message.includes('expired')) return res.status(409).json({ error: message, code: 'TRASH_ITEM_EXPIRED' });
  if (message.includes('required') || message.includes('invalid') || message.includes('too large')) {
    return res.status(400).json({ error: message, code: 'TRASH_INVALID_REQUEST' });
  }
  return res.status(500).json({ error: message, code: 'TRASH_OPERATION_FAILED' });
};

export const registerTrashRoutes = ({ app, auth, trashService }) => {
  app.get('/api/trash', auth, (req, res) => {
    try {
      const cleanup = trashService.purgeExpired(req.user.id);
      if (cleanup.cleanup_failures.length) {
        console.warn('[Trash] request cleanup failed', cleanup.cleanup_failures);
      }
      const rows = trashService.list(req.user.id, {
        entityType: req.query.entityType,
        includeRestored: parseBoolean(req.query.includeRestored),
        limit: req.query.limit,
        offset: req.query.offset,
      });
      res.json({ items: rows, stats: trashService.getStats(req.user.id) });
    } catch (error) {
      sendTrashError(res, error);
    }
  });

  app.get('/api/trash/:id', auth, (req, res) => {
    try {
      const id = parseTrashId(req.params.id);
      if (!id) return res.status(400).json({ error: 'invalid trash id', code: 'TRASH_INVALID_REQUEST' });
      const row = trashService.get(req.user.id, id);
      if (!row) return res.status(404).json({ error: 'trash item not found' });
      return res.json(row);
    } catch (error) {
      return sendTrashError(res, error);
    }
  });

  app.post('/api/trash/:id/restore', auth, (req, res) => {
    try {
      const id = parseTrashId(req.params.id);
      if (!id) return res.status(400).json({ error: 'invalid trash id', code: 'TRASH_INVALID_REQUEST' });
      const result = trashService.restore(req.user.id, id);
      if (!result) return res.status(404).json({ error: 'trash item not found' });
      return res.json(result);
    } catch (error) {
      return sendTrashError(res, error);
    }
  });

  app.delete('/api/trash/:id', auth, (req, res) => {
    try {
      const id = parseTrashId(req.params.id);
      if (!id) return res.status(400).json({ error: 'invalid trash id', code: 'TRASH_INVALID_REQUEST' });
      const row = trashService.remove(req.user.id, id);
      if (!row) return res.status(404).json({ error: 'trash item not found' });
      return res.json({ ok: true, removed: row });
    } catch (error) {
      return sendTrashError(res, error);
    }
  });

  app.post('/api/trash/purge-expired', auth, (req, res) => {
    try {
      const result = trashService.purgeExpired(req.user.id, req.body?.now);
      res.json({
        ok: result.cleanup_failures.length === 0,
        removed_count: result.removed.length,
        cleanup_failures: result.cleanup_failures,
      });
    } catch (error) {
      sendTrashError(res, error);
    }
  });
};
