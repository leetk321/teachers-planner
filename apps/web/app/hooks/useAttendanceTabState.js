'use client';

import { useMemo, useState } from 'react';
import { toSeoulYm, toSeoulYmd } from '../lib/date-time.js';

const compareStudentOrder = (a, b) => {
  const classCompare = String(a?.class_name || '').localeCompare(String(b?.class_name || ''), 'ko', { numeric: true });
  if (classCompare !== 0) return classCompare;
  const noA = Number(String(a?.student_no ?? '').replace(/[^0-9]/g, '')) || Number.MAX_SAFE_INTEGER;
  const noB = Number(String(b?.student_no ?? '').replace(/[^0-9]/g, '')) || Number.MAX_SAFE_INTEGER;
  if (noA !== noB) return noA - noB;
  return String(a?.name || '').localeCompare(String(b?.name || ''), 'ko');
};

const weekdayKeyByIdx = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri' };

export function useAttendanceTabState({ clubs, students, homeroomClass }) {
  const [attendanceDate, setAttendanceDate] = useState(() => toSeoulYmd());
  const [attendanceMode, setAttendanceMode] = useState('homeroom');
  const [attendanceClassName, setAttendanceClassName] = useState('');
  const [attendanceClubId, setAttendanceClubId] = useState('');
  const [attendancePeriod, setAttendancePeriod] = useState('1교시');
  const [attendanceSavedDates, setAttendanceSavedDates] = useState([]);
  const [attendanceSavedItems, setAttendanceSavedItems] = useState([]);
  const [attendanceSavedMonth, setAttendanceSavedMonth] = useState(() => toSeoulYm());
  const [weekdayPeriods, setWeekdayPeriods] = useState({ mon: 7, tue: 7, wed: 7, thu: 7, fri: 7 });
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [attendanceLatest, setAttendanceLatest] = useState(null);

  const attendanceEligibleClubs = useMemo(
    () => [...(Array.isArray(clubs) ? clubs : [])]
      .filter((club) => club?.use_for_attendance)
      .sort((a, b) => (
        String(a?.name || '').localeCompare(String(b?.name || ''), 'ko', { numeric: true })
        || Number(a?.id || 0) - Number(b?.id || 0)
      )),
    [clubs]
  );
  const homeroomStudents = useMemo(
    () => (students || []).filter((student) => student.class_name === homeroomClass).sort(compareStudentOrder),
    [students, homeroomClass]
  );
  const selectedAttendanceClub = useMemo(() => attendanceEligibleClubs.find((club) => String(club.id) === String(attendanceClubId)) || null, [attendanceEligibleClubs, attendanceClubId]);
  const selectedAttendanceClubStudentIdSet = useMemo(() => new Set((selectedAttendanceClub?.student_ids || []).map((id) => String(id))), [selectedAttendanceClub]);
  const attendanceClubStudents = useMemo(() => students.filter((student) => selectedAttendanceClubStudentIdSet.has(String(student.id))).sort(compareStudentOrder), [students, selectedAttendanceClubStudentIdSet, compareStudentOrder]);
  const attendanceTargetSummary = useMemo(() => {
    if (attendanceMode === 'homeroom') return { classValue: homeroomClass, periodValue: '종합', label: homeroomClass || '담임반', students: homeroomStudents };
    if (attendanceMode === 'club') {
      return {
        classValue: selectedAttendanceClub ? `club:${selectedAttendanceClub.id}` : '',
        periodValue: attendancePeriod,
        label: [selectedAttendanceClub?.name || '선택', attendancePeriod].filter(Boolean).join(' / '),
        students: attendanceClubStudents,
      };
    }
    return {
      classValue: attendanceClassName,
      periodValue: attendancePeriod,
      label: [attendanceClassName, attendancePeriod].filter(Boolean).join(' '),
      students: students.filter((student) => !attendanceClassName || student.class_name === attendanceClassName).sort(compareStudentOrder),
    };
  }, [attendanceMode, homeroomClass, homeroomStudents, selectedAttendanceClub, attendanceClubStudents, attendanceClassName, attendancePeriod, students, compareStudentOrder]);

  const attendanceWeekdayIdx = useMemo(() => new Date(`${attendanceDate}T00:00:00`).getDay(), [attendanceDate]);
  const attendanceMaxPeriod = useMemo(() => {
    const key = weekdayKeyByIdx[attendanceWeekdayIdx];
    return key ? Math.max(1, Number(weekdayPeriods[key] || 7)) : 7;
  }, [attendanceWeekdayIdx, weekdayPeriods]);
  const filteredAttendanceSavedItems = useMemo(() => (attendanceSavedItems || []).filter((it) => String(it.date || '').slice(0, 7) === attendanceSavedMonth), [attendanceSavedItems, attendanceSavedMonth]);

  return {
    attendanceDate,
    setAttendanceDate,
    attendanceMode,
    setAttendanceMode,
    attendanceClassName,
    setAttendanceClassName,
    attendanceClubId,
    setAttendanceClubId,
    attendancePeriod,
    setAttendancePeriod,
    attendanceSavedDates,
    setAttendanceSavedDates,
    attendanceSavedItems,
    setAttendanceSavedItems,
    attendanceSavedMonth,
    setAttendanceSavedMonth,
    weekdayPeriods,
    setWeekdayPeriods,
    attendanceRows,
    setAttendanceRows,
    attendanceLatest,
    setAttendanceLatest,
    attendanceEligibleClubs,
    homeroomStudents,
    selectedAttendanceClub,
    selectedAttendanceClubStudentIdSet,
    attendanceClubStudents,
    attendanceTargetSummary,
    attendanceWeekdayIdx,
    attendanceMaxPeriod,
    filteredAttendanceSavedItems,
  };
}
