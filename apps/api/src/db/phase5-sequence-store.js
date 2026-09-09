import fs from 'fs';
import path from 'path';

const PHASE5_MIGRATION_NAME = '20260328_phase5_sequences';

const KNOWN_SEQUENCES = [
  { name: 'user', legacyKey: 'user', table: 'user_rows' },
  { name: 'student', legacyKey: 'student', table: 'student_rows' },
  { name: 'note', legacyKey: 'note', table: 'note_rows' },
  { name: 'schedule', legacyKey: 'schedule', table: 'schedule_rows' },
  { name: 'attendance', legacyKey: 'attendance', table: 'attendance_rows' },
  { name: 'memo', legacyKey: 'memo', table: 'task_memo_rows' },
  { name: 'club', legacyKey: 'club', table: 'club_rows' },
];

const ensureBackupFile = (dataDir, legacyDb) => {
  const backupDir = path.join(dataDir, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${PHASE5_MIGRATION_NAME}.json`);
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, JSON.stringify(legacyDb, null, 2), 'utf8');
  }
};

const ensurePhase5Tables = (sqlite) => {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS tn_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sequence_rows (
  name TEXT PRIMARY KEY,
  next_value INTEGER NOT NULL
);
`);
};

export const createPhase5SequenceStore = ({ sqlite, dataDir, readLegacySnapshot }) => {
  ensurePhase5Tables(sqlite);

  const getMigrationRowStmt = sqlite.prepare('SELECT name FROM tn_migrations WHERE name = ?');
  const insertMigrationStmt = sqlite.prepare('INSERT INTO tn_migrations(name, applied_at) VALUES(?, ?)');
  const getTableExistsStmt = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?");
  const getSequenceStmt = sqlite.prepare('SELECT next_value FROM sequence_rows WHERE name = ?');
  const upsertSequenceStmt = sqlite.prepare(`
    INSERT INTO sequence_rows(name, next_value)
    VALUES(?, ?)
    ON CONFLICT(name) DO UPDATE SET
      next_value = excluded.next_value
  `);
  const updateSequenceStmt = sqlite.prepare('UPDATE sequence_rows SET next_value = ? WHERE name = ?');

  const runMigration = sqlite.transaction(() => {
    if (getMigrationRowStmt.get(PHASE5_MIGRATION_NAME)) return;
    const legacyDb = readLegacySnapshot(sqlite);
    ensureBackupFile(dataDir, legacyDb);

    for (const seq of KNOWN_SEQUENCES) {
      const legacyNext = Number(legacyDb?.seq?.[seq.legacyKey] || 1);
      const tableExists = Boolean(getTableExistsStmt.get(seq.table));
      const tableMaxRow = tableExists
        ? sqlite.prepare(`SELECT COALESCE(MAX(id), 0) AS max_id FROM ${seq.table}`).get()
        : { max_id: 0 };
      const maxId = Number(tableMaxRow?.max_id || 0);
      const nextValue = Math.max(legacyNext, maxId + 1, 1);
      upsertSequenceStmt.run(seq.name, nextValue);
    }
    insertMigrationStmt.run(PHASE5_MIGRATION_NAME, new Date().toISOString());
  });

  runMigration();

  const ensure = sqlite.transaction((name, initialValue = 1) => {
    const key = String(name || '').trim();
    if (!key) throw new Error('sequence name required');
    const current = getSequenceStmt.get(key);
    if (!current) upsertSequenceStmt.run(key, Math.max(Number(initialValue || 1), 1));
  });

  const next = sqlite.transaction((name) => {
    const key = String(name || '').trim();
    if (!key) throw new Error('sequence name required');

    const row = getSequenceStmt.get(key);
    if (!row) {
      upsertSequenceStmt.run(key, 2);
      return 1;
    }
    const current = Math.max(Number(row?.next_value || 1), 1);
    const nextValue = current + 1;

    updateSequenceStmt.run(nextValue, key);
    return current;
  });

  const getAll = () => KNOWN_SEQUENCES.reduce((acc, seq) => {
    const row = getSequenceStmt.get(seq.name);
    acc[seq.name] = Number(row?.next_value || 1);
    return acc;
  }, {});

  return {
    next,
    ensure,
    getAll,
  };
};
