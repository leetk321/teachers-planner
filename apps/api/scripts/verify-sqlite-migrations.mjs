import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { BACKUP_DIR, SQLITE_PATH } from '../src/config/paths.js';
import { findAttendanceEntriesIntegrityError } from '../src/services/attendance-integrity.js';
import { verifyJsonBackup } from '../src/services/migration-backup-service.js';

const REQUIRED_TABLES = [
  'app_state',
  'tn_migrations',
  'settings_rows',
  'task_memo_rows',
  'file_rows',
  'activity_log_rows',
  'student_rows',
  'note_rows',
  'schedule_rows',
  'club_rows',
  'club_member_rows',
  'attendance_rows',
  'user_rows',
  'session_rows',
  'sequence_rows',
  'issue_rows',
  'issue_consultation_rows',
  'user_drafts',
  'trash_rows',
  'search_documents',
  'search_index_dirty',
  'search_index_config',
];

const REQUIRED_MIGRATIONS = [
  '20260328_phase1_normalized_store',
  '20260328_phase2_core_entities',
  '20260328_phase3_clubs_attendance',
  '20260722_phase3_attendance_orphan_preservation',
  '20260328_phase4_auth_entities',
  '20260328_phase5_sequences',
  '20260722_phase1_attachment_fields',
  '20260722_phase2_note_attachment_fields',
  '20260722_phase2_student_identity_unique',
  '20260722_phase6_issues',
  '20260722_phase6_consultation_student_link',
  '20260722_phase6_consultation_attachments',
  '20260722_owner_recycle_bin',
];

const REQUIRED_BACKUPS = [
  '20260328_phase1_normalized_store.json',
  '20260328_phase2_core_entities.json',
  '20260328_phase3_clubs_attendance.json',
  '20260722_phase3_attendance_orphan_preservation.json',
  '20260328_phase4_auth_entities.json',
  '20260328_phase5_sequences.json',
  '20260722_phase2_student_identity_unique.json',
  '20260722_phase6_issues.json',
  '20260722_phase6_consultation_student_link.json',
  '20260722_phase6_consultation_attachments.json',
];

const fail = (message) => {
  console.error(`[verify-sqlite-migrations] ${message}`);
  process.exit(1);
};

const parseJsonColumn = (value, label, { array = false } = {}) => {
  let parsed;
  try {
    parsed = JSON.parse(String(value || (array ? '[]' : '{}')));
  } catch (error) {
    fail(`${label} is invalid JSON: ${error.message}`);
  }
  if (array && !Array.isArray(parsed)) fail(`${label} must contain a JSON array`);
  return parsed;
};

if (!fs.existsSync(SQLITE_PATH)) fail(`SQLite database not found: ${SQLITE_PATH}`);

const sqlite = new Database(SQLITE_PATH, { readonly: true });

