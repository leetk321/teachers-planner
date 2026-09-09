import { writeVerifiedJsonBackup } from '../services/migration-backup-service.js';
import {
  normalizeAttendanceEntriesForRead,
  preserveOrphanedAttendanceReferences,
} from '../services/attendance-integrity.js';

const PHASE3_MIGRATION_NAME = '20260328_phase3_clubs_attendance';
export const PHASE3_ATTENDANCE_ORPHAN_MIGRATION_NAME = '20260722_phase3_attendance_orphan_preservation';

const normalizeClubName = (value = '') => String(value || '').trim();

const normalizeClubRow = (row = {}, studentIds = []) => ({
  id: Number(row?.id || 0),
  owner_id: Number(row?.owner_id || 0),
  academic_year: String(row?.academic_year || ''),
  name: normalizeClubName(row?.name || ''),
  use_for_attendance: Boolean(row?.use_for_attendance),
  student_ids: Array.from(new Set((Array.isArray(studentIds) ? studentIds : []).map((id) => Number(id)).filter(Number.isFinite))).sort((a, b) => a - b),
  created_at: String(row?.created_at || ''),
  updated_at: String(row?.updated_at || ''),
});

const normalizeAttendanceRow = (row = {}) => ({
  id: Number(row?.id || 0),
  owner_id: Number(row?.owner_id || 0),
  kind: String(row?.kind || 'homeroom'),
  date: String(row?.date || ''),
  class_name: String(row?.class_name || ''),
  period: String(row?.period || ''),
  entries: normalizeAttendanceEntriesForRead(row?.entries),
  created_at: String(row?.created_at || ''),
  updated_at: String(row?.updated_at || ''),
});

const sortClubList = (rows = []) => (
  [...rows].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'ko', { numeric: true }) || Number(a?.id || 0) - Number(b?.id || 0))
);

const ensureBackupFile = (dataDir, legacyDb) => {
  writeVerifiedJsonBackup({
    dataDir,
    fileName: `${PHASE3_MIGRATION_NAME}.json`,
    payload: legacyDb,
  });
};

