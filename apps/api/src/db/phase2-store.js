import { writeVerifiedJsonBackup } from '../services/migration-backup-service.js';
import { getSeoulDateText } from '../utils/dateTime.js';

const PHASE2_MIGRATION_NAME = '20260328_phase2_core_entities';
const PHASE2_ATTACHMENT_SCHEMA_MIGRATION_NAME = '20260722_phase2_note_attachment_fields';
const PHASE2_STUDENT_IDENTITY_MIGRATION_NAME = '20260722_phase2_student_identity_unique';
const STUDENT_IDENTITY_INDEX_NAME = 'idx_student_rows_owner_identity_unique';

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

const normalizeStudentRow = (row = {}) => ({
  id: Number(row?.id || 0),
  owner_id: Number(row?.owner_id || 0),
  academic_year: String(row?.academic_year || ''),
  name: String(row?.name || '').trim(),
  class_name: String(row?.class_name || ''),
  student_no: String(row?.student_no || ''),
  memo: String(row?.memo || ''),
  risk_level: ['normal', 'watch', 'focus'].includes(String(row?.risk_level || 'normal')) ? String(row?.risk_level || 'normal') : 'normal',
  tags: String(row?.tags || ''),
  student_track: String(row?.student_track || 'course'),
  student_phone: String(row?.student_phone || ''),
  guardian_phone: String(row?.guardian_phone || ''),
  basic_info: String(row?.basic_info || ''),
  basic_survey: String(row?.basic_survey || ''),
  gender: ['남', '여'].includes(String(row?.gender || '')) ? String(row?.gender || '') : '',
  birth_date: String(row?.birth_date || ''),
  transferred_at: String(row?.transferred_at || ''),
  photo_url: String(row?.photo_url || ''),
  photo_updated_at: String(row?.photo_updated_at || ''),
  created_at: String(row?.created_at || ''),
  updated_at: String(row?.updated_at || ''),
});

const normalizeStudentGenderInput = (value = '') => (
  ['남', '여'].includes(String(value || '')) ? String(value || '') : ''
);

const normalizeNoteRow = (row = {}) => {
  const attachments = normalizeAttachments(row?.attachments ?? row?.attachments_json);
  return {
    id: Number(row?.id || 0),
    owner_id: Number(row?.owner_id || 0),
    academic_year: String(row?.academic_year || ''),
    student_id: Number(row?.student_id || 0),
    note_date: String(row?.note_date || ''),
    category: String(row?.category || 'general'),
    content: String(row?.content || '').trim(),
    attachments,
    attachments_json: JSON.stringify(attachments),
    created_at: String(row?.created_at || ''),
  };
};

const normalizeScheduleRow = (row = {}) => ({
  id: Number(row?.id || 0),
  owner_id: Number(row?.owner_id || 0),
  title: String(row?.title || '').trim(),
  due_at: row?.due_at || null,
  importance: String(row?.importance || 'normal'),
  kind: String(row?.kind) === 'event' ? 'event' : 'todo',
  done: Boolean(row?.done),
  created_at: String(row?.created_at || ''),
});

const ensureBackupFile = (dataDir, legacyDb) => {
  writeVerifiedJsonBackup({
    dataDir,
    fileName: `${PHASE2_MIGRATION_NAME}.json`,
    payload: legacyDb,
  });
};

const hasCompleteStudentIdentity = ({ academic_year: academicYear, class_name: className, student_no: studentNo } = {}) => (
  Boolean(String(academicYear || '').trim() && String(className || '').trim() && String(studentNo || '').trim())
);

