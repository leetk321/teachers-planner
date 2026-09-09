'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { draftStatusLabel, useServerDraft } from './useServerDraft.js';

const NEW_ISSUE_ID = '__new__';
const ISSUE_STUDENT_ROLES = ['attacker', 'victim', 'related'];

const toDateTimeLocal = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '').slice(0, 16);
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const buildStudentCode = (student) => {
  const classMatch = String(student?.class_name || '').replace(/\s/g, '').match(/^(\d+)-(\d+)$/);
  const studentNo = Number(student?.student_no);
  if (!classMatch || !Number.isFinite(studentNo)) return '';
  return `${classMatch[1]}${String(Number(classMatch[2])).padStart(2, '0')}${String(studentNo).padStart(2, '0')}`;
};

const normalizeIssueStudents = (rows, students) => {
  const rowKeyCounts = new Map();
  return (Array.isArray(rows) ? rows : [])
    .map((item) => {
      const studentId = Number(item?.student_id ?? item?.studentId ?? 0);
      const current = (Array.isArray(students) ? students : []).find((student) => Number(student.id) === studentId);
      const role = String(item?.role || 'related');
      const studentCode = current ? buildStudentCode(current) : String(item?.student_code ?? item?.studentCode ?? '').trim();
      const studentName = current ? String(current.name || '') : String(item?.student_name ?? item?.studentName ?? item?.name ?? '').trim();
      const storedRowKey = String(item?.row_key ?? item?.rowKey ?? '').trim();
      const baseRowKey = storedRowKey || (studentId > 0
        ? `student:${studentId}`
        : `legacy:${encodeURIComponent(studentCode)}:${encodeURIComponent(studentName)}`);
      const occurrence = rowKeyCounts.get(baseRowKey) || 0;
      rowKeyCounts.set(baseRowKey, occurrence + 1);
      return {
        row_key: occurrence ? `${baseRowKey}:${occurrence}` : baseRowKey,
        student_id: studentId,
        student_code: studentCode,
        student_name: studentName,
        role: ISSUE_STUDENT_ROLES.includes(role) ? role : 'related',
      };
    })
    .filter((item) => item.student_id || item.student_code || item.student_name);
};

const restorableAttachments = (attachments) => (Array.isArray(attachments) ? attachments : [])
  .filter((item) => !item?.draft_file && (Number(item?.id || 0) > 0 || String(item?.url || '')));

const nextCaseNumber = (issues, academicYear) => {
  const year = String(academicYear || new Date().getFullYear());
  const maxNo = (Array.isArray(issues) ? issues : []).reduce((max, issue) => {
    const match = String(issue?.case_no || '').match(/^(\d{4})-(\d+)호$/);
    if (!match || match[1] !== year) return max;
    return Math.max(max, Number(match[2]) || 0);
  }, 0);
  return `${year}-${String(maxNo + 1).padStart(2, '0')}호`;
};

