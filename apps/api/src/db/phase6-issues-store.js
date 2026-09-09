import { writeVerifiedJsonBackup } from '../services/migration-backup-service.js';

const PHASE6_MIGRATION_NAME = '20260722_phase6_issues';
const PHASE6_STUDENT_LINK_MIGRATION_NAME = '20260722_phase6_consultation_student_link';
const PHASE6_CONSULTATION_ATTACHMENTS_MIGRATION_NAME = '20260722_phase6_consultation_attachments';
const ISSUE_STATUSES = ['open', 'simple_close', 'mediation', 'school_violence'];
const CONSULTATION_TYPES = ['student', 'guardian'];
const ISSUE_STUDENT_ROLES = ['attacker', 'victim', 'related'];

const normalizeAttachments = (value) => {
  let rows = value;
  if (typeof rows === 'string') {
    try { rows = JSON.parse(rows); } catch { rows = []; }
  }
  return (Array.isArray(rows) ? rows : [])
    .map((item) => ({
      id: Number(item?.id || 0),
      name: String(item?.name || '첨부파일'),
      url: String(item?.url || ''),
      type: String(item?.type || ''),
      size: Number(item?.size || 0),
    }))
    .filter((item) => item.id || item.url);
};

const normalizeIssueStudents = (value) => {
  let rows = value;
  if (typeof rows === 'string') {
    try { rows = JSON.parse(rows); } catch { rows = []; }
  }
  return (Array.isArray(rows) ? rows : [])
    .map((item) => {
      if (item && typeof item === 'object') {
        const role = String(item.role || 'related');
        return {
          student_id: Number(item.student_id ?? item.studentId ?? 0),
          student_code: String(item.student_code ?? item.studentCode ?? '').trim(),
          student_name: String(item.student_name ?? item.studentName ?? item.name ?? '').trim(),
          role: ISSUE_STUDENT_ROLES.includes(role) ? role : 'related',
        };
      }
      const text = String(item || '').trim();
      const code = text.match(/(?:^|\s)(\d{5})(?=\s|$)/)?.[1] || '';
      return {
        student_id: 0,
        student_code: code,
        student_name: code ? text.replace(code, '').trim() : text,
        role: 'related',
      };
    })
    .filter((item) => item.student_id || item.student_code || item.student_name)
    .filter((item, index, all) => {
      const key = item.student_id ? `id:${item.student_id}` : `legacy:${item.student_code}:${item.student_name}`;
      return all.findIndex((candidate) => {
        const candidateKey = candidate.student_id ? `id:${candidate.student_id}` : `legacy:${candidate.student_code}:${candidate.student_name}`;
        return candidateKey === key;
      }) === index;
    });
};

const normalizeIssue = (row = {}) => {
  const issueStudents = normalizeIssueStudents(row?.issue_students ?? row?.related_students ?? row?.related_students_json);
  const status = String(row?.status || 'open');
  return {
    id: Number(row?.id || 0),
    owner_id: Number(row?.owner_id || 0),
    academic_year: String(row?.academic_year || ''),
    case_no: String(row?.case_no || '').trim(),
    title: String(row?.title || '').trim(),
    issue_students: issueStudents,
    related_students: issueStudents.map((item) => `${item.student_code} ${item.student_name}`.trim()),
    related_students_json: JSON.stringify(issueStudents),
    status: ISSUE_STATUSES.includes(status) ? status : 'open',
    closed_at: String(row?.closed_at || ''),
    created_at: String(row?.created_at || ''),
    updated_at: String(row?.updated_at || ''),
  };
};

const normalizeConsultation = (row = {}) => {
  const consultationType = String(row?.consultation_type || 'student');
  const attachments = normalizeAttachments(row?.attachments ?? row?.attachments_json);
  return {
    id: Number(row?.id || 0),
    owner_id: Number(row?.owner_id || 0),
    issue_id: Number(row?.issue_id || 0),
    student_id: Number(row?.student_id || 0),
    student_code: String(row?.student_code || '').trim(),
    participant_name: String(row?.participant_name || '').trim(),
    consultation_type: CONSULTATION_TYPES.includes(consultationType) ? consultationType : 'student',
    consulted_at: String(row?.consulted_at || ''),
    content: String(row?.content || '').trim(),
    attachments,
    attachments_json: JSON.stringify(attachments),
    created_at: String(row?.created_at || ''),
    updated_at: String(row?.updated_at || ''),
  };
};

const ensureBackupFile = (dataDir, sqlite) => {
  const issues = sqlite.prepare('SELECT * FROM issue_rows ORDER BY id ASC').all();
  const consultations = sqlite.prepare('SELECT * FROM issue_consultation_rows ORDER BY id ASC').all();
  writeVerifiedJsonBackup({
    dataDir,
    fileName: `${PHASE6_MIGRATION_NAME}.json`,
    payload: { issues, consultations },
  });
};

