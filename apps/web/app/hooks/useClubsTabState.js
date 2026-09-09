'use client';

import { useDeferredValue, useMemo, useState } from 'react';

const sortClubList = (rows) => [...(Array.isArray(rows) ? rows : [])].sort((a, b) => (
  String(a?.name || '').localeCompare(String(b?.name || ''), 'ko', { numeric: true })
  || Number(a?.id || 0) - Number(b?.id || 0)
));

const compareStudentOrder = (a, b) => {
  const classCompare = String(a?.class_name || '').localeCompare(String(b?.class_name || ''), 'ko', { numeric: true });
  if (classCompare !== 0) return classCompare;
  const noA = Number(String(a?.student_no ?? '').replace(/[^0-9]/g, '')) || Number.MAX_SAFE_INTEGER;
  const noB = Number(String(b?.student_no ?? '').replace(/[^0-9]/g, '')) || Number.MAX_SAFE_INTEGER;
  if (noA !== noB) return noA - noB;
  return String(a?.name || '').localeCompare(String(b?.name || ''), 'ko');
};

export function useClubsTabState({ clubs, students }) {
  const [selectedClubId, setSelectedClubId] = useState('');
  const [editingClubId, setEditingClubId] = useState(null);
  const [clubNameDraft, setClubNameDraft] = useState('');
  const [clubAttendanceEnabled, setClubAttendanceEnabled] = useState(false);
  const [clubStudentQuery, setClubStudentQuery] = useState('');

  const deferredClubStudentQuery = useDeferredValue(clubStudentQuery);

  const sortedClubs = useMemo(() => sortClubList(clubs), [clubs]);
  const selectedClub = useMemo(() => sortedClubs.find((club) => String(club.id) === String(selectedClubId)) || null, [sortedClubs, selectedClubId]);
  const attendanceEligibleClubs = useMemo(() => sortedClubs.filter((club) => club.use_for_attendance), [sortedClubs]);
  const clubsByStudentId = useMemo(() => {
    const out = {};
    sortedClubs.forEach((club) => {
      (club.student_ids || []).forEach((studentId) => {
        const key = String(studentId);
        if (!out[key]) out[key] = [];
        out[key].push(club);
      });
    });
    return out;
  }, [sortedClubs]);
  const selectedClubStudentIdSet = useMemo(() => new Set((selectedClub?.student_ids || []).map((id) => String(id))), [selectedClub]);
  const clubStudentSearch = useMemo(() => String(deferredClubStudentQuery || '').trim().toLowerCase(), [deferredClubStudentQuery]);
  const filteredClubStudents = useMemo(() => (
    [...students]
      .sort(compareStudentOrder)
      .filter((student) => {
        if (!clubStudentSearch) return true;
        return `${String(student.class_name || '')} ${String(student.student_no || '')} ${String(student.name || '')}`.toLowerCase().includes(clubStudentSearch);
      })
  ), [students, clubStudentSearch]);

  return {
    selectedClubId,
    setSelectedClubId,
    editingClubId,
    setEditingClubId,
    clubNameDraft,
    setClubNameDraft,
    clubAttendanceEnabled,
    setClubAttendanceEnabled,
    clubStudentQuery,
    setClubStudentQuery,
    sortedClubs,
    selectedClub,
    attendanceEligibleClubs,
    clubsByStudentId,
    selectedClubStudentIdSet,
    filteredClubStudents,
  };
}