export function useIssuesTabState({ issues, consultations, students, academicYear, activeTab, apiFetch }) {
  const [selectedIssueId, setSelectedIssueId] = useState('');
  const [issueCaseNo, setIssueCaseNo] = useState('');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueStatus, setIssueStatus] = useState('open');
  const [issueStudentQuery, setIssueStudentQuery] = useState('');
  const [issueStudentRole, setIssueStudentRole] = useState('related');
  const [issueStudentsDraft, setIssueStudentsDraft] = useState([]);
  const [consultationType, setConsultationType] = useState('student');
  const [consultationParticipantName, setConsultationParticipantName] = useState('');
  const [consultationStudentId, setConsultationStudentId] = useState('');
  const [consultationAt, setConsultationAt] = useState(toDateTimeLocal());
  const [consultationContent, setConsultationContent] = useState('');
  const [consultationAttachments, setConsultationAttachments] = useState([]);
  const [consultationNameFilter, setConsultationNameFilter] = useState('');
  const [editingConsultationId, setEditingConsultationId] = useState('');
  const [expandedConsultations, setExpandedConsultations] = useState({});
  const [issueTouched, setIssueTouched] = useState(false);
  const [consultationTouched, setConsultationTouched] = useState(false);
  const hydratedIssueIdRef = useRef('');

  const isCreatingIssue = selectedIssueId === NEW_ISSUE_ID;
  const studentsWithCodes = useMemo(() => (Array.isArray(students) ? students : []).map((student) => ({
    ...student,
    student_code: buildStudentCode(student),
  })), [students]);
  const selectedIssue = useMemo(
    () => (isCreatingIssue ? null : (Array.isArray(issues) ? issues : []).find((item) => String(item.id) === String(selectedIssueId)) || null),
    [issues, selectedIssueId, isCreatingIssue],
  );
  const filteredConsultations = useMemo(() => {
    const query = String(consultationNameFilter || '').trim().toLowerCase();
    return (Array.isArray(consultations) ? consultations : [])
      .filter((item) => !query || String(item.participant_name || '').toLowerCase().includes(query))
      .sort((a, b) => String(a.consulted_at || '').localeCompare(String(b.consulted_at || '')) || Number(a.id || 0) - Number(b.id || 0));
  }, [consultations, consultationNameFilter]);
  const issueStudentSearchResults = useMemo(() => {
    const query = String(issueStudentQuery || '').trim().toLowerCase();
    if (!query) return [];
    return studentsWithCodes
      .filter((student) => String(student.student_code || '').includes(query) || String(student.name || '').toLowerCase().includes(query))
      .slice(0, 10);
  }, [issueStudentQuery, studentsWithCodes]);
  const consultationStudentSearchResults = useMemo(() => {
    const query = String(consultationParticipantName || '').trim().toLowerCase();
    if (!query || consultationStudentId) return [];
    const assignedIds = new Set(issueStudentsDraft.map((item) => Number(item.student_id)).filter(Boolean));
    const candidates = assignedIds.size
      ? studentsWithCodes.filter((student) => assignedIds.has(Number(student.id)))
      : studentsWithCodes;
    return candidates
      .filter((student) => String(student.student_code || '').includes(query) || String(student.name || '').toLowerCase().includes(query))
      .slice(0, 10);
  }, [consultationParticipantName, consultationStudentId, issueStudentsDraft, studentsWithCodes]);

  const resetConsultationForm = () => {
    setEditingConsultationId('');
    setConsultationType('student');
    setConsultationParticipantName('');
    setConsultationStudentId('');
    setConsultationAt(toDateTimeLocal());
    setConsultationContent('');
    setConsultationAttachments([]);
    setConsultationTouched(false);
  };

  const editConsultation = async (consultation) => {
    if (!consultation?.id) return;
    if (consultationTouched && !(await consultationDraft.flushDraft())) {
      window.alert('작성 중인 상담 초안을 저장하지 못해 다른 상담 기록으로 이동하지 않았습니다.');
      return false;
    }
    setEditingConsultationId(String(consultation.id));
    setConsultationType(String(consultation.consultation_type || 'student'));
    setConsultationParticipantName(String(consultation.participant_name || ''));
    setConsultationStudentId(String(consultation.student_id || ''));
    setConsultationAt(toDateTimeLocal(consultation.consulted_at));
    setConsultationContent(String(consultation.content || ''));
    setConsultationAttachments(Array.isArray(consultation.attachments) ? consultation.attachments : []);
    setConsultationTouched(false);
    return true;
  };

  const toggleConsultationExpanded = (consultationId) => {
    const key = String(consultationId);
    setExpandedConsultations((previous) => ({ ...previous, [key]: !previous[key] }));
  };

  const startNewIssue = async () => {
    if (isCreatingIssue && issueTouched) {
      if (!(await issueDraft.flushDraft())) {
        window.alert('작성 중인 사안 초안을 저장하지 못해 새 사안으로 전환하지 않았습니다.');
        return false;
      }
      if (!window.confirm('작성 중인 새 사안 초안을 비우고 다시 시작할까요?')) return false;
      void issueDraft.clearDraft();
    } else if (issueTouched) {
      if (!(await issueDraft.flushDraft())) {
        window.alert('작성 중인 사안 초안을 저장하지 못해 새 사안으로 전환하지 않았습니다.');
        return false;
      }
    } else {
      void issueDraft.clearDraft();
    }
    if (consultationTouched && !(await consultationDraft.flushDraft())) {
      window.alert('작성 중인 상담 초안을 저장하지 못해 새 사안으로 전환하지 않았습니다.');
      return false;
    }
    setSelectedIssueId(NEW_ISSUE_ID);
    setIssueCaseNo(nextCaseNumber(issues, academicYear));
    setIssueTitle('');
    setIssueStatus('open');
    setIssueStudentQuery('');
    setIssueStudentRole('related');
    setIssueStudentsDraft([]);
    setConsultationNameFilter('');
    setIssueTouched(false);
    resetConsultationForm();
    return true;
  };

  const selectIssue = async (id) => {
    if (issueTouched && !(await issueDraft.flushDraft())) {
      window.alert('작성 중인 사안 초안을 저장하지 못해 다른 사안으로 이동하지 않았습니다.');
      return false;
    }
    if (consultationTouched && !(await consultationDraft.flushDraft())) {
      window.alert('작성 중인 상담 초안을 저장하지 못해 다른 사안으로 이동하지 않았습니다.');
      return false;
    }
    setSelectedIssueId(String(id));
    setIssueStudentQuery('');
    setConsultationNameFilter('');
    setIssueTouched(false);
    resetConsultationForm();
    return true;
  };

  const addIssueStudent = (student) => {
    if (!student?.id) return;
    const next = {
      row_key: `student:${Number(student.id)}`,
      student_id: Number(student.id),
      student_code: String(student.student_code || buildStudentCode(student)),
      student_name: String(student.name || ''),
      role: ISSUE_STUDENT_ROLES.includes(issueStudentRole) ? issueStudentRole : 'related',
    };
    setIssueStudentsDraft((previous) => {
      const exists = previous.some((item) => Number(item.student_id) === Number(next.student_id));
      return exists
        ? previous.map((item) => (Number(item.student_id) === Number(next.student_id) ? { ...item, role: next.role, student_code: next.student_code, student_name: next.student_name } : item))
        : [...previous, next];
    });
    setIssueTouched(true);
    setIssueStudentQuery('');
  };

  const updateIssueStudentRole = (rowKey, role) => {
    if (!ISSUE_STUDENT_ROLES.includes(String(role))) return;
    setIssueStudentsDraft((previous) => previous.map((item) => (
      String(item.row_key) === String(rowKey) ? { ...item, role } : item
    )));
    setIssueTouched(true);
  };

  const removeIssueStudent = (rowKey) => {
    const target = issueStudentsDraft.find((item) => String(item.row_key) === String(rowKey));
    setIssueStudentsDraft((previous) => previous.filter((item) => String(item.row_key) !== String(rowKey)));
    setIssueTouched(true);
    if (target?.student_id && Number(consultationStudentId) === Number(target.student_id)) {
      setConsultationStudentId('');
      setConsultationParticipantName('');
    }
  };

  const changeConsultationStudentQuery = (value) => {
    setConsultationParticipantName(value);
    setConsultationStudentId('');
    setConsultationTouched(true);
  };

  const selectConsultationStudent = (student) => {
    setConsultationStudentId(String(student.id));
    setConsultationParticipantName(`${student.student_code || buildStudentCode(student)} ${student.name || ''}`.trim());
    setConsultationTouched(true);
  };

  useEffect(() => {
    if (isCreatingIssue) return;
    if (!issues?.length) {
      if (selectedIssueId) setSelectedIssueId('');
      return;
    }
    if (!issues.some((item) => String(item.id) === String(selectedIssueId))) {
      setSelectedIssueId(String(issues[0].id));
    }
  }, [issues, selectedIssueId, isCreatingIssue]);

  useEffect(() => {
    if (isCreatingIssue) {
      hydratedIssueIdRef.current = NEW_ISSUE_ID;
      return;
    }
    if (!selectedIssue) {
      hydratedIssueIdRef.current = '';
      setIssueCaseNo('');
      setIssueTitle('');
      setIssueStatus('open');
      setIssueStudentsDraft([]);
      return;
    }
    const issueId = String(selectedIssue.id);
    if (hydratedIssueIdRef.current === issueId) return;
    hydratedIssueIdRef.current = issueId;
    setIssueCaseNo(String(selectedIssue.case_no || ''));
    setIssueTitle(String(selectedIssue.title || ''));
    setIssueStatus(String(selectedIssue.status || 'open'));
    setIssueStudentsDraft(normalizeIssueStudents(selectedIssue.issue_students, studentsWithCodes));
    setIssueTouched(false);
  }, [selectedIssue, isCreatingIssue, studentsWithCodes]);

  useEffect(() => {
    const currentStudentsById = new Map(studentsWithCodes.map((student) => [Number(student.id), student]));
    setIssueStudentsDraft((previous) => {
      let changed = false;
      const next = previous.map((item) => {
        if (!item.student_id) return item;
        const current = currentStudentsById.get(Number(item.student_id));
        if (!current) return item;
        const studentCode = String(current.student_code || buildStudentCode(current));
        const studentName = String(current.name || '');
        if (item.student_code === studentCode && item.student_name === studentName) return item;
        changed = true;
        return { ...item, student_code: studentCode, student_name: studentName };
      });
      return changed ? next : previous;
    });
  }, [studentsWithCodes]);

  const issueDraftValue = useMemo(() => ({
    dirty: issueTouched,
    issueCaseNo,
    issueTitle,
    issueStatus,
    issueStudentsDraft,
  }), [issueTouched, issueCaseNo, issueTitle, issueStatus, issueStudentsDraft]);
  const consultationDraftValue = useMemo(() => ({
    dirty: consultationTouched,
    consultationType,
    consultationParticipantName,
    consultationStudentId,
    consultationAt,
    consultationContent,
    consultationAttachments,
  }), [consultationTouched, consultationType, consultationParticipantName, consultationStudentId, consultationAt, consultationContent, consultationAttachments]);

  const issueDraft = useServerDraft({
    apiFetch,
    draftKey: selectedIssueId ? `issue:${isCreatingIssue ? 'new' : selectedIssueId}` : '',
    active: activeTab === 'issues' && Boolean(selectedIssueId),
    value: issueDraftValue,
    shouldSave: issueTouched,
    isEmpty: (payload) => !payload?.dirty,
    canRestore: () => !issueTouched,
    onRestore: (payload) => {
      setIssueCaseNo(String(payload.issueCaseNo || ''));
      setIssueTitle(String(payload.issueTitle || ''));
      setIssueStatus(String(payload.issueStatus || 'open'));
      setIssueStudentsDraft(normalizeIssueStudents(payload.issueStudentsDraft, studentsWithCodes));
      setIssueTouched(false);
    },
  });
  const consultationDraft = useServerDraft({
    apiFetch,
    draftKey: selectedIssue?.id ? `issue-consultation:${selectedIssue.id}:${editingConsultationId || 'new'}` : '',
    active: activeTab === 'issues' && Boolean(selectedIssue?.id),
    value: consultationDraftValue,
    shouldSave: consultationTouched,
    isEmpty: (payload) => !payload?.dirty,
    canRestore: () => !consultationTouched,
    onRestore: (payload) => {
      setConsultationType(String(payload.consultationType || 'student'));
      setConsultationParticipantName(String(payload.consultationParticipantName || ''));
      setConsultationStudentId(String(payload.consultationStudentId || ''));
      setConsultationAt(String(payload.consultationAt || toDateTimeLocal()).slice(0, 16));
      setConsultationContent(String(payload.consultationContent || ''));
      setConsultationAttachments(restorableAttachments(payload.consultationAttachments));
      setConsultationTouched(false);
    },
  });

  const discardIssueDraft = async () => {
    await issueDraft.clearDraft();
    if (selectedIssue) {
      setIssueCaseNo(String(selectedIssue.case_no || ''));
      setIssueTitle(String(selectedIssue.title || ''));
      setIssueStatus(String(selectedIssue.status || 'open'));
      setIssueStudentsDraft(normalizeIssueStudents(selectedIssue.issue_students, studentsWithCodes));
    } else {
      setIssueCaseNo(nextCaseNumber(issues, academicYear));
      setIssueTitle('');
      setIssueStatus('open');
      setIssueStudentsDraft([]);
    }
    setIssueTouched(false);
  };

  const discardConsultationDraft = async () => {
    await consultationDraft.clearDraft();
    resetConsultationForm();
  };

  const confirmIssueSaved = async () => {
    await issueDraft.clearDraft();
    setIssueTouched(false);
  };

  const confirmConsultationSaved = async () => {
    await consultationDraft.clearDraft();
    setConsultationTouched(false);
  };

  const changeIssueCaseNo = (value) => { setIssueCaseNo(value); setIssueTouched(true); };
  const changeIssueTitle = (value) => { setIssueTitle(value); setIssueTouched(true); };
  const changeIssueStatus = (value) => { setIssueStatus(value); setIssueTouched(true); };
  const changeConsultationType = (value) => { setConsultationType(value); setConsultationTouched(true); };
  const changeConsultationAt = (value) => { setConsultationAt(value); setConsultationTouched(true); };
  const changeConsultationContent = (value) => { setConsultationContent(value); setConsultationTouched(true); };
  const changeConsultationAttachments = (value) => { setConsultationAttachments(value); setConsultationTouched(true); };

  return {
    issueState: {
      selectedIssueId,
      isCreatingIssue,
      issueCaseNo,
      issueTitle,
      issueStatus,
      issueStudentQuery,
      issueStudentRole,
      issueStudentsDraft,
      consultationType,
      consultationParticipantName,
      consultationStudentId,
      consultationAt,
      consultationContent,
      consultationAttachments,
      consultationNameFilter,
      editingConsultationId,
      expandedConsultations,
    },
    issueSetters: {
      setSelectedIssueId,
      setIssueCaseNo: changeIssueCaseNo,
      setIssueTitle: changeIssueTitle,
      setIssueStatus: changeIssueStatus,
      setIssueStudentQuery,
      setIssueStudentRole,
      setConsultationType: changeConsultationType,
      setConsultationAt: changeConsultationAt,
      setConsultationContent: changeConsultationContent,
      setConsultationAttachments: changeConsultationAttachments,
      setConsultationNameFilter,
    },
    issueDerived: {
      selectedIssue,
      filteredConsultations,
      issueStudentSearchResults,
      consultationStudentSearchResults,
    },
    issueActions: {
      startNewIssue,
      selectIssue,
      addIssueStudent,
      updateIssueStudentRole,
      removeIssueStudent,
      changeConsultationStudentQuery,
      selectConsultationStudent,
      resetConsultationForm,
      editConsultation,
      cancelConsultationEdit: discardConsultationDraft,
      toggleConsultationExpanded,
      confirmIssueSaved,
      confirmConsultationSaved,
    },
    issueDrafts: {
      issue: {
        status: issueDraft.status,
        label: draftStatusLabel(issueDraft.status),
        recovered: issueDraft.recovered,
        discard: discardIssueDraft,
      },
      consultation: {
        status: consultationDraft.status,
        label: draftStatusLabel(consultationDraft.status),
        recovered: consultationDraft.recovered,
        discard: discardConsultationDraft,
      },
    },
  };
}
