import assert from 'node:assert/strict';
import test from 'node:test';

import Database from 'better-sqlite3';

import { createTrashStore } from '../db/trash-store.js';
import { createTeacherNotebookTrashLifecycle, createTrashService } from '../services/trash-service.js';

const createSchema = (sqlite) => sqlite.exec(`
  CREATE TABLE student_rows (
    id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, academic_year TEXT NOT NULL, name TEXT NOT NULL,
    class_name TEXT NOT NULL, student_no TEXT NOT NULL, memo TEXT NOT NULL, risk_level TEXT NOT NULL,
    tags TEXT NOT NULL, student_track TEXT NOT NULL, student_phone TEXT NOT NULL, guardian_phone TEXT NOT NULL,
    basic_info TEXT NOT NULL, basic_survey TEXT NOT NULL, gender TEXT NOT NULL, birth_date TEXT NOT NULL,
    transferred_at TEXT NOT NULL, photo_url TEXT NOT NULL, photo_updated_at TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX student_identity_test ON student_rows(owner_id, academic_year, class_name, student_no)
    WHERE TRIM(academic_year) <> '' AND TRIM(class_name) <> '' AND TRIM(student_no) <> '';
  CREATE TABLE note_rows (
    id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, academic_year TEXT NOT NULL, student_id INTEGER NOT NULL,
    note_date TEXT NOT NULL, category TEXT NOT NULL, content TEXT NOT NULL, attachments_json TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE schedule_rows (
    id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, title TEXT NOT NULL, due_at TEXT, importance TEXT NOT NULL,
    kind TEXT NOT NULL, done INTEGER NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE task_memo_rows (
    id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, memo_date TEXT NOT NULL, title TEXT NOT NULL,
    content TEXT NOT NULL, show_on_dashboard INTEGER NOT NULL, kind TEXT NOT NULL, is_completed INTEGER NOT NULL,
    completed_at TEXT NOT NULL, attachments_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE file_rows (
    id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL,
    path TEXT NOT NULL, url TEXT NOT NULL, scope TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE club_rows (
    id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, academic_year TEXT NOT NULL, name TEXT NOT NULL,
    use_for_attendance INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE club_member_rows (club_id INTEGER NOT NULL, student_id INTEGER NOT NULL, PRIMARY KEY(club_id, student_id));
  CREATE TABLE attendance_rows (
    id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, kind TEXT NOT NULL, date TEXT NOT NULL, class_name TEXT NOT NULL,
    period TEXT NOT NULL, entries_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX attendance_slot_test ON attendance_rows(owner_id, kind, date, class_name, period);
  CREATE TABLE issue_rows (
    id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, academic_year TEXT NOT NULL, case_no TEXT NOT NULL,
    title TEXT NOT NULL, related_students_json TEXT NOT NULL, status TEXT NOT NULL, closed_at TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX issue_case_test ON issue_rows(owner_id, case_no);
  CREATE TABLE issue_consultation_rows (
    id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, issue_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
    student_code TEXT NOT NULL, participant_name TEXT NOT NULL, consultation_type TEXT NOT NULL,
    consulted_at TEXT NOT NULL, content TEXT NOT NULL, attachments_json TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
`);

const now = '2026-07-22T00:00:00.000Z';
const studentRow = (id, ownerId, no, name = `student-${id}`) => ({
  id,
  owner_id: ownerId,
  academic_year: '2026',
  name,
  class_name: '1-1',
  student_no: String(no),
  memo: '',
  risk_level: 'normal',
  tags: '',
  student_track: 'course',
  student_phone: '',
  guardian_phone: '',
  basic_info: '',
  basic_survey: '',
  gender: '',
  birth_date: '',
  transferred_at: '',
  photo_url: `/student-photos/${ownerId}/${id}.png`,
  photo_updated_at: now,
  created_at: now,
  updated_at: now,
});

const insertStudent = (sqlite, row) => sqlite.prepare(`
  INSERT INTO student_rows(id, owner_id, academic_year, name, class_name, student_no, memo, risk_level, tags,
    student_track, student_phone, guardian_phone, basic_info, basic_survey, gender, birth_date, transferred_at,
    photo_url, photo_updated_at, created_at, updated_at)
  VALUES(@id, @owner_id, @academic_year, @name, @class_name, @student_no, @memo, @risk_level, @tags,
    @student_track, @student_phone, @guardian_phone, @basic_info, @basic_survey, @gender, @birth_date, @transferred_at,
    @photo_url, @photo_updated_at, @created_at, @updated_at)
`).run(row);

