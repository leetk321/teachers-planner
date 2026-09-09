const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

const orphanReason = (studentId, studentOwnerById) => (
  studentOwnerById.has(studentId) ? 'foreign_owner' : 'missing_student'
);

export const preserveOrphanedAttendanceReferences = (entries, { ownerId, studentOwnerById }) => {
  if (!Array.isArray(entries)) throw new Error('attendance entries must be a JSON array');
  let changed = false;
  let orphanedCount = 0;
  const normalizedOwnerId = Number(ownerId);

  const nextEntries = entries.map((entry) => {
    const studentId = Number(entry?.student_id);
    if (!hasOwn(entry, 'student_id') || !Number.isInteger(studentId) || studentId <= 0) return entry;
    if (studentOwnerById.get(studentId) === normalizedOwnerId) return entry;

    const { student_id: originalStudentId, ...rest } = entry;
    changed = true;
    orphanedCount += 1;
    return {
      ...rest,
      orphaned: true,
      orphaned_student_id: originalStudentId,
      orphan_reason: orphanReason(studentId, studentOwnerById),
    };
  });

  return { entries: nextEntries, changed, orphanedCount };
};

export const normalizeAttendanceEntriesForRead = (entries = []) => (
  Array.isArray(entries)
    ? entries.map((entry) => {
      const studentId = Number(entry?.student_id);
      if (hasOwn(entry, 'student_id') && Number.isInteger(studentId) && studentId > 0) {
        return {
          student_id: studentId,
          status: String(entry?.status || ''),
          memo: String(entry?.memo || ''),
        };
      }
      if (entry?.orphaned === true && hasOwn(entry, 'orphaned_student_id')) {
        return {
          orphaned: true,
          orphaned_student_id: entry.orphaned_student_id,
          orphan_reason: String(entry?.orphan_reason || ''),
          status: String(entry?.status || ''),
          memo: String(entry?.memo || ''),
        };
      }
      return null;
    }).filter(Boolean)
    : []
);

export const findAttendanceEntriesIntegrityError = (entries, { attendanceId, ownerId, studentOwnerById }) => {
  if (!Array.isArray(entries)) return `attendance ${attendanceId} entries must be an array`;
  const seen = new Set();

  for (const entry of entries) {
    if (hasOwn(entry, 'student_id')) {
      const studentId = Number(entry?.student_id);
      if (!Number.isInteger(studentId) || studentId <= 0) return `attendance ${attendanceId} has invalid student id`;
      if (entry?.orphaned === true || hasOwn(entry, 'orphaned_student_id')) {
        return `attendance ${attendanceId} mixes active and orphan student references: ${studentId}`;
      }
      if (seen.has(studentId)) return `attendance ${attendanceId} has duplicate student id: ${studentId}`;
      if (studentOwnerById.get(studentId) !== Number(ownerId)) {
        return `attendance ${attendanceId} references a missing or foreign student: ${studentId}`;
      }
      seen.add(studentId);
      continue;
    }

    if (entry?.orphaned !== true || !hasOwn(entry, 'orphaned_student_id') || !String(entry?.orphan_reason || '').trim()) {
      return `attendance ${attendanceId} has an unmarked orphan entry`;
    }
  }

  return '';
};

