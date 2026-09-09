import { getSeoulDateText } from '../utils/dateTime.js';

export const registerPgCoreRoutes = ({ app, pool }) => {
  app.get('/api/students', async (req, res) => {
    const { year } = req.query;
    if (year) {
      const { rows } = await pool.query('SELECT * FROM students WHERE academic_year=$1 ORDER BY id DESC', [String(year)]);
      return res.json(rows);
    }
    const { rows } = await pool.query('SELECT * FROM students ORDER BY id DESC');
    res.json(rows);
  });

  app.post('/api/students', async (req, res) => {
    const { academicYear = '', name, className = '', studentNo = '', memo = '', riskLevel = 'normal', tags = '', studentTrack = 'course', transferredAt = '', basicSurvey = '' } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const { rows } = await pool.query(
      'INSERT INTO students(academic_year, name, class_name, student_no, memo, risk_level, tags, student_track, transferred_at, basic_survey) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [String(academicYear), name.trim(), className.trim(), studentNo.trim(), memo, riskLevel, tags, studentTrack, String(transferredAt || ''), String(basicSurvey || '')]
    );
    res.status(201).json(rows[0]);
  });

  app.post('/api/students/bulk', async (req, res) => {
    const { students: bulk = [] } = req.body || {};
    if (!Array.isArray(bulk) || !bulk.length) return res.status(400).json({ error: 'students array is required' });

    const inserted = [];
    for (const student of bulk) {
      const name = String(student.name || '').trim();
      if (!name) continue;
      const className = String(student.className || '').trim();
      const studentNo = String(student.studentNo || '').trim();
      const riskLevel = String(student.riskLevel || 'normal');
      const tags = String(student.tags || '');
      const studentTrack = String(student.studentTrack || 'course');
      const academicYear = String(student.academicYear || '');
      const { rows } = await pool.query(
        'INSERT INTO students(academic_year, name, class_name, student_no, memo, risk_level, tags, student_track, transferred_at, basic_survey) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
        [academicYear, name, className, studentNo, '', riskLevel, tags, studentTrack, String(student.transferredAt || ''), String(student.basicSurvey || '')]
      );
      inserted.push(rows[0]);
    }

    res.status(201).json({ count: inserted.length, students: inserted });
  });

  app.get('/api/students/:id', async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM students WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'student not found' });
    res.json(rows[0]);
  });

  app.get('/api/students/by-slug/:slug', async (req, res) => {
    const match = String(req.params.slug || '').match(/^(\d{4})-(\d)(\d{2})(\d{2})$/);
    if (!match) return res.status(400).json({ error: 'invalid slug format' });

    const year = match[1];
    const grade = Number(match[2]);
    const klass = Number(match[3]);
    const no = Number(match[4]);

    const exact = await pool.query(
      `SELECT *
       FROM students
       WHERE academic_year = $1
         AND split_part(class_name, '-', 1) ~ '^[0-9]+$'
         AND split_part(class_name, '-', 2) ~ '^[0-9]+$'
         AND student_no ~ '^[0-9]+$'
         AND CAST(split_part(class_name, '-', 1) AS INTEGER) = $2
         AND CAST(split_part(class_name, '-', 2) AS INTEGER) = $3
         AND CAST(student_no AS INTEGER) = $4
       ORDER BY id DESC
       LIMIT 1`,
      [year, grade, klass, no]
    );
    if (exact.rows.length) return res.json(exact.rows[0]);

    const fallback = await pool.query(
      `SELECT *
       FROM students
       WHERE split_part(class_name, '-', 1) ~ '^[0-9]+$'
         AND split_part(class_name, '-', 2) ~ '^[0-9]+$'
         AND student_no ~ '^[0-9]+$'
         AND CAST(split_part(class_name, '-', 1) AS INTEGER) = $1
         AND CAST(split_part(class_name, '-', 2) AS INTEGER) = $2
         AND CAST(student_no AS INTEGER) = $3
       ORDER BY id DESC
       LIMIT 1`,
      [grade, klass, no]
    );

    if (!fallback.rows.length) return res.status(404).json({ error: 'student not found by slug' });
    res.json(fallback.rows[0]);
  });

  app.patch('/api/students/:id', async (req, res) => {
    const current = await pool.query('SELECT * FROM students WHERE id=$1', [req.params.id]);
    if (!current.rowCount) return res.status(404).json({ error: 'student not found' });
    const prev = current.rows[0];
    const {
      name = prev.name,
      className = prev.class_name,
      studentNo = prev.student_no,
      memo = prev.memo,
      riskLevel = prev.risk_level,
      tags = prev.tags,
      studentTrack = prev.student_track,
      transferredAt = (req.body?.transferredAt ?? req.body?.transferred_at ?? prev.transferred_at ?? ''),
      basicSurvey = (req.body?.basicSurvey ?? prev.basic_survey ?? ''),
    } = req.body || {};
    const { rows } = await pool.query(
      'UPDATE students SET name=$1, class_name=$2, student_no=$3, memo=$4, risk_level=$5, tags=$6, student_track=$7, transferred_at=$8, basic_survey=$9, updated_at=NOW() WHERE id=$10 RETURNING *',
      [name, className, studentNo, memo, riskLevel, tags, studentTrack, String(transferredAt || ''), String(basicSurvey || ''), req.params.id]
    );
    res.json(rows[0]);
  });

  app.delete('/api/students/:id', async (req, res) => {
    await pool.query('DELETE FROM students WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  });

  app.get('/api/notes', async (req, res) => {
    const { studentId, year } = req.query;
    let query = `
      SELECT n.*, s.name as student_name
      FROM counseling_notes n
      LEFT JOIN students s ON s.id = n.student_id
    `;
    const params = [];
    const where = [];
    if (studentId) {
      params.push(studentId);
      where.push(`n.student_id = $${params.length}`);
    }
    if (year) {
      params.push(String(year));
      where.push(`n.academic_year = $${params.length}`);
    }
    if (where.length) query += ` WHERE ${where.join(' AND ')} `;
    query += ' ORDER BY n.note_date DESC, n.id DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  });

  app.post('/api/notes', async (req, res) => {
    const { academicYear = '', studentId, noteDate, category = 'general', content } = req.body || {};
    if (!studentId) return res.status(400).json({ error: 'studentId is required' });
    if (!content?.trim()) return res.status(400).json({ error: 'content is required' });
    const { rows } = await pool.query(
      'INSERT INTO counseling_notes(academic_year, student_id, note_date, category, content) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [String(academicYear), studentId, noteDate || getSeoulDateText(), category, content.trim()]
    );
    res.status(201).json(rows[0]);
  });

  app.patch('/api/notes/:id', async (req, res) => {
    const current = await pool.query('SELECT * FROM counseling_notes WHERE id=$1', [req.params.id]);
    if (!current.rowCount) return res.status(404).json({ error: 'note not found' });
    const prev = current.rows[0];
    const { category = prev.category, content = prev.content, noteDate = prev.note_date } = req.body || {};
    const { rows } = await pool.query(
      'UPDATE counseling_notes SET category=$1, content=$2, note_date=$3 WHERE id=$4 RETURNING *',
      [category, content, noteDate, req.params.id]
    );
    res.json(rows[0]);
  });

  app.delete('/api/notes/:id', async (req, res) => {
    await pool.query('DELETE FROM counseling_notes WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  });

  app.get('/api/schedules', async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM schedules ORDER BY COALESCE(due_at, NOW()) ASC, id DESC');
    res.json(rows);
  });

  app.post('/api/schedules', async (req, res) => {
    const { title, dueAt = null, importance = 'normal' } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
    const { rows } = await pool.query(
      'INSERT INTO schedules(title, due_at, importance) VALUES ($1,$2,$3) RETURNING *',
      [title.trim(), dueAt, importance]
    );
    res.status(201).json(rows[0]);
  });

  app.patch('/api/schedules/:id/toggle', async (req, res) => {
    const { rows } = await pool.query('UPDATE schedules SET done = NOT done WHERE id=$1 RETURNING *', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'schedule not found' });
    res.json(rows[0]);
  });

  app.delete('/api/schedules/:id', async (req, res) => {
    await pool.query('DELETE FROM schedules WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  });
};