const createHarness = () => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  createSchema(sqlite);
  const removedUploads = [];
  const removedPhotos = [];
  const phase1Store = {
    getFile(ownerId, id) {
      return sqlite.prepare('SELECT * FROM file_rows WHERE id = ? AND owner_id = ?').get(Number(id), Number(ownerId)) || null;
    },
    deleteFile(ownerId, id) {
      const row = this.getFile(ownerId, id);
      if (row) sqlite.prepare('DELETE FROM file_rows WHERE id = ? AND owner_id = ?').run(Number(id), Number(ownerId));
      return row;
    },
  };
  const trashStore = createTrashStore({ sqlite });
  const trashService = createTrashService({ trashStore });
  const lifecycle = createTeacherNotebookTrashLifecycle({
    sqlite,
    trashService,
    phase1Store,
    removeOwnedUploadRows(ownerId, rows) {
      removedUploads.push({ ownerId, rows });
      return rows.length;
    },
    removeStudentPhotoFileByUrl(ownerId, url) {
      removedPhotos.push({ ownerId, url });
      return true;
    },
  });
  return { sqlite, trashStore, trashService, lifecycle, removedUploads, removedPhotos };
};

test('student trash round-trip preserves linked data, isolates owners, and purges files only permanently', () => {
  const harness = createHarness();
  const { sqlite, lifecycle, trashService, removedUploads, removedPhotos } = harness;
  insertStudent(sqlite, studentRow(101, 1, 5, 'Kim'));
  insertStudent(sqlite, studentRow(102, 1, 6, 'Lee'));
  insertStudent(sqlite, studentRow(201, 2, 5, 'Other owner'));
  sqlite.prepare(`INSERT INTO file_rows VALUES(900, 1, '상담.txt', 'text/plain', 10, 'users/1/a.txt', '/api/files/900/download', 'attachment', ?)`).run(now);
  const attachments = JSON.stringify([{ id: 900, name: '상담.txt', type: 'text/plain', size: 10, url: '/api/files/900/download' }]);
  sqlite.prepare('INSERT INTO note_rows VALUES(501, 1, ?, 101, ?, ?, ?, ?, ?)').run('2026', now, 'general', 'note', attachments, now);
  sqlite.prepare('INSERT INTO club_rows VALUES(301, 1, ?, ?, 1, ?, ?)').run('2026', 'course', now, now);
  sqlite.prepare('INSERT INTO club_member_rows VALUES(301, 101)').run();
  sqlite.prepare('INSERT INTO attendance_rows VALUES(401, 1, ?, ?, ?, ?, ?, ?, ?)').run(
    'homeroom', '2026-07-22', '1-1', '1', JSON.stringify([
      { student_id: 101, status: 'late', memo: 'bus' },
      { student_id: 102, status: '', memo: '' },
    ]), now, now,
  );
  sqlite.prepare('INSERT INTO issue_rows VALUES(601, 1, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    '2026', '2026-01', 'case', JSON.stringify([{ student_id: 101, student_code: '10105', student_name: 'Kim', role: 'related' }]),
    'open', '', now, now,
  );
  sqlite.prepare('INSERT INTO issue_consultation_rows VALUES(701, 1, 601, 101, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    '10105', '10105 Kim', 'student', now, 'issue note', '[]', now, now,
  );

  const deleted = lifecycle.deleteStudent(1, 101);
  assert.ok(deleted?.trash?.id);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM student_rows WHERE id = 101').get().count, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM note_rows WHERE student_id = 101').get().count, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM club_member_rows WHERE student_id = 101').get().count, 0);
  assert.deepEqual(JSON.parse(sqlite.prepare('SELECT entries_json FROM attendance_rows WHERE id = 401').get().entries_json).map((item) => item.student_id), [102]);
  assert.equal(JSON.parse(sqlite.prepare('SELECT related_students_json FROM issue_rows WHERE id = 601').get().related_students_json)[0].student_id, 0);
  assert.equal(sqlite.prepare('SELECT student_id FROM issue_consultation_rows WHERE id = 701').get().student_id, 0);
  assert.ok(sqlite.prepare('SELECT id FROM file_rows WHERE id = 900').get());
  assert.equal(removedUploads.length, 0);
  assert.equal(removedPhotos.length, 0);

  const ownerList = trashService.list(1);
  assert.equal(ownerList.length, 1);
  assert.equal(Object.hasOwn(ownerList[0], 'payload'), false);
  assert.equal(Object.hasOwn(ownerList[0], 'metadata'), false);
  assert.equal(trashService.list(2).length, 0);
  assert.equal(trashService.get(2, deleted.trash.id), null);
  assert.equal(trashService.get(1, deleted.trash.id).payload.notes.length, 1);

  trashService.restore(1, deleted.trash.id);
  assert.ok(sqlite.prepare('SELECT id FROM student_rows WHERE id = 101').get());
  assert.ok(sqlite.prepare('SELECT id FROM note_rows WHERE id = 501 AND student_id = 101').get());
  assert.ok(sqlite.prepare('SELECT club_id FROM club_member_rows WHERE club_id = 301 AND student_id = 101').get());
  assert.deepEqual(JSON.parse(sqlite.prepare('SELECT entries_json FROM attendance_rows WHERE id = 401').get().entries_json).map((item) => item.student_id), [101, 102]);
  assert.equal(JSON.parse(sqlite.prepare('SELECT related_students_json FROM issue_rows WHERE id = 601').get().related_students_json)[0].student_id, 101);
  assert.equal(sqlite.prepare('SELECT student_id FROM issue_consultation_rows WHERE id = 701').get().student_id, 101);

  const deletedAgain = lifecycle.deleteStudent(1, 101);
  trashService.remove(1, deletedAgain.trash.id);
  assert.equal(sqlite.prepare('SELECT id FROM file_rows WHERE id = 900').get(), undefined);
  assert.equal(removedUploads.length, 1);
  assert.equal(removedPhotos.length, 1);
  sqlite.close();
});

