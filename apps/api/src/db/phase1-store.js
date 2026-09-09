import fs from 'fs';
import path from 'path';

const PHASE1_MIGRATION_NAME = '20260328_phase1_normalized_store';
const PHASE1_SHADOW_WRITE_REDUCTION_NAME = '20260328_phase1_shadow_write_reduce_files_logs';
const PHASE1_ATTACHMENT_SCHEMA_MIGRATION_NAME = '20260722_phase1_attachment_fields';

const normalizeAttachments = (value) => {
  let rows = value;
  if (typeof rows === 'string') {
    try { rows = JSON.parse(rows); } catch { rows = []; }
  }
  return (Array.isArray(rows) ? rows : [])
    .map((item) => ({
      id: Number(item?.id || 0),
      name: String(item?.name || '').trim(),
      type: String(item?.type || 'application/octet-stream'),
      size: Number(item?.size || 0),
      url: String(item?.url || '').trim(),
    }))
    .filter((item) => item.id && item.name && item.url);
};

const normalizeSettingsData = (data = {}) => {
  const row = data && typeof data === 'object' ? data : {};
  return {
    schoolName: String(row.schoolName || ''),
    kmaAuthKey: String(row.kmaAuthKey || row.kmaServiceKey || ''),
    teacherDisplayName: String(row.teacherDisplayName || ''),
    academicYear: String(row.academicYear || ''),
    homeroomClass: String(row.homeroomClass || ''),
    schoolCodeSetting: String(row.schoolCodeSetting || ''),
    teacherNoSetting: String(row.teacherNoSetting || ''),
    weekdayPeriods: row.weekdayPeriods && typeof row.weekdayPeriods === 'object' ? row.weekdayPeriods : {},
    googleCalendarEmbedUrl: String(row.googleCalendarEmbedUrl || ''),
    googleCalendarIcsUrl: String(row.googleCalendarIcsUrl || ''),
    googleTasksAccessToken: String(row.googleTasksAccessToken || ''),
    googleTasksClientId: String(row.googleTasksClientId || ''),
    googleTasksClientSecret: String(row.googleTasksClientSecret || ''),
    googleTasksRefreshToken: String(row.googleTasksRefreshToken || ''),
    googleTasksListId: String(row.googleTasksListId || '@default'),
    resourceLinks: Array.isArray(row.resourceLinks)
      ? row.resourceLinks
        .map((item) => ({
          id: String(item?.id || ''),
          title: String(item?.title || '').trim(),
          url: String(item?.url || '').trim(),
        }))
        .filter((item) => item.id && item.title && item.url)
      : [],
  };
};

const normalizeTaskMemo = (memo = {}) => {
  const attachments = normalizeAttachments(memo?.attachments ?? memo?.attachments_json);
  return {
    id: Number(memo?.id || 0),
    owner_id: Number(memo?.owner_id || 0),
    memo_date: String(memo?.memo_date || '').slice(0, 10),
    title: String(memo?.title || ''),
    content: String(memo?.content || ''),
    show_on_dashboard: Boolean(memo?.show_on_dashboard),
    kind: String(memo?.kind || '') === 'announcement' ? 'announcement' : 'memo',
    is_completed: Boolean(memo?.is_completed),
    completed_at: String(memo?.completed_at || ''),
    attachments,
    attachments_json: JSON.stringify(attachments),
    created_at: String(memo?.created_at || ''),
    updated_at: String(memo?.updated_at || ''),
  };
};

const normalizeFileRow = (row = {}) => ({
  id: Number(row?.id || 0),
  owner_id: Number(row?.owner_id || 0),
  name: String(row?.name || ''),
  type: String(row?.type || 'application/octet-stream'),
  size: Number(row?.size || 0),
  path: String(row?.path || ''),
  url: String(row?.url || ''),
  scope: String(row?.scope || '') === 'attachment' ? 'attachment' : 'library',
  created_at: String(row?.created_at || ''),
});

