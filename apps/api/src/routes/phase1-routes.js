import path from 'path';

import {
  assertUploadCapacity,
  createSingleUploadMiddleware,
  deleteStoredUploadAsset,
  getOwnerUploadDirectory,
  resolveStoredUploadPath,
  rollbackUploadedFile,
  sanitizeOriginalFilename,
  sendSecureAsset,
  sumStoredFileSizes,
  toStorageKey,
  uploadErrorResponse,
  validateUploadContent,
} from '../utils/uploadAssets.js';
import { sendTrashError } from './trash-routes.js';

export const registerPhase1Routes = ({
  app,
  auth,
  fs,
  UPLOAD_DIR,
  phase1Store,
  trashLifecycle,
  createDiskUpload,
  normalizeUploadedOriginalName,
}) => {
  app.get('/api/settings', auth, (req, res) => {
    res.json(phase1Store.getSettings(req.user.id));
  });

  app.put('/api/settings', auth, (req, res) => {
    const body = req.body || {};
    const allowed = {
      schoolName: String(body.schoolName || ''),
      kmaAuthKey: String(body.kmaAuthKey || body.kmaServiceKey || ''),
      teacherDisplayName: String(body.teacherDisplayName || ''),
      academicYear: String(body.academicYear || ''),
      homeroomClass: String(body.homeroomClass || ''),
      schoolCodeSetting: String(body.schoolCodeSetting || ''),
      teacherNoSetting: String(body.teacherNoSetting || ''),
      weekdayPeriods: body.weekdayPeriods && typeof body.weekdayPeriods === 'object' ? body.weekdayPeriods : {},
      googleCalendarEmbedUrl: String(body.googleCalendarEmbedUrl || ''),
      googleCalendarIcsUrl: String(body.googleCalendarIcsUrl || ''),
      googleTasksAccessToken: String(body.googleTasksAccessToken || ''),
      googleTasksClientId: String(body.googleTasksClientId || ''),
      googleTasksClientSecret: String(body.googleTasksClientSecret || ''),
      googleTasksRefreshToken: String(body.googleTasksRefreshToken || ''),
      googleTasksListId: String(body.googleTasksListId || '@default'),
      resourceLinks: Array.isArray(body.resourceLinks)
        ? body.resourceLinks
          .map((x) => ({
            id: String(x?.id || ''),
            title: String(x?.title || '').trim(),
            url: String(x?.url || '').trim(),
          }))
          .filter((x) => x.id && x.title && x.url)
        : [],
    };

    phase1Store.putSettings(req.user.id, allowed);
    res.json({ ok: true, settings: allowed });
  });

  app.get('/api/resource-links', auth, (req, res) => {
    const settings = phase1Store.getSettings(req.user.id);
    const links = Array.isArray(settings?.resourceLinks) ? settings.resourceLinks : [];
    res.json(links);
  });

  app.put('/api/resource-links', auth, (req, res) => {
    const body = req.body || {};
    const links = Array.isArray(body.links)
      ? body.links
        .map((x) => ({
          id: String(x?.id || ''),
          title: String(x?.title || '').trim(),
          url: String(x?.url || '').trim(),
        }))
        .filter((x) => x.id && x.title && x.url)
      : [];

    phase1Store.putResourceLinks(req.user.id, links);
    res.json({ ok: true, links });
  });

  app.get('/api/task-memos', auth, (req, res) => {
    const { date, kind } = req.query;
    res.json(phase1Store.listTaskMemos(req.user.id, { date, kind }));
  });

  app.post('/api/task-memos', auth, (req, res) => {
    const { memoDate = '', title = '', content = '', showOnDashboard = false, kind = 'memo', isCompleted = false, completedAt = '', attachments = [] } = req.body || {};
    const d = String(memoDate || '').slice(0, 10);
    if (!d) return res.status(400).json({ error: 'memoDate is required' });
    const row = phase1Store.createTaskMemo(req.user.id, { memoDate: d, title, content, showOnDashboard, kind, isCompleted, completedAt, attachments });
    res.status(201).json(row);
  });

  app.patch('/api/task-memos/:id', auth, (req, res) => {
    const row = phase1Store.updateTaskMemo(req.user.id, Number(req.params.id), req.body || {});
    if (!row) return res.status(404).json({ error: 'memo not found' });
    res.json(row);
  });

  app.delete('/api/task-memos/:id', auth, (req, res) => {
    try {
      const result = trashLifecycle.deleteTaskMemo(req.user.id, Number(req.params.id));
      if (!result) return res.status(404).json({ error: 'memo not found' });
      return res.json({ ok: true });
    } catch (error) {
      return sendTrashError(res, error);
    }
  });

  const serializeFile = (row) => ({
    id: Number(row?.id || 0),
    name: String(row?.name || ''),
    type: String(row?.type || 'application/octet-stream'),
    size: Number(row?.size || 0),
    url: `/api/files/${Number(row?.id || 0)}/download`,
    scope: String(row?.scope || '') === 'attachment' ? 'attachment' : 'library',
    created_at: String(row?.created_at || ''),
  });

  const listOwnedFiles = (ownerId) => phase1Store.listFiles(ownerId, { includeAttachments: true });

  const resolveOwnedFile = (ownerId, row) => resolveStoredUploadPath({
    rootDir: UPLOAD_DIR,
    ownerId,
    storedPath: row?.path,
    storedUrl: row?.url,
    kind: 'file',
  });

  const serveOwnedFile = (req, res, row) => {
    const resolved = row ? resolveOwnedFile(req.user.id, row) : null;
    if (!row || !resolved) return res.status(404).json({ error: 'file not found' });
    sendSecureAsset(res, resolved.absolutePath, {
      filename: row.name,
      contentType: row.type,
      disposition: 'attachment',
    });
  };

  const uploadDestination = (req) => getOwnerUploadDirectory(UPLOAD_DIR, req.user.id);
  const libraryUpload = createSingleUploadMiddleware(createDiskUpload(uploadDestination, { profile: 'library' }));
  const attachmentUpload = createSingleUploadMiddleware(createDiskUpload(uploadDestination, { profile: 'attachment' }));

  const guardAndUploadFile = (req, res, next) => {
    const scope = String(req.query?.scope || '') === 'attachment' ? 'attachment' : 'library';
    const existingBytes = sumStoredFileSizes(listOwnedFiles(req.user.id));
    try {
      assertUploadCapacity({
        profile: scope,
        rootDir: UPLOAD_DIR,
        existingBytes,
        incomingBytes: Number(req.headers['content-length'] || 0),
      });
      req.uploadSecurity = { profile: scope, existingBytes };
    } catch (error) {
      const response = uploadErrorResponse(error);
      return res.status(response.statusCode).json({ error: response.error, code: response.code });
    }
    return (scope === 'attachment' ? attachmentUpload : libraryUpload)(req, res, next);
  };

  // Legacy URLs remain routable, but are no longer public and must belong to the caller.
  app.get('/uploads/*', auth, (req, res) => {
    const requestedUrl = `/uploads/${String(req.params[0] || '').replace(/^\/+/, '')}`;
    const requestedName = sanitizeOriginalFilename(path.basename(requestedUrl));
    const row = listOwnedFiles(req.user.id).find((item) => {
      let itemPathname = '';
      try { itemPathname = new URL(String(item?.url || ''), 'http://local').pathname; } catch {}
      return itemPathname === requestedUrl
        || sanitizeOriginalFilename(path.basename(String(item?.path || itemPathname || ''))) === requestedName;
    });
    return serveOwnedFile(req, res, row);
  });

  app.get('/api/files', auth, (req, res) => {
    res.json(phase1Store
      .listFiles(req.user.id, { includeAttachments: String(req.query?.includeAttachments || '') === '1' })
      .map(serializeFile));
  });

  app.post('/api/files/upload', auth, guardAndUploadFile, (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const scope = req.uploadSecurity?.profile === 'attachment' ? 'attachment' : 'library';
    try {
      validateUploadContent(req.file, scope);
      assertUploadCapacity({
        profile: scope,
        rootDir: UPLOAD_DIR,
        existingBytes: req.uploadSecurity?.existingBytes,
        incomingBytes: Number(req.file.size || 0),
      });
    } catch (error) {
      rollbackUploadedFile(req.file.path, UPLOAD_DIR);
      const response = uploadErrorResponse(error);
      return res.status(response.statusCode).json({ error: response.error, code: response.code });
    }

    let savedRow;
    try {
      const normalizedOriginalName = normalizeUploadedOriginalName(req.file);
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const row = {
        id,
        owner_id: req.user.id,
        name: String(normalizedOriginalName || req.file.filename).trim(),
        type: String(req.file.mimetype || 'application/octet-stream'),
        size: Number(req.file.size || 0),
        path: toStorageKey(UPLOAD_DIR, req.file.path),
        url: `/api/files/${id}/download`,
        scope,
        created_at: new Date().toISOString(),
      };
      savedRow = phase1Store.createFile(req.user.id, row);
      if (!savedRow) throw new Error('file row was not saved');
    } catch (e) {
      rollbackUploadedFile(req.file.path, UPLOAD_DIR);
      return res.status(500).json({ error: String(e?.message || e || 'file save failed') });
    }
    return res.status(201).json(serializeFile(savedRow));
  });

  app.get('/api/files/:id/download', auth, (req, res) => {
    const row = phase1Store.getFile(req.user.id, Number(req.params.id));
    return serveOwnedFile(req, res, row);
  });

  app.patch('/api/files/:id', auth, (req, res) => {
    const row = phase1Store.updateFileName(req.user.id, Number(req.params.id), req.body?.name);
    if (!row) return res.status(404).json({ error: 'file not found' });
    res.json(serializeFile(row));
  });

  app.delete('/api/files/:id', auth, (req, res) => {
    const fileId = Number(req.params.id);
    if (trashLifecycle?.isFileProtected(req.user.id, fileId)) {
      return res.status(409).json({ error: 'file is retained by an active record or trash item', code: 'FILE_STILL_REFERENCED' });
    }
    const row = phase1Store.deleteFile(req.user.id, fileId);
    if (row) deleteStoredUploadAsset({
      rootDir: UPLOAD_DIR,
      ownerId: req.user.id,
      storedPath: row.path,
      storedUrl: row.url,
      kind: 'file',
    });
    res.json({ ok: true });
  });

  app.get('/api/activity-logs', auth, (req, res) => {
    res.json(phase1Store.listActivityLogs(req.user.id));
  });

  app.post('/api/activity-logs', auth, (req, res) => {
    const { category = '기록', text = '', at } = req.body || {};
    if (!String(text).trim()) return res.status(400).json({ error: 'text is required' });
    const row = phase1Store.createActivityLog(req.user.id, {
      id: Date.now() + Math.floor(Math.random() * 1000),
      category: String(category || '기록'),
      text: String(text),
      at: at || new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
    res.status(201).json(row);
  });

  app.delete('/api/activity-logs/:id', auth, (req, res) => {
    phase1Store.deleteActivityLog(req.user.id, Number(req.params.id));
    res.json({ ok: true });
  });

  app.delete('/api/activity-logs', auth, (req, res) => {
    phase1Store.deleteAllActivityLogs(req.user.id);
    res.json({ ok: true });
  });
};
