import { getSeoulWeekday } from '../utils/dateTime.js';

export const registerComtimeRoutes = ({ app, auth, comtimeService }) => {
  app.get('/api/comtime/teachers', auth, async (req, res) => {
    try {
      const { schoolCode } = req.query;
      if (!schoolCode) return res.status(400).json({ error: 'schoolCode is required' });
      res.json(await comtimeService.getTeachers(String(schoolCode)));
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.get('/api/comtime/date-options', auth, async (req, res) => {
    try {
      const { schoolCode } = req.query;
      if (!schoolCode) return res.status(400).json({ error: 'schoolCode is required' });
      res.json(await comtimeService.getDateOptions(String(schoolCode)));
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.get('/api/comtime/timetable', auth, async (req, res) => {
    try {
      const { schoolCode, teacherNo, weekday, week } = req.query;
      if (!schoolCode || teacherNo === undefined) return res.status(400).json({ error: 'schoolCode and teacherNo are required' });
      const wd = Number(weekday ?? getSeoulWeekday());
      if (![0, 1, 2, 3, 4, 5, 6].includes(wd)) return res.status(400).json({ error: 'weekday must be 0-6' });
      const weekOffset = Number(week ?? 1);
      res.json(await comtimeService.getTeacherTimetable(String(schoolCode), Number(teacherNo), wd, weekOffset));
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.get('/api/comtime/homeroom', auth, async (req, res) => {
    try {
      const { schoolCode, homeroom, weekday, week } = req.query;
      if (!schoolCode || !homeroom) return res.status(400).json({ error: 'schoolCode and homeroom are required' });
      const wd = Number(weekday ?? getSeoulWeekday());
      if (![0, 1, 2, 3, 4, 5, 6].includes(wd)) return res.status(400).json({ error: 'weekday must be 0-6' });
      const weekOffset = Number(week ?? 1);
      res.json(await comtimeService.getHomeroomTimetable(String(schoolCode), String(homeroom), wd, weekOffset));
    } catch (e) {
      const message = String(e?.message || e);
      if (message === 'homeroom format should be grade-class (e.g. 1-5)') {
        return res.status(400).json({ error: message });
      }
      res.status(500).json({ error: message });
    }
  });
};
