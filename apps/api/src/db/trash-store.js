const TRASH_MIGRATION_NAME = '20260722_owner_recycle_bin';

const clampRetentionDays = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), 3650);
};

const stringifySnapshot = (value, label) => {
  try {
    return JSON.stringify(value ?? null);
  } catch (error) {
    throw new Error(`${label} is not JSON serializable: ${error.message}`);
  }
};

const parseSnapshot = (value, label) => {
  try {
    return JSON.parse(String(value || 'null'));
  } catch (error) {
    throw new Error(`trash ${label} is invalid JSON: ${error.message}`);
  }
};

const normalizeTrashRow = (row, now = new Date()) => {
  if (!row) return null;
  const restoredAt = String(row.restored_at || '');
  const expiresAt = String(row.expires_at || '');
  const expired = !restoredAt && Boolean(expiresAt) && new Date(expiresAt).getTime() <= now.getTime();
  return {
    id: Number(row.id),
    owner_id: Number(row.owner_id),
    entity_type: String(row.entity_type || ''),
    entity_id: String(row.entity_id || ''),
    label: String(row.label || ''),
    schema_version: Number(row.schema_version || 1),
    retention_days: Number(row.retention_days || 0),
    payload: parseSnapshot(row.payload_json, 'payload'),
    metadata: parseSnapshot(row.metadata_json, 'metadata'),
    deleted_at: String(row.deleted_at || ''),
    expires_at: expiresAt,
    restored_at: restoredAt,
    state: restoredAt ? 'restored' : (expired ? 'expired' : 'active'),
  };
};

const normalizeTrashSummary = (row, now = new Date()) => {
  if (!row) return null;
  const restoredAt = String(row.restored_at || '');
  const expiresAt = String(row.expires_at || '');
  const expired = !restoredAt && Boolean(expiresAt) && new Date(expiresAt).getTime() <= now.getTime();
  return {
    id: Number(row.id),
    owner_id: Number(row.owner_id),
    entity_type: String(row.entity_type || ''),
    entity_id: String(row.entity_id || ''),
    label: String(row.label || ''),
    schema_version: Number(row.schema_version || 1),
    retention_days: Number(row.retention_days || 0),
    deleted_at: String(row.deleted_at || ''),
    expires_at: expiresAt,
    restored_at: restoredAt,
    state: restoredAt ? 'restored' : (expired ? 'expired' : 'active'),
  };
};

