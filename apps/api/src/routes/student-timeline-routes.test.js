import assert from 'node:assert/strict';
import test from 'node:test';

import Database from 'better-sqlite3';

import { createApiApp } from '../app/create-api-app.js';
import { createStudentTimelineStore } from '../db/student-timeline-store.js';
import { registerStudentTimelineRoutes } from './student-timeline-routes.js';

const createDatabase = () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE student_rows (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      academic_year TEXT NOT NULL,
      name TEXT NOT NULL,
      class_name TEXT NOT NULL,
      student_no TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE note_rows (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      academic_year TEXT NOT NULL,
      student_id INTEGER NOT NULL,
      note_date TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE issue_rows (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      case_no TEXT NOT NULL,
      title TEXT NOT NULL
    );
    CREATE TABLE issue_consultation_rows (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      issue_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      student_code TEXT NOT NULL,
      participant_name TEXT NOT NULL,
      consultation_type TEXT NOT NULL,
      consulted_at TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE attendance_rows (
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
  `);
  return sqlite;
};

const startApi = async (sqlite) => {
  const app = createApiApp();
  const auth = (req, res, next) => {
    const match = String(req.headers.authorization || '').match(/^Bearer owner-(\d+)$/);
    if (!match) return res.status(401).json({ error: 'unauthorized' });
    req.user = { id: Number(match[1]) };
    return next();
  };
  registerStudentTimelineRoutes({
    app,
    auth,
    studentTimelineStore: createStudentTimelineStore({ sqlite }),
  });

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
};

const requestTimeline = (baseUrl, id, ownerId = 1) => fetch(`${baseUrl}/api/students/${id}/timeline`, {
  headers: ownerId ? { authorization: `Bearer owner-${ownerId}` } : {},
});

test('student timeline merges owned history in newest-first order with a stable schema', async (t) => {
  const sqlite = createDatabase();
  t.after(() => sqlite.close());
  sqlite.prepare('INSERT INTO student_rows VALUES(?, ?, ?, ?, ?, ?, ?, ?)').run(
    101, 1, '2026', '김학생', '1-1', '5', '2026-03-01T00:00:00.000Z', '2026-07-18T09:00:00.000Z',
  );
  sqlite.prepare('INSERT INTO student_rows VALUES(?, ?, ?, ?, ?, ?, ?, ?)').run(
    202, 2, '2026', '타사용자', '2-2', '8', '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z',
  );

  const insertNote = sqlite.prepare('INSERT INTO note_rows VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insertNote.run(11, 1, '2026', 101, '2026-07-20T10:00:00.000Z', 'general', '일반 상담 내용', '[{"id":1,"name":"상담.txt","url":"/owned"}]', '2026-07-20T10:01:00.000Z');
  insertNote.run(12, 2, '2026', 101, '2026-07-23T10:00:00.000Z', 'general', 'foreign note', '[]', '2026-07-23T10:00:00.000Z');

  sqlite.prepare('INSERT INTO issue_rows VALUES(?, ?, ?, ?)').run(21, 1, '2026-01호', '생활 사안');
  sqlite.prepare('INSERT INTO issue_rows VALUES(?, ?, ?, ?)').run(22, 2, '2026-99호', 'foreign issue');
  const insertIssueConsultation = sqlite.prepare('INSERT INTO issue_consultation_rows VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insertIssueConsultation.run(31, 1, 21, 101, '10105', '10105 김학생', 'guardian', '2026-07-21T11:00:00.000Z', '보호자 상담 내용', '[]', '2026-07-21T11:01:00.000Z', '2026-07-21T11:02:00.000Z');
  insertIssueConsultation.run(32, 2, 22, 101, '10105', 'foreign', 'student', '2026-07-24T11:00:00.000Z', 'foreign consultation', '[]', '2026-07-24T11:00:00.000Z', '2026-07-24T11:00:00.000Z');
  insertIssueConsultation.run(33, 1, 22, 101, '10105', 'cross-owner issue', 'student', '2026-07-25T11:00:00.000Z', 'cross owner consultation', '[]', '2026-07-25T11:00:00.000Z', '2026-07-25T11:00:00.000Z');

  const insertAttendance = sqlite.prepare('INSERT INTO attendance_rows VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insertAttendance.run(41, 1, 'homeroom', '2026-07-22', '1-1', '조회', JSON.stringify([
    { student_id: 101, status: '지각', memo: '등교 확인' },
    { student_id: 999, status: '결석', memo: '' },
  ]), '2026-07-22T08:30:00.000Z', '2026-07-22T08:31:00.000Z');
  insertAttendance.run(42, 1, 'homeroom', '2026-07-23T08:30:00.000Z', '1-1', '조회', JSON.stringify([
    { student_id: 101, status: '출석', memo: '   ' },
  ]), '2026-07-23T08:30:00.000Z', '2026-07-23T08:31:00.000Z');
  insertAttendance.run(43, 2, 'homeroom', '2026-07-24T08:30:00.000Z', '1-1', '조회', JSON.stringify([
    { student_id: 101, status: 'foreign attendance', memo: '' },
  ]), '2026-07-24T08:30:00.000Z', '2026-07-24T08:31:00.000Z');

  const api = await startApi(sqlite);
  t.after(api.close);
  const response = await requestTimeline(api.baseUrl, 101);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.deepEqual(body.items.map((item) => item.type), [
    'attendance',
    'issue_consultation',
    'consultation',
    'student_updated',
    'student_created',
  ]);
  assert.deepEqual(body.counts, {
    total: 5,
    returned: 5,
    studentCreated: 1,
    studentUpdated: 1,
    consultations: 1,
    issueConsultations: 1,
    attendance: 1,
  });
  body.items.forEach((item) => {
    assert.deepEqual(Object.keys(item), ['id', 'type', 'label', 'occurredAt', 'title', 'content', 'meta']);
  });
  assert.equal(body.items[0].content, '지각\n등교 확인');
  assert.equal(body.items[0].occurredAt, '2026-07-22');
  assert.equal(body.items[1].label, '사안-보호자');
  assert.equal(body.items[1].meta.caseNo, '2026-01호');
  assert.equal(body.items[2].meta.attachments[0].name, '상담.txt');
  assert.doesNotMatch(JSON.stringify(body), /foreign|cross owner/);
});

test('student timeline requires authentication and rejects invalid, missing, or foreign students', async (t) => {
  const sqlite = createDatabase();
  t.after(() => sqlite.close());
  sqlite.prepare('INSERT INTO student_rows VALUES(?, ?, ?, ?, ?, ?, ?, ?)').run(
    202, 2, '2026', '타사용자', '2-2', '8', '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z',
  );
  const api = await startApi(sqlite);
  t.after(api.close);

  assert.equal((await requestTimeline(api.baseUrl, 202, 0)).status, 401);
  assert.equal((await requestTimeline(api.baseUrl, 'abc')).status, 400);
  assert.equal((await requestTimeline(api.baseUrl, '1.5')).status, 400);
  assert.equal((await requestTimeline(api.baseUrl, 0)).status, 400);
  assert.equal((await requestTimeline(api.baseUrl, 202, 1)).status, 404);
  assert.equal((await requestTimeline(api.baseUrl, 999, 1)).status, 404);
});

test('student timeline returns at most 300 items while reporting complete source counts', async (t) => {
  const sqlite = createDatabase();
  t.after(() => sqlite.close());
  sqlite.prepare('INSERT INTO student_rows VALUES(?, ?, ?, ?, ?, ?, ?, ?)').run(
    101, 1, '2026', '김학생', '1-1', '5', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z',
  );
  const insertNote = sqlite.prepare('INSERT INTO note_rows VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertNotes = sqlite.transaction(() => {
    for (let id = 1; id <= 305; id += 1) {
      const occurredAt = new Date(Date.UTC(2026, 0, id)).toISOString();
      insertNote.run(id, 1, '2026', 101, occurredAt, 'general', `상담 ${id}`, '[]', occurredAt);
    }
  });
  insertNotes();

  const api = await startApi(sqlite);
  t.after(api.close);
  const response = await requestTimeline(api.baseUrl, 101);
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.items.length, 300);
  assert.equal(body.items[0].id, 'note:305');
  assert.equal(body.items.at(-1).id, 'note:6');
  assert.deepEqual(body.counts, {
    total: 306,
    returned: 300,
    studentCreated: 1,
    studentUpdated: 0,
    consultations: 305,
    issueConsultations: 0,
    attendance: 0,
  });
});