test('student restore rejects composite identity conflicts without partial writes', () => {
  const { sqlite, lifecycle, trashService } = createHarness();
  insertStudent(sqlite, studentRow(101, 1, 5, 'Original'));
  const deleted = lifecycle.deleteStudent(1, 101);
  insertStudent(sqlite, studentRow(999, 1, 5, 'Replacement'));
  assert.throws(() => trashService.restore(1, deleted.trash.id), (error) => error.statusCode === 409);
  assert.equal(sqlite.prepare('SELECT id FROM student_rows WHERE id = 101').get(), undefined);
  assert.ok(sqlite.prepare('SELECT id FROM student_rows WHERE id = 999').get());
  assert.equal(trashService.get(1, deleted.trash.id).state, 'active');
  sqlite.close();
});

test('memo, schedule, issue, and issue consultation support delete and restore', () => {
  const { sqlite, lifecycle, trashService } = createHarness();
  insertStudent(sqlite, studentRow(101, 1, 5, 'Kim'));
  sqlite.prepare('INSERT INTO task_memo_rows VALUES(11, 1, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?)').run('2026-07-22', 'memo', 'body', 'memo', '', '[]', now, now);
  sqlite.prepare('INSERT INTO schedule_rows VALUES(12, 1, ?, ?, ?, ?, 0, ?)').run('schedule', now, 'normal', 'todo', now);
  sqlite.prepare('INSERT INTO issue_rows VALUES(13, 1, ?, ?, ?, ?, ?, ?, ?, ?)').run('2026', '2026-13', 'issue', '[]', 'open', '', now, now);
  sqlite.prepare('INSERT INTO issue_consultation_rows VALUES(14, 1, 13, 101, ?, ?, ?, ?, ?, ?, ?, ?)').run('10105', 'Kim', 'student', now, 'content', '[]', now, now);

  const memoTrash = lifecycle.deleteTaskMemo(1, 11).trash.id;
  const scheduleTrash = lifecycle.deleteSchedule(1, 12).trash.id;
  const consultationTrash = lifecycle.deleteIssueConsultation(1, 13, 14).trash.id;
  trashService.restore(1, memoTrash);
  trashService.restore(1, scheduleTrash);
  trashService.restore(1, consultationTrash);
  assert.ok(sqlite.prepare('SELECT id FROM task_memo_rows WHERE id = 11').get());
  assert.ok(sqlite.prepare('SELECT id FROM schedule_rows WHERE id = 12').get());
  assert.ok(sqlite.prepare('SELECT id FROM issue_consultation_rows WHERE id = 14').get());

  const issueTrash = lifecycle.deleteIssue(1, 13).trash.id;
  assert.equal(sqlite.prepare('SELECT id FROM issue_consultation_rows WHERE id = 14').get(), undefined);
  trashService.restore(1, issueTrash);
  assert.ok(sqlite.prepare('SELECT id FROM issue_rows WHERE id = 13').get());
  assert.ok(sqlite.prepare('SELECT id FROM issue_consultation_rows WHERE id = 14').get());
  sqlite.close();
});

test('trash list is capped at 100 summaries and global expiry cleanup removes old rows', () => {
  const { sqlite, trashService } = createHarness();
  for (let index = 1; index <= 105; index += 1) {
    trashService.capture(1, { entityType: 'schedule', entityId: index, label: `row-${index}`, payload: { large: 'x'.repeat(100) } });
  }
  const list = trashService.list(1, { limit: 500 });
  assert.equal(list.length, 100);
  assert.equal(Object.hasOwn(list[0], 'payload'), false);

  trashService.capture(2, {
    entityType: 'schedule',
    entityId: 999,
    label: 'expired',
    payload: { row: null },
    deletedAt: '2020-01-01T00:00:00.000Z',
    retentionDays: 1,
  });
  const cleanup = trashService.purgeAllExpired('2026-07-22T00:00:00.000Z');
  assert.equal(cleanup.owners_checked, 1);
  assert.equal(cleanup.removed.length, 1);
  assert.equal(trashService.list(2).length, 0);
  sqlite.close();
});