const ensureTrashTable = (sqlite) => {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS tn_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trash_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  schema_version INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  retention_days INTEGER NOT NULL DEFAULT 30,
  deleted_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  restored_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_trash_rows_owner_deleted
  ON trash_rows(owner_id, restored_at, deleted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_trash_rows_owner_entity
  ON trash_rows(owner_id, entity_type, entity_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_trash_rows_expiry
  ON trash_rows(restored_at, expires_at);
`);
  const columns = sqlite.prepare('PRAGMA table_info(trash_rows)').all();
  if (!columns.some((column) => String(column.name) === 'retention_days')) {
    sqlite.exec('ALTER TABLE trash_rows ADD COLUMN retention_days INTEGER NOT NULL DEFAULT 30');
  }
  sqlite.prepare('INSERT OR IGNORE INTO tn_migrations(name, applied_at) VALUES(?, ?)')
    .run(TRASH_MIGRATION_NAME, new Date().toISOString());
};

export const createTrashStore = ({ sqlite, defaultRetentionDays = 30, maxPayloadBytes = 5 * 1024 * 1024 }) => {
  ensureTrashTable(sqlite);
  const fallbackRetentionDays = clampRetentionDays(defaultRetentionDays, 30);

  const insertStmt = sqlite.prepare(`
    INSERT INTO trash_rows(
      owner_id, entity_type, entity_id, label, schema_version, payload_json, metadata_json,
      retention_days, deleted_at, expires_at, restored_at
    ) VALUES(
      @owner_id, @entity_type, @entity_id, @label, @schema_version, @payload_json, @metadata_json,
      @retention_days, @deleted_at, @expires_at, ''
    )
  `);
  const getStmt = sqlite.prepare('SELECT * FROM trash_rows WHERE id = ? AND owner_id = ?');
  const summaryColumns = 'id, owner_id, entity_type, entity_id, label, schema_version, retention_days, deleted_at, expires_at, restored_at';
  const listActiveStmt = sqlite.prepare(`
    SELECT ${summaryColumns} FROM trash_rows
    WHERE owner_id = ? AND restored_at = ''
    ORDER BY deleted_at DESC, id DESC
    LIMIT ? OFFSET ?
  `);
  const listActiveByTypeStmt = sqlite.prepare(`
    SELECT ${summaryColumns} FROM trash_rows
    WHERE owner_id = ? AND restored_at = '' AND entity_type = ?
    ORDER BY deleted_at DESC, id DESC
    LIMIT ? OFFSET ?
  `);
  const listAllStmt = sqlite.prepare(`
    SELECT ${summaryColumns} FROM trash_rows
    WHERE owner_id = ?
    ORDER BY deleted_at DESC, id DESC
    LIMIT ? OFFSET ?
  `);
  const listAllByTypeStmt = sqlite.prepare(`
    SELECT ${summaryColumns} FROM trash_rows
    WHERE owner_id = ? AND entity_type = ?
    ORDER BY deleted_at DESC, id DESC
    LIMIT ? OFFSET ?
  `);
  const markRestoredStmt = sqlite.prepare("UPDATE trash_rows SET restored_at = ? WHERE id = ? AND owner_id = ? AND restored_at = ''");
  const removeStmt = sqlite.prepare('DELETE FROM trash_rows WHERE id = ? AND owner_id = ?');
  const listExpiredStmt = sqlite.prepare('SELECT * FROM trash_rows WHERE owner_id = ? AND expires_at <= ? ORDER BY expires_at ASC, id ASC');
  const listExpiredOwnersStmt = sqlite.prepare('SELECT DISTINCT owner_id FROM trash_rows WHERE expires_at <= ? ORDER BY owner_id ASC');
  const purgeExpiredStmt = sqlite.prepare('DELETE FROM trash_rows WHERE owner_id = ? AND expires_at <= ?');
  const deleteOwnerStmt = sqlite.prepare('DELETE FROM trash_rows WHERE owner_id = ?');
  const statsStmt = sqlite.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN restored_at = '' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN restored_at <> '' THEN 1 ELSE 0 END) AS restored,
      MIN(CASE WHEN restored_at = '' THEN expires_at ELSE NULL END) AS next_expiry
    FROM trash_rows
    WHERE owner_id = ?
  `);

  const insertSnapshot = (ownerId, input = {}) => {
    const entityType = String(input.entityType || input.entity_type || '').trim();
    const entityId = String(input.entityId ?? input.entity_id ?? '').trim();
    if (!Number.isInteger(Number(ownerId)) || Number(ownerId) <= 0) throw new Error('trash owner id is required');
    if (!entityType || !/^[a-z0-9_.-]{1,80}$/i.test(entityType)) throw new Error('invalid trash entity type');
    if (!entityId) throw new Error('trash entity id is required');

    const payloadJson = stringifySnapshot(input.payload, 'trash payload');
    const metadataJson = stringifySnapshot(input.metadata || {}, 'trash metadata');
    if (Buffer.byteLength(payloadJson, 'utf8') > maxPayloadBytes) throw new Error('trash payload is too large');

    const deletedAtDate = input.deletedAt ? new Date(input.deletedAt) : new Date();
    if (!Number.isFinite(deletedAtDate.getTime())) throw new Error('invalid trash deletion date');
    const retentionDays = clampRetentionDays(input.retentionDays, fallbackRetentionDays);
    const expiresAt = new Date(deletedAtDate.getTime() + (retentionDays * 24 * 60 * 60 * 1000));
    const result = insertStmt.run({
      owner_id: Number(ownerId),
      entity_type: entityType,
      entity_id: entityId,
      label: String(input.label || '').trim(),
      schema_version: Math.max(Number(input.schemaVersion || 1), 1),
      payload_json: payloadJson,
      metadata_json: metadataJson,
      retention_days: retentionDays,
      deleted_at: deletedAtDate.toISOString(),
      expires_at: expiresAt.toISOString(),
    });
    return normalizeTrashRow(getStmt.get(Number(result.lastInsertRowid), Number(ownerId)));
  };

  const capture = sqlite.transaction((ownerId, input) => insertSnapshot(ownerId, input));

  const captureWithAction = sqlite.transaction((ownerId, input, action) => {
    if (typeof action !== 'function') throw new Error('trash deletion action is required');
    const row = insertSnapshot(ownerId, input);
    const actionResult = action(row);
    return { trash: row, result: actionResult };
  });

  const list = (ownerId, { entityType = '', includeRestored = false, limit = 100, offset = 0 } = {}) => {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const type = String(entityType || '').trim();
    let rows;
    if (includeRestored) rows = type ? listAllByTypeStmt.all(ownerId, type, safeLimit, safeOffset) : listAllStmt.all(ownerId, safeLimit, safeOffset);
    else rows = type ? listActiveByTypeStmt.all(ownerId, type, safeLimit, safeOffset) : listActiveStmt.all(ownerId, safeLimit, safeOffset);
    return rows.map((row) => normalizeTrashSummary(row));
  };

  const get = (ownerId, id) => normalizeTrashRow(getStmt.get(Number(id), Number(ownerId)));

  const restoreWithAction = sqlite.transaction((ownerId, id, action) => {
    if (typeof action !== 'function') throw new Error('trash restore action is required');
    const raw = getStmt.get(Number(id), Number(ownerId));
    const row = normalizeTrashRow(raw);
    if (!row) return null;
    if (row.restored_at) throw new Error('trash item is already restored');
    if (row.state === 'expired') throw new Error('trash item has expired');
    const result = action(row);
    const restoredAt = new Date().toISOString();
    const updated = markRestoredStmt.run(restoredAt, Number(id), Number(ownerId));
    if (updated.changes !== 1) throw new Error('trash item restore state changed concurrently');
    return { trash: normalizeTrashRow(getStmt.get(Number(id), Number(ownerId))), result };
  });

  const remove = sqlite.transaction((ownerId, id) => {
    const current = get(ownerId, id);
    if (!current) return null;
    removeStmt.run(Number(id), Number(ownerId));
    return current;
  });

  const listExpired = (ownerId, now = new Date().toISOString()) => {
    const cutoff = new Date(now);
    if (!Number.isFinite(cutoff.getTime())) throw new Error('invalid trash purge date');
    const cutoffIso = cutoff.toISOString();
    return listExpiredStmt.all(Number(ownerId), cutoffIso).map((row) => normalizeTrashRow(row, cutoff));
  };

  const listOwnersWithExpired = (now = new Date().toISOString()) => {
    const cutoff = new Date(now);
    if (!Number.isFinite(cutoff.getTime())) throw new Error('invalid trash purge date');
    return listExpiredOwnersStmt.all(cutoff.toISOString()).map((row) => Number(row.owner_id));
  };

  // Kept for compatibility. Services that clean external files should call
  // listExpired(), run cleanup, and remove each successful row individually.
  const purgeExpired = sqlite.transaction((ownerId, now = new Date().toISOString()) => {
    const rows = listExpired(ownerId, now);
    if (rows.length) purgeExpiredStmt.run(Number(ownerId), new Date(now).toISOString());
    return rows;
  });

  const deleteOwnerTrash = sqlite.transaction((ownerId) => deleteOwnerStmt.run(Number(ownerId)).changes);

  const getStats = (ownerId) => {
    const row = statsStmt.get(Number(ownerId)) || {};
    return {
      total: Number(row.total || 0),
      active: Number(row.active || 0),
      restored: Number(row.restored || 0),
      next_expiry: String(row.next_expiry || ''),
    };
  };

  return {
    capture,
    captureWithAction,
    list,
    get,
    restoreWithAction,
    remove,
    listExpired,
    listOwnersWithExpired,
    purgeExpired,
    deleteOwnerTrash,
    deleteOwnerData: deleteOwnerTrash,
    getStats,
  };
};

export { TRASH_MIGRATION_NAME };
