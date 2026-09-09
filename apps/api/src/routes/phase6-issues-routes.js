import { sendTrashError } from './trash-routes.js';

const extractStudentCode = (value) => {
  const match = String(value || '').match(/(?:^|\s)(\d{5})(?=\s|$)/) || String(value || '').match(/(\d{5})/);
  return match ? match[1] : '';
};

const buildStudentCode = (student) => {
  const classMatch = String(student?.class_name || '').replace(/\s/g, '').match(/^(\d+)-(\d+)$/);
  if (!classMatch) return '';
  const studentNo = Number(student?.student_no);
  if (!Number.isFinite(studentNo)) return '';
  return `${classMatch[1]}${String(Number(classMatch[2])).padStart(2, '0')}${String(studentNo).padStart(2, '0')}`;
};

const findStudentForConsultation = ({ phase2Store, ownerId, academicYear, participantName }) => {
  const studentCode = extractStudentCode(participantName);
  if (!studentCode) return { student: null, studentCode: '' };

  const grade = studentCode.slice(0, 1);
  const classNo = String(Number(studentCode.slice(1, 3)));
  const studentNo = Number(studentCode.slice(3, 5));
  const students = phase2Store.listStudents(ownerId, { year: academicYear || undefined });
  const student = students.find((item) => (
    String(item.class_name || '').replace(/\s/g, '') === `${grade}-${classNo}`
    && Number(item.student_no) === studentNo
  )) || null;
  return { student, studentCode };
};

export const registerPhase6IssuesRoutes = ({ app, auth, phase2Store, phase6Store, trashLifecycle }) => {
  const sendIssueError = (res, error) => {
    const message = String(error?.message || error || 'issue save failed');
    if (message === 'case number already exists' || message === 'case number is required') return res.status(400).json({ error: message });
    return res.status(500).json({ error: message });
  };

  app.get('/api/issues', auth, (req, res) => {
    res.json(phase6Store.listIssues(req.user.id));
  });

  app.post('/api/issues', auth, (req, res) => {
    try {
      const row = phase6Store.createIssue(req.user.id, req.body || {});
      res.status(201).json(row);
    } catch (error) {
      sendIssueError(res, error);
    }
  });

  app.patch('/api/issues/:id', auth, (req, res) => {
    try {
      const row = phase6Store.updateIssue(req.user.id, Number(req.params.id), req.body || {});
      if (!row) return res.status(404).json({ error: 'issue not found' });
      return res.json(row);
    } catch (error) {
      return sendIssueError(res, error);
    }
  });

  app.delete('/api/issues/:id', auth, (req, res) => {
    try {
      const result = trashLifecycle.deleteIssue(req.user.id, Number(req.params.id));
      if (!result) return res.status(404).json({ error: 'issue not found' });
      return res.json({ ok: true });
    } catch (error) {
      return sendTrashError(res, error);
    }
  });

  app.get('/api/issues/consultations', auth, (req, res) => {
    const studentId = Number(req.query.studentId);
    if (!Number.isFinite(studentId) || studentId <= 0) return res.status(400).json({ error: 'studentId is required' });
    return res.json(phase6Store.listConsultationsByStudent(req.user.id, studentId));
  });

  app.get('/api/issues/:id/consultations', auth, (req, res) => {
    const issueId = Number(req.params.id);
    if (!phase6Store.getIssue(req.user.id, issueId)) return res.status(404).json({ error: 'issue not found' });
    res.json(phase6Store.listConsultations(req.user.id, issueId));
  });

  app.post('/api/issues/:id/consultations', auth, (req, res) => {
    const issueId = Number(req.params.id);
    const { participantName = '', content = '', studentId } = req.body || {};
    if (!String(content).trim()) return res.status(400).json({ error: 'content is required' });
    const issue = phase6Store.getIssue(req.user.id, issueId);
    if (!issue) return res.status(404).json({ error: 'issue not found' });
    const requestedStudentId = Number(studentId);
    let student = Number.isFinite(requestedStudentId) && requestedStudentId > 0
      ? phase2Store.getStudent(req.user.id, requestedStudentId)
      : null;
    let studentCode = student ? buildStudentCode(student) : '';
    if (!student) {
      const legacyMatch = findStudentForConsultation({
        phase2Store,
        ownerId: req.user.id,
        academicYear: String(issue.academic_year || ''),
        participantName,
      });
      student = legacyMatch.student;
      studentCode = legacyMatch.studentCode;
    }
    if (!studentCode) return res.status(400).json({ error: '학번과 이름을 11105 홍길동 형식으로 입력해 주세요.' });
    if (!student) return res.status(400).json({ error: '입력한 학번에 해당하는 학생을 찾을 수 없습니다.' });
    if (issue.academic_year && String(student.academic_year || '') !== String(issue.academic_year)) {
      return res.status(400).json({ error: '사안 학년도와 학생 학년도가 일치하지 않습니다.' });
    }
    const row = phase6Store.createConsultation(req.user.id, issueId, {
      ...(req.body || {}),
      studentId: student.id,
      studentCode,
      participantName: `${studentCode} ${student.name}`.trim(),
    });
    res.status(201).json(row);
  });

  app.patch('/api/issues/:id/consultations/:consultationId', auth, (req, res) => {
    const payload = req.body || {};
    if (Object.prototype.hasOwnProperty.call(payload, 'content') && !String(payload.content || '').trim()) {
      return res.status(400).json({ error: 'content is required' });
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'attachments') && !Array.isArray(payload.attachments)) {
      return res.status(400).json({ error: 'attachments must be an array' });
    }
    const row = phase6Store.updateConsultation(req.user.id, Number(req.params.id), Number(req.params.consultationId), payload);
    if (!row) return res.status(404).json({ error: 'consultation not found' });
    res.json(row);
  });

  app.delete('/api/issues/:id/consultations/:consultationId', auth, (req, res) => {
    try {
      const result = trashLifecycle.deleteIssueConsultation(
        req.user.id,
        Number(req.params.id),
        Number(req.params.consultationId),
      );
      if (!result) return res.status(404).json({ error: 'consultation not found' });
      return res.json({ ok: true });
    } catch (error) {
      return sendTrashError(res, error);
    }
  });
};