const ensureStudentLinkBackupFile = (dataDir, sqlite) => {
  const consultations = sqlite.prepare('SELECT * FROM issue_consultation_rows ORDER BY id ASC').all();
  writeVerifiedJsonBackup({
    dataDir,
    fileName: `${PHASE6_STUDENT_LINK_MIGRATION_NAME}.json`,
    payload: { consultations },
  });
};

const ensureConsultationAttachmentsBackupFile = (dataDir, sqlite) => {
  const consultations = sqlite.prepare('SELECT * FROM issue_consultation_rows ORDER BY id ASC').all();
  writeVerifiedJsonBackup({
    dataDir,
    fileName: `${PHASE6_CONSULTATION_ATTACHMENTS_MIGRATION_NAME}.json`,
    payload: { consultations },
  });
};

const ensurePhase6Tables = (sqlite) => {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS tn_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_rows (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  academic_year TEXT NOT NULL,
  case_no TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  related_students_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',
  closed_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_consultation_rows (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  issue_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL DEFAULT 0,
  student_code TEXT NOT NULL DEFAULT '',
  participant_name TEXT NOT NULL,
  consultation_type TEXT NOT NULL,
  consulted_at TEXT NOT NULL,
  content TEXT NOT NULL,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_rows_owner_case_no ON issue_rows(owner_id, case_no);
CREATE INDEX IF NOT EXISTS idx_issue_rows_owner_updated ON issue_rows(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_issue_consultation_rows_issue_at ON issue_consultation_rows(owner_id, issue_id, consulted_at ASC, id ASC);

CREATE TRIGGER IF NOT EXISTS trg_student_delete_detach_issue_consultations
AFTER DELETE ON student_rows
BEGIN
  UPDATE issue_consultation_rows
  SET student_id = 0
  WHERE owner_id = OLD.owner_id AND student_id = OLD.id;
END;
`);

  const columns = sqlite.prepare('PRAGMA table_info(issue_consultation_rows)').all();
  const ensureColumn = (name, definition) => {
    if (!columns.some((column) => String(column.name) === name)) sqlite.exec(`ALTER TABLE issue_consultation_rows ADD COLUMN ${definition}`);
  };
  ensureColumn('student_id', 'student_id INTEGER NOT NULL DEFAULT 0');
  ensureColumn('student_code', "student_code TEXT NOT NULL DEFAULT ''");
  ensureColumn('attachments_json', "attachments_json TEXT NOT NULL DEFAULT '[]'");
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_issue_consultation_rows_student_at ON issue_consultation_rows(owner_id, student_id, consulted_at DESC, id DESC)');
};

export const createPhase6IssuesStore = ({ sqlite, dataDir, sequenceStore }) => {
  ensurePhase6Tables(sqlite);
  sequenceStore.ensure('issue');
  sequenceStore.ensure('issue_consultation');

  const getMigrationRowStmt = sqlite.prepare('SELECT name FROM tn_migrations WHERE name = ?');
  const insertMigrationStmt = sqlite.prepare('INSERT INTO tn_migrations(name, applied_at) VALUES(?, ?)');
  const listIssuesStmt = sqlite.prepare('SELECT * FROM issue_rows WHERE owner_id = ? ORDER BY updated_at DESC, id DESC');
  const getIssueStmt = sqlite.prepare('SELECT * FROM issue_rows WHERE id = ? AND owner_id = ?');
  const getIssueByCaseNoStmt = sqlite.prepare('SELECT * FROM issue_rows WHERE owner_id = ? AND case_no = ?');
  const getOwnedStudentStmt = sqlite.prepare('SELECT id FROM student_rows WHERE id = ? AND owner_id = ?');
  const deleteIssueStmt = sqlite.prepare('DELETE FROM issue_rows WHERE id = ? AND owner_id = ?');
  const touchIssueStmt = sqlite.prepare('UPDATE issue_rows SET updated_at = ? WHERE id = ? AND owner_id = ?');
  const deleteIssuesForOwnerStmt = sqlite.prepare('DELETE FROM issue_rows WHERE owner_id = ?');
  const upsertIssueStmt = sqlite.prepare(`
    INSERT INTO issue_rows(id, owner_id, academic_year, case_no, title, related_students_json, status, closed_at, created_at, updated_at)
    VALUES(@id, @owner_id, @academic_year, @case_no, @title, @related_students_json, @status, @closed_at, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      academic_year = excluded.academic_year,
      case_no = excluded.case_no,
      title = excluded.title,
      related_students_json = excluded.related_students_json,
      status = excluded.status,
      closed_at = excluded.closed_at,
      updated_at = excluded.updated_at
  `);
  const listConsultationsStmt = sqlite.prepare('SELECT * FROM issue_consultation_rows WHERE owner_id = ? AND issue_id = ? ORDER BY consulted_at ASC, id ASC');
  const listConsultationsByStudentStmt = sqlite.prepare('SELECT * FROM issue_consultation_rows WHERE owner_id = ? AND student_id = ? ORDER BY consulted_at DESC, id DESC');
  const getConsultationStmt = sqlite.prepare('SELECT * FROM issue_consultation_rows WHERE id = ? AND owner_id = ? AND issue_id = ?');
  const deleteConsultationStmt = sqlite.prepare('DELETE FROM issue_consultation_rows WHERE id = ? AND owner_id = ? AND issue_id = ?');
  const deleteConsultationsForIssueStmt = sqlite.prepare('DELETE FROM issue_consultation_rows WHERE owner_id = ? AND issue_id = ?');
  const deleteConsultationsForOwnerStmt = sqlite.prepare('DELETE FROM issue_consultation_rows WHERE owner_id = ?');
  const upsertConsultationStmt = sqlite.prepare(`
    INSERT INTO issue_consultation_rows(id, owner_id, issue_id, student_id, student_code, participant_name, consultation_type, consulted_at, content, attachments_json, created_at, updated_at)
    VALUES(@id, @owner_id, @issue_id, @student_id, @student_code, @participant_name, @consultation_type, @consulted_at, @content, @attachments_json, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      student_id = excluded.student_id,
      student_code = excluded.student_code,
      participant_name = excluded.participant_name,
      consultation_type = excluded.consultation_type,
      consulted_at = excluded.consulted_at,
      content = excluded.content,
      attachments_json = excluded.attachments_json,
      updated_at = excluded.updated_at
  `);

  const runMigration = sqlite.transaction(() => {
    if (!getMigrationRowStmt.get(PHASE6_MIGRATION_NAME)) {
      ensureBackupFile(dataDir, sqlite);
      insertMigrationStmt.run(PHASE6_MIGRATION_NAME, new Date().toISOString());
    }
    if (!getMigrationRowStmt.get(PHASE6_STUDENT_LINK_MIGRATION_NAME)) {
      ensureStudentLinkBackupFile(dataDir, sqlite);
      insertMigrationStmt.run(PHASE6_STUDENT_LINK_MIGRATION_NAME, new Date().toISOString());
    }
    if (!getMigrationRowStmt.get(PHASE6_CONSULTATION_ATTACHMENTS_MIGRATION_NAME)) {
      ensureConsultationAttachmentsBackupFile(dataDir, sqlite);
      insertMigrationStmt.run(PHASE6_CONSULTATION_ATTACHMENTS_MIGRATION_NAME, new Date().toISOString());
    }
  });
  runMigration();

  const assertOwnedStudentLinks = (ownerId, rows = []) => {
    for (const item of Array.isArray(rows) ? rows : []) {
      const studentId = Number(item?.student_id || 0);
      if (studentId > 0 && !getOwnedStudentStmt.get(studentId, ownerId)) {
        throw new Error(`issue student is not owned by user: ${studentId}`);
      }
    }
  };

  const assertOwnedStudentId = (ownerId, studentId) => {
    const id = Number(studentId || 0);
    if (id > 0 && !getOwnedStudentStmt.get(id, ownerId)) {
      throw new Error(`issue consultation student is not owned by user: ${id}`);
    }
  };

  const listIssues = (ownerId) => listIssuesStmt.all(ownerId).map(normalizeIssue);
  const getIssue = (ownerId, id) => {
    const row = getIssueStmt.get(id, ownerId);
    return row ? normalizeIssue(row) : null;
  };

  const createIssue = sqlite.transaction((ownerId, payload) => {
    const caseNo = String(payload?.caseNo || '').trim();
    if (!caseNo) throw new Error('case number is required');
    if (getIssueByCaseNoStmt.get(ownerId, caseNo)) throw new Error('case number already exists');
    const now = new Date().toISOString();
    const status = ISSUE_STATUSES.includes(String(payload?.status || '')) ? String(payload.status) : 'open';
    const row = normalizeIssue({
      id: sequenceStore.next('issue'),
      owner_id: ownerId,
      academic_year: String(payload?.academicYear || ''),
      case_no: caseNo,
      title: String(payload?.title || ''),
      issue_students: payload?.issueStudents ?? payload?.relatedStudents,
      status,
      closed_at: status === 'open' ? '' : now,
      created_at: now,
      updated_at: now,
    });
    assertOwnedStudentLinks(ownerId, row.issue_students);
    upsertIssueStmt.run(row);
    return row;
  });

  const updateIssue = sqlite.transaction((ownerId, id, payload) => {
    const current = getIssue(ownerId, id);
    if (!current) return null;
    const caseNo = String(payload?.caseNo ?? current.case_no).trim();
    if (!caseNo) throw new Error('case number is required');
    const duplicate = getIssueByCaseNoStmt.get(ownerId, caseNo);
    if (duplicate && Number(duplicate.id) !== Number(id)) throw new Error('case number already exists');
    const status = ISSUE_STATUSES.includes(String(payload?.status || '')) ? String(payload.status) : current.status;
    const row = normalizeIssue({
      ...current,
      academic_year: String(payload?.academicYear ?? current.academic_year),
      case_no: caseNo,
      title: String(payload?.title ?? current.title),
      issue_students: Object.prototype.hasOwnProperty.call(payload || {}, 'issueStudents')
        ? payload.issueStudents
        : (Object.prototype.hasOwnProperty.call(payload || {}, 'relatedStudents') ? payload.relatedStudents : current.issue_students),
      status,
      closed_at: status === 'open' ? '' : (current.status === status && current.closed_at ? current.closed_at : new Date().toISOString()),
      updated_at: new Date().toISOString(),
    });
    assertOwnedStudentLinks(ownerId, row.issue_students);
    upsertIssueStmt.run(row);
    return row;
  });

  const deleteIssue = sqlite.transaction((ownerId, id) => {
    const row = getIssue(ownerId, id);
    if (!row) return null;
    deleteConsultationsForIssueStmt.run(ownerId, id);
    deleteIssueStmt.run(id, ownerId);
    return row;
  });

  const listConsultations = (ownerId, issueId) => listConsultationsStmt.all(ownerId, issueId).map(normalizeConsultation);
  const listConsultationsByStudent = (ownerId, studentId) => listConsultationsByStudentStmt.all(ownerId, studentId).map(normalizeConsultation);

  const createConsultation = sqlite.transaction((ownerId, issueId, payload) => {
    if (!getIssue(ownerId, issueId)) return null;
    assertOwnedStudentId(ownerId, payload?.studentId);
    const now = new Date().toISOString();
    const row = normalizeConsultation({
      id: sequenceStore.next('issue_consultation'),
      owner_id: ownerId,
      issue_id: issueId,
      student_id: Number(payload?.studentId || 0),
      student_code: String(payload?.studentCode || ''),
      participant_name: String(payload?.participantName || ''),
      consultation_type: String(payload?.consultationType || 'student'),
      consulted_at: payload?.consultedAt || now,
      content: String(payload?.content || ''),
      attachments: payload?.attachments,
      created_at: now,
      updated_at: now,
    });
    upsertConsultationStmt.run(row);
    touchIssueStmt.run(now, issueId, ownerId);
    return row;
  });

  const updateConsultation = sqlite.transaction((ownerId, issueId, consultationId, payload) => {
    const currentRaw = getConsultationStmt.get(consultationId, ownerId, issueId);
    if (!currentRaw) return null;
    const current = normalizeConsultation(currentRaw);
    assertOwnedStudentId(ownerId, payload?.studentId ?? current.student_id);
    const row = normalizeConsultation({
      ...current,
      student_id: Number(payload?.studentId ?? current.student_id ?? 0),
      student_code: String(payload?.studentCode ?? current.student_code ?? ''),
      participant_name: String(payload?.participantName ?? current.participant_name),
      consultation_type: payload?.consultationType ?? current.consultation_type,
      consulted_at: payload?.consultedAt ?? current.consulted_at,
      content: String(payload?.content ?? current.content),
      attachments: Object.prototype.hasOwnProperty.call(payload || {}, 'attachments') ? payload.attachments : current.attachments,
      updated_at: new Date().toISOString(),
    });
    upsertConsultationStmt.run(row);
    touchIssueStmt.run(row.updated_at, issueId, ownerId);
    return row;
  });

  const deleteConsultation = sqlite.transaction((ownerId, issueId, consultationId) => {
    const current = getConsultationStmt.get(consultationId, ownerId, issueId);
    if (!current) return null;
    deleteConsultationStmt.run(consultationId, ownerId, issueId);
    touchIssueStmt.run(new Date().toISOString(), issueId, ownerId);
    return normalizeConsultation(current);
  });

  const deleteOwnerPhase6Data = sqlite.transaction((ownerId) => {
    deleteConsultationsForOwnerStmt.run(ownerId);
    deleteIssuesForOwnerStmt.run(ownerId);
  });

  return {
    listIssues,
    getIssue,
    createIssue,
    updateIssue,
    deleteIssue,
    listConsultations,
    listConsultationsByStudent,
    createConsultation,
    updateConsultation,
    deleteConsultation,
    deleteOwnerPhase6Data,
  };
};
