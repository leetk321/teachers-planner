const toHandlerMap = (handlers = {}) => (
  handlers instanceof Map ? new Map(handlers) : new Map(Object.entries(handlers || {}))
);

const ENTITY_TYPES = Object.freeze({
  STUDENT: 'student',
  STUDENT_NOTE: 'student_note',
  TASK_MEMO: 'task_memo',
  SCHEDULE: 'schedule',
  ISSUE: 'issue',
  ISSUE_CONSULTATION: 'issue_consultation',
});

const safeJson = (value, fallback = []) => {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || ''));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const asPositiveId = (value, label = 'id') => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new TrashOperationError(400, 'INVALID_ID', `${label} must be a positive integer`);
  }
  return id;
};

export class TrashOperationError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'TrashOperationError';
    this.statusCode = Number(statusCode) || 500;
    this.code = String(code || 'TRASH_OPERATION_FAILED');
  }
}

const conflict = (message, code = 'TRASH_RESTORE_CONFLICT') => {
  throw new TrashOperationError(409, code, message);
};

export const createTrashService = ({ trashStore, restoreHandlers = {}, purgeHandlers = {} }) => {
  if (!trashStore) throw new Error('trash store is required');
  const restorers = toHandlerMap(restoreHandlers);
  const purgers = toHandlerMap(purgeHandlers);

  const registerRestorer = (entityType, handler) => {
    const type = String(entityType || '').trim();
    if (!type || typeof handler !== 'function') throw new Error('valid trash restorer is required');
    restorers.set(type, handler);
  };

  const registerPurger = (entityType, handler) => {
    const type = String(entityType || '').trim();
    if (!type || typeof handler !== 'function') throw new Error('valid trash purger is required');
    purgers.set(type, handler);
  };

  const capture = (ownerId, input) => trashStore.capture(ownerId, input);
  const captureAndDelete = (ownerId, input, deleteAction) => trashStore.captureWithAction(ownerId, input, deleteAction);
  const list = (ownerId, filters) => trashStore.list(ownerId, filters);
  const get = (ownerId, id) => trashStore.get(ownerId, id);
  const getStats = (ownerId) => trashStore.getStats(ownerId);

  const restore = (ownerId, id) => {
    const current = trashStore.get(ownerId, id);
    if (!current) return null;
    const handler = restorers.get(current.entity_type);
    if (!handler) throw new TrashOperationError(409, 'TRASH_RESTORE_UNSUPPORTED', `trash restore is not supported for entity type: ${current.entity_type}`);
    try {
      return trashStore.restoreWithAction(ownerId, id, (row) => handler({ ownerId: Number(ownerId), row }));
    } catch (error) {
      if (error instanceof TrashOperationError) throw error;
      if (String(error?.message || '').includes('UNIQUE constraint failed')) {
        throw new TrashOperationError(409, 'TRASH_RESTORE_CONFLICT', 'existing data conflicts with this trash item');
      }
      throw error;
    }
  };

  const remove = (ownerId, id) => {
    const current = trashStore.get(ownerId, id);
    if (!current) return null;
    const handler = purgers.get(current.entity_type);
    if (handler) handler({ ownerId: Number(ownerId), row: current });
    return trashStore.remove(ownerId, id);
  };

  const purgeExpired = (ownerId, now) => {
    const expired = typeof trashStore.listExpired === 'function'
      ? trashStore.listExpired(ownerId, now)
      : trashStore.purgeExpired(ownerId, now);
    const removed = [];
    const failures = [];

    for (const row of expired) {
      const handler = purgers.get(row.entity_type);
      try {
        if (handler) handler({ ownerId: Number(ownerId), row });
        const deleted = trashStore.remove(ownerId, row.id);
        if (deleted) removed.push(deleted);
      } catch (error) {
        failures.push({ id: row.id, error: String(error?.message || error) });
      }
    }
    return { removed, cleanup_failures: failures };
  };

  const purgeAllExpired = (now = new Date().toISOString()) => {
    if (typeof trashStore.listOwnersWithExpired !== 'function') {
      throw new Error('trash store does not support global expiry cleanup');
    }
    const owners = trashStore.listOwnersWithExpired(now);
    const removed = [];
    const cleanupFailures = [];
    for (const ownerId of owners) {
      const result = purgeExpired(ownerId, now);
      removed.push(...result.removed);
      cleanupFailures.push(...result.cleanup_failures.map((failure) => ({ ...failure, owner_id: ownerId })));
    }
    return { owners_checked: owners.length, removed, cleanup_failures: cleanupFailures };
  };

  return {
    registerRestorer,
    registerPurger,
    capture,
    captureAndDelete,
    list,
    get,
    getStats,
    restore,
    remove,
    purgeExpired,
    purgeAllExpired,
  };
};