const ensurePhase2Tables = (sqlite) => {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS tn_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_rows (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  academic_year TEXT NOT NULL,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  student_no TEXT NOT NULL,
  memo TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  tags TEXT NOT NULL,
  student_track TEXT NOT NULL,
  student_phone TEXT NOT NULL,
  guardian_phone TEXT NOT NULL,
  basic_info TEXT NOT NULL,
  basic_survey TEXT NOT NULL,
  gender TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  transferred_at TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  photo_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_rows (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  academic_year TEXT NOT NULL,
  student_id INTEGER NOT NULL,
  note_date TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_rows (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  due_at TEXT,
  importance TEXT NOT NULL,
  kind TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_student_rows_owner_year ON student_rows(owner_id, academic_year, id DESC);
CREATE INDEX IF NOT EXISTS idx_student_rows_owner_class_no ON student_rows(owner_id, academic_year, class_name, student_no);
CREATE INDEX IF NOT EXISTS idx_note_rows_owner_student_date ON note_rows(owner_id, student_id, note_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_rows_owner ON schedule_rows(owner_id, id ASC);
`);

  const columns = sqlite.prepare('PRAGMA table_info(note_rows)').all();
  if (!columns.some((item) => String(item.name) === 'attachments_json')) {
    sqlite.exec("ALTER TABLE note_rows ADD COLUMN attachments_json TEXT NOT NULL DEFAULT '[]'");
  }
};

export const createPhase2Store = ({ sqlite, dataDir, readLegacySnapshot, sequenceStore }) => {
  ensurePhase2Tables(sqlite);

  const getMigrationRowStmt = sqlite.prepare('SELECT name FROM tn_migrations WHERE name = ?');
  const insertMigrationStmt = sqlite.prepare('INSERT INTO tn_migrations(name, applied_at) VALUES(?, ?)');

  const upsertStudentStmt = sqlite.prepare(`
    INSERT INTO student_rows(id, owner_id, academic_year, name, class_name, student_no, memo, risk_level, tags, student_track, student_phone, guardian_phone, basic_info, basic_survey, gender, birth_date, transferred_at, photo_url, photo_updated_at, created_at, updated_at)
    VALUES(@id, @owner_id, @academic_year, @name, @class_name, @student_no, @memo, @risk_level, @tags, @student_track, @student_phone, @guardian_phone, @basic_info, @basic_survey, @gender, @birth_date, @transferred_at, @photo_url, @photo_updated_at, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      owner_id = excluded.owner_id,
      academic_year = excluded.academic_year,
      name = excluded.name,
      class_name = excluded.class_name,
      student_no = excluded.student_no,
      memo = excluded.memo,
      risk_level = excluded.risk_level,
      tags = excluded.tags,
      student_track = excluded.student_track,
      student_phone = excluded.student_phone,
      guardian_phone = excluded.guardian_phone,
      basic_info = excluded.basic_info,
      basic_survey = excluded.basic_survey,
      gender = excluded.gender,
      birth_date = excluded.birth_date,
      transferred_at = excluded.transferred_at,
      photo_url = excluded.photo_url,
      photo_updated_at = excluded.photo_updated_at,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `);
  const listStudentRowsStmt = sqlite.prepare('SELECT * FROM student_rows WHERE owner_id = ? ORDER BY id DESC');
  const listStudentRowsByYearStmt = sqlite.prepare('SELECT * FROM student_rows WHERE owner_id = ? AND academic_year = ? ORDER BY id DESC');
  const getStudentStmt = sqlite.prepare('SELECT * FROM student_rows WHERE id = ? AND owner_id = ?');
  const findStudentByCompositeStmt = sqlite.prepare('SELECT * FROM student_rows WHERE owner_id = ? AND academic_year = ? AND class_name = ? AND student_no = ? LIMIT 1');
  const findOtherStudentByCompositeStmt = sqlite.prepare('SELECT * FROM student_rows WHERE owner_id = ? AND academic_year = ? AND class_name = ? AND student_no = ? AND id <> ? LIMIT 1');
  const listStudentIdentityRowsStmt = sqlite.prepare(`
    SELECT id, owner_id, academic_year, class_name, student_no, name
    FROM student_rows
    WHERE TRIM(academic_year) <> '' AND TRIM(class_name) <> '' AND TRIM(student_no) <> ''
    ORDER BY owner_id, academic_year, class_name, student_no, id
  `);
  const listDuplicateStudentIdentitiesStmt = sqlite.prepare(`
    SELECT owner_id, academic_year, class_name, student_no, COUNT(*) AS duplicate_count, GROUP_CONCAT(id, ',') AS student_ids
    FROM student_rows
    WHERE TRIM(academic_year) <> '' AND TRIM(class_name) <> '' AND TRIM(student_no) <> ''
    GROUP BY owner_id, academic_year, class_name, student_no
    HAVING COUNT(*) > 1
    ORDER BY owner_id, academic_year, class_name, student_no
  `);
  const deleteStudentStmt = sqlite.prepare('DELETE FROM student_rows WHERE id = ? AND owner_id = ?');
  const deleteStudentsForOwnerStmt = sqlite.prepare('DELETE FROM student_rows WHERE owner_id = ?');
  const deleteStudentsByPhotoUrlStmt = sqlite.prepare('SELECT * FROM student_rows WHERE owner_id = ? AND photo_url = ?');

  const upsertNoteStmt = sqlite.prepare(`
    INSERT INTO note_rows(id, owner_id, academic_year, student_id, note_date, category, content, attachments_json, created_at)
    VALUES(@id, @owner_id, @academic_year, @student_id, @note_date, @category, @content, @attachments_json, @created_at)
    ON CONFLICT(id) DO UPDATE SET
      owner_id = excluded.owner_id,
      academic_year = excluded.academic_year,
      student_id = excluded.student_id,
      note_date = excluded.note_date,
      category = excluded.category,
      content = excluded.content,
      attachments_json = excluded.attachments_json,
      created_at = excluded.created_at
  `);
  const listNoteRowsStmt = sqlite.prepare(`
    SELECT n.*, COALESCE(s.name, '') AS student_name
    FROM note_rows n
    LEFT JOIN student_rows s ON s.id = n.student_id
    WHERE n.owner_id = ?
    ORDER BY n.note_date DESC, n.id DESC
  `);
  const getNoteStmt = sqlite.prepare('SELECT * FROM note_rows WHERE id = ? AND owner_id = ?');
  const deleteNoteStmt = sqlite.prepare('DELETE FROM note_rows WHERE id = ? AND owner_id = ?');
  const deleteNotesForStudentStmt = sqlite.prepare('DELETE FROM note_rows WHERE owner_id = ? AND student_id = ?');
  const deleteNotesForOwnerStmt = sqlite.prepare('DELETE FROM note_rows WHERE owner_id = ?');

  const upsertScheduleStmt = sqlite.prepare(`
    INSERT INTO schedule_rows(id, owner_id, title, due_at, importance, kind, done, created_at)
    VALUES(@id, @owner_id, @title, @due_at, @importance, @kind, @done, @created_at)
    ON CONFLICT(id) DO UPDATE SET
      owner_id = excluded.owner_id,
      title = excluded.title,
      due_at = excluded.due_at,
      importance = excluded.importance,
      kind = excluded.kind,
      done = excluded.done,
      created_at = excluded.created_at
  `);
  const listScheduleRowsStmt = sqlite.prepare('SELECT * FROM schedule_rows WHERE owner_id = ? ORDER BY id ASC');
  const getScheduleStmt = sqlite.prepare('SELECT * FROM schedule_rows WHERE id = ? AND owner_id = ?');
  const deleteScheduleStmt = sqlite.prepare('DELETE FROM schedule_rows WHERE id = ? AND owner_id = ?');
  const deleteSchedulesForOwnerStmt = sqlite.prepare('DELETE FROM schedule_rows WHERE owner_id = ?');

  const runMigration = sqlite.transaction(() => {
    if (getMigrationRowStmt.get(PHASE2_MIGRATION_NAME)) return;
    const legacyDb = readLegacySnapshot(sqlite);
    ensureBackupFile(dataDir, legacyDb);

    legacyDb.students.forEach((row) => upsertStudentStmt.run(normalizeStudentRow(row)));
    legacyDb.notes.forEach((row) => upsertNoteStmt.run(normalizeNoteRow(row)));
    legacyDb.schedules.forEach((row) => {
      const normalized = normalizeScheduleRow(row);
      upsertScheduleStmt.run({ ...normalized, done: normalized.done ? 1 : 0 });
    });

    insertMigrationStmt.run(PHASE2_MIGRATION_NAME, new Date().toISOString());
  });

  runMigration();

  const runAttachmentSchemaMigration = sqlite.transaction(() => {
    if (getMigrationRowStmt.get(PHASE2_ATTACHMENT_SCHEMA_MIGRATION_NAME)) return;
    insertMigrationStmt.run(PHASE2_ATTACHMENT_SCHEMA_MIGRATION_NAME, new Date().toISOString());
  });

  runAttachmentSchemaMigration();

  const runStudentIdentityMigration = sqlite.transaction(() => {
    const identityRows = listStudentIdentityRowsStmt.all();
    const duplicateGroups = listDuplicateStudentIdentitiesStmt.all();
    if (!getMigrationRowStmt.get(PHASE2_STUDENT_IDENTITY_MIGRATION_NAME)) {
      writeVerifiedJsonBackup({
        dataDir,
        fileName: `${PHASE2_STUDENT_IDENTITY_MIGRATION_NAME}.json`,
        payload: {
          migration: PHASE2_STUDENT_IDENTITY_MIGRATION_NAME,
          audited_at: new Date().toISOString(),
          identity_rows: identityRows,
          duplicate_groups: duplicateGroups,
        },
      });
    }

    if (duplicateGroups.length) {
      const example = duplicateGroups[0];
      throw new Error(
        `student identity migration blocked: ${duplicateGroups.length} duplicate group(s); `
        + `owner=${example.owner_id}, year=${example.academic_year}, class=${example.class_name}, no=${example.student_no}`,
      );
    }

    sqlite.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${STUDENT_IDENTITY_INDEX_NAME}
      ON student_rows(owner_id, academic_year, class_name, student_no)
      WHERE TRIM(academic_year) <> '' AND TRIM(class_name) <> '' AND TRIM(student_no) <> ''
    `);
    if (!getMigrationRowStmt.get(PHASE2_STUDENT_IDENTITY_MIGRATION_NAME)) {
      insertMigrationStmt.run(PHASE2_STUDENT_IDENTITY_MIGRATION_NAME, new Date().toISOString());
    }
  });

  runStudentIdentityMigration();

  const assertStudentIdentityAvailable = (ownerId, row, excludedId = 0) => {
    if (!hasCompleteStudentIdentity(row)) return;
    const duplicate = findOtherStudentByCompositeStmt.get(
      ownerId,
      String(row.academic_year || ''),
      String(row.class_name || ''),
      String(row.student_no || ''),
      Number(excludedId || 0),
    );
    if (duplicate) throw new Error('student identity already exists');
  };

  const listStudents = (ownerId, { year } = {}) => {
    const rows = year ? listStudentRowsByYearStmt.all(ownerId, String(year)) : listStudentRowsStmt.all(ownerId);
    return rows.map(normalizeStudentRow);
  };

  const getStudent = (ownerId, id) => {
    const row = getStudentStmt.get(id, ownerId);
    return row ? normalizeStudentRow(row) : null;
  };

  const createStudent = sqlite.transaction((ownerId, payload) => {
    const now = new Date().toISOString();
    const row = normalizeStudentRow({
      id: sequenceStore.next('student'),
      owner_id: ownerId,
      academic_year: String(payload?.academicYear || ''),
      name: String(payload?.name || '').trim(),
      class_name: String(payload?.className || ''),
      student_no: String(payload?.studentNo || ''),
      memo: String(payload?.memo || ''),
      risk_level: String(payload?.riskLevel || 'normal'),
      tags: String(payload?.tags || ''),
      student_track: String(payload?.studentTrack || 'course'),
      student_phone: String(payload?.studentPhone || ''),
      guardian_phone: String(payload?.guardianPhone || ''),
      basic_info: String(payload?.basicInfo || ''),
      basic_survey: String(payload?.basicSurvey || ''),
      gender: String(payload?.gender || ''),
      birth_date: String(payload?.birthDate || ''),
      transferred_at: String(payload?.transferredAt || ''),
      photo_url: '',
      photo_updated_at: '',
      created_at: now,
      updated_at: now,
    });
    assertStudentIdentityAvailable(ownerId, row);
    upsertStudentStmt.run(row);
    return row;
  });

  const bulkUpsertStudents = sqlite.transaction((ownerId, bulkRows) => {
    const processed = [];

    for (const item of Array.isArray(bulkRows) ? bulkRows : []) {
      const name = String(item?.name || '').trim();
      if (!name) continue;

      const academic_year = String(item?.academicYear || '');
      const class_name = String(item?.className || '');
      const student_no = String(item?.studentNo || '');
      const now = new Date().toISOString();

      const existingRow = findStudentByCompositeStmt.get(ownerId, academic_year, class_name, student_no);

      if (existingRow) {
        const existing = normalizeStudentRow(existingRow);
        const updated = normalizeStudentRow({
          ...existing,
          name: name || existing.name,
          gender: ['남', '여'].includes(String(item?.gender || '')) ? String(item.gender) : existing.gender,
          student_phone: item?.studentPhone && String(item.studentPhone).trim() ? String(item.studentPhone).trim() : existing.student_phone,
          guardian_phone: item?.guardianPhone && String(item.guardianPhone).trim() ? String(item.guardianPhone).trim() : existing.guardian_phone,
          birth_date: item?.birthDate && String(item.birthDate).trim() ? String(item.birthDate).trim() : existing.birth_date,
          updated_at: now,
        });
        upsertStudentStmt.run(updated);
        processed.push(updated);
      } else {
        const row = normalizeStudentRow({
          id: sequenceStore.next('student'),
          owner_id: ownerId,
          academic_year,
          name,
          class_name,
          student_no,
          memo: '',
          risk_level: String(item?.riskLevel || 'normal'),
          tags: String(item?.tags || ''),
          student_track: String(item?.studentTrack || 'course'),
          student_phone: String(item?.studentPhone || ''),
          guardian_phone: String(item?.guardianPhone || ''),
          basic_info: String(item?.basicInfo || ''),
          basic_survey: String(item?.basicSurvey || ''),
          gender: normalizeStudentGenderInput(item?.gender),
          birth_date: String(item?.birthDate || ''),
          transferred_at: String(item?.transferredAt || ''),
          photo_url: '',
          photo_updated_at: '',
          created_at: now,
          updated_at: now,
        });
        upsertStudentStmt.run(row);
        processed.push(row);
      }
    }

    return processed;
  });

  const updateStudent = sqlite.transaction((ownerId, id, payload) => {
    const current = getStudent(ownerId, id);
    if (!current) return null;
    const body = payload || {};
    const updated = normalizeStudentRow({
      ...current,
      name: body?.name ?? current.name,
      class_name: body?.className ?? current.class_name,
      student_no: body?.studentNo ?? current.student_no,
      memo: body?.memo ?? current.memo,
      risk_level: body?.riskLevel ?? current.risk_level,
      tags: body?.tags ?? current.tags,
      student_track: body?.studentTrack ?? current.student_track,
      student_phone: String(body?.studentPhone ?? current.student_phone ?? ''),
      guardian_phone: String(body?.guardianPhone ?? current.guardian_phone ?? ''),
      basic_info: String(body?.basicInfo ?? current.basic_info ?? ''),
      basic_survey: String(body?.basicSurvey ?? current.basic_survey ?? ''),
      gender: body?.gender ?? current.gender,
      birth_date: String(body?.birthDate ?? current.birth_date ?? ''),
      transferred_at: String((body?.transferredAt ?? body?.transferred_at ?? current.transferred_at) || ''),
      updated_at: new Date().toISOString(),
    });

    assertStudentIdentityAvailable(ownerId, updated, id);
    upsertStudentStmt.run(updated);
    return updated;
  });

  const updateStudentPhoto = sqlite.transaction((ownerId, id, url, updatedAt) => {
    const current = getStudent(ownerId, id);
    if (!current) return null;
    const next = normalizeStudentRow({
      ...current,
      photo_url: String(url || ''),
      photo_updated_at: String(updatedAt || ''),
      updated_at: new Date().toISOString(),
    });
    upsertStudentStmt.run(next);
    return next;
  });

  const syncStudentPhotos = sqlite.transaction((ownerId, items) => {
    const now = new Date().toISOString();
    const updatedItems = [];

    for (const item of Array.isArray(items) ? items : []) {
      const studentId = Number(item?.studentId);
      if (!Number.isFinite(studentId)) continue;
      const current = getStudent(ownerId, studentId);
      if (!current) continue;
      const next = normalizeStudentRow({
        ...current,
        photo_url: String(item?.url || ''),
        photo_updated_at: String(item?.updatedAt || now),
        updated_at: now,
      });
      upsertStudentStmt.run(next);
      updatedItems.push({ studentId, url: next.photo_url, updatedAt: next.photo_updated_at });
    }

    return updatedItems;
  });

  const clearStudentPhotoById = (ownerId, id) => {
    const current = getStudent(ownerId, id);
    if (!current) return null;
    return updateStudentPhoto(ownerId, id, '', '');
  };

  const clearStudentPhotoByUrl = sqlite.transaction((ownerId, url) => {
    const value = String(url || '').trim();
    if (!value) return [];
    const rows = deleteStudentsByPhotoUrlStmt.all(ownerId, value).map(normalizeStudentRow);
    if (!rows.length) return [];
    const now = new Date().toISOString();
    const updatedIds = [];
    rows.forEach((student) => {
      const next = normalizeStudentRow({ ...student, photo_url: '', photo_updated_at: '', updated_at: now });
      upsertStudentStmt.run(next);
      updatedIds.push(next.id);
    });
    return updatedIds;
  });

  const deleteStudent = sqlite.transaction((ownerId, id) => {
    const current = getStudent(ownerId, id);
    if (!current) return null;
    deleteStudentStmt.run(id, ownerId);
    deleteNotesForStudentStmt.run(ownerId, id);
    return current;
  });

  const findStudentBySlug = (ownerId, slug) => {
    const match = String(slug || '').match(/^(\d{4})-(\d)(\d{2})(\d{2})$/);
    if (!match) return null;
    const [, year, g, k, n] = match;
    const grade = Number(g);
    const klass = Number(k);
    const no = Number(n);
    const rows = listStudents(ownerId);
    return rows.find((student) => {
      const parsed = String(student.class_name || '').match(/(\d+)\s*-\s*(\d+)/);
      if (!parsed) return false;
      return String(student.academic_year || '') === year
        && Number(parsed[1]) === grade
        && Number(parsed[2]) === klass
        && Number(student.student_no) === no;
    }) || rows.find((student) => {
      const parsed = String(student.class_name || '').match(/(\d+)\s*-\s*(\d+)/);
      if (!parsed) return false;
      return Number(parsed[1]) === grade
        && Number(parsed[2]) === klass
        && Number(student.student_no) === no;
    }) || null;
  };

  const getStudentByYearClassNo = (ownerId, academicYear, className, studentNo) => {
    const row = findStudentByCompositeStmt.get(ownerId, String(academicYear || ''), String(className || ''), String(studentNo || ''));
    return row ? normalizeStudentRow(row) : null;
  };

  const listNotes = (ownerId, { studentId, year } = {}) => {
    let rows = listNoteRowsStmt.all(ownerId).map((row) => ({
      ...normalizeNoteRow(row),
      student_name: String(row?.student_name || ''),
    }));
    if (studentId) rows = rows.filter((row) => row.student_id === Number(studentId));
    if (year) rows = rows.filter((row) => String(row.academic_year || '') === String(year));
    return rows;
  };

  const createNote = sqlite.transaction((ownerId, payload) => {
    const row = normalizeNoteRow({
      id: sequenceStore.next('note'),
      owner_id: ownerId,
      academic_year: String(payload?.academicYear || ''),
      student_id: Number(payload?.studentId || 0),
      note_date: payload?.noteDate || getSeoulDateText(),
      category: payload?.category || 'general',
      content: String(payload?.content || '').trim(),
      attachments: payload?.attachments,
      created_at: new Date().toISOString(),
    });
    upsertNoteStmt.run(row);
    return row;
  });

  const updateNote = sqlite.transaction((ownerId, id, payload) => {
    const current = getNoteStmt.get(id, ownerId);
    if (!current) return null;
    const updated = normalizeNoteRow({
      ...normalizeNoteRow(current),
      category: payload?.category ?? current.category,
      content: payload?.content ?? current.content,
      note_date: payload?.noteDate ?? current.note_date,
      attachments: Object.prototype.hasOwnProperty.call(payload || {}, 'attachments') ? payload.attachments : normalizeNoteRow(current).attachments,
    });
    upsertNoteStmt.run(updated);
    return updated;
  });

  const deleteNote = sqlite.transaction((ownerId, id) => {
    deleteNoteStmt.run(id, ownerId);
  });

  const listSchedules = (ownerId) => listScheduleRowsStmt.all(ownerId).map((row) => normalizeScheduleRow({ ...row, done: Boolean(row.done) }));

  const createSchedule = sqlite.transaction((ownerId, payload) => {
    const row = normalizeScheduleRow({
      id: sequenceStore.next('schedule'),
      owner_id: ownerId,
      title: String(payload?.title || '').trim(),
      due_at: payload?.dueAt || null,
      importance: payload?.importance || 'normal',
      kind: payload?.kind || 'todo',
      done: false,
      created_at: new Date().toISOString(),
    });
    upsertScheduleStmt.run({ ...row, done: row.done ? 1 : 0 });
    return row;
  });

  const updateSchedule = sqlite.transaction((ownerId, id, payload) => {
    const current = getScheduleStmt.get(id, ownerId);
    if (!current) return null;
    const body = payload || {};
    const hasDueAt = Object.prototype.hasOwnProperty.call(body, 'dueAt');
    const hasImportance = Object.prototype.hasOwnProperty.call(body, 'importance');
    const hasKind = Object.prototype.hasOwnProperty.call(body, 'kind');
    const hasDone = Object.prototype.hasOwnProperty.call(body, 'done');
    const updated = normalizeScheduleRow({
      ...normalizeScheduleRow({ ...current, done: Boolean(current.done) }),
      title: String(body?.title ?? current.title ?? '').trim() || String(current.title || ''),
      due_at: hasDueAt ? (body.dueAt || null) : current.due_at,
      importance: hasImportance ? String(body.importance || 'normal') : current.importance,
      kind: hasKind ? body.kind : current.kind,
      done: hasDone ? Boolean(body.done) : Boolean(current.done),
    });
    upsertScheduleStmt.run({ ...updated, done: updated.done ? 1 : 0 });
    return updated;
  });

  const toggleSchedule = sqlite.transaction((ownerId, id) => {
    const current = getScheduleStmt.get(id, ownerId);
    if (!current) return null;
    const normalized = normalizeScheduleRow({ ...current, done: Boolean(current.done) });
    if (String(normalized.kind || 'todo') !== 'todo') return normalized;
    const updated = normalizeScheduleRow({ ...normalized, done: !normalized.done });
    upsertScheduleStmt.run({ ...updated, done: updated.done ? 1 : 0 });
    return updated;
  });

  const deleteSchedule = sqlite.transaction((ownerId, id) => {
    deleteScheduleStmt.run(id, ownerId);
  });

  const deleteOwnerPhase2Data = sqlite.transaction((ownerId) => {
    deleteStudentsForOwnerStmt.run(ownerId);
    deleteNotesForOwnerStmt.run(ownerId);
    deleteSchedulesForOwnerStmt.run(ownerId);
  });

  return {
    listStudents,
    getStudent,
    createStudent,
    bulkUpsertStudents,
    updateStudent,
    updateStudentPhoto,
    syncStudentPhotos,
    clearStudentPhotoById,
    clearStudentPhotoByUrl,
    deleteStudent,
    findStudentBySlug,
    getStudentByYearClassNo,
    listNotes,
    createNote,
    updateNote,
    deleteNote,
    listSchedules,
    createSchedule,
    updateSchedule,
    toggleSchedule,
    deleteSchedule,
    deleteOwnerPhase2Data,
  };
};
