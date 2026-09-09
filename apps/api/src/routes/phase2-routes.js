import {
  assertUploadCapacity,
  createSingleUploadMiddleware,
  getDirectorySizeBytes,
  getStudentPhotoDirectory,
  resolveStoredUploadPath,
  rollbackUploadedFile,
  sanitizeOriginalFilename,
  sendSecureAsset,
  uploadErrorResponse,
  validateUploadContent,
} from '../utils/uploadAssets.js';
import { sendTrashError } from './trash-routes.js';

export const registerPhase2Routes = ({
  app,
  auth,
  fs,
  path,
  STUDENT_PHOTO_DIR,
  phase2Store,
  phase3Store,
  trashLifecycle,
  createDiskUpload,
  normalizeStudentPhotoUrlForUser,
  normalizeUploadedOriginalName,
  removeStudentPhotoFileByUrl,
}) => {
  const securePhotoUrl = (student) => String(student?.photo_url || '').trim()
    ? `/api/student-photos/${Number(student.id)}`
    : '';

  const serializeStudent = (student) => student
    ? { ...student, photo_url: securePhotoUrl(student) }
    : student;

  app.get('/api/students', auth, (req, res) => {
    const { year } = req.query;
    res.json(phase2Store.listStudents(req.user.id, { year }).map(serializeStudent));
  });

  app.post('/api/students', auth, (req, res) => {
    const { academicYear = '', name, className = '', studentNo = '', memo = '', riskLevel = 'normal', tags = '', studentTrack = 'course', studentPhone = '', guardianPhone = '', basicInfo = '', basicSurvey = '', gender = '', birthDate = '', transferredAt = '' } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const row = phase2Store.createStudent(req.user.id, {
      academicYear,
      name,
      className,
      studentNo,
      memo,
      riskLevel,
      tags,
      studentTrack,
      studentPhone,
      guardianPhone,
      basicInfo,
      basicSurvey,
      gender,
      birthDate,
      transferredAt,
    });
    res.status(201).json(serializeStudent(row));
  });

  app.post('/api/students/bulk', auth, (req, res) => {
    const { students: bulk = [] } = req.body || {};
    if (!Array.isArray(bulk) || !bulk.length) return res.status(400).json({ error: 'students array is required' });
    const processed = phase2Store.bulkUpsertStudents(req.user.id, bulk);
    res.status(201).json({ count: processed.length, students: processed.map(serializeStudent) });
  });

  app.get('/api/students/:id', auth, (req, res) => {
    const row = phase2Store.getStudent(req.user.id, Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'student not found' });
    res.json(serializeStudent(row));
  });

  app.patch('/api/students/:id', auth, (req, res) => {
    const row = phase2Store.updateStudent(req.user.id, Number(req.params.id), req.body || {});
    if (!row) return res.status(404).json({ error: 'student not found' });
    res.json(serializeStudent(row));
  });

  app.delete('/api/students/:id', auth, (req, res) => {
    try {
      const result = trashLifecycle.deleteStudent(req.user.id, Number(req.params.id));
      if (!result) return res.status(404).json({ error: 'student not found' });
      return res.json({ ok: true });
    } catch (error) {
      return sendTrashError(res, error);
    }
  });

  app.get('/api/students/by-slug/:slug', auth, (req, res) => {
    if (!String(req.params.slug || '').match(/^(\d{4})-(\d)(\d{2})(\d{2})$/)) {
      return res.status(400).json({ error: 'invalid slug format' });
    }
    const row = phase2Store.findStudentBySlug(req.user.id, req.params.slug);
    if (!row) return res.status(404).json({ error: 'student not found by slug' });
    res.json(serializeStudent(row));
  });

  app.get('/api/notes', auth, (req, res) => {
    const { studentId, year } = req.query;
    res.json(phase2Store.listNotes(req.user.id, { studentId, year }));
  });

  app.post('/api/notes', auth, (req, res) => {
    const { academicYear = '', studentId, noteDate, category = 'general', content, attachments = [] } = req.body || {};
    if (!studentId) return res.status(400).json({ error: 'studentId is required' });
    if (!content?.trim()) return res.status(400).json({ error: 'content is required' });
    const st = phase2Store.getStudent(req.user.id, Number(studentId));
    if (!st) return res.status(404).json({ error: 'student not found' });
    const row = phase2Store.createNote(req.user.id, { academicYear, studentId, noteDate, category, content, attachments });
    res.status(201).json(row);
  });

  app.patch('/api/notes/:id', auth, (req, res) => {
    const row = phase2Store.updateNote(req.user.id, Number(req.params.id), req.body || {});
    if (!row) return res.status(404).json({ error: 'note not found' });
    res.json(row);
  });

  app.delete('/api/notes/:id', auth, (req, res) => {
    try {
      const result = trashLifecycle.deleteStudentNote(req.user.id, Number(req.params.id));
      if (!result) return res.status(404).json({ error: 'note not found' });
      return res.json({ ok: true });
    } catch (error) {
      return sendTrashError(res, error);
    }
  });

  app.get('/api/schedules', auth, (req, res) => {
    res.json(phase2Store.listSchedules(req.user.id));
  });

  app.post('/api/schedules', auth, (req, res) => {
    const { title, dueAt = null, importance = 'normal', kind = 'todo' } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
    const row = phase2Store.createSchedule(req.user.id, { title, dueAt, importance, kind });
    res.status(201).json(row);
  });

  app.patch('/api/schedules/:id', auth, (req, res) => {
    const row = phase2Store.updateSchedule(req.user.id, Number(req.params.id), req.body || {});
    if (!row) return res.status(404).json({ error: 'schedule not found' });
    res.json(row);
  });

  app.patch('/api/schedules/:id/toggle', auth, (req, res) => {
    const row = phase2Store.toggleSchedule(req.user.id, Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'schedule not found' });
    res.json(row);
  });

  app.delete('/api/schedules/:id', auth, (req, res) => {
    try {
      const result = trashLifecycle.deleteSchedule(req.user.id, Number(req.params.id));
      if (!result) return res.status(404).json({ error: 'schedule not found' });
      return res.json({ ok: true });
    } catch (error) {
      return sendTrashError(res, error);
    }
  });

  const resolveStudentPhoto = (ownerId, student) => resolveStoredUploadPath({
    rootDir: STUDENT_PHOTO_DIR,
    ownerId,
    storedUrl: student?.photo_url,
    kind: 'photo',
  });

  const serveStudentPhoto = (req, res, student) => {
    const resolved = student ? resolveStudentPhoto(req.user.id, student) : null;
    if (!student || !resolved) return res.status(404).json({ error: 'student photo not found' });
    let filename = 'student-photo';
    try {
      filename = sanitizeOriginalFilename(path.basename(new URL(String(student.photo_url || ''), 'http://local').pathname));
    } catch {}
    sendSecureAsset(res, resolved.absolutePath, {
      filename,
      disposition: 'inline',
    });
  };

  const photoDestination = (req) => getStudentPhotoDirectory(STUDENT_PHOTO_DIR, req.user.id);
  const studentPhotoUpload = createSingleUploadMiddleware(createDiskUpload(photoDestination, { profile: 'photo' }));

  const guardAndUploadStudentPhoto = (req, res, next) => {
    const ownerDirectory = photoDestination(req);
    const existingBytes = getDirectorySizeBytes(ownerDirectory);
    try {
      assertUploadCapacity({
        profile: 'photo',
        rootDir: STUDENT_PHOTO_DIR,
        existingBytes,
        incomingBytes: Number(req.headers['content-length'] || 0),
      });
      req.uploadSecurity = { profile: 'photo', existingBytes };
    } catch (error) {
      const response = uploadErrorResponse(error);
      return res.status(response.statusCode).json({ error: response.error, code: response.code });
    }
    return studentPhotoUpload(req, res, next);
  };

  app.get('/api/student-photos/:studentId', auth, (req, res) => {
    const student = phase2Store.getStudent(req.user.id, Number(req.params.studentId));
    return serveStudentPhoto(req, res, student);
  });

  // Keep legacy photo URLs resolvable without exposing them publicly.
  app.get('/student-photos/:ownerId/:filename', auth, (req, res) => {
    if (Number(req.params.ownerId) !== Number(req.user.id)) return res.status(404).json({ error: 'student photo not found' });
    const requestedUrl = `/student-photos/${req.params.ownerId}/${sanitizeOriginalFilename(req.params.filename)}`;
    const student = phase2Store.listStudents(req.user.id).find((item) => {
      try { return new URL(String(item?.photo_url || ''), 'http://local').pathname === requestedUrl; } catch { return false; }
    });
    return serveStudentPhoto(req, res, student);
  });

  app.post('/api/student-photos/upload', auth, guardAndUploadStudentPhoto, (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const studentId = Number(req.body?.studentId);
    if (!Number.isFinite(studentId)) {
      rollbackUploadedFile(req.file.path, STUDENT_PHOTO_DIR);
      return res.status(400).json({ error: 'studentId is required' });
    }

    const student = phase2Store.getStudent(req.user.id, studentId);
    if (!student) {
      rollbackUploadedFile(req.file.path, STUDENT_PHOTO_DIR);
      return res.status(404).json({ error: 'student not found' });
    }

    try {
      validateUploadContent(req.file, 'photo');
      assertUploadCapacity({
        profile: 'photo',
        rootDir: STUDENT_PHOTO_DIR,
        existingBytes: req.uploadSecurity?.existingBytes,
        incomingBytes: Number(req.file.size || 0),
      });
    } catch (error) {
      rollbackUploadedFile(req.file.path, STUDENT_PHOTO_DIR);
      const response = uploadErrorResponse(error);
      return res.status(response.statusCode).json({ error: response.error, code: response.code });
    }

    const previousUrl = String(student.photo_url || '').trim();
    const nextUrl = `/student-photos/${req.user.id}/${req.file.filename}`;
    const updatedAt = new Date().toISOString();
    try {
      const updated = phase2Store.updateStudentPhoto(req.user.id, studentId, nextUrl, updatedAt);
      if (!updated) {
        rollbackUploadedFile(req.file.path, STUDENT_PHOTO_DIR);
        return res.status(404).json({ error: 'student not found' });
      }
    } catch (error) {
      rollbackUploadedFile(req.file.path, STUDENT_PHOTO_DIR);
      return res.status(500).json({ error: String(error?.message || error || 'student photo save failed') });
    }
    if (previousUrl && previousUrl !== nextUrl) removeStudentPhotoFileByUrl(req.user.id, previousUrl);

    res.status(201).json({
      studentId,
      name: String(normalizeUploadedOriginalName(req.file) || req.file.filename).trim(),
      type: String(req.file.mimetype || 'application/octet-stream'),
      size: Number(req.file.size || 0),
      url: `/api/student-photos/${studentId}`,
      updatedAt,
      created_at: updatedAt,
    });
  });

  app.post('/api/student-photos/sync', auth, (req, res) => {
    const { items = [] } = req.body || {};
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items array is required' });
    const normalizedItems = items.map((item) => {
      const studentId = Number(item?.studentId);
      const student = Number.isFinite(studentId) ? phase2Store.getStudent(req.user.id, studentId) : null;
      const securePath = `/api/student-photos/${studentId}`;
      const rawPath = (() => {
        try { return new URL(String(item?.url || ''), 'http://local').pathname; } catch { return ''; }
      })();
      return {
        studentId,
        url: rawPath === securePath && student?.photo_url
          ? String(student.photo_url)
          : normalizeStudentPhotoUrlForUser(req.user.id, item?.url),
        updatedAt: String(item?.updatedAt || ''),
      };
    });
    const updatedItems = phase2Store.syncStudentPhotos(req.user.id, normalizedItems);
    res.json({
      ok: true,
      items: updatedItems.map((item) => ({ ...item, url: item?.url ? `/api/student-photos/${Number(item.studentId)}` : '' })),
    });
  });

  app.delete('/api/student-photos', auth, (req, res) => {
    const { url = '', studentId = null } = req.body || {};
    const requestedStudentId = Number(studentId);

    if (Number.isFinite(requestedStudentId)) {
      const student = phase2Store.getStudent(req.user.id, requestedStudentId);
      if (!student) return res.status(404).json({ error: 'student not found' });
      const currentUrl = String(student.photo_url || '').trim();
      const ok = currentUrl ? removeStudentPhotoFileByUrl(req.user.id, currentUrl) : true;
      phase2Store.clearStudentPhotoById(req.user.id, requestedStudentId);
      return res.json({ ok, studentId: requestedStudentId });
    }

    const normalizedUrl = normalizeStudentPhotoUrlForUser(req.user.id, url);
    if (!normalizedUrl) return res.json({ ok: false });
    if (trashLifecycle?.isPhotoProtected(req.user.id, normalizedUrl)) {
      return res.status(409).json({ error: 'student photo is retained by a trash item', code: 'FILE_STILL_REFERENCED' });
    }
    const ok = removeStudentPhotoFileByUrl(req.user.id, normalizedUrl);
    phase2Store.clearStudentPhotoByUrl(req.user.id, normalizedUrl);
    res.json({ ok });
  });
};
