const parseStudentId = (value) => {
  const text = String(value || '');
  if (!/^[1-9]\d*$/.test(text)) return 0;
  const id = Number(text);
  return Number.isSafeInteger(id) ? id : 0;
};

export const registerStudentTimelineRoutes = ({ app, auth, studentTimelineStore }) => {
  app.get('/api/students/:id/timeline', auth, (req, res) => {
    const studentId = parseStudentId(req.params.id);
    if (!studentId) return res.status(400).json({ error: 'invalid student id' });

    const timeline = studentTimelineStore.getStudentTimeline(req.user.id, studentId);
    if (!timeline) return res.status(404).json({ error: 'student not found' });
    return res.json(timeline);
  });
};