const attachmentRefsFromRows = (rows = []) => {
  const refs = new Map();
  for (const row of rows) {
    const attachments = safeJson(row?.attachments ?? row?.attachments_json, []);
    for (const item of attachments) {
      const id = Number(item?.id || 0);
      if (!Number.isInteger(id) || id <= 0 || refs.has(id)) continue;
      refs.set(id, {
        id,
        name: String(item?.name || ''),
        type: String(item?.type || 'application/octet-stream'),
        size: Number(item?.size || 0),
        url: String(item?.url || ''),
      });
    }
  }
  return [...refs.values()];
};

const sameIssueLink = (left = {}, right = {}) => (
  String(left?.student_code || '') === String(right?.student_code || '')
  && String(left?.student_name || '') === String(right?.student_name || '')
  && String(left?.role || 'related') === String(right?.role || 'related')
);

export const createTeacherNotebookTrashLifecycle = ({
  sqlite,
  trashService,
  phase1Store = null,
  removeOwnedUploadRows = null,
  removeStudentPhotoFileByUrl = null,
}) => {
  if (!sqlite || !trashService) throw new Error('sqlite and trashService are required');

  const statements = {
    getStudent: sqlite.prepare('SELECT * FROM student_rows WHERE id = ? AND owner_id = ?'),
    getStudentAnyOwner: sqlite.prepare('SELECT id, owner_id FROM student_rows WHERE id = ?'),
    getStudentIdentity: sqlite.prepare('SELECT id FROM student_rows WHERE owner_id = ? AND academic_year = ? AND class_name = ? AND student_no = ? LIMIT 1'),
    listStudentNotes: sqlite.prepare('SELECT * FROM note_rows WHERE owner_id = ? AND student_id = ? ORDER BY id ASC'),
    listStudentClubs: sqlite.prepare(`
      SELECT cm.club_id, cm.student_id
      FROM club_member_rows cm
      JOIN club_rows c ON c.id = cm.club_id
      WHERE c.owner_id = ? AND cm.student_id = ?
      ORDER BY cm.club_id ASC
    `),
    listAttendance: sqlite.prepare('SELECT * FROM attendance_rows WHERE owner_id = ? ORDER BY id ASC'),
    listIssues: sqlite.prepare('SELECT * FROM issue_rows WHERE owner_id = ? ORDER BY id ASC'),
    listStudentIssueConsultations: sqlite.prepare('SELECT * FROM issue_consultation_rows WHERE owner_id = ? AND student_id = ? ORDER BY id ASC'),
    deleteStudentNotes: sqlite.prepare('DELETE FROM note_rows WHERE owner_id = ? AND student_id = ?'),
    deleteStudentClubs: sqlite.prepare(`
      DELETE FROM club_member_rows
      WHERE student_id = ? AND club_id IN (SELECT id FROM club_rows WHERE owner_id = ?)
    `),
    deleteStudent: sqlite.prepare('DELETE FROM student_rows WHERE id = ? AND owner_id = ?'),
    updateAttendanceEntries: sqlite.prepare('UPDATE attendance_rows SET entries_json = ? WHERE id = ? AND owner_id = ?'),
    updateIssueLinks: sqlite.prepare('UPDATE issue_rows SET related_students_json = ? WHERE id = ? AND owner_id = ?'),
    detachIssueConsultation: sqlite.prepare('UPDATE issue_consultation_rows SET student_id = 0 WHERE id = ? AND owner_id = ? AND student_id = ?'),
    getTaskMemo: sqlite.prepare('SELECT * FROM task_memo_rows WHERE id = ? AND owner_id = ?'),
    deleteTaskMemo: sqlite.prepare('DELETE FROM task_memo_rows WHERE id = ? AND owner_id = ?'),
    getNote: sqlite.prepare('SELECT * FROM note_rows WHERE id = ? AND owner_id = ?'),
    deleteNote: sqlite.prepare('DELETE FROM note_rows WHERE id = ? AND owner_id = ?'),
    getSchedule: sqlite.prepare('SELECT * FROM schedule_rows WHERE id = ? AND owner_id = ?'),
    deleteSchedule: sqlite.prepare('DELETE FROM schedule_rows WHERE id = ? AND owner_id = ?'),
    getIssue: sqlite.prepare('SELECT * FROM issue_rows WHERE id = ? AND owner_id = ?'),
    getIssueByCaseNo: sqlite.prepare('SELECT id FROM issue_rows WHERE owner_id = ? AND case_no = ? LIMIT 1'),
    listIssueConsultations: sqlite.prepare('SELECT * FROM issue_consultation_rows WHERE owner_id = ? AND issue_id = ? ORDER BY id ASC'),
    deleteIssueConsultations: sqlite.prepare('DELETE FROM issue_consultation_rows WHERE owner_id = ? AND issue_id = ?'),
    deleteIssue: sqlite.prepare('DELETE FROM issue_rows WHERE id = ? AND owner_id = ?'),
    getIssueConsultation: sqlite.prepare('SELECT * FROM issue_consultation_rows WHERE id = ? AND owner_id = ? AND issue_id = ?'),
    deleteIssueConsultation: sqlite.prepare('DELETE FROM issue_consultation_rows WHERE id = ? AND owner_id = ? AND issue_id = ?'),
    touchIssue: sqlite.prepare('UPDATE issue_rows SET updated_at = ? WHERE id = ? AND owner_id = ?'),
    getClub: sqlite.prepare('SELECT id, owner_id FROM club_rows WHERE id = ?'),
    getAttendanceAnyOwner: sqlite.prepare('SELECT * FROM attendance_rows WHERE id = ?'),
    getAttendanceSlot: sqlite.prepare('SELECT id FROM attendance_rows WHERE owner_id = ? AND kind = ? AND date = ? AND class_name = ? AND period = ? LIMIT 1'),
    getIssueAnyOwner: sqlite.prepare('SELECT id, owner_id FROM issue_rows WHERE id = ?'),
    getIssueConsultationAnyOwner: sqlite.prepare('SELECT id, owner_id, issue_id, student_id FROM issue_consultation_rows WHERE id = ?'),
    getNoteAnyOwner: sqlite.prepare('SELECT id, owner_id FROM note_rows WHERE id = ?'),
    getTaskMemoAnyOwner: sqlite.prepare('SELECT id, owner_id FROM task_memo_rows WHERE id = ?'),
    getScheduleAnyOwner: sqlite.prepare('SELECT id, owner_id FROM schedule_rows WHERE id = ?'),
    insertStudent: sqlite.prepare(`
      INSERT INTO student_rows(id, owner_id, academic_year, name, class_name, student_no, memo, risk_level, tags, student_track, student_phone, guardian_phone, basic_info, basic_survey, gender, birth_date, transferred_at, photo_url, photo_updated_at, created_at, updated_at)
      VALUES(@id, @owner_id, @academic_year, @name, @class_name, @student_no, @memo, @risk_level, @tags, @student_track, @student_phone, @guardian_phone, @basic_info, @basic_survey, @gender, @birth_date, @transferred_at, @photo_url, @photo_updated_at, @created_at, @updated_at)
    `),
    insertNote: sqlite.prepare(`
      INSERT INTO note_rows(id, owner_id, academic_year, student_id, note_date, category, content, attachments_json, created_at)
      VALUES(@id, @owner_id, @academic_year, @student_id, @note_date, @category, @content, @attachments_json, @created_at)
    `),
    insertClubMember: sqlite.prepare('INSERT INTO club_member_rows(club_id, student_id) VALUES(?, ?)'),
    insertAttendance: sqlite.prepare(`
      INSERT INTO attendance_rows(id, owner_id, kind, date, class_name, period, entries_json, created_at, updated_at)
      VALUES(@id, @owner_id, @kind, @date, @class_name, @period, @entries_json, @created_at, @updated_at)
    `),
    insertTaskMemo: sqlite.prepare(`
      INSERT INTO task_memo_rows(id, owner_id, memo_date, title, content, show_on_dashboard, kind, is_completed, completed_at, attachments_json, created_at, updated_at)
      VALUES(@id, @owner_id, @memo_date, @title, @content, @show_on_dashboard, @kind, @is_completed, @completed_at, @attachments_json, @created_at, @updated_at)
    `),
    insertSchedule: sqlite.prepare(`
      INSERT INTO schedule_rows(id, owner_id, title, due_at, importance, kind, done, created_at)
      VALUES(@id, @owner_id, @title, @due_at, @importance, @kind, @done, @created_at)
    `),
    insertIssue: sqlite.prepare(`
      INSERT INTO issue_rows(id, owner_id, academic_year, case_no, title, related_students_json, status, closed_at, created_at, updated_at)
      VALUES(@id, @owner_id, @academic_year, @case_no, @title, @related_students_json, @status, @closed_at, @created_at, @updated_at)
    `),
    insertIssueConsultation: sqlite.prepare(`
      INSERT INTO issue_consultation_rows(id, owner_id, issue_id, student_id, student_code, participant_name, consultation_type, consulted_at, content, attachments_json, created_at, updated_at)
      VALUES(@id, @owner_id, @issue_id, @student_id, @student_code, @participant_name, @consultation_type, @consulted_at, @content, @attachments_json, @created_at, @updated_at)
    `),
    relinkIssueConsultation: sqlite.prepare('UPDATE issue_consultation_rows SET student_id = ? WHERE id = ? AND owner_id = ? AND student_id = 0'),
    getFileAnyOwner: sqlite.prepare('SELECT * FROM file_rows WHERE id = ?'),
    activeTaskMemoAttachments: sqlite.prepare('SELECT attachments_json FROM task_memo_rows WHERE owner_id = ?'),
    activeNoteAttachments: sqlite.prepare('SELECT attachments_json FROM note_rows WHERE owner_id = ?'),
    activeIssueAttachments: sqlite.prepare('SELECT attachments_json FROM issue_consultation_rows WHERE owner_id = ?'),
    activeTrashMetadata: sqlite.prepare("SELECT id, metadata_json FROM trash_rows WHERE owner_id = ? AND restored_at = '' AND id <> ?"),
    activeStudentPhoto: sqlite.prepare('SELECT id FROM student_rows WHERE owner_id = ? AND photo_url = ? LIMIT 1'),
  };

  const attachmentMetadata = (ownerId, rows = []) => attachmentRefsFromRows(rows).map((reference) => {
    const stored = phase1Store?.getFile?.(ownerId, reference.id) || null;
    return {
      ...reference,
      ...(stored || {}),
      was_stored: Boolean(stored),
    };
  });

  const assertAttachmentsAvailable = (ownerId, metadata = {}) => {
    for (const attachment of Array.isArray(metadata?.attachments) ? metadata.attachments : []) {
      if (!attachment?.was_stored) continue;
      const current = statements.getFileAnyOwner.get(Number(attachment.id));
      if (!current || Number(current.owner_id) !== Number(ownerId)) {
        conflict(`attachment ${attachment.id} is no longer available`, 'TRASH_ATTACHMENT_MISSING');
      }
    }
  };

  const captureSimple = ({ ownerId, entityType, entityId, label, row, deleteStatement, metadata = {} }) => {
    if (!row) return null;
    return trashService.captureAndDelete(ownerId, {
      entityType,
      entityId,
      label,
      payload: { row },
      metadata,
    }, () => {
      const deleted = deleteStatement.run(Number(entityId), Number(ownerId));
      if (deleted.changes !== 1) conflict('data changed before it could be moved to trash');
      return row;
    });
  };

  const deleteTaskMemo = (ownerId, rawId) => {
    const id = asPositiveId(rawId, 'memo id');
    const row = statements.getTaskMemo.get(id, ownerId);
    return captureSimple({
      ownerId,
      entityType: ENTITY_TYPES.TASK_MEMO,
      entityId: id,
      label: String(row?.title || row?.memo_date || ''),
      row,
      deleteStatement: statements.deleteTaskMemo,
      metadata: { attachments: attachmentMetadata(ownerId, row ? [row] : []) },
    });
  };

  const deleteStudentNote = (ownerId, rawId) => {
    const id = asPositiveId(rawId, 'note id');
    const row = statements.getNote.get(id, ownerId);
    return captureSimple({
      ownerId,
      entityType: ENTITY_TYPES.STUDENT_NOTE,
      entityId: id,
      label: String(row?.note_date || ''),
      row,
      deleteStatement: statements.deleteNote,
      metadata: { attachments: attachmentMetadata(ownerId, row ? [row] : []) },
    });
  };

  const deleteSchedule = (ownerId, rawId) => {
    const id = asPositiveId(rawId, 'schedule id');
    const row = statements.getSchedule.get(id, ownerId);
    return captureSimple({
      ownerId,
      entityType: ENTITY_TYPES.SCHEDULE,
      entityId: id,
      label: String(row?.title || ''),
      row,
      deleteStatement: statements.deleteSchedule,
    });
  };

  const deleteStudent = (ownerId, rawId) => {
    const id = asPositiveId(rawId, 'student id');
    const student = statements.getStudent.get(id, ownerId);
    if (!student) return null;

    const notes = statements.listStudentNotes.all(ownerId, id);
    const clubMemberships = statements.listStudentClubs.all(ownerId, id);
    const attendanceLinks = [];
    for (const attendance of statements.listAttendance.all(ownerId)) {
      const entries = safeJson(attendance.entries_json, []);
      entries.forEach((entry, index) => {
        if (Number(entry?.student_id) === id) attendanceLinks.push({ row: attendance, entry, index });
      });
    }

    const issueLinks = [];
    for (const issue of statements.listIssues.all(ownerId)) {
      const students = safeJson(issue.related_students_json, []);
      students.forEach((item, index) => {
        if (Number(item?.student_id) === id) issueLinks.push({ issue_id: Number(issue.id), index, item });
      });
    }
    const issueConsultations = statements.listStudentIssueConsultations.all(ownerId, id);
    const payload = { student, notes, club_memberships: clubMemberships, attendance_links: attendanceLinks, issue_links: issueLinks, issue_consultations: issueConsultations };
    const metadata = {
      attachments: attachmentMetadata(ownerId, notes),
      student_photo_url: String(student.photo_url || ''),
    };

    return trashService.captureAndDelete(ownerId, {
      entityType: ENTITY_TYPES.STUDENT,
      entityId: id,
      label: `${student.class_name || ''} ${student.student_no || ''} ${student.name || ''}`.trim(),
      payload,
      metadata,
    }, () => {
      statements.deleteStudentNotes.run(ownerId, id);
      statements.deleteStudentClubs.run(id, ownerId);

      const attendanceById = new Map(attendanceLinks.map((link) => [Number(link.row.id), link.row]));
      for (const attendance of attendanceById.values()) {
        const nextEntries = safeJson(attendance.entries_json, []).filter((entry) => Number(entry?.student_id) !== id);
        statements.updateAttendanceEntries.run(JSON.stringify(nextEntries), attendance.id, ownerId);
      }

      const issueIds = new Set(issueLinks.map((link) => Number(link.issue_id)));
      for (const issueId of issueIds) {
        const issue = statements.getIssue.get(issueId, ownerId);
        if (!issue) conflict('linked issue changed before student deletion');
        const nextStudents = safeJson(issue.related_students_json, []).map((item) => (
          Number(item?.student_id) === id ? { ...item, student_id: 0 } : item
        ));
        statements.updateIssueLinks.run(JSON.stringify(nextStudents), issueId, ownerId);
      }

      for (const consultation of issueConsultations) {
        statements.detachIssueConsultation.run(consultation.id, ownerId, id);
      }

      const deleted = statements.deleteStudent.run(id, ownerId);
      if (deleted.changes !== 1) conflict('student changed before it could be moved to trash');
      return student;
    });
  };

  const deleteIssue = (ownerId, rawId) => {
    const id = asPositiveId(rawId, 'issue id');
    const issue = statements.getIssue.get(id, ownerId);
    if (!issue) return null;
    const consultations = statements.listIssueConsultations.all(ownerId, id);
    return trashService.captureAndDelete(ownerId, {
      entityType: ENTITY_TYPES.ISSUE,
      entityId: id,
      label: String(issue.case_no || issue.title || ''),
      payload: { issue, consultations },
      metadata: { attachments: attachmentMetadata(ownerId, consultations) },
    }, () => {
      statements.deleteIssueConsultations.run(ownerId, id);
      const deleted = statements.deleteIssue.run(id, ownerId);
      if (deleted.changes !== 1) conflict('issue changed before it could be moved to trash');
      return issue;
    });
  };

  const deleteIssueConsultation = (ownerId, rawIssueId, rawConsultationId) => {
    const issueId = asPositiveId(rawIssueId, 'issue id');
    const id = asPositiveId(rawConsultationId, 'consultation id');
    const row = statements.getIssueConsultation.get(id, ownerId, issueId);
    if (!row) return null;
    return trashService.captureAndDelete(ownerId, {
      entityType: ENTITY_TYPES.ISSUE_CONSULTATION,
      entityId: id,
      label: String(row.consulted_at || row.participant_name || ''),
      payload: { row },
      metadata: { attachments: attachmentMetadata(ownerId, [row]) },
    }, () => {
      const deleted = statements.deleteIssueConsultation.run(id, ownerId, issueId);
      if (deleted.changes !== 1) conflict('consultation changed before it could be moved to trash');
      statements.touchIssue.run(new Date().toISOString(), issueId, ownerId);
      return row;
    });
  };

  const assertFreeId = (statement, id, label) => {
    if (statement.get(Number(id))) conflict(`${label} id ${id} is already in use`);
  };

  const assertOwnedStudent = (ownerId, studentId, label = 'student') => {
    const id = Number(studentId || 0);
    if (id <= 0) return;
    const student = statements.getStudentAnyOwner.get(id);
    if (!student || Number(student.owner_id) !== Number(ownerId)) conflict(`${label} ${id} is no longer available`);
  };

  const restoreTaskMemo = ({ ownerId, row }) => {
    const source = row.payload?.row;
    if (!source) conflict('trash memo snapshot is incomplete');
    assertFreeId(statements.getTaskMemoAnyOwner, source.id, 'memo');
    assertAttachmentsAvailable(ownerId, row.metadata);
    statements.insertTaskMemo.run({ ...source, owner_id: ownerId });
    return { id: Number(source.id) };
  };

  const restoreStudentNote = ({ ownerId, row }) => {
    const source = row.payload?.row;
    if (!source) conflict('trash note snapshot is incomplete');
    assertFreeId(statements.getNoteAnyOwner, source.id, 'note');
    assertOwnedStudent(ownerId, source.student_id);
    assertAttachmentsAvailable(ownerId, row.metadata);
    statements.insertNote.run({ ...source, owner_id: ownerId });
    return { id: Number(source.id), student_id: Number(source.student_id) };
  };

  const restoreSchedule = ({ ownerId, row }) => {
    const source = row.payload?.row;
    if (!source) conflict('trash schedule snapshot is incomplete');
    assertFreeId(statements.getScheduleAnyOwner, source.id, 'schedule');
    statements.insertSchedule.run({ ...source, owner_id: ownerId });
    return { id: Number(source.id) };
  };

  const findDetachedIssueLinkIndex = (items, link, usedIndexes) => {
    const preferred = Number(link.index);
    if (!usedIndexes.has(preferred) && Number(items[preferred]?.student_id || 0) === 0 && sameIssueLink(items[preferred], link.item)) return preferred;
    return items.findIndex((item, index) => !usedIndexes.has(index) && Number(item?.student_id || 0) === 0 && sameIssueLink(item, link.item));
  };

  const restoreStudent = ({ ownerId, row }) => {
    const payload = row.payload || {};
    const student = payload.student;
    if (!student) conflict('trash student snapshot is incomplete');
    const studentId = Number(student.id);
    assertFreeId(statements.getStudentAnyOwner, studentId, 'student');
    const hasCompleteIdentity = Boolean(
      String(student.academic_year || '').trim()
      && String(student.class_name || '').trim()
      && String(student.student_no || '').trim(),
    );
    const identityConflict = hasCompleteIdentity
      ? statements.getStudentIdentity.get(ownerId, student.academic_year, student.class_name, student.student_no)
      : null;
    if (identityConflict) conflict('another student already uses the same academic year, class, and number');

    for (const note of Array.isArray(payload.notes) ? payload.notes : []) assertFreeId(statements.getNoteAnyOwner, note.id, 'note');
    for (const membership of Array.isArray(payload.club_memberships) ? payload.club_memberships : []) {
      const club = statements.getClub.get(Number(membership.club_id));
      if (!club || Number(club.owner_id) !== Number(ownerId)) conflict(`club ${membership.club_id} is no longer available`);
    }
    for (const link of Array.isArray(payload.attendance_links) ? payload.attendance_links : []) {
      const current = statements.getAttendanceAnyOwner.get(Number(link.row?.id));
      if (current && Number(current.owner_id) !== Number(ownerId)) conflict(`attendance id ${link.row?.id} is already in use`);
      if (current && (
        String(current.kind) !== String(link.row?.kind)
        || String(current.date) !== String(link.row?.date)
        || String(current.class_name) !== String(link.row?.class_name)
        || String(current.period) !== String(link.row?.period)
      )) conflict(`attendance ${current.id} was changed to a different time slot`);
      if (current && safeJson(current.entries_json, []).some((entry) => Number(entry?.student_id) === studentId)) {
        conflict(`attendance ${current.id} already contains this student`);
      }
      if (!current) {
        const slot = statements.getAttendanceSlot.get(ownerId, link.row?.kind, link.row?.date, link.row?.class_name, link.row?.period);
        if (slot) conflict('an attendance row already exists for the original time slot');
      }
    }

    const issueLinkGroups = new Map();
    for (const link of Array.isArray(payload.issue_links) ? payload.issue_links : []) {
      if (!issueLinkGroups.has(Number(link.issue_id))) issueLinkGroups.set(Number(link.issue_id), []);
      issueLinkGroups.get(Number(link.issue_id)).push(link);
    }
    for (const [issueId, links] of issueLinkGroups.entries()) {
      const issue = statements.getIssue.get(issueId, ownerId);
      if (!issue) conflict(`linked issue ${issueId} is no longer available`);
      const items = safeJson(issue.related_students_json, []);
      const used = new Set();
      for (const link of links) {
        const index = findDetachedIssueLinkIndex(items, link, used);
        if (index < 0) conflict(`linked issue ${issueId} was edited after student deletion`);
        used.add(index);
      }
    }
    for (const consultation of Array.isArray(payload.issue_consultations) ? payload.issue_consultations : []) {
      const current = statements.getIssueConsultationAnyOwner.get(Number(consultation.id));
      if (!current || Number(current.owner_id) !== Number(ownerId) || Number(current.issue_id) !== Number(consultation.issue_id) || Number(current.student_id) !== 0) {
        conflict(`linked issue consultation ${consultation.id} was changed after student deletion`);
      }
    }
    assertAttachmentsAvailable(ownerId, row.metadata);

    statements.insertStudent.run({ ...student, owner_id: ownerId });
    for (const note of Array.isArray(payload.notes) ? payload.notes : []) {
      statements.insertNote.run({ ...note, owner_id: ownerId, student_id: studentId });
    }
    for (const membership of Array.isArray(payload.club_memberships) ? payload.club_memberships : []) {
      statements.insertClubMember.run(Number(membership.club_id), studentId);
    }

    const attendanceGroups = new Map();
    for (const link of Array.isArray(payload.attendance_links) ? payload.attendance_links : []) {
      const attendanceId = Number(link.row?.id);
      if (!attendanceGroups.has(attendanceId)) attendanceGroups.set(attendanceId, []);
      attendanceGroups.get(attendanceId).push(link);
    }
    for (const [attendanceId, links] of attendanceGroups.entries()) {
      const current = statements.getAttendanceAnyOwner.get(attendanceId);
      if (!current) {
        statements.insertAttendance.run({ ...links[0].row, owner_id: ownerId });
        continue;
      }
      const entries = safeJson(current.entries_json, []);
      for (const link of [...links].sort((a, b) => Number(a.index) - Number(b.index))) {
        const index = Math.min(Math.max(Number(link.index) || 0, 0), entries.length);
        entries.splice(index, 0, link.entry);
      }
      statements.updateAttendanceEntries.run(JSON.stringify(entries), attendanceId, ownerId);
    }

    for (const [issueId, links] of issueLinkGroups.entries()) {
      const issue = statements.getIssue.get(issueId, ownerId);
      const items = safeJson(issue.related_students_json, []);
      const used = new Set();
      for (const link of links) {
        const index = findDetachedIssueLinkIndex(items, link, used);
        used.add(index);
        items[index] = link.item;
      }
      statements.updateIssueLinks.run(JSON.stringify(items), issueId, ownerId);
    }
    for (const consultation of Array.isArray(payload.issue_consultations) ? payload.issue_consultations : []) {
      const relinked = statements.relinkIssueConsultation.run(studentId, consultation.id, ownerId);
      if (relinked.changes !== 1) conflict(`linked issue consultation ${consultation.id} could not be restored`);
    }
    return { id: studentId, restored_notes: Array.isArray(payload.notes) ? payload.notes.length : 0 };
  };

  const validateIssueStudentLinks = (ownerId, issue, consultations) => {
    for (const item of safeJson(issue.related_students_json, [])) assertOwnedStudent(ownerId, item?.student_id, 'issue student');
    for (const consultation of consultations) assertOwnedStudent(ownerId, consultation.student_id, 'consultation student');
  };

  const restoreIssue = ({ ownerId, row }) => {
    const issue = row.payload?.issue;
    const consultations = Array.isArray(row.payload?.consultations) ? row.payload.consultations : [];
    if (!issue) conflict('trash issue snapshot is incomplete');
    assertFreeId(statements.getIssueAnyOwner, issue.id, 'issue');
    const caseConflict = statements.getIssueByCaseNo.get(ownerId, issue.case_no);
    if (caseConflict) conflict(`case number ${issue.case_no} is already in use`);
    for (const consultation of consultations) assertFreeId(statements.getIssueConsultationAnyOwner, consultation.id, 'consultation');
    validateIssueStudentLinks(ownerId, issue, consultations);
    assertAttachmentsAvailable(ownerId, row.metadata);
    statements.insertIssue.run({ ...issue, owner_id: ownerId });
    for (const consultation of consultations) statements.insertIssueConsultation.run({ ...consultation, owner_id: ownerId, issue_id: Number(issue.id) });
    return { id: Number(issue.id), restored_consultations: consultations.length };
  };

  const restoreIssueConsultation = ({ ownerId, row }) => {
    const source = row.payload?.row;
    if (!source) conflict('trash consultation snapshot is incomplete');
    assertFreeId(statements.getIssueConsultationAnyOwner, source.id, 'consultation');
    const issue = statements.getIssue.get(Number(source.issue_id), ownerId);
    if (!issue) conflict(`parent issue ${source.issue_id} is no longer available`);
    assertOwnedStudent(ownerId, source.student_id, 'consultation student');
    assertAttachmentsAvailable(ownerId, row.metadata);
    statements.insertIssueConsultation.run({ ...source, owner_id: ownerId });
    statements.touchIssue.run(new Date().toISOString(), source.issue_id, ownerId);
    return { id: Number(source.id), issue_id: Number(source.issue_id) };
  };

  const activeAttachmentReferences = (ownerId) => {
    const ids = new Set();
    for (const statement of [statements.activeTaskMemoAttachments, statements.activeNoteAttachments, statements.activeIssueAttachments]) {
      for (const row of statement.all(ownerId)) {
        for (const item of safeJson(row.attachments_json, [])) {
          const id = Number(item?.id || 0);
          if (id > 0) ids.add(id);
        }
      }
    }
    return ids;
  };

  const referencedByOtherTrash = (ownerId, trashId, predicate) => statements.activeTrashMetadata
    .all(ownerId, Number(trashId))
    .some((item) => {
      try { return predicate(JSON.parse(String(item.metadata_json || '{}'))); } catch { return false; }
    });

  const purgeAssets = ({ ownerId, row }) => {
    const activeAttachmentIds = activeAttachmentReferences(ownerId);
    for (const attachment of Array.isArray(row.metadata?.attachments) ? row.metadata.attachments : []) {
      const fileId = Number(attachment?.id || 0);
      if (!fileId || activeAttachmentIds.has(fileId)) continue;
      if (referencedByOtherTrash(ownerId, row.id, (metadata) => (
        Array.isArray(metadata?.attachments) && metadata.attachments.some((item) => Number(item?.id) === fileId)
      ))) continue;
      const current = statements.getFileAnyOwner.get(fileId);
      if (!current || Number(current.owner_id) !== Number(ownerId) || String(current.scope || '') !== 'attachment') continue;
      if (typeof removeOwnedUploadRows === 'function') removeOwnedUploadRows(ownerId, [current]);
      phase1Store?.deleteFile?.(ownerId, fileId);
    }

    const photoUrl = String(row.metadata?.student_photo_url || '');
    if (photoUrl && !statements.activeStudentPhoto.get(ownerId, photoUrl)) {
      const heldByOtherTrash = referencedByOtherTrash(ownerId, row.id, (metadata) => String(metadata?.student_photo_url || '') === photoUrl);
      if (!heldByOtherTrash && typeof removeStudentPhotoFileByUrl === 'function') removeStudentPhotoFileByUrl(ownerId, photoUrl);
    }
  };

  const isFileProtected = (ownerId, fileId) => {
    const id = Number(fileId || 0);
    if (!id) return false;
    if (activeAttachmentReferences(ownerId).has(id)) return true;
    return referencedByOtherTrash(ownerId, 0, (metadata) => (
      Array.isArray(metadata?.attachments) && metadata.attachments.some((item) => Number(item?.id) === id)
    ));
  };

  const isPhotoProtected = (ownerId, photoUrl) => {
    const value = String(photoUrl || '');
    if (!value) return false;
    return referencedByOtherTrash(ownerId, 0, (metadata) => String(metadata?.student_photo_url || '') === value);
  };

  trashService.registerRestorer(ENTITY_TYPES.STUDENT, restoreStudent);
  trashService.registerRestorer(ENTITY_TYPES.STUDENT_NOTE, restoreStudentNote);
  trashService.registerRestorer(ENTITY_TYPES.TASK_MEMO, restoreTaskMemo);
  trashService.registerRestorer(ENTITY_TYPES.SCHEDULE, restoreSchedule);
  trashService.registerRestorer(ENTITY_TYPES.ISSUE, restoreIssue);
  trashService.registerRestorer(ENTITY_TYPES.ISSUE_CONSULTATION, restoreIssueConsultation);
  Object.values(ENTITY_TYPES).forEach((type) => trashService.registerPurger(type, purgeAssets));

  return {
    deleteStudent,
    deleteStudentNote,
    deleteTaskMemo,
    deleteSchedule,
    deleteIssue,
    deleteIssueConsultation,
    isFileProtected,
    isPhotoProtected,
  };
};

export { ENTITY_TYPES as TRASH_ENTITY_TYPES };
