export const registerPhase3Routes = ({ app, auth, phase3Store }) => {
  app.get('/api/clubs', auth, (req, res) => {
    const { year = '' } = req.query;
    res.json(phase3Store.listClubs(req.user.id, { year }));
  });

  app.post('/api/clubs', auth, (req, res) => {
    const { academicYear = '', name = '', useForAttendance = false, studentIds = [] } = req.body || {};
    const normalizedName = String(name || '').trim();
    if (!normalizedName) return res.status(400).json({ error: 'name is required' });
    try {
      const row = phase3Store.createClub(req.user.id, { academicYear, name: normalizedName, useForAttendance, studentIds });
      res.status(201).json(row);
    } catch (e) {
      const message = String(e?.message || e || 'club save failed');
      if (message === 'club name already exists' || message === 'name is required') return res.status(400).json({ error: message });
      res.status(500).json({ error: message });
    }
  });

  app.patch('/api/clubs/:id', auth, (req, res) => {
    const clubId = Number(req.params.id);
    const row = phase3Store.getClub(req.user.id, clubId);
    if (!row) return res.status(404).json({ error: 'club not found' });
    try {
      const updated = phase3Store.updateClub(req.user.id, clubId, req.body || {});
      res.json(updated);
    } catch (e) {
      const message = String(e?.message || e || 'club update failed');
      if (message === 'club name already exists' || message === 'name is required') return res.status(400).json({ error: message });
      res.status(500).json({ error: message });
    }
  });

  app.delete('/api/clubs/:id', auth, (req, res) => {
    const clubId = Number(req.params.id);
    const row = phase3Store.deleteClub(req.user.id, clubId);
    if (!row) return res.status(404).json({ error: 'club not found' });
    res.json({ ok: true });
  });

  app.get('/api/attendance', auth, (req, res) => {
    const { kind = 'homeroom', date = '', className = '', period = '' } = req.query;
    res.json(phase3Store.listAttendance(req.user.id, { kind, date, className, period }));
  });

  app.post('/api/attendance/upsert', auth, (req, res) => {
    const { kind = 'homeroom', date = '', className = '', period = '', entries = [] } = req.body || {};
    if (!date || !className || !period) return res.status(400).json({ error: 'date/className/period required' });
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries array required' });
    const row = phase3Store.upsertAttendance(req.user.id, { kind, date, className, period, entries });
    const created = String(row.created_at || '') === String(row.updated_at || '');
    res.status(created ? 201 : 200).json(row);
  });
};
