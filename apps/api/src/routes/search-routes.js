export const registerSearchRoutes = ({ app, auth, searchService }) => {
  app.get('/api/search', auth, (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const scope = String(req.query.scope || 'all').trim();
      const limit = Number(req.query.limit || 80);
      const year = String(req.query.year || '').trim();

      if (!q) {
        return res.json({ query: '', scope, total: 0, counts: {}, results: [] });
      }

      return res.json(searchService.search(req.user.id, { q, scope, limit, year }));
    } catch (error) {
      return res.status(500).json({ error: String(error?.message || error || 'search failed') });
    }
  });

  app.post('/api/search/reindex', auth, (req, res) => {
    try {
      if (typeof searchService.reindex !== 'function') {
        return res.status(503).json({ error: 'search index is not enabled' });
      }
      const documentCount = searchService.reindex(req.user.id);
      return res.json({ ok: true, documentCount, mode: searchService.indexMode });
    } catch (error) {
      return res.status(500).json({ error: String(error?.message || error || 'search reindex failed') });
    }
  });
};
