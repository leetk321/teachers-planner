'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { toSeoulYmd } from '../lib/date-time.js';
import { draftStatusLabel, useServerDraft } from './useServerDraft.js';

const restorableAttachments = (attachments) => (Array.isArray(attachments) ? attachments : [])
  .filter((item) => !item?.draft_file && (Number(item?.id || 0) > 0 || String(item?.url || '')));

export function useStudentsTabState({
  students,
  notes,
  clubsByStudentId,
  homeroomClass,
  activeTab,
  attendanceMode,
  attendanceClassName,
  setAttendanceClassName,
  isTransferredStudent,
  apiFetch,
  editingIssueConsultation,
}) {
  const [studentName, setStudentName] = useState('');
  const [studentNo, setStudentNo] = useState('');
  const [className, setClassName] = useState('');
  const [riskLevel, setRiskLevel] = useState('normal');
  const [studentNameQuery, setStudentNameQuery] = useState('');
  const [studentNoteQuery, setStudentNoteQuery] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState('all');
  const [showTransferredStudents, setShowTransferredStudents] = useState(false);
  const [riskLevelOpen, setRiskLevelOpen] = useState(false);
  const [studentClassFilterOpen, setStudentClassFilterOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [studentManagePanelOpen, setStudentManagePanelOpen] = useState(false);
  const [studentBasicMemoEditMode, setStudentBasicMemoEditMode] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [detailName, setDetailName] = useState('');
  const [detailClassName, setDetailClassName] = useState('');
  const [detailStudentNo, setDetailStudentNo] = useState('');
  const [detailRiskLevel, setDetailRiskLevel] = useState('normal');
  const [studentPhone, setStudentPhone] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [studentGender, setStudentGender] = useState('');
  const [studentBirthDate, setStudentBirthDate] = useState('');
  const [studentBasicInfo, setStudentBasicInfo] = useState('');
  const [studentBasicSurvey, setStudentBasicSurvey] = useState('');
  const [transferDateInput, setTransferDateInput] = useState('');
  const [studentInfoEditMode, setStudentInfoEditMode] = useState(false);
  const [studentPhotos, setStudentPhotos] = useState({});
  const [noteCategory, setNoteCategory] = useState('general');
  const [noteCategoryOpen, setNoteCategoryOpen] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteAttachments, setNoteAttachments] = useState([]);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteTouched, setNoteTouched] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState({});
  const [pdfSelectedIds, setPdfSelectedIds] = useState(new Set());

  const deferredStudentNameQuery = useDeferredValue(studentNameQuery);
  const deferredStudentNoteQuery = useDeferredValue(studentNoteQuery);

  const filteredStudents = useMemo(() => {
    const nq = deferredStudentNameQuery.trim().toLowerCase();
    return students.filter((s) => {
      const nameOk = !nq || String(s.name || '').toLowerCase().includes(nq);
      const classOk = studentClassFilter === 'all' ? true : String(s.class_name || '') === studentClassFilter;
      const transferOk = showTransferredStudents ? true : !isTransferredStudent(s);
      return nameOk && classOk && transferOk;
    });
  }, [students, deferredStudentNameQuery, studentClassFilter, showTransferredStudents, isTransferredStudent]);

  const studentNoteMatchedStudents = useMemo(() => {
    const q = String(deferredStudentNoteQuery || '').trim().toLowerCase();
    if (!q) return [];
    return students.filter((s) => notes.some((n) => String(n.student_id) === String(s.id) && String(n.content || '').toLowerCase().includes(q)));
  }, [students, notes, deferredStudentNoteQuery]);

  const sortedFilteredStudents = useMemo(() => {
    const toNo = (v) => {
      const n = Number(String(v ?? '').replace(/[^0-9]/g, ''));
      return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
    };
    return [...filteredStudents].sort((a, b) => {
      const classCompare = String(a.class_name || '').localeCompare(String(b.class_name || ''), undefined, { numeric: true });
      if (classCompare !== 0) return classCompare;
      const diff = toNo(a.student_no) - toNo(b.student_no);
      if (diff !== 0) return diff;
      return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
    });
  }, [filteredStudents]);

  const selectedClassCount = useMemo(() => (studentClassFilter === 'all' ? 0 : sortedFilteredStudents.length), [studentClassFilter, sortedFilteredStudents]);
  const effectiveStudentClass = useMemo(() => {
    const selectedClass = String(studentClassFilter || '').trim();
    if (selectedClass && selectedClass !== 'all') return selectedClass;
    return String(homeroomClass || '').trim();
  }, [studentClassFilter, homeroomClass]);

  const preferredStudents = useMemo(() => {
    if (!effectiveStudentClass) return sortedFilteredStudents;
    const inClass = sortedFilteredStudents.filter((s) => String(s.class_name || '') === effectiveStudentClass);
    return inClass.length ? inClass : sortedFilteredStudents;
  }, [sortedFilteredStudents, effectiveStudentClass]);

  const activeStudents = useMemo(() => students.filter((s) => !isTransferredStudent(s)), [students, isTransferredStudent]);
  const activeStudentsWithBirthdays = useMemo(() => activeStudents.filter((s) => !!s.birth_date), [activeStudents]);
  const selectedStudent = useMemo(() => students.find((s) => String(s.id) === String(selectedStudentId)), [students, selectedStudentId]);
  const selectedStudentNotes = useMemo(() => notes.filter((n) => String(n.student_id) === String(selectedStudentId)).sort((a, b) => String(b.note_date).localeCompare(String(a.note_date))), [notes, selectedStudentId]);
  const allClasses = useMemo(() => Array.from(new Set(students.map((s) => s.class_name).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })), [students]);
  const selectedStudentClubs = useMemo(() => clubsByStudentId[String(selectedStudentId)] || [], [clubsByStudentId, selectedStudentId]);

  const prevSelectedStudentIdRef = useRef('');
  useEffect(() => {
    const currentId = String(selectedStudentId || '');
    const changedStudent = prevSelectedStudentIdRef.current !== currentId;
    prevSelectedStudentIdRef.current = currentId;

    if (!selectedStudent) {
      setStudentPhone('');
      setGuardianPhone('');
      setStudentGender('');
      setStudentBirthDate('');
      setStudentBasicInfo('');
      setStudentBasicSurvey('');
      setTransferDateInput('');
      setStudentInfoEditMode(false);
      setStudentBasicMemoEditMode(false);
      return;
    }

    if (changedStudent || !studentInfoEditMode) {
      setStudentPhone(String(selectedStudent.student_phone || ''));
      setGuardianPhone(String(selectedStudent.guardian_phone || ''));
      setStudentGender(String(selectedStudent.gender || ''));
      setStudentBirthDate(String(selectedStudent.birth_date || '').slice(0, 10));
      setStudentBasicInfo(String(selectedStudent.basic_info || ''));
      setTransferDateInput(String(selectedStudent.transferred_at || '').slice(0, 10) || toSeoulYmd());
    }

    if (changedStudent || !studentBasicMemoEditMode) {
      setStudentBasicSurvey(String(selectedStudent.basic_survey || ''));
    }

    if (changedStudent) {
      setStudentInfoEditMode(false);
      setStudentBasicMemoEditMode(false);
    }
  }, [selectedStudent, selectedStudentId, studentInfoEditMode, studentBasicMemoEditMode]);

  useEffect(() => {
    if (attendanceMode !== 'course') return;
    if (attendanceClassName) return;
    if (homeroomClass) {
      setAttendanceClassName(homeroomClass);
      return;
    }
    if (allClasses[0]) setAttendanceClassName(String(allClasses[0]));
  }, [attendanceMode, attendanceClassName, homeroomClass, allClasses, setAttendanceClassName]);

  useEffect(() => {
    if (studentClassFilter !== 'all') return;
    const hr = String(homeroomClass || '').trim();
    if (!hr) return;
    if (allClasses.includes(hr)) setStudentClassFilter(hr);
  }, [studentClassFilter, homeroomClass, allClasses]);

  const prevPreferredClassRef = useRef('');
  useEffect(() => {
    const classChanged = prevPreferredClassRef.current !== effectiveStudentClass;
    prevPreferredClassRef.current = effectiveStudentClass;
    if (!preferredStudents.length) {
      if (selectedStudentId) setSelectedStudentId('');
      return;
    }
    const hasSelectedStudent = preferredStudents.some((s) => String(s.id) === String(selectedStudentId));
    if (classChanged || !hasSelectedStudent) {
      setSelectedStudentId(String(preferredStudents[0].id));
    }
  }, [preferredStudents, effectiveStudentClass, selectedStudentId]);

  useEffect(() => {
    if (activeTab !== 'students') return;
    const onKeyDown = (e) => {
      const t = e.target;
      const tag = String(t?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const list = preferredStudents;
      if (!list.length) return;
      const currentIdx = list.findIndex((s) => String(s.id) === String(selectedStudentId));
      const nextIdx = currentIdx < 0
        ? (e.key === 'ArrowDown' ? 0 : list.length - 1)
        : (e.key === 'ArrowDown' ? Math.min(list.length - 1, currentIdx + 1) : Math.max(0, currentIdx - 1));
      const nextStudent = list[nextIdx];
      if (!nextStudent) return;
      e.preventDefault();
      setSelectedStudentId(String(nextStudent.id));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, preferredStudents, selectedStudentId]);

  const riskBadge = (risk) => {
    const normalized = String(risk || 'normal');
    if (normalized === 'focus' || normalized === 'high') return { label: '집중', bg: '#fee2e2', color: '#b91c1c' };
    if (normalized === 'watch') return { label: '관심', bg: '#fef3c7', color: '#92400e' };
    return { label: '일반', bg: '#dcfce7', color: '#166534' };
  };

  const noteCategoryMeta = (cat) => {
    const c = String(cat || 'general');
    if (c === 'issue_student') return { label: '사안-학생', bg: '#fee2e2', color: '#b91c1c' };
    if (c === 'issue_guardian') return { label: '사안-보호자', bg: '#f3e8ff', color: '#7e22ce' };
    if (c === 'class') return { label: '수업', bg: '#dbeafe', color: '#1d4ed8' };
    if (c === 'guidance') return { label: '생활지도', bg: '#fee2e2', color: '#b91c1c' };
    if (c === 'parent') return { label: '보호자', bg: '#ede9fe', color: '#6d28d9' };
    if (c === 'observe') return { label: '관찰', bg: '#ecfeff', color: '#0e7490' };
    return { label: '일반', bg: '#e2e8f0', color: '#334155' };
  };

  const noteDraftValue = useMemo(() => ({
    dirty: noteTouched,
    noteCategory,
    noteContent,
    noteAttachments,
  }), [noteTouched, noteCategory, noteContent, noteAttachments]);
  const noteDraftKey = selectedStudentId
    ? (editingIssueConsultation?.id
      ? `student-issue-consultation:${editingIssueConsultation.issueId}:${editingIssueConsultation.id}`
      : `student-note:${selectedStudentId}:${editingNoteId || 'new'}`)
    : '';
  const noteDraft = useServerDraft({
    apiFetch,
    draftKey: noteDraftKey,
    active: activeTab === 'students' && Boolean(selectedStudentId),
    value: noteDraftValue,
    shouldSave: noteTouched,
    isEmpty: (payload) => !payload?.dirty,
    canRestore: () => !noteTouched,
    onRestore: (payload) => {
      setNoteCategory(String(payload.noteCategory || 'general'));
      setNoteContent(String(payload.noteContent || ''));
      setNoteAttachments(restorableAttachments(payload.noteAttachments));
      setNoteTouched(false);
    },
  });

  const resetNoteFields = () => {
    setEditingNoteId(null);
    setNoteCategory('general');
    setNoteContent('');
    setNoteAttachments([]);
    setNoteTouched(false);
  };

  const beginStudentNoteEdit = ({ id = null, category = 'general', content = '', attachments = [] } = {}) => {
    if (noteTouched) void noteDraft.flushDraft();
    setEditingNoteId(id);
    setNoteCategory(String(category || 'general'));
    setNoteContent(String(content || ''));
    setNoteAttachments(Array.isArray(attachments) ? attachments : []);
    setNoteTouched(false);
  };

  const confirmStudentNoteSaved = async () => {
    await noteDraft.clearDraft();
    resetNoteFields();
  };

  const startNewStudentNote = () => {
    if (noteTouched) {
      void noteDraft.flushDraft();
      return false;
    }
    void noteDraft.clearDraft();
    resetNoteFields();
    return true;
  };

  const previousNoteStudentIdRef = useRef(String(selectedStudentId || ''));
  useEffect(() => {
    const currentStudentId = String(selectedStudentId || '');
    const previousStudentId = previousNoteStudentIdRef.current;
    previousNoteStudentIdRef.current = currentStudentId;
    if (!previousStudentId || previousStudentId === currentStudentId) return;
    resetNoteFields();
  }, [selectedStudentId]);

  const discardStudentNoteDraft = async () => {
    await noteDraft.clearDraft();
    const original = editingIssueConsultation?.id
      ? selectedStudentNotes.find((item) => item?.source === 'issue' && String(item.issue_consultation_id) === String(editingIssueConsultation.id))
      : selectedStudentNotes.find((item) => item?.source !== 'issue' && String(item.id) === String(editingNoteId));
    if (original) {
      setNoteCategory(String(original.category || 'general'));
      setNoteContent(String(original.content || ''));
      setNoteAttachments(Array.isArray(original.attachments) ? original.attachments : []);
      setNoteTouched(false);
      return;
    }
    resetNoteFields();
  };

  const changeNoteCategory = (value) => { setNoteCategory(value); setNoteTouched(true); };
  const changeNoteContent = (value) => { setNoteContent(value); setNoteTouched(true); };
  const changeNoteAttachments = (value) => {
    setNoteAttachments((previous) => (typeof value === 'function' ? value(previous) : value));
    setNoteTouched(true);
  };

  return {
    studentState: {
      studentName,
      studentNo,
      className,
      riskLevel,
      studentNameQuery,
      studentNoteQuery,
      studentClassFilter,
      showTransferredStudents,
      riskLevelOpen,
      studentClassFilterOpen,
      bulkText,
      studentManagePanelOpen,
      studentBasicMemoEditMode,
      selectedStudentId,
      editingStudentId,
      detailName,
      detailClassName,
      detailStudentNo,
      detailRiskLevel,
      studentPhone,
      guardianPhone,
      studentGender,
      studentBirthDate,
      studentBasicInfo,
      studentBasicSurvey,
      transferDateInput,
      studentInfoEditMode,
      studentPhotos,
      noteCategory,
      noteCategoryOpen,
      noteContent,
      noteAttachments,
      editingNoteId,
      expandedNotes,
      pdfSelectedIds,
    },
    studentSetters: {
      setStudentName,
      setStudentNo,
      setClassName,
      setRiskLevel,
      setStudentNameQuery,
      setStudentNoteQuery,
      setStudentClassFilter,
      setShowTransferredStudents,
      setRiskLevelOpen,
      setStudentClassFilterOpen,
      setBulkText,
      setStudentManagePanelOpen,
      setStudentBasicMemoEditMode,
      setSelectedStudentId,
      setEditingStudentId,
      setDetailName,
      setDetailClassName,
      setDetailStudentNo,
      setDetailRiskLevel,
      setStudentPhone,
      setGuardianPhone,
      setStudentGender,
      setStudentBirthDate,
      setStudentBasicInfo,
      setStudentBasicSurvey,
      setTransferDateInput,
      setStudentInfoEditMode,
      setStudentPhotos,
      setNoteCategory: changeNoteCategory,
      setNoteCategoryOpen,
      setNoteContent: changeNoteContent,
      setNoteAttachments: changeNoteAttachments,
      setEditingNoteId,
      setExpandedNotes,
      setPdfSelectedIds,
    },
    studentDerived: {
      filteredStudents,
      studentNoteMatchedStudents,
      sortedFilteredStudents,
      selectedClassCount,
      effectiveStudentClass,
      preferredStudents,
      activeStudents,
      activeStudentsWithBirthdays,
      selectedStudent,
      selectedStudentNotes,
      allClasses,
      selectedStudentClubs,
      riskBadge,
      noteCategoryMeta,
    },
    studentActions: {
      beginStudentNoteEdit,
      confirmStudentNoteSaved,
      startNewStudentNote,
    },
    studentDrafts: {
      note: {
        status: noteDraft.status,
        label: draftStatusLabel(noteDraft.status),
        recovered: noteDraft.recovered,
        discard: discardStudentNoteDraft,
      },
    },
  };
}