const normalizeActivityLog = (row = {}) => ({
  id: Number(row?.id || 0),
  owner_id: Number(row?.owner_id || 0),
  category: String(row?.category || '기록'),
  text: String(row?.text || ''),
  at: String(row?.at || row?.created_at || ''),
  created_at: String(row?.created_at || ''),
});

const parseSettingsRow = (row) => {
  if (!row?.data) return null;
  try {
    return normalizeSettingsData(JSON.parse(row.data));
  } catch {
    return null;
  }
};

const ensurePhase1Tables = (sqlite) => {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS tn_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings_rows (
  owner_id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_memo_rows (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  memo_date TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  show_on_dashboard INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'memo',
  is_completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT NOT NULL DEFAULT '',
  attachments_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS file_rows (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  path TEXT NOT NULL,
  url TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'library',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log_rows (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  text TEXT NOT NULL,
  at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_memo_rows_owner_date ON task_memo_rows(owner_id, memo_date, updated_at);
CREATE INDEX IF NOT EXISTS idx_file_rows_owner_created ON file_rows(owner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_rows_owner_at ON activity_log_rows(owner_id, at, created_at);
`);

  const ensureColumn = (table, column, definition) => {
    const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((item) => String(item.name) === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };
  ensureColumn('task_memo_rows', 'attachments_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('file_rows', 'scope', "TEXT NOT NULL DEFAULT 'library'");
};

const ensureBackupFile = (dataDir, legacyDb) => {
  const backupDir = path.join(dataDir, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${PHASE1_MIGRATION_NAME}.json`);
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, JSON.stringify(legacyDb, null, 2), 'utf8');
  }
};

const ensureShadowWriteReductionBackupFile = (dataDir, legacyDb) => {
  const backupDir = path.join(dataDir, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${PHASE1_SHADOW_WRITE_REDUCTION_NAME}.json`);
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, JSON.stringify({
      files: Array.isArray(legacyDb?.files) ? legacyDb.files : [],
      activity_logs: Array.isArray(legacyDb?.activity_logs) ? legacyDb.activity_logs : [],
    }, null, 2), 'utf8');
  }
};

export const createPhase1Store = ({ sqlite, dataDir, readLegacySnapshot, sequenceStore }) => {
  ensurePhase1Tables(sqlite);

  const getMigrationRowStmt = sqlite.prepare('SELECT name FROM tn_migrations WHERE name = ?');
  const insertMigrationStmt = sqlite.prepare('INSERT INTO tn_migrations(name, applied_at) VALUES(?, ?)');
  const getSettingsStmt = sqlite.prepare('SELECT owner_id, data, created_at, updated_at FROM settings_rows WHERE owner_id = ?');
  const upsertSettingsStmt = sqlite.prepare(`
    INSERT INTO settings_rows(owner_id, data, created_at, updated_at)
    VALUES(@owner_id, @data, @created_at, @updated_at)
    ON CONFLICT(owner_id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `);
  const deleteSettingsStmt = sqlite.prepare('DELETE FROM settings_rows WHERE owner_id = ?');

  const upsertTaskMemoStmt = sqlite.prepare(`
    INSERT INTO task_memo_rows(id, owner_id, memo_date, title, content, show_on_dashboard, kind, is_completed, completed_at, attachments_json, created_at, updated_at)
    VALUES(@id, @owner_id, @memo_date, @title, @content, @show_on_dashboard, @kind, @is_completed, @completed_at, @attachments_json, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      owner_id = excluded.owner_id,
      memo_date = excluded.memo_date,
      title = excluded.title,
      content = excluded.content,
      show_on_dashboard = excluded.show_on_dashboard,
      kind = excluded.kind,
      is_completed = excluded.is_completed,
      completed_at = excluded.completed_at,
      attachments_json = excluded.attachments_json,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);
  const listTaskMemoRowsStmt = sqlite.prepare('SELECT * FROM task_memo_rows WHERE owner_id = ? ORDER BY memo_date DESC, updated_at DESC');
  const getTaskMemoStmt = sqlite.prepare('SELECT * FROM task_memo_rows WHERE id = ? AND owner_id = ?');
  const deleteTaskMemoStmt = sqlite.prepare('DELETE FROM task_memo_rows WHERE id = ? AND owner_id = ?');
  const deleteTaskMemosForOwnerStmt = sqlite.prepare('DELETE FROM task_memo_rows WHERE owner_id = ?');

  const upsertFileStmt = sqlite.prepare(`
    INSERT INTO file_rows(id, owner_id, name, type, size, path, url, scope, created_at)
    VALUES(@id, @owner_id, @name, @type, @size, @path, @url, @scope, @created_at)
    ON CONFLICT(id) DO UPDATE SET
      owner_id = excluded.owner_id,
      name = excluded.name,
      type = excluded.type,
      size = excluded.size,
      path = excluded.path,
      url = excluded.url,
      scope = excluded.scope,
      created_at = excluded.created_at
  `);
  const listFileRowsStmt = sqlite.prepare('SELECT * FROM file_rows WHERE owner_id = ? ORDER BY created_at DESC');
  const getFileStmt = sqlite.prepare('SELECT * FROM file_rows WHERE id = ? AND owner_id = ?');
  const deleteFileStmt = sqlite.prepare('DELETE FROM file_rows WHERE id = ? AND owner_id = ?');
  const deleteFilesForOwnerStmt = sqlite.prepare('DELETE FROM file_rows WHERE owner_id = ?');

  const upsertActivityLogStmt = sqlite.prepare(`
    INSERT INTO activity_log_rows(id, owner_id, category, text, at, created_at)
    VALUES(@id, @owner_id, @category, @text, @at, @created_at)
    ON CONFLICT(id) DO UPDATE SET
      owner_id = excluded.owner_id,
      category = excluded.category,
      text = excluded.text,
      at = excluded.at,
      created_at = excluded.created_at
  `);
  const listActivityLogRowsStmt = sqlite.prepare('SELECT * FROM activity_log_rows WHERE owner_id = ? ORDER BY at DESC, created_at DESC');
  const getActivityLogStmt = sqlite.prepare('SELECT * FROM activity_log_rows WHERE id = ? AND owner_id = ?');
  const deleteActivityLogStmt = sqlite.prepare('DELETE FROM activity_log_rows WHERE id = ? AND owner_id = ?');
  const deleteActivityLogsForOwnerStmt = sqlite.prepare('DELETE FROM activity_log_rows WHERE owner_id = ?');
  const trimActivityLogRowsStmt = sqlite.prepare('SELECT id FROM activity_log_rows WHERE owner_id = ? ORDER BY at DESC, created_at DESC LIMIT -1 OFFSET 300');

  const runMigration = sqlite.transaction(() => {
    if (getMigrationRowStmt.get(PHASE1_MIGRATION_NAME)) return;
    const legacyDb = readLegacySnapshot(sqlite);
    ensureBackupFile(dataDir, legacyDb);

    legacyDb.settings.forEach((row) => {
      const normalized = normalizeSettingsData(row?.data || {});
      const createdAt = String(row?.created_at || row?.updated_at || new Date().toISOString());
      const updatedAt = String(row?.updated_at || createdAt);
      upsertSettingsStmt.run({
        owner_id: Number(row?.owner_id || 0),
        data: JSON.stringify(normalized),
        created_at: createdAt,
        updated_at: updatedAt,
      });
    });

    legacyDb.task_memos.forEach((row) => {
      const normalized = normalizeTaskMemo(row);
      upsertTaskMemoStmt.run({
        ...normalized,
        show_on_dashboard: normalized.show_on_dashboard ? 1 : 0,
        is_completed: normalized.is_completed ? 1 : 0,
      });
    });

    legacyDb.files.forEach((row) => {
      const normalized = normalizeFileRow(row);
      upsertFileStmt.run(normalized);
    });

    legacyDb.activity_logs.forEach((row) => {
      const normalized = normalizeActivityLog(row);
      upsertActivityLogStmt.run(normalized);
    });

    insertMigrationStmt.run(PHASE1_MIGRATION_NAME, new Date().toISOString());
  });

  runMigration();

  const runShadowWriteReduction = sqlite.transaction(() => {
    if (getMigrationRowStmt.get(PHASE1_SHADOW_WRITE_REDUCTION_NAME)) return;
    const legacyDb = readLegacySnapshot(sqlite);
    ensureShadowWriteReductionBackupFile(dataDir, legacyDb);
    insertMigrationStmt.run(PHASE1_SHADOW_WRITE_REDUCTION_NAME, new Date().toISOString());
  });

  runShadowWriteReduction();

  const runAttachmentSchemaMigration = sqlite.transaction(() => {
    if (getMigrationRowStmt.get(PHASE1_ATTACHMENT_SCHEMA_MIGRATION_NAME)) return;
    insertMigrationStmt.run(PHASE1_ATTACHMENT_SCHEMA_MIGRATION_NAME, new Date().toISOString());
  });

  runAttachmentSchemaMigration();

  const getSettings = (ownerId) => {
    const row = getSettingsStmt.get(ownerId);
    return parseSettingsRow(row) || {};
  };

  const putSettings = sqlite.transaction((ownerId, settingsData) => {
    const normalized = normalizeSettingsData(settingsData);
    const now = new Date().toISOString();
    const existing = getSettingsStmt.get(ownerId);
    upsertSettingsStmt.run({
      owner_id: ownerId,
      data: JSON.stringify(normalized),
      created_at: String(existing?.created_at || now),
      updated_at: now,
    });
    return normalized;
  });

  const putResourceLinks = (ownerId, links) => {
    const current = getSettings(ownerId);
    const normalizedLinks = normalizeSettingsData({ resourceLinks: links }).resourceLinks;
    return putSettings(ownerId, { ...current, resourceLinks: normalizedLinks });
  };

  const listTaskMemos = (ownerId, { date, kind } = {}) => {
    let rows = listTaskMemoRowsStmt.all(ownerId).map((row) => normalizeTaskMemo({
      ...row,
      show_on_dashboard: Boolean(row.show_on_dashboard),
      is_completed: Boolean(row.is_completed),
    }));
    if (date) rows = rows.filter((row) => String(row.memo_date) === String(date));
    if (kind) rows = rows.filter((row) => String(row.kind || 'memo') === String(kind));
    return rows;
  };

  const createTaskMemo = sqlite.transaction((ownerId, payload) => {
    const { memoDate = '', title = '', content = '', showOnDashboard = false, kind = 'memo', isCompleted = false, completedAt = '', attachments = [] } = payload || {};
    const memoDateValue = String(memoDate || '').slice(0, 10);
    const id = Number(sequenceStore.next('memo'));
    const normalizedCompleted = Boolean(isCompleted);
    const now = new Date().toISOString();
    const row = normalizeTaskMemo({
      id,
      owner_id: ownerId,
      memo_date: memoDateValue,
      title,
      content,
      show_on_dashboard: showOnDashboard,
      kind,
      is_completed: normalizedCompleted,
      completed_at: normalizedCompleted ? String(completedAt || now) : '',
      attachments,
      created_at: now,
      updated_at: now,
    });
    upsertTaskMemoStmt.run({
      ...row,
      show_on_dashboard: row.show_on_dashboard ? 1 : 0,
      is_completed: row.is_completed ? 1 : 0,
    });
    return row;
  });

  const updateTaskMemo = sqlite.transaction((ownerId, id, payload) => {
    const current = getTaskMemoStmt.get(id, ownerId);
    if (!current) return null;
    const row = normalizeTaskMemo({
      ...current,
      show_on_dashboard: Boolean(current.show_on_dashboard),
      is_completed: Boolean(current.is_completed),
    });
    const body = payload || {};
    const hasIsCompleted = Object.prototype.hasOwnProperty.call(body, 'isCompleted');
    const hasCompletedAt = Object.prototype.hasOwnProperty.call(body, 'completedAt');
    const nextIsCompleted = hasIsCompleted ? Boolean(body.isCompleted) : Boolean(row.is_completed);
    const updatedRow = normalizeTaskMemo({
      ...row,
      memo_date: String(body.memoDate ?? row.memo_date).slice(0, 10),
      title: String(body.title ?? row.title ?? ''),
      content: String(body.content ?? row.content ?? ''),
      show_on_dashboard: Boolean(body.showOnDashboard ?? row.show_on_dashboard),
      kind: body.kind ?? row.kind ?? 'memo',
      is_completed: nextIsCompleted,
      completed_at: nextIsCompleted
        ? String(hasCompletedAt ? body.completedAt : (row.completed_at || new Date().toISOString()))
        : '',
      attachments: Object.prototype.hasOwnProperty.call(body, 'attachments') ? body.attachments : row.attachments,
      updated_at: new Date().toISOString(),
    });

    upsertTaskMemoStmt.run({
      ...updatedRow,
      show_on_dashboard: updatedRow.show_on_dashboard ? 1 : 0,
      is_completed: updatedRow.is_completed ? 1 : 0,
    });
    return updatedRow;
  });

  const deleteTaskMemo = sqlite.transaction((ownerId, id) => {
    deleteTaskMemoStmt.run(id, ownerId);
  });

  const listFiles = (ownerId, { includeAttachments = false } = {}) => listFileRowsStmt
    .all(ownerId)
    .map(normalizeFileRow)
    .filter((row) => includeAttachments || row.scope === 'library');

  const getFile = (ownerId, id) => {
    const row = getFileStmt.get(id, ownerId);
    return row ? normalizeFileRow(row) : null;
  };

  const createFile = sqlite.transaction((ownerId, row) => {
    const normalized = normalizeFileRow({ ...row, owner_id: ownerId });
    upsertFileStmt.run(normalized);
    return normalized;
  });

  const updateFileName = sqlite.transaction((ownerId, id, name) => {
    const current = getFileStmt.get(id, ownerId);
    if (!current) return null;
    const nextName = String(name || current.name).trim() || String(current.name || '');
    const updated = normalizeFileRow({ ...current, name: nextName });
    upsertFileStmt.run(updated);
    return updated;
  });

  const deleteFile = sqlite.transaction((ownerId, id) => {
    const current = getFileStmt.get(id, ownerId);
    if (!current) return null;
    deleteFileStmt.run(id, ownerId);
    return normalizeFileRow(current);
  });

  const trimActivityLogs = (ownerId) => {
    const staleRows = trimActivityLogRowsStmt.all(ownerId);
    staleRows.forEach((row) => deleteActivityLogStmt.run(row.id, ownerId));
  };

  const listActivityLogs = (ownerId) => listActivityLogRowsStmt.all(ownerId).slice(0, 120).map(normalizeActivityLog);

  const createActivityLog = sqlite.transaction((ownerId, row) => {
    const normalized = normalizeActivityLog({ ...row, owner_id: ownerId });
    upsertActivityLogStmt.run(normalized);
    trimActivityLogs(ownerId);
    return normalized;
  });

  const deleteActivityLog = sqlite.transaction((ownerId, id) => {
    deleteActivityLogStmt.run(id, ownerId);
  });

  const deleteAllActivityLogs = sqlite.transaction((ownerId) => {
    deleteActivityLogsForOwnerStmt.run(ownerId);
  });

  const deleteOwnerPhase1Data = sqlite.transaction((ownerId) => {
    deleteFilesForOwnerStmt.run(ownerId);
    deleteActivityLogsForOwnerStmt.run(ownerId);
    deleteTaskMemosForOwnerStmt.run(ownerId);
    deleteSettingsStmt.run(ownerId);
  });

  return {
    getSettings,
    putSettings,
    putResourceLinks,
    listTaskMemos,
    createTaskMemo,
    updateTaskMemo,
    deleteTaskMemo,
    listFiles,
    getFile,
    createFile,
    updateFileName,
    deleteFile,
    listActivityLogs,
    createActivityLog,
    deleteActivityLog,
    deleteAllActivityLogs,
    deleteOwnerPhase1Data,
  };
};
