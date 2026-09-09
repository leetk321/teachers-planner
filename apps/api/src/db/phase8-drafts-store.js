const nowIso = () => new Date().toISOString();

const safeParse = (raw) => {
  try {
    return JSON.parse(String(raw || '{}'));
  } catch {
    return {};
  }
};

export const createPhase8DraftsStore = ({ sqlite }) => {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS user_drafts (
      owner_id INTEGER NOT NULL,
      draft_key TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_id, draft_key)
    );
    CREATE INDEX IF NOT EXISTS idx_user_drafts_owner_updated
      ON user_drafts(owner_id, updated_at DESC);
  `);

  const getStmt = sqlite.prepare(`
    SELECT draft_key, payload_json, updated_at
    FROM user_drafts
    WHERE owner_id = ? AND draft_key = ?
  `);
  const listStmt = sqlite.prepare(`
    SELECT draft_key, updated_at
    FROM user_drafts
    WHERE owner_id = ?
    ORDER BY updated_at DESC
  `);
  const upsertStmt = sqlite.prepare(`
    INSERT INTO user_drafts (owner_id, draft_key, payload_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(owner_id, draft_key) DO UPDATE SET
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `);
  const deleteStmt = sqlite.prepare('DELETE FROM user_drafts WHERE owner_id = ? AND draft_key = ?');
  const deleteOwnerStmt = sqlite.prepare('DELETE FROM user_drafts WHERE owner_id = ?');

  return {
    get(ownerId, draftKey) {
      const row = getStmt.get(Number(ownerId), String(draftKey));
      return row ? { key: row.draft_key, payload: safeParse(row.payload_json), updatedAt: row.updated_at } : null;
    },
    list(ownerId) {
      return listStmt.all(Number(ownerId)).map((row) => ({ key: row.draft_key, updatedAt: row.updated_at }));
    },
    upsert(ownerId, draftKey, payload) {
      const updatedAt = nowIso();
      upsertStmt.run(Number(ownerId), String(draftKey), JSON.stringify(payload ?? {}), updatedAt);
      return { key: String(draftKey), payload: payload ?? {}, updatedAt };
    },
    remove(ownerId, draftKey) {
      return deleteStmt.run(Number(ownerId), String(draftKey)).changes > 0;
    },
    deleteOwnerData(ownerId) {
      return deleteOwnerStmt.run(Number(ownerId)).changes;
    },
  };
};