try {
  for (const pragma of ['quick_check', 'integrity_check']) {
    const rows = sqlite.pragma(pragma);
    const errors = rows.filter((row) => String(row?.[pragma] || '') !== 'ok');
    if (errors.length) fail(`PRAGMA ${pragma} failed: ${JSON.stringify(errors[0])}`);
  }
  const foreignKeyErrors = sqlite.pragma('foreign_key_check');
  if (foreignKeyErrors.length) fail(`foreign key violation: ${JSON.stringify(foreignKeyErrors[0])}`);

  const tableRows = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const tableSet = new Set(tableRows.map((row) => String(row.name)));
  for (const table of REQUIRED_TABLES) {
    if (!tableSet.has(table)) fail(`missing table: ${table}`);
  }

  const migrationRows = sqlite.prepare('SELECT name FROM tn_migrations').all();
  const migrationSet = new Set(migrationRows.map((row) => String(row.name)));
  for (const migration of REQUIRED_MIGRATIONS) {
    if (!migrationSet.has(migration)) fail(`missing migration marker: ${migration}`);
  }

  const requiredColumns = [
    { table: 'task_memo_rows', column: 'attachments_json' },
    { table: 'file_rows', column: 'scope' },
    { table: 'note_rows', column: 'attachments_json' },
    { table: 'issue_consultation_rows', column: 'student_id' },
    { table: 'issue_consultation_rows', column: 'student_code' },
    { table: 'issue_consultation_rows', column: 'attachments_json' },
  ];
  for (const requirement of requiredColumns) {
    const columns = sqlite.prepare(`PRAGMA table_info(${requirement.table})`).all();
    if (!columns.some((column) => String(column.name) === requirement.column)) {
      fail(`missing column: ${requirement.table}.${requirement.column}`);
    }
  }

  for (const backupFile of REQUIRED_BACKUPS) {
    const backupPath = path.join(BACKUP_DIR, backupFile);
    if (!fs.existsSync(backupPath)) fail(`missing backup file: ${backupPath}`);
    try {
      verifyJsonBackup(backupPath, {
        requireChecksum: [
          '20260722_phase2_student_identity_unique.json',
          '20260722_phase3_attendance_orphan_preservation.json',
        ].includes(backupFile),
      });
    } catch (error) {
      fail(error.message);
    }
  }

  const uniqueStudentIndex = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_student_rows_owner_identity_unique'").get();
  if (!uniqueStudentIndex) fail('missing student identity unique index');
  const issueDetachTrigger = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_student_delete_detach_issue_consultations'").get();
  if (!issueDetachTrigger) fail('missing issue consultation student-delete trigger');

  const appStateRow = sqlite.prepare('SELECT data FROM app_state WHERE id = 1').get();
  if (!appStateRow) fail('missing app_state.id=1');
  const appState = parseJsonColumn(appStateRow.data, 'app_state.id=1.data');
  if (!appState || typeof appState !== 'object' || Array.isArray(appState)) fail('app_state.id=1.data must contain a JSON object');

  const duplicateStudentIdentity = sqlite.prepare(`
    SELECT owner_id, academic_year, class_name, student_no, COUNT(*) AS duplicate_count
    FROM student_rows
    WHERE TRIM(academic_year) <> '' AND TRIM(class_name) <> '' AND TRIM(student_no) <> ''
    GROUP BY owner_id, academic_year, class_name, student_no
    HAVING COUNT(*) > 1
    LIMIT 1
  `).get();
  if (duplicateStudentIdentity) fail(`duplicate student identity: ${JSON.stringify(duplicateStudentIdentity)}`);

  const orphanNote = sqlite.prepare(`
    SELECT n.id
    FROM note_rows n
    LEFT JOIN student_rows s ON s.id = n.student_id AND s.owner_id = n.owner_id
    WHERE s.id IS NULL
    LIMIT 1
  `).get();
  if (orphanNote) fail(`orphan note detected: ${orphanNote.id}`);

  const orphanClubMember = sqlite.prepare(`
    SELECT cm.club_id, cm.student_id
    FROM club_member_rows cm
    LEFT JOIN club_rows c ON c.id = cm.club_id
    LEFT JOIN student_rows s ON s.id = cm.student_id
    WHERE c.id IS NULL OR s.id IS NULL OR c.owner_id <> s.owner_id
    LIMIT 1
  `).get();
  if (orphanClubMember) fail(`orphan club member detected: ${JSON.stringify(orphanClubMember)}`);

  const duplicateAttendanceSlot = sqlite.prepare(`
    SELECT owner_id, kind, date, class_name, period, COUNT(*) AS duplicate_count
    FROM attendance_rows
    GROUP BY owner_id, kind, date, class_name, period
    HAVING COUNT(*) > 1
    LIMIT 1
  `).get();
  if (duplicateAttendanceSlot) fail(`duplicate attendance slot: ${JSON.stringify(duplicateAttendanceSlot)}`);

  const studentOwnerById = new Map(
    sqlite.prepare('SELECT id, owner_id FROM student_rows').all().map((row) => [Number(row.id), Number(row.owner_id)]),
  );
  for (const attendance of sqlite.prepare('SELECT id, owner_id, entries_json FROM attendance_rows').iterate()) {
    const entries = parseJsonColumn(attendance.entries_json, `attendance_rows.${attendance.id}.entries_json`, { array: true });
    const integrityError = findAttendanceEntriesIntegrityError(entries, {
      attendanceId: attendance.id,
      ownerId: attendance.owner_id,
      studentOwnerById,
    });
    if (integrityError) fail(integrityError);
  }

  const orphanIssueConsultation = sqlite.prepare(`
    SELECT c.id
    FROM issue_consultation_rows c
    LEFT JOIN issue_rows i ON i.id = c.issue_id AND i.owner_id = c.owner_id
    WHERE i.id IS NULL
    LIMIT 1
  `).get();
  if (orphanIssueConsultation) fail(`orphan issue consultation detected: ${orphanIssueConsultation.id}`);

  const foreignIssueStudent = sqlite.prepare(`
    SELECT c.id, c.student_id
    FROM issue_consultation_rows c
    LEFT JOIN student_rows s ON s.id = c.student_id AND s.owner_id = c.owner_id
    WHERE c.student_id > 0 AND s.id IS NULL
    LIMIT 1
  `).get();
  if (foreignIssueStudent) fail(`issue consultation references a missing or foreign student: ${JSON.stringify(foreignIssueStudent)}`);

  const jsonColumns = [
    { table: 'note_rows', id: 'id', column: 'attachments_json' },
    { table: 'task_memo_rows', id: 'id', column: 'attachments_json' },
    { table: 'issue_rows', id: 'id', column: 'related_students_json' },
    { table: 'issue_consultation_rows', id: 'id', column: 'attachments_json' },
  ];
  for (const source of jsonColumns) {
    for (const row of sqlite.prepare(`SELECT ${source.id} AS row_id, ${source.column} AS json_value FROM ${source.table}`).iterate()) {
      parseJsonColumn(row.json_value, `${source.table}.${row.row_id}.${source.column}`, { array: true });
    }
  }

  for (const row of sqlite.prepare('SELECT owner_id, draft_key, payload_json FROM user_drafts').iterate()) {
    parseJsonColumn(row.payload_json, `user_drafts.${row.owner_id}.${row.draft_key}.payload_json`);
  }
  for (const row of sqlite.prepare('SELECT id, meta_json FROM search_documents').iterate()) {
    parseJsonColumn(row.meta_json, `search_documents.${row.id}.meta_json`);
  }

  const searchMode = String(sqlite.prepare("SELECT value FROM search_index_config WHERE key = 'mode'").get()?.value || '');
  if (!['fts5-trigram', 'like'].includes(searchMode)) fail(`invalid search index mode: ${searchMode || '(empty)'}`);
  if (searchMode === 'fts5-trigram' && !tableSet.has('search_documents_fts')) {
    fail('search index is configured for FTS5 but search_documents_fts is missing');
  }

  {
    const trashMigration = sqlite.prepare('SELECT name FROM tn_migrations WHERE name = ?').get('20260722_owner_recycle_bin');
    if (!trashMigration) fail('trash table exists without its migration marker');
    const trashColumns = sqlite.prepare('PRAGMA table_info(trash_rows)').all();
    if (!trashColumns.some((column) => String(column.name) === 'retention_days')) fail('trash_rows.retention_days is missing');
    for (const row of sqlite.prepare('SELECT id, payload_json, metadata_json, retention_days, deleted_at, expires_at FROM trash_rows').iterate()) {
      parseJsonColumn(row.payload_json, `trash_rows.${row.id}.payload_json`);
      parseJsonColumn(row.metadata_json, `trash_rows.${row.id}.metadata_json`);
      const deletedAt = new Date(row.deleted_at).getTime();
      const expiresAt = new Date(row.expires_at).getTime();
      if (!Number.isFinite(deletedAt) || !Number.isFinite(expiresAt) || expiresAt <= deletedAt) {
        fail(`trash row ${row.id} has invalid retention dates`);
      }
      const retentionDays = Number(row.retention_days);
      const actualDays = (expiresAt - deletedAt) / (24 * 60 * 60 * 1000);
      if (!Number.isFinite(retentionDays) || retentionDays < 1 || Math.abs(actualDays - retentionDays) > 0.001) {
        fail(`trash row ${row.id} has inconsistent retention metadata`);
      }
    }
  }

  const orphanSession = sqlite.prepare(`
    SELECT s.token
    FROM session_rows s
    LEFT JOIN user_rows u ON u.id = s.user_id
    WHERE u.id IS NULL
    LIMIT 1
  `).get();
  if (orphanSession) fail(`orphan session detected: ${orphanSession.token}`);

  const sequenceChecks = [
    { name: 'user', table: 'user_rows' },
    { name: 'student', table: 'student_rows' },
    { name: 'note', table: 'note_rows' },
    { name: 'schedule', table: 'schedule_rows' },
    { name: 'attendance', table: 'attendance_rows' },
    { name: 'memo', table: 'task_memo_rows' },
    { name: 'club', table: 'club_rows' },
    { name: 'issue', table: 'issue_rows' },
    { name: 'issue_consultation', table: 'issue_consultation_rows' },
  ];

  for (const seq of sequenceChecks) {
    const row = sqlite.prepare('SELECT next_value FROM sequence_rows WHERE name = ?').get(seq.name);
    if (!row) fail(`missing sequence row: ${seq.name}`);
    const maxIdRow = sqlite.prepare(`SELECT COALESCE(MAX(id), 0) AS max_id FROM ${seq.table}`).get();
    const nextValue = Number(row.next_value || 0);
    const maxId = Number(maxIdRow.max_id || 0);
    if (nextValue < (maxId + 1)) {
      fail(`sequence ${seq.name} is behind max(id): next=${nextValue}, max=${maxId}`);
    }
  }

  console.log(JSON.stringify({
    ok: true,
    db: SQLITE_PATH,
    migrations: REQUIRED_MIGRATIONS.length,
    backups: REQUIRED_BACKUPS.length,
    integrity: 'ok',
  }));
} finally {
  sqlite.close();
}
