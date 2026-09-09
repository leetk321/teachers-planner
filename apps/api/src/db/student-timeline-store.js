const TIMELINE_LIMIT = 300;

const safeJsonArray = (value) => {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const safeJsonObject = (value) => {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const normalizeAttachments = (value) => safeJsonArray(value)
  .map((item) => ({
    id: Number(item?.id || 0),
    name: String(item?.name || '').trim(),
    type: String(item?.type || 'application/octet-stream'),
    size: Number(item?.size || 0),
    url: String(item?.url || '').trim(),
  }))
  .filter((item) => item.id || item.url);

const toSortTime = (value) => {
  const text = String(value || '').trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? Date.parse(`${text}T00:00:00+09:00`)
    : Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
};

const studentIdentityText = (student) => [
  String(student?.class_name || '').trim(),
  String(student?.student_no || '').trim() ? `${String(student.student_no).trim()}번` : '',
  String(student?.name || '').trim(),
].filter(Boolean).join(' ');

const createItem = ({ id, type, label, occurredAt, title, content = '', meta = {}, sourceId = 0 }) => ({
  id: String(id),
  type: String(type),
  label: String(label),
  occurredAt: String(occurredAt || ''),
  title: String(title),
  content: String(content || ''),
  meta: meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {},
  _sortTime: toSortTime(occurredAt),
  _sourceId: Number(sourceId || 0),
});

const publicItem = ({ _sortTime, _sourceId, ...item }) => item;

const buildAttendanceTitle = (row) => [
  String(row?.kind || '') === 'club' ? '선택' : '학급',
  String(row?.class_name || '').trim(),
  String(row?.period || '').trim(),
].filter(Boolean).join(' · ');

export const createStudentTimelineStore = ({ sqlite }) => {
  const getOwnedStudentStmt = sqlite.prepare(`
    SELECT id, academic_year, name, class_name, student_no, created_at, updated_at
    FROM student_rows
    WHERE id = ? AND owner_id = ?
  `);
  const listNotesStmt = sqlite.prepare(`
    SELECT id, academic_year, note_date, category, content, attachments_json, created_at
    FROM note_rows
    WHERE owner_id = ? AND student_id = ?
    ORDER BY note_date DESC, id DESC
  `);
  const listIssueConsultationsStmt = sqlite.prepare(`
    SELECT
      consultation.id,
      consultation.issue_id,
      consultation.student_code,
      consultation.participant_name,
      consultation.consultation_type,
      consultation.consulted_at,
      consultation.content,
      consultation.attachments_json,
      consultation.created_at,
      consultation.updated_at,
      issue.case_no,
      issue.title AS issue_title
    FROM issue_consultation_rows consultation
    INNER JOIN issue_rows issue
      ON issue.id = consultation.issue_id
      AND issue.owner_id = consultation.owner_id
    WHERE consultation.owner_id = ? AND consultation.student_id = ?
    ORDER BY consultation.consulted_at DESC, consultation.id DESC
  `);
  const listAttendanceStmt = sqlite.prepare(`
    SELECT
      attendance.id,
      attendance.kind,
      attendance.date,
      attendance.class_name,
      attendance.period,
      attendance.created_at,
      attendance.updated_at,
      entry.value AS entry_json
    FROM attendance_rows attendance
    JOIN json_each(
      CASE WHEN json_valid(attendance.entries_json) THEN attendance.entries_json ELSE '[]' END
    ) entry
    WHERE attendance.owner_id = ?
      AND CAST(json_extract(entry.value, '$.student_id') AS INTEGER) = ?
    ORDER BY attendance.date DESC, attendance.id DESC
  `);

  const getStudentTimeline = (ownerId, studentId) => {
    const student = getOwnedStudentStmt.get(studentId, ownerId);
    if (!student) return null;

    const items = [];
    const identity = studentIdentityText(student);

    if (String(student.created_at || '').trim()) {
      items.push(createItem({
        id: `student:${student.id}:created`,
        type: 'student_created',
        label: '학생 등록',
        occurredAt: student.created_at,
        title: '학생 등록',
        content: identity,
        meta: { studentId: Number(student.id), action: 'created' },
        sourceId: student.id,
      }));
    }

    if (String(student.updated_at || '').trim() && String(student.updated_at) !== String(student.created_at || '')) {
      items.push(createItem({
        id: `student:${student.id}:updated`,
        type: 'student_updated',
        label: '학생 정보 수정',
        occurredAt: student.updated_at,
        title: '학생 정보 수정',
        content: identity,
        meta: { studentId: Number(student.id), action: 'updated' },
        sourceId: student.id,
      }));
    }

    listNotesStmt.all(ownerId, studentId).forEach((note) => {
      items.push(createItem({
        id: `note:${note.id}`,
        type: 'consultation',
        label: '상담 기록',
        occurredAt: note.note_date || note.created_at,
        title: '상담 기록',
        content: note.content,
        meta: {
          noteId: Number(note.id),
          academicYear: String(note.academic_year || ''),
          category: String(note.category || 'general'),
          attachments: normalizeAttachments(note.attachments_json),
          createdAt: String(note.created_at || ''),
        },
        sourceId: note.id,
      }));
    });

    listIssueConsultationsStmt.all(ownerId, studentId).forEach((consultation) => {
      const consultationType = String(consultation.consultation_type || 'student');
      const label = consultationType === 'guardian' ? '사안-보호자' : '사안-학생';
      const caseNo = String(consultation.case_no || '').trim();
      items.push(createItem({
        id: `issue-consultation:${consultation.id}`,
        type: 'issue_consultation',
        label,
        occurredAt: consultation.consulted_at || consultation.created_at,
        title: caseNo ? `${caseNo} 상담` : '사안 상담',
        content: consultation.content,
        meta: {
          consultationId: Number(consultation.id),
          issueId: Number(consultation.issue_id),
          caseNo,
          issueTitle: String(consultation.issue_title || ''),
          consultationType,
          studentCode: String(consultation.student_code || ''),
          participantName: String(consultation.participant_name || ''),
          attachments: normalizeAttachments(consultation.attachments_json),
          createdAt: String(consultation.created_at || ''),
          updatedAt: String(consultation.updated_at || ''),
        },
        sourceId: consultation.id,
      }));
    });

    listAttendanceStmt.all(ownerId, studentId).forEach((attendance) => {
      const entry = safeJsonObject(attendance.entry_json);

      const rawStatus = String(entry?.status || '').trim();
      const status = rawStatus && rawStatus !== '출석' ? rawStatus : '';
      const memo = String(entry?.memo || '').trim();
      if (!status && !memo) return;

      items.push(createItem({
        id: `attendance:${attendance.id}:${studentId}`,
        type: 'attendance',
        label: '출석 메모',
        occurredAt: attendance.date || attendance.updated_at || attendance.created_at,
        title: buildAttendanceTitle(attendance) || '출석 기록',
        content: [status, memo].filter(Boolean).join('\n'),
        meta: {
          attendanceId: Number(attendance.id),
          kind: String(attendance.kind || ''),
          date: String(attendance.date || ''),
          className: String(attendance.class_name || ''),
          period: String(attendance.period || ''),
          status,
          memo,
        },
        sourceId: attendance.id,
      }));
    });

    items.sort((left, right) => (
      right._sortTime - left._sortTime
      || String(right.occurredAt).localeCompare(String(left.occurredAt))
      || right._sourceId - left._sourceId
      || String(left.id).localeCompare(String(right.id))
    ));

    const countType = (type) => items.filter((item) => item.type === type).length;
    const limitedItems = items.slice(0, TIMELINE_LIMIT).map(publicItem);
    return {
      items: limitedItems,
      counts: {
        total: items.length,
        returned: limitedItems.length,
        studentCreated: countType('student_created'),
        studentUpdated: countType('student_updated'),
        consultations: countType('consultation'),
        issueConsultations: countType('issue_consultation'),
        attendance: countType('attendance'),
      },
    };
  };

  return { getStudentTimeline };
};
