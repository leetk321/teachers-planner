import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import Database from 'better-sqlite3';

import { createPhase3Store, PHASE3_ATTENDANCE_ORPHAN_MIGRATION_NAME } from './phase3-store.js';
import { findAttendanceEntriesIntegrityError } from '../services/attendance-integrity.js';
import { verifyJsonBackup } from '../services/migration-backup-service.js';

test('attendance orphan migration preserves missing and foreign student ids with a verified backup', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-notebook-attendance-migration-'));
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(`
      CREATE TABLE tn_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE student_rows (id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL);
      CREATE TABLE attendance_rows (
        id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, kind TEXT NOT NULL, date TEXT NOT NULL,
        class_name TEXT NOT NULL, period TEXT NOT NULL, entries_json TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `);
    sqlite.prepare('INSERT INTO tn_migrations(name, applied_at) VALUES(?, ?)').run('20260328_phase3_clubs_attendance', '2026-01-01T00:00:00.000Z');
    sqlite.prepare('INSERT INTO student_rows(id, owner_id) VALUES(?, ?)').run(1, 1);
    sqlite.prepare('INSERT INTO student_rows(id, owner_id) VALUES(?, ?)').run(2, 2);
    const originalEntries = [
      { student_id: 1, status: 'late', memo: 'valid' },
      { student_id: 99, status: 'absent', memo: 'deleted student' },
      { student_id: 2, status: '', memo: 'foreign student' },
    ];
    sqlite.prepare('INSERT INTO attendance_rows VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      10, 1, 'homeroom', '2026-07-22', '1-1', '1', JSON.stringify(originalEntries),
      '2026-07-22T00:00:00.000Z', '2026-07-22T00:00:00.000Z',
    );

    const store = createPhase3Store({
      sqlite,
      dataDir,
      readLegacySnapshot: () => ({ clubs: [], attendance: [] }),
      sequenceStore: { next: () => 11 },
    });

    const migratedEntries = JSON.parse(sqlite.prepare('SELECT entries_json FROM attendance_rows WHERE id = 10').get().entries_json);
    assert.deepEqual(migratedEntries[0], originalEntries[0]);
    assert.deepEqual(migratedEntries[1], {
      status: 'absent', memo: 'deleted student', orphaned: true,
      orphaned_student_id: 99, orphan_reason: 'missing_student',
    });
    assert.deepEqual(migratedEntries[2], {
      status: '', memo: 'foreign student', orphaned: true,
      orphaned_student_id: 2, orphan_reason: 'foreign_owner',
    });
    const studentOwnerById = new Map([[1, 1], [2, 2]]);
    assert.equal(findAttendanceEntriesIntegrityError(migratedEntries, {
      attendanceId: 10,
      ownerId: 1,
      studentOwnerById,
    }), '');
    assert.match(findAttendanceEntriesIntegrityError([{ student_id: 99 }], {
      attendanceId: 11,
      ownerId: 1,
      studentOwnerById,
    }), /missing or foreign student/);
    assert.ok(sqlite.prepare('SELECT name FROM tn_migrations WHERE name = ?').get(PHASE3_ATTENDANCE_ORPHAN_MIGRATION_NAME));

    const backupPath = path.join(dataDir, 'backups', `${PHASE3_ATTENDANCE_ORPHAN_MIGRATION_NAME}.json`);
    const verified = verifyJsonBackup(backupPath, { requireChecksum: true });
    assert.equal(verified.payload.affected_row_count, 1);
    assert.equal(verified.payload.orphaned_entry_count, 2);
    assert.equal(verified.payload.rows[0].entries_json, JSON.stringify(originalEntries));

    const listedEntries = store.listAttendance(1, { date: '2026-07-22' })[0].entries;
    assert.equal(listedEntries.length, 3);
    assert.equal(listedEntries[1].orphaned, true);
    assert.equal(listedEntries[1].orphaned_student_id, 99);

    assert.throws(
      () => store.upsertAttendance(1, { kind: 'homeroom', date: '2026-07-23', className: '1-1', period: '1', entries: [{ student_id: 99 }] }),
      /not owned by user/,
    );
    assert.throws(
      () => store.upsertAttendance(1, { kind: 'homeroom', date: '2026-07-23', className: '1-1', period: '1', entries: [{ student_id: 2 }] }),
      /not owned by user/,
    );
  } finally {
    sqlite.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