const ensurePhase3Tables = (sqlite) => {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS tn_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS club_rows (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  academic_year TEXT NOT NULL,
  name TEXT NOT NULL,
  use_for_attendance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS club_member_rows (
  club_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  PRIMARY KEY (club_id, student_id)
);

CREATE TABLE IF NOT EXISTS attendance_rows (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  date TEXT NOT NULL,
  class_name TEXT NOT NULL,
  period TEXT NOT NULL,
  entries_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_club_rows_owner_year_name ON club_rows(owner_id, academic_year, name);
CREATE INDEX IF NOT EXISTS idx_club_member_rows_student ON club_member_rows(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_rows_owner_slot ON attendance_rows(owner_id, kind, date, class_name, period);
CREATE INDEX IF NOT EXISTS idx_attendance_rows_owner_date ON attendance_rows(owner_id, date, id);
`);
};

export const createPhase3Store = ({ sqlite, dataDir, readLegacySnapshot, sequenceStore }) => {
  ensurePhase3Tables(sqlite);

  const getMigrationRowStmt = sqlite.prepare('SELECT name FROM tn_migrations WHERE name = ?');
  const insertMigrationStmt = sqlite.prepare('INSERT INTO tn_migrations(name, applied_at) VALUES(?, ?)');

  const upsertClubStmt = sqlite.prepare(`
    INSERT INTO club_rows(id, owner_id, academic_year, name, use_for_attendance, created_at, updated_at)
    VALUES(@id, @owner_id, @academic_year, @name, @use_for_attendance, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      owner_id = excluded.owner_id,
      academic_year = excluded.academic_year,
      name = excluded.name,
      use_for_attendance = excluded.use_for_attendance,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);
  const listClubRowsStmt = sqlite.prepare('SELECT * FROM club_rows WHERE owner_id = ? ORDER BY id ASC');
  const listAllClubMemberRowsForOwnerStmt = sqlite.prepare(`
    SELECT cm.club_id, cm.student_id
    FROM club_member_rows cm
    JOIN club_rows c ON c.id = cm.club_id
    WHERE c.owner_id = ?
    ORDER BY cm.club_id ASC, cm.student_id ASC
  `);
  const listClubMemberIdsStmt = sqlite.prepare('SELECT student_id FROM club_member_rows WHERE club_id = ? ORDER BY student_id ASC');
  const getClubRowStmt = sqlite.prepare('SELECT * FROM club_rows WHERE id = ? AND owner_id = ?');
  const deleteClubStmt = sqlite.prepare('DELETE FROM club_rows WHERE id = ? AND owner_id = ?');
  const deleteClubsForOwnerStmt = sqlite.prepare('DELETE FROM club_rows WHERE owner_id = ?');
  const deleteClubMembersStmt = sqlite.prepare('DELETE FROM club_member_rows WHERE club_id = ?');
  const deleteClubMembersForOwnerStudentStmt = sqlite.prepare(`
    DELETE FROM club_member_rows
    WHERE student_id = ?
      AND club_id IN (SELECT id FROM club_rows WHERE owner_id = ?)
  `);
  const deleteClubMembersForOwnerStmt = sqlite.prepare(`
    DELETE FROM club_member_rows
    WHERE club_id IN (SELECT id FROM club_rows WHERE owner_id = ?)
  `);
  const insertClubMemberStmt = sqlite.prepare('INSERT OR IGNORE INTO club_member_rows(club_id, student_id) VALUES(?, ?)');
  const validStudentIdsStmt = sqlite.prepare('SELECT id FROM student_rows WHERE owner_id = ?');

  const listAttendanceRowsStmt = sqlite.prepare('SELECT * FROM attendance_rows WHERE owner_id = ? ORDER BY id ASC');
  const getAttendanceRowStmt = sqlite.prepare('SELECT * FROM attendance_rows WHERE owner_id = ? AND kind = ? AND date = ? AND class_name = ? AND period = ? LIMIT 1');
  const upsertAttendanceStmt = sqlite.prepare(`
    INSERT INTO attendance_rows(id, owner_id, kind, date, class_name, period, entries_json, created_at, updated_at)
    VALUES(@id, @owner_id, @kind, @date, @class_name, @period, @entries_json, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      owner_id = excluded.owner_id,
      kind = excluded.kind,
      date = excluded.date,
      class_name = excluded.class_name,
      period = excluded.period,
      entries_json = excluded.entries_json,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);
  const deleteAttendanceForOwnerStmt = sqlite.prepare('DELETE FROM attendance_rows WHERE owner_id = ?');
  const listAllAttendanceRowsStmt = sqlite.prepare('SELECT id, owner_id, entries_json FROM attendance_rows ORDER BY id ASC');
  const updateAttendanceEntriesByIdStmt = sqlite.prepare('UPDATE attendance_rows SET entries_json = ? WHERE id = ? AND owner_id = ?');
  const listStudentOwnersStmt = sqlite.prepare('SELECT id, owner_id FROM student_rows');

  const hydrateClubs = (rows) => {
    const membershipRows = listAllClubMemberRowsForOwnerStmt.all(Number(rows?.[0]?.owner_id || 0));
    const memberMap = {};
    membershipRows.forEach((row) => {
      const key = String(row.club_id);
      if (!memberMap[key]) memberMap[key] = [];
      memberMap[key].push(Number(row.student_id));
    });
    return sortClubList((rows || []).map((row) => normalizeClubRow(row, memberMap[String(row.id)] || [])));
  };

  const getValidStudentIds = (ownerId, ids = []) => {
    const allowed = new Set(validStudentIdsStmt.all(ownerId).map((row) => Number(row.id)));
    return Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => Number(id)).filter((id) => allowed.has(id)))).sort((a, b) => a - b);
  };

  const validateAttendanceEntries = (ownerId, rawEntries) => {
    if (!Array.isArray(rawEntries)) throw new Error('attendance entries must be an array');
    const allowed = new Set(validStudentIdsStmt.all(ownerId).map((row) => Number(row.id)));
    const seen = new Set();
    const normalized = [];

    for (const rawEntry of rawEntries) {
      const studentId = Number(rawEntry?.student_id);
      if (!Number.isInteger(studentId) || studentId <= 0) {
        throw new Error('attendance entry has an invalid student id');
      }
      if (seen.has(studentId)) throw new Error(`duplicate attendance student id: ${studentId}`);
      if (!allowed.has(studentId)) throw new Error(`attendance student is not owned by user: ${studentId}`);
      seen.add(studentId);
      normalized.push({
        student_id: studentId,
        status: String(rawEntry?.status || ''),
        memo: String(rawEntry?.memo || ''),
      });
    }

    return normalized;
  };

  const runMigration = sqlite.transaction(() => {
    if (getMigrationRowStmt.get(PHASE3_MIGRATION_NAME)) return;
    const legacyDb = readLegacySnapshot(sqlite);
    ensureBackupFile(dataDir, legacyDb);

    legacyDb.clubs.forEach((row) => {
      const normalized = normalizeClubRow(row, row?.student_ids);
      upsertClubStmt.run({ ...normalized, use_for_attendance: normalized.use_for_attendance ? 1 : 0 });
      normalized.student_ids.forEach((studentId) => insertClubMemberStmt.run(normalized.id, studentId));
    });

    legacyDb.attendance.forEach((row) => {
      const normalized = normalizeAttendanceRow(row);
      upsertAttendanceStmt.run({
        id: normalized.id,
        owner_id: normalized.owner_id,
        kind: normalized.kind,
        date: normalized.date,
        class_name: normalized.class_name,
        period: normalized.period,
        entries_json: JSON.stringify(normalized.entries),
        created_at: normalized.created_at,
        updated_at: normalized.updated_at,
      });
    });

    insertMigrationStmt.run(PHASE3_MIGRATION_NAME, new Date().toISOString());
  });

  runMigration();

  const runAttendanceOrphanMigration = sqlite.transaction(() => {
    if (getMigrationRowStmt.get(PHASE3_ATTENDANCE_ORPHAN_MIGRATION_NAME)) return;

    const studentOwnerById = new Map(listStudentOwnersStmt.all().map((row) => [Number(row.id), Number(row.owner_id)]));
    const affectedRows = [];
    const updates = [];
    let orphanedEntryCount = 0;

    for (const row of listAllAttendanceRowsStmt.iterate()) {
      let entries;
      try {
        entries = JSON.parse(String(row.entries_json || '[]'));
      } catch (error) {
        throw new Error(`attendance ${row.id} entries_json is invalid: ${error.message}`);
      }
      const migrated = preserveOrphanedAttendanceReferences(entries, {
        ownerId: row.owner_id,
        studentOwnerById,
      });
      if (!migrated.changed) continue;
      affectedRows.push({
        id: Number(row.id),
        owner_id: Number(row.owner_id),
        entries_json: String(row.entries_json),
      });
      updates.push({
        id: Number(row.id),
        owner_id: Number(row.owner_id),
        entries_json: JSON.stringify(migrated.entries),
      });
      orphanedEntryCount += migrated.orphanedCount;
    }

    const backupPayload = {
      migration: PHASE3_ATTENDANCE_ORPHAN_MIGRATION_NAME,
      source: 'attendance_rows.entries_json',
      affected_row_count: affectedRows.length,
      orphaned_entry_count: orphanedEntryCount,
      rows: affectedRows,
    };
    const verifiedBackup = writeVerifiedJsonBackup({
      dataDir,
      fileName: `${PHASE3_ATTENDANCE_ORPHAN_MIGRATION_NAME}.json`,
      payload: backupPayload,
    });
    if (JSON.stringify(verifiedBackup.payload?.rows || []) !== JSON.stringify(backupPayload.rows)) {
      throw new Error('attendance orphan migration backup does not match the current database');
    }

    updates.forEach((row) => updateAttendanceEntriesByIdStmt.run(row.entries_json, row.id, row.owner_id));
    insertMigrationStmt.run(PHASE3_ATTENDANCE_ORPHAN_MIGRATION_NAME, new Date().toISOString());
  });

  runAttendanceOrphanMigration();

  const listClubs = (ownerId, { year = '' } = {}) => {
    const rows = hydrateClubs(listClubRowsStmt.all(ownerId));
    return year ? rows.filter((club) => String(club.academic_year || '') === String(year || '')) : rows;
  };

  const getClub = (ownerId, id) => {
    const row = getClubRowStmt.get(id, ownerId);
    if (!row) return null;
    const studentIds = listClubMemberIdsStmt.all(id).map((member) => Number(member.student_id));
    return normalizeClubRow(row, studentIds);
  };

  const createClub = sqlite.transaction((ownerId, payload) => {
    const now = new Date().toISOString();
    const name = normalizeClubName(payload?.name);
    const academicYear = String(payload?.academicYear || '');
    if (listClubs(ownerId, { year: academicYear }).some((club) => String(club.name || '').toLowerCase() === name.toLowerCase())) {
      throw new Error('club name already exists');
    }

    const studentIds = getValidStudentIds(ownerId, payload?.studentIds);
    const row = normalizeClubRow({
      id: sequenceStore.next('club'),
      owner_id: ownerId,
      academic_year: academicYear,
      name,
      use_for_attendance: Boolean(payload?.useForAttendance),
      created_at: now,
      updated_at: now,
    }, studentIds);

    upsertClubStmt.run({ ...row, use_for_attendance: row.use_for_attendance ? 1 : 0 });
    studentIds.forEach((studentId) => insertClubMemberStmt.run(row.id, studentId));
    return row;
  });

  const updateClub = sqlite.transaction((ownerId, id, payload) => {
    const current = getClub(ownerId, id);
    if (!current) return null;

    const hasAcademicYear = Object.prototype.hasOwnProperty.call(payload || {}, 'academicYear');
    const hasName = Object.prototype.hasOwnProperty.call(payload || {}, 'name');
    const hasUseForAttendance = Object.prototype.hasOwnProperty.call(payload || {}, 'useForAttendance');
    const hasStudentIds = Object.prototype.hasOwnProperty.call(payload || {}, 'studentIds');

    const nextAcademicYear = hasAcademicYear ? String(payload?.academicYear || '') : current.academic_year;
    const nextName = hasName ? normalizeClubName(payload?.name) : current.name;
    if (!nextName) throw new Error('name is required');
    const duplicated = listClubs(ownerId, { year: nextAcademicYear }).find((club) => club.id !== id && String(club.name || '').toLowerCase() === nextName.toLowerCase());
    if (duplicated) throw new Error('club name already exists');

    const nextStudentIds = hasStudentIds ? getValidStudentIds(ownerId, payload?.studentIds) : current.student_ids;
    const updated = normalizeClubRow({
      ...current,
      academic_year: nextAcademicYear,
      name: nextName,
      use_for_attendance: hasUseForAttendance ? Boolean(payload?.useForAttendance) : current.use_for_attendance,
      updated_at: new Date().toISOString(),
    }, nextStudentIds);

    upsertClubStmt.run({ ...updated, use_for_attendance: updated.use_for_attendance ? 1 : 0 });
    deleteClubMembersStmt.run(id);
    nextStudentIds.forEach((studentId) => insertClubMemberStmt.run(id, studentId));
    return updated;
  });

  const deleteClub = sqlite.transaction((ownerId, id) => {
    const current = getClub(ownerId, id);
    if (!current) return null;
    deleteClubMembersStmt.run(id);
    deleteClubStmt.run(id, ownerId);
    return current;
  });

  const removeStudentFromClubs = sqlite.transaction((ownerId, studentId) => {
    const clubs = listClubs(ownerId);
    const touched = clubs
      .filter((club) => club.student_ids.some((id) => Number(id) === Number(studentId)))
      .map((club) => ({
        ...club,
        student_ids: club.student_ids.filter((id) => Number(id) !== Number(studentId)),
        updated_at: new Date().toISOString(),
      }));
    if (!touched.length) return false;

    deleteClubMembersForOwnerStudentStmt.run(studentId, ownerId);
    touched.forEach((club) => upsertClubStmt.run({ ...club, use_for_attendance: club.use_for_attendance ? 1 : 0 }));
    return true;
  });

  const listAttendance = (ownerId, filters = {}) => {
    const kind = String(filters?.kind || 'homeroom');
    const date = String(filters?.date || '');
    const className = String(filters?.className || '');
    const period = String(filters?.period || '');
    let rows = listAttendanceRowsStmt.all(ownerId).map((row) => normalizeAttendanceRow({
      ...row,
      entries: JSON.parse(String(row.entries_json || '[]')),
    }));
    rows = rows.filter((row) => row.kind === kind);
    if (date) rows = rows.filter((row) => row.date === date);
    if (className) rows = rows.filter((row) => row.class_name === className);
    if (period) rows = rows.filter((row) => row.period === period);
    return rows.sort((a, b) => a.id - b.id);
  };

  const upsertAttendance = sqlite.transaction((ownerId, payload) => {
    const kind = String(payload?.kind || 'homeroom');
    const date = String(payload?.date || '');
    const className = String(payload?.className || '');
    const period = String(payload?.period || '');
    const entries = validateAttendanceEntries(ownerId, payload?.entries);
    const now = new Date().toISOString();

    const existing = getAttendanceRowStmt.get(ownerId, kind, date, className, period);
    if (existing) {
      const updated = normalizeAttendanceRow({
        ...existing,
        entries,
        updated_at: now,
      });
      upsertAttendanceStmt.run({
        id: updated.id,
        owner_id: ownerId,
        kind,
        date,
        class_name: className,
        period,
        entries_json: JSON.stringify(updated.entries),
        created_at: updated.created_at,
        updated_at: updated.updated_at,
      });
      return updated;
    }

    const row = normalizeAttendanceRow({
      id: sequenceStore.next('attendance'),
      owner_id: ownerId,
      kind,
      date,
      class_name: className,
      period,
      entries,
      created_at: now,
      updated_at: now,
    });
    upsertAttendanceStmt.run({
      id: row.id,
      owner_id: ownerId,
      kind,
      date,
      class_name: className,
      period,
      entries_json: JSON.stringify(row.entries),
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
    return row;
  });

  const deleteOwnerPhase3Data = sqlite.transaction((ownerId) => {
    deleteAttendanceForOwnerStmt.run(ownerId);
    deleteClubMembersForOwnerStmt.run(ownerId);
    deleteClubsForOwnerStmt.run(ownerId);
  });

  return {
    listClubs,
    getClub,
    createClub,
    updateClub,
    deleteClub,
    removeStudentFromClubs,
    listAttendance,
    upsertAttendance,
    deleteOwnerPhase3Data,
  };
};
