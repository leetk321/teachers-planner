'use client';

import dynamic from 'next/dynamic';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import DatePicker from 'react-datepicker';
import { ko } from 'date-fns/locale';
import { DashboardTab } from './components/tabs/DashboardTab.js';
import { MemosTab } from './components/tabs/MemosTab.js';
import { StudentsTab } from './components/tabs/StudentsTab.js';
import { AuthScreen } from './components/auth/AuthScreen.js';
import { AttachmentLinks, AttachmentPicker } from './components/common/AttachmentPicker.js';
import { QuickRecordPalette } from './components/common/QuickRecordPalette.js';
import { useAttendanceTabState } from './hooks/useAttendanceTabState.js';
import { toSeoulDateTimeLocal, toSeoulYmd } from './lib/date-time.js';
import { useClubsTabState } from './hooks/useClubsTabState.js';
import { useIssuesTabState } from './hooks/useIssuesTabState.js';
import { useMemosTabState } from './hooks/useMemosTabState.js';
import { useStudentsTabState } from './hooks/useStudentsTabState.js';
import { useTasksTabState } from './hooks/useTasksTabState.js';

const SearchTab = dynamic(() => import('./components/tabs/SearchTab.js').then((mod) => mod.SearchTab));
const SettingsTab = dynamic(() => import('./components/tabs/SettingsTab.js').then((mod) => mod.SettingsTab));
const TimetableTab = dynamic(() => import('./components/tabs/TimetableTab.js').then((mod) => mod.TimetableTab));
const FilesTab = dynamic(() => import('./components/tabs/FilesTab.js').then((mod) => mod.FilesTab));
const PatchNotesView = dynamic(() => import('./components/common/PatchNotesView.js').then((mod) => mod.PatchNotesView));
const ClubsTab = dynamic(() => import('./components/tabs/ClubsTab.js').then((mod) => mod.ClubsTab));
const IssuesTab = dynamic(() => import('./components/tabs/IssuesTab.js').then((mod) => mod.IssuesTab));
const TasksTab = dynamic(() => import('./components/tabs/TasksTab.js').then((mod) => mod.TasksTab));
const AttendanceTab = dynamic(() => import('./components/tabs/AttendanceTab.js').then((mod) => mod.AttendanceTab));

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
const APP_VERSION = 'v3.16.0';
const STUDENT_BASIC_SURVEY_PDF_ID = '__student_basic_survey__';
const FILES_TAB_CACHE_MS = 60_000;
const FILES_TAB_PARTIAL_RETRY_MS = 15_000;

const KR_HOLIDAYS_FALLBACK = {
  2026: {
    '2026-01-01': '신정',
    '2026-02-16': '설날 연휴',
    '2026-02-17': '설날',
    '2026-02-18': '설날 연휴',
    '2026-03-01': '삼일절',
    '2026-05-05': '어린이날',
    '2026-05-24': '부처님오신날',
    '2026-06-06': '현충일',
    '2026-08-15': '광복절',
    '2026-09-24': '추석 연휴',
    '2026-09-25': '추석',
    '2026-09-26': '추석 연휴',
    '2026-10-03': '개천절',
    '2026-10-09': '한글날',
    '2026-12-25': '성탄절',
  },
};

export default function Home() {
  const [authed, setAuthed] = useState(false);
  const [token, setToken] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [authName, setAuthName] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState('');
  const [rememberLogin, setRememberLogin] = useState(false);
  const [authError, setAuthError] = useState('');

  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobile, setIsMobile] = useState(false);
  const [isWebView, setIsWebView] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickRecordOpen, setQuickRecordOpen] = useState(false);

  const [schoolName, setSchoolName] = useState('');
  const [kmaServiceKey, setKmaServiceKey] = useState('');
  const [teacherDisplayName, setTeacherDisplayName] = useState('');
  const [academicYear, setAcademicYear] = useState(String(new Date().getFullYear()));
  const [homeroomClass, setHomeroomClass] = useState('');
  const [schoolCodeSetting, setSchoolCodeSetting] = useState('');
  const [teacherNoSetting, setTeacherNoSetting] = useState('');
  const [dashboardLunch, setDashboardLunch] = useState(null);
  const [dashboardLunchLoading, setDashboardLunchLoading] = useState(false);
  const [dashboardLunchError, setDashboardLunchError] = useState('');
  const [dashboardWeather, setDashboardWeather] = useState(null);
  const [dashboardWeatherLoading, setDashboardWeatherLoading] = useState(false);
  const [dashboardWeatherError, setDashboardWeatherError] = useState('');

  const [students, setStudents] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [issues, setIssues] = useState([]);
  const [issueConsultations, setIssueConsultations] = useState([]);
  const [studentIssueConsultations, setStudentIssueConsultations] = useState([]);
  const [editingIssueConsultation, setEditingIssueConsultation] = useState(null);
  const [notes, setNotes] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [fileItems, setFileItems] = useState([]);
  const [fileSort, setFileSort] = useState('newest');
  const [fileDragActive, setFileDragActive] = useState(false);
  const [fileUploadState, setFileUploadState] = useState({ active: false, total: 0, done: 0, name: '', percent: 0 });
  const [editingFileId, setEditingFileId] = useState(null);
  const [fileNameDraft, setFileNameDraft] = useState('');
  const [resourceLinks, setResourceLinks] = useState([]);
  const [resourceTitle, setResourceTitle] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchScope, setGlobalSearchScope] = useState('all');
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [globalSearchError, setGlobalSearchError] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState([]);
  const [globalSearchCounts, setGlobalSearchCounts] = useState({});
  const [globalSearchTotal, setGlobalSearchTotal] = useState(0);
  const globalSearchRequestRef = useRef(0);
  const deferredGlobalSearchQuery = useDeferredValue(globalSearchQuery);

  const reportStartDate = '';
  const reportEndDate = '';
  const setReportStartDate = (_value) => null;
  const setReportEndDate = (_value) => null;
  const reportDateInvalid = false;
  const weeklyReportText = '';
  const exportWeeklyReportPdf = () => null;
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-3-flash-preview');
  const [googleCalendarEmbedUrl, setGoogleCalendarEmbedUrl] = useState('');
  const [googleCalendarIcsUrl, setGoogleCalendarIcsUrl] = useState('');
  const [googleCalendarEvents, setGoogleCalendarEvents] = useState([]);
  const [googleTasksAccessToken, setGoogleTasksAccessToken] = useState('');
  const [googleTasksClientId, setGoogleTasksClientId] = useState('');
  const [googleTasksClientSecret, setGoogleTasksClientSecret] = useState('');
  const [googleTasksRefreshToken, setGoogleTasksRefreshToken] = useState('');
  const [googleTasksListId, setGoogleTasksListId] = useState('@default');
  const [googleTasksItems, setGoogleTasksItems] = useState([]);
  const [holidayMap, setHolidayMap] = useState({});
  const [aiQuestionByTab, setAiQuestionByTab] = useState({ dashboard: '', students: '', tasks: '', attendance: '' });
  const [aiLastQuestionByTab, setAiLastQuestionByTab] = useState({ dashboard: '', students: '', tasks: '', attendance: '' });
  const [aiChatByTab, setAiChatByTab] = useState({ dashboard: [], students: [], tasks: [], attendance: [] });
  const [aiAnswerByTab, setAiAnswerByTab] = useState({ dashboard: '', students: '', tasks: '', attendance: '' });
  const [aiErrorByTab, setAiErrorByTab] = useState({ dashboard: '', students: '', tasks: '', attendance: '' });
  const [aiLoadingTab, setAiLoadingTab] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [me, setMe] = useState(null);
  const [myCurrentPassword, setMyCurrentPassword] = useState('');
  const [myNewPassword, setMyNewPassword] = useState('');
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminPwDraftById, setAdminPwDraftById] = useState({});
  const [activityLogs, setActivityLogs] = useState([]);
  const [confirmDeleteStudent, setConfirmDeleteStudent] = useState(false);
  const localStudentPhotoCacheRef = useRef({});
  const studentPhotoSyncAttemptedRef = useRef(false);
  const coreLoadRef = useRef({ requestId: 0, token: '', key: '', status: 'idle', promise: null });
  const filesLoadRef = useRef({ requestId: 0, token: '', status: 'idle', loadedAt: 0, promise: null });
  const settingsBootstrappedTokenRef = useRef('');

  const [myTimetableWeek, setMyTimetableWeek] = useState({});
  const [homeroomTimetableWeek, setHomeroomTimetableWeek] = useState({});
  const [myTimetableDate, setMyTimetableDate] = useState('');
  const [homeroomTimetableDate, setHomeroomTimetableDate] = useState('');
  const [comtimeDateOptions, setComtimeDateOptions] = useState([]);

  const clearExpiredSession = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('teacher_notebook_token_v1');
      sessionStorage.removeItem('teacher_notebook_token_v1');
    }
    setToken('');
    setAuthed(false);
    setMe(null);
    setQuickRecordOpen(false);
    coreLoadRef.current = { requestId: coreLoadRef.current.requestId + 1, token: '', key: '', status: 'idle', promise: null };
    filesLoadRef.current = { requestId: filesLoadRef.current.requestId + 1, token: '', status: 'idle', loadedAt: 0, promise: null };
    settingsBootstrappedTokenRef.current = '';
  };

  const apiFetch = async (path, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, { ...options, headers });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) clearExpiredSession();
    if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
    return json;
  };

  useEffect(() => {
    const onQuickRecordKey = (event) => {
      if (!authed || !(event.ctrlKey || event.metaKey) || String(event.key).toLowerCase() !== 'k') return;
      event.preventDefault();
      setQuickRecordOpen((open) => !open);
    };
    window.addEventListener('keydown', onQuickRecordKey);
    return () => window.removeEventListener('keydown', onQuickRecordKey);
  }, [authed]);

  const sortClubList = (rows) => [...(Array.isArray(rows) ? rows : [])].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'ko', { numeric: true }) || Number(a?.id || 0) - Number(b?.id || 0));
  const toAbsoluteAssetUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${API}${raw.startsWith('/') ? '' : '/'}${raw}`;
  };
  const normalizePhotoCacheMap = (value) => {
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(
      Object.entries(value).map(([studentId, item]) => {
        const url = String(item?.url || '').trim();
        if (!url) return null;
        return [String(studentId), { url: toAbsoluteAssetUrl(url), updatedAt: String(item?.updatedAt || '') }];
      }).filter(Boolean)
    );
  };
  const buildStudentPhotoMap = (studentRows) => Object.fromEntries(
    (Array.isArray(studentRows) ? studentRows : [])
      .filter((student) => String(student?.photo_url || '').trim())
      .map((student) => [String(student.id), { url: toAbsoluteAssetUrl(student.photo_url), updatedAt: String(student.photo_updated_at || student.updated_at || '') }])
  );

  const pushActivity = (category, text) => {
    const item = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      category,
      text,
      at: new Date().toISOString(),
    };
    setActivityLogs((prev) => [item, ...prev].slice(0, 120));
    if (!token) return;
    apiFetch('/api/activity-logs', {
      method: 'POST',
      body: JSON.stringify({ category, text, at: item.at }),
    })
      .then((saved) => {
        setActivityLogs((prev) => [saved, ...prev.filter((x) => String(x.id) !== String(item.id))].slice(0, 120));
      })
      .catch(() => null);
  };

  const {
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
  } = useClubsTabState({ clubs, students });

  const {
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
      setIssueCaseNo,
      setIssueTitle,
      setIssueStatus,
      setIssueStudentQuery,
      setIssueStudentRole,
      setConsultationType,
      setConsultationAt,
      setConsultationContent,
      setConsultationAttachments,
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
      cancelConsultationEdit,
      toggleConsultationExpanded,
      confirmIssueSaved,
      confirmConsultationSaved,
    },
    issueDrafts: {
      issue: issueDraftInfo,
      consultation: issueConsultationDraftInfo,
    },
  } = useIssuesTabState({
    issues,
    consultations: issueConsultations,
    students,
    academicYear,
    activeTab,
    apiFetch,
  });

  const {
    scheduleTitle,
    setScheduleTitle,
    taskSearchQuery,
    setTaskSearchQuery,
    scheduleKind,
    setScheduleKind,
    dueAt,
    setDueAt,
    editingScheduleId,
    setEditingScheduleId,
    taskCalendarMonth,
    setTaskCalendarMonth,
    confirmDeleteScheduleId,
    setConfirmDeleteScheduleId,
    taskDatesInMonth,
    schedulesInSelectedMonth,
    isCurrentTaskMonth,
    taskMonthTitle,
    taskSearchQ,
    taskSearchTodoResults,
    taskSearchEventResults,
    googleEventsInSelectedMonth,
    taskBottomLocalTodos,
    taskBottomLocalEvents,
    taskBottomGoogleTasks,
    taskBottomGoogleEvents,
    taskSearchGoogleEventResults,
    taskSearchGoogleTaskResults,
  } = useTasksTabState({ schedules, googleCalendarEvents, googleTasksItems });

  const {
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
    selectedAttendanceClub,
    selectedAttendanceClubStudentIdSet,
    attendanceClubStudents,
    attendanceTargetSummary,
    attendanceWeekdayIdx,
    attendanceMaxPeriod,
    filteredAttendanceSavedItems,
    homeroomStudents,
  } = useAttendanceTabState({ clubs, students, homeroomClass });

  const studentNotesWithIssueConsultations = useMemo(() => [
    ...notes,
    ...studentIssueConsultations.map((consultation) => ({
      id: `issue-${consultation.issue_id}-${consultation.id}`,
      source: 'issue',
      issue_id: consultation.issue_id,
      issue_consultation_id: consultation.id,
      student_id: consultation.student_id,
      student_code: consultation.student_code,
      participant_name: consultation.participant_name,
      consultation_type: consultation.consultation_type,
      academic_year: academicYear,
      note_date: consultation.consulted_at,
      category: consultation.consultation_type === 'guardian' ? 'issue_guardian' : 'issue_student',
      content: consultation.content,
      attachments: Array.isArray(consultation.attachments) ? consultation.attachments : [],
    })),
  ], [academicYear, notes, studentIssueConsultations]);

  const {
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
      setNoteCategory,
      setNoteCategoryOpen,
      setNoteContent,
      setNoteAttachments,
      setEditingNoteId,
      setExpandedNotes,
      setPdfSelectedIds,
    },
    studentDerived: {
      studentNoteMatchedStudents,
      sortedFilteredStudents,
      selectedClassCount,
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
      note: studentNoteDraftInfo,
    },
  } = useStudentsTabState({
    students,
    notes: studentNotesWithIssueConsultations,
    clubsByStudentId,
    homeroomClass,
    activeTab,
    attendanceMode,
    attendanceClassName,
    setAttendanceClassName,
    isTransferredStudent,
    apiFetch,
    editingIssueConsultation,
  });

  const {
    memoState: {
      memoDate,
      memoTitle,
      memoContent,
      memoAttachments,
      memoItems,
      memoSearchQuery,
      editingMemoId,
      memoShowOnDashboard,
      memoTouched,
      memoListMonth,
      announcementDate,
      announcementTitle,
      announcementContent,
      announcementAttachments,
      editingAnnouncementId,
      announcementTouched,
      announcementShowCompleted,
      announcementPanelMode,
    },
    memoSetters: {
      setMemoDate,
      setMemoTitle,
      setMemoContent,
      setMemoAttachments,
      setMemoItems,
      setMemoSearchQuery,
      setEditingMemoId,
      setMemoShowOnDashboard,
      setMemoTouched,
      setMemoListMonth,
      setAnnouncementDate,
      setAnnouncementTitle,
      setAnnouncementContent,
      setAnnouncementAttachments,
      setEditingAnnouncementId,
      setAnnouncementTouched,
      setAnnouncementShowCompleted,
      setAnnouncementPanelMode,
    },
    memoDerived: {
      announcementItems,
      memosByMonth,
      memoSearchQ,
      memoSearchResults,
      selectedMemo,
      selectedAnnouncement,
      dashboardMemos,
      visibleAnnouncementItems,
      pendingAnnouncementItemsCount,
    },
    memoActions: {
      startNewMemo,
      selectMemo,
      saveTaskMemo,
      deleteTaskMemo,
      startNewAnnouncement,
      selectAnnouncement,
      saveAnnouncement,
      deleteAnnouncement,
      toggleAnnouncementCompleted,
    },
    memoGuards: {
      memoDirty,
      announcementDirty,
    },
    memoDrafts: {
      memo: memoDraftInfo,
      announcement: announcementDraftInfo,
    },
  } = useMemosTabState({
    activeTab,
    apiFetch,
    setActionMessage,
  });

  const deferredSortedFilteredStudents = useDeferredValue(sortedFilteredStudents);
  const deferredStudentNoteMatchedStudents = useDeferredValue(studentNoteMatchedStudents);
  const deferredMemosByMonth = useDeferredValue(memosByMonth);

  const applyServerSettings = (settings, initializeScope) => {
    if (!settings || typeof settings !== 'object') return;
    if (settings.schoolName !== undefined) setSchoolName(String(settings.schoolName || ''));
    if (settings.kmaAuthKey !== undefined) setKmaServiceKey(String(settings.kmaAuthKey || ''));
    if (settings.kmaServiceKey !== undefined) setKmaServiceKey(String(settings.kmaServiceKey || ''));
    if (settings.teacherDisplayName !== undefined) setTeacherDisplayName(String(settings.teacherDisplayName || ''));
    if (initializeScope && settings.academicYear !== undefined) setAcademicYear(String(settings.academicYear || academicYear));
    if (settings.homeroomClass !== undefined) setHomeroomClass(String(settings.homeroomClass || ''));
    if (settings.schoolCodeSetting !== undefined) setSchoolCodeSetting(String(settings.schoolCodeSetting || ''));
    if (settings.teacherNoSetting !== undefined) setTeacherNoSetting(String(settings.teacherNoSetting || ''));
    if (settings.weekdayPeriods && typeof settings.weekdayPeriods === 'object') setWeekdayPeriods((prev) => ({ ...prev, ...settings.weekdayPeriods }));
    if (settings.geminiApiKey !== undefined) setGeminiApiKey(String(settings.geminiApiKey || ''));
    if (settings.geminiModel !== undefined) setGeminiModel(String(settings.geminiModel || ''));
    if (settings.googleCalendarEmbedUrl !== undefined) setGoogleCalendarEmbedUrl(String(settings.googleCalendarEmbedUrl || ''));
    if (settings.googleCalendarIcsUrl !== undefined) setGoogleCalendarIcsUrl(String(settings.googleCalendarIcsUrl || ''));
    if (settings.googleTasksAccessToken !== undefined) setGoogleTasksAccessToken(String(settings.googleTasksAccessToken || ''));
    if (settings.googleTasksClientId !== undefined) setGoogleTasksClientId(String(settings.googleTasksClientId || ''));
    if (settings.googleTasksClientSecret !== undefined) setGoogleTasksClientSecret(String(settings.googleTasksClientSecret || ''));
    if (settings.googleTasksRefreshToken !== undefined) setGoogleTasksRefreshToken(String(settings.googleTasksRefreshToken || ''));
    if (settings.googleTasksListId !== undefined) setGoogleTasksListId(String(settings.googleTasksListId || '@default'));
  };

  const loadAll = ({ force = true } = {}) => {
    if (!authed || !token) return Promise.resolve();
    const initialKey = `${token}|${academicYear}|${homeroomClass}`;
    const currentLoad = coreLoadRef.current;
    if (!force && currentLoad.token === token && currentLoad.key === initialKey) {
      if (currentLoad.status === 'loading' && currentLoad.promise) return currentLoad.promise;
      if (currentLoad.status === 'loaded') return Promise.resolve();
    }

    const requestId = currentLoad.requestId + 1;
    const loadPromise = (async () => {
      const failures = [];
      const settingsResult = await Promise.allSettled([apiFetch('/api/settings')]);
      if (coreLoadRef.current.requestId !== requestId || coreLoadRef.current.token !== token) return;

      const settingsEntry = settingsResult[0];
      const settings = settingsEntry.status === 'fulfilled' && settingsEntry.value && typeof settingsEntry.value === 'object'
        ? settingsEntry.value
        : null;
      const initializeScope = settingsBootstrappedTokenRef.current !== token;
      const effectiveYear = initializeScope && String(settings?.academicYear || '').trim()
        ? String(settings.academicYear).trim()
        : String(academicYear || new Date().getFullYear());
      const effectiveHomeroom = initializeScope && settings?.homeroomClass !== undefined
        ? String(settings.homeroomClass || '')
        : String(homeroomClass || '');
      const effectiveKey = `${token}|${effectiveYear}|${effectiveHomeroom}`;
      coreLoadRef.current.key = effectiveKey;

      if (settings) {
        applyServerSettings(settings, initializeScope);
        settingsBootstrappedTokenRef.current = token;
      } else {
        failures.push('설정');
      }

      const definitions = [
        { key: 'students', label: '학생', request: apiFetch(`/api/students?year=${encodeURIComponent(effectiveYear)}`) },
        { key: 'notes', label: '상담 기록', request: apiFetch(`/api/notes?year=${encodeURIComponent(effectiveYear)}`) },
        { key: 'schedules', label: '일정', request: apiFetch('/api/schedules') },
        { key: 'attendance', label: '출석 메모', request: apiFetch(`/api/attendance?kind=homeroom&className=${encodeURIComponent(effectiveHomeroom)}`) },
        { key: 'activityLogs', label: '최근 기록', request: apiFetch('/api/activity-logs') },
        { key: 'taskMemos', label: '메모', request: apiFetch('/api/task-memos') },
        { key: 'clubs', label: '선택 편성', request: apiFetch(`/api/clubs?year=${encodeURIComponent(effectiveYear)}`) },
        { key: 'issues', label: '사안', request: apiFetch('/api/issues') },
      ];
      const results = await Promise.allSettled(definitions.map((definition) => definition.request));
      if (coreLoadRef.current.requestId !== requestId || coreLoadRef.current.token !== token) return;

      const values = {};
      results.forEach((result, index) => {
        const definition = definitions[index];
        if (result.status === 'fulfilled' && Array.isArray(result.value)) values[definition.key] = result.value;
        else failures.push(definition.label);
      });

      if (values.students) {
        const serverPhotoMap = buildStudentPhotoMap(values.students);
        const cachedPhotoMap = normalizePhotoCacheMap(localStudentPhotoCacheRef.current);
        const mergedPhotoMap = { ...serverPhotoMap };
        if (!studentPhotoSyncAttemptedRef.current) {
          Object.entries(cachedPhotoMap).forEach(([studentId, item]) => {
            if (!mergedPhotoMap[studentId]?.url && item?.url) mergedPhotoMap[studentId] = item;
          });
        }
        setStudents(values.students);
        setStudentPhotos(mergedPhotoMap);
      }
      if (values.notes) setNotes(values.notes);
      if (values.schedules) setSchedules(values.schedules);
      if (values.attendance) setAttendanceLatest(values.attendance.length ? values.attendance[values.attendance.length - 1] : null);
      if (values.activityLogs) setActivityLogs(values.activityLogs);
      if (values.taskMemos) setMemoItems(values.taskMemos);
      if (values.clubs) setClubs(sortClubList(values.clubs));
      if (values.issues) setIssues(values.issues);

      coreLoadRef.current = { requestId, token, key: effectiveKey, status: 'loaded', promise: null };
      if (failures.length) {
        setActionMessage(`일부 데이터 로드 지연: ${Array.from(new Set(failures)).join(', ')}. 기존 내용을 유지합니다.`);
      }
    })().catch((error) => {
      if (coreLoadRef.current.requestId !== requestId || coreLoadRef.current.token !== token) return;
      coreLoadRef.current = { requestId, token, key: initialKey, status: 'partial', promise: null };
      setActionMessage(`데이터 로드 지연: ${error?.message || '서버 응답을 확인해 주세요.'} 기존 내용을 유지합니다.`);
    });

    coreLoadRef.current = { requestId, token, key: initialKey, status: 'loading', promise: loadPromise };
    return loadPromise;
  };

  const loadFilesData = ({ force = false } = {}) => {
    if (!authed || !token) return Promise.resolve();
    const currentLoad = filesLoadRef.current;
    const age = Date.now() - Number(currentLoad.loadedAt || 0);
    if (!force && currentLoad.token === token) {
      if (currentLoad.status === 'loading' && currentLoad.promise) return currentLoad.promise;
      if (currentLoad.status === 'loaded' && age < FILES_TAB_CACHE_MS) return Promise.resolve();
      if (currentLoad.status === 'partial' && age < FILES_TAB_PARTIAL_RETRY_MS) return Promise.resolve();
    }

    const requestId = currentLoad.requestId + 1;
    const loadPromise = (async () => {
      const [filesResult, linksResult] = await Promise.allSettled([
        apiFetch('/api/files'),
        apiFetch('/api/resource-links'),
      ]);
      if (filesLoadRef.current.requestId !== requestId || filesLoadRef.current.token !== token) return;

      const failures = [];
      if (filesResult.status === 'fulfilled' && Array.isArray(filesResult.value)) setFileItems(filesResult.value);
      else failures.push('파일');

      if (linksResult.status === 'fulfilled' && Array.isArray(linksResult.value)) {
        if (linksResult.value.length) {
          setResourceLinks(linksResult.value);
        } else {
          try {
            const linksRaw = localStorage.getItem('teacher_notebook_resource_links_v1');
            const localLinks = linksRaw ? JSON.parse(linksRaw) : [];
            if (Array.isArray(localLinks) && localLinks.length) {
              setResourceLinks(localLinks);
              await apiFetch('/api/resource-links', { method: 'PUT', body: JSON.stringify({ links: localLinks }) });
            } else {
              setResourceLinks([]);
            }
          } catch {
            failures.push('링크 동기화');
          }
        }
      } else {
        failures.push('링크');
      }

      const status = failures.length ? 'partial' : 'loaded';
      filesLoadRef.current = { requestId, token, status, loadedAt: Date.now(), promise: null };
      if (failures.length) {
        setActionMessage(`자료 일부 로드 지연: ${Array.from(new Set(failures)).join(', ')}. 기존 내용을 유지합니다.`);
      }
    })().catch((error) => {
      if (filesLoadRef.current.requestId !== requestId || filesLoadRef.current.token !== token) return;
      filesLoadRef.current = { requestId, token, status: 'partial', loadedAt: Date.now(), promise: null };
      setActionMessage(`자료 로드 지연: ${error?.message || '서버 응답을 확인해 주세요.'} 기존 내용을 유지합니다.`);
    });

    filesLoadRef.current = { requestId, token, status: 'loading', loadedAt: currentLoad.loadedAt || 0, promise: loadPromise };
    return loadPromise;
  };

  useEffect(() => {
    if (!authed || !selectedIssueId) {
      setIssueConsultations([]);
      return;
    }
    let cancelled = false;
    apiFetch(`/api/issues/${selectedIssueId}/consultations`)
      .then((rows) => {
        if (!cancelled) setIssueConsultations(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setIssueConsultations([]);
      });
    return () => { cancelled = true; };
  }, [authed, selectedIssueId, token]);

  useEffect(() => {
    if (!authed || !selectedStudentId) {
      setStudentIssueConsultations([]);
      return;
    }
    let cancelled = false;
    apiFetch(`/api/issues/consultations?studentId=${encodeURIComponent(selectedStudentId)}`)
      .then((rows) => {
        if (!cancelled) setStudentIssueConsultations(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setStudentIssueConsultations([]);
      });
    return () => { cancelled = true; };
  }, [authed, selectedStudentId, token]);

  const saveIssue = async () => {
    if (!String(issueCaseNo || '').trim()) {
      setActionMessage('사안 번호를 입력해 주세요.');
      return;
    }
    const payload = {
      academicYear,
      caseNo: issueCaseNo,
      title: issueTitle,
      issueStudents: issueStudentsDraft,
      relatedStudents: issueStudentsDraft.map((item) => `${item.student_code || ''} ${item.student_name || ''}`.trim()),
      status: issueStatus,
    };
    const isNewIssue = isCreatingIssue || !selectedIssue;
    try {
      const saved = isNewIssue
        ? await apiFetch('/api/issues', { method: 'POST', body: JSON.stringify(payload) })
        : await apiFetch(`/api/issues/${selectedIssue.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      await confirmIssueSaved();
      setIssues((previous) => [saved, ...previous.filter((item) => String(item.id) !== String(saved.id))]
        .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))));
      setSelectedIssueId(String(saved.id));
      pushActivity(isNewIssue ? '사안 등록' : '사안 수정', `${saved.case_no} ${saved.title || ''}`.trim());
      setActionMessage(isNewIssue ? '사안을 등록했습니다.' : '사안을 저장했습니다.');
    } catch (error) {
      setActionMessage(`사안 저장 실패: ${error?.message || 'API 오류'}`);
    }
  };

  const deleteIssue = async (id) => {
    if (!confirm('이 사안과 상담 기록을 모두 삭제할까요?')) return;
    try {
      await apiFetch(`/api/issues/${id}`, { method: 'DELETE' });
      if (String(selectedIssueId) === String(id)) await confirmIssueSaved();
      setIssues((previous) => previous.filter((item) => String(item.id) !== String(id)));
      setStudentIssueConsultations((previous) => previous.filter((item) => String(item.issue_id) !== String(id)));
      if (String(selectedIssueId) === String(id)) {
        setIssueConsultations([]);
        startNewIssue();
      }
      pushActivity('사안 삭제', '사안과 상담 기록 삭제');
      setActionMessage('사안과 연결된 상담 기록을 삭제했습니다.');
    } catch (error) {
      setActionMessage(`사안 삭제 실패: ${error?.message || 'API 오류'}`);
    }
  };

  const addIssueConsultation = async () => {
    if (!selectedIssue) return;
    if (!consultationStudentId || !String(consultationContent || '').trim()) {
      setActionMessage('상담 대상 학생을 검색해 선택하고 상담 내용을 입력해 주세요.');
      return;
    }
    const isEditing = Boolean(editingConsultationId);
    try {
      const endpoint = isEditing
        ? `/api/issues/${selectedIssue.id}/consultations/${editingConsultationId}`
        : `/api/issues/${selectedIssue.id}/consultations`;
      const payload = {
        consultationType,
        consultedAt: consultationAt ? new Date(consultationAt).toISOString() : new Date().toISOString(),
        content: consultationContent,
        attachments: consultationAttachments,
        ...(!isEditing ? {
          participantName: consultationParticipantName,
          studentId: Number(consultationStudentId),
        } : {}),
      };
      const saved = await apiFetch(endpoint, {
        method: isEditing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      await confirmConsultationSaved();
      setIssueConsultations((previous) => [...previous.filter((item) => Number(item.id) !== Number(saved.id)), saved]
        .sort((a, b) => String(a.consulted_at || '').localeCompare(String(b.consulted_at || '')) || Number(a.id || 0) - Number(b.id || 0)));
      setStudentIssueConsultations((previous) => {
        const withoutSaved = previous.filter((item) => Number(item.id) !== Number(saved.id));
        return String(saved.student_id) === String(selectedStudentId)
          ? [saved, ...withoutSaved].sort((a, b) => String(b.consulted_at || '').localeCompare(String(a.consulted_at || '')) || Number(b.id || 0) - Number(a.id || 0))
          : withoutSaved;
      });
      resetConsultationForm();
      pushActivity(isEditing ? '사안 상담 기록 수정' : '사안 상담 기록', `${selectedIssue.case_no} ${saved.participant_name} 상담 기록 ${isEditing ? '수정' : '추가'}`);
      setActionMessage(isEditing ? '상담 기록을 수정했습니다.' : '상담 기록을 추가했습니다.');
    } catch (error) {
      setActionMessage(`상담 기록 ${isEditing ? '수정' : '추가'} 실패: ${error?.message || 'API 오류'}`);
    }
  };

  const deleteIssueConsultation = async (consultationId) => {
    if (!selectedIssue || !confirm('이 상담 기록을 삭제할까요?')) return;
    try {
      await apiFetch(`/api/issues/${selectedIssue.id}/consultations/${consultationId}`, { method: 'DELETE' });
      if (String(editingConsultationId) === String(consultationId)) await confirmConsultationSaved();
      setIssueConsultations((previous) => previous.filter((item) => String(item.id) !== String(consultationId)));
      setStudentIssueConsultations((previous) => previous.filter((item) => String(item.id) !== String(consultationId)));
      if (String(editingConsultationId) === String(consultationId)) resetConsultationForm();
      setActionMessage('상담 기록을 삭제했습니다.');
    } catch (error) {
      setActionMessage(`상담 기록 삭제 실패: ${error?.message || 'API 오류'}`);
    }
  };

  const runGlobalSearch = async (options = {}) => {
    const query = String((options.query ?? globalSearchQuery) || '').trim();
    const scopeValue = String((options.scope ?? globalSearchScope) || 'all');
    if (!query) {
      globalSearchRequestRef.current += 1;
      setGlobalSearchLoading(false);
      setGlobalSearchError('');
      setGlobalSearchResults([]);
      setGlobalSearchCounts({});
      setGlobalSearchTotal(0);
      return;
    }

    const requestId = globalSearchRequestRef.current + 1;
    globalSearchRequestRef.current = requestId;
    setGlobalSearchLoading(true);
    setGlobalSearchError('');
    try {
      const params = new URLSearchParams();
      params.set('q', query);
      params.set('scope', scopeValue);
      params.set('limit', '120');
      const result = await apiFetch(`/api/search?${params.toString()}`);
      if (requestId !== globalSearchRequestRef.current) return;
      setGlobalSearchResults(Array.isArray(result?.results) ? result.results : []);
      setGlobalSearchCounts(result?.counts && typeof result.counts === 'object' ? result.counts : {});
      setGlobalSearchTotal(Number(result?.total || 0));
    } catch (error) {
      if (requestId !== globalSearchRequestRef.current) return;
      setGlobalSearchResults([]);
      setGlobalSearchCounts({});
      setGlobalSearchTotal(0);
      setGlobalSearchError(String(error?.message || error || '통합 검색 중 오류가 발생했습니다.'));
    } finally {
      if (requestId === globalSearchRequestRef.current) setGlobalSearchLoading(false);
    }
  };

  const openGlobalSearchResult = (item) => {
    const nextQuery = String(globalSearchQuery || '').trim();
    if (item?.scope === 'students' || item?.scope === 'notes') {
      if (item?.studentId) setSelectedStudentId(String(item.studentId));
      if (item?.className) setStudentClassFilter(String(item.className));
      trySetActiveTab('students');
      return;
    }
    if (item?.scope === 'schedules') {
      if (nextQuery) setTaskSearchQuery(nextQuery);
      trySetActiveTab('tasks');
      return;
    }
    if (item?.scope === 'memos') {
      if (nextQuery) setMemoSearchQuery(nextQuery);
      trySetActiveTab('memos');
      return;
    }
    if (item?.scope === 'files' || item?.scope === 'links') {
      trySetActiveTab('files');
      return;
    }
    if (item?.scope === 'clubs') {
      if (item?.clubId) setSelectedClubId(String(item.clubId));
      trySetActiveTab('clubs');
      return;
    }
    if (item?.scope === 'issues') {
      if (item?.id) setSelectedIssueId(String(item.id));
      trySetActiveTab('issues');
      return;
    }
    if (item?.scope === 'attendance') {
      if (item?.date) setAttendanceDate(String(item.date).slice(0, 10));
      if (item?.kind) setAttendanceMode(String(item.kind));
      if (item?.className) setAttendanceClassName(String(item.className));
      if (item?.period) setAttendancePeriod(String(item.period));
      trySetActiveTab('attendance');
      return;
    }
    trySetActiveTab('dashboard');
  };

  useEffect(() => {
    const persistentToken = localStorage.getItem('teacher_notebook_token_v1') || '';
    const sessionToken = sessionStorage.getItem('teacher_notebook_token_v1') || '';
    if (sessionToken && persistentToken) localStorage.removeItem('teacher_notebook_token_v1');
    const t = sessionToken || persistentToken;
    const settingsRaw = localStorage.getItem('teacher_notebook_settings_v1');
    if (t) {
      setToken(t);
      setRememberLogin(Boolean(!sessionToken && persistentToken));
    }
    if (settingsRaw) {
      try {
        const s = JSON.parse(settingsRaw);
        if (s.schoolName) setSchoolName(String(s.schoolName));
        if (s.kmaAuthKey) setKmaServiceKey(String(s.kmaAuthKey));
        if (s.kmaServiceKey) setKmaServiceKey(String(s.kmaServiceKey));
        if (s.teacherDisplayName) setTeacherDisplayName(String(s.teacherDisplayName));
        if (s.academicYear) setAcademicYear(String(s.academicYear));
        if (s.homeroomClass) setHomeroomClass(String(s.homeroomClass));
        if (s.schoolCodeSetting) setSchoolCodeSetting(String(s.schoolCodeSetting));
        if (s.teacherNoSetting) setTeacherNoSetting(String(s.teacherNoSetting));
        if (s.weekdayPeriods) setWeekdayPeriods({ ...weekdayPeriods, ...s.weekdayPeriods });
        if (s.geminiApiKey) setGeminiApiKey(String(s.geminiApiKey));
        if (s.geminiModel) setGeminiModel(String(s.geminiModel));
        if (s.googleCalendarEmbedUrl) setGoogleCalendarEmbedUrl(String(s.googleCalendarEmbedUrl));
        if (s.googleCalendarIcsUrl) setGoogleCalendarIcsUrl(String(s.googleCalendarIcsUrl));
        if (s.googleTasksAccessToken) setGoogleTasksAccessToken(String(s.googleTasksAccessToken));
        if (s.googleTasksClientId) setGoogleTasksClientId(String(s.googleTasksClientId));
        if (s.googleTasksClientSecret) setGoogleTasksClientSecret(String(s.googleTasksClientSecret));
        if (s.googleTasksRefreshToken) setGoogleTasksRefreshToken(String(s.googleTasksRefreshToken));
        if (s.googleTasksListId) setGoogleTasksListId(String(s.googleTasksListId));
      } catch {}
    }
    const photosRaw = localStorage.getItem('teacher_notebook_student_photos_v1');
    if (photosRaw) {
      try {
        const parsed = normalizePhotoCacheMap(JSON.parse(photosRaw));
        localStudentPhotoCacheRef.current = parsed;
        if (Object.keys(parsed).length) setStudentPhotos(parsed);
      } catch {}
    }
    const linksRaw = localStorage.getItem('teacher_notebook_resource_links_v1');
    if (linksRaw) {
      try {
        const arr = JSON.parse(linksRaw);
        if (Array.isArray(arr) && arr.length) setResourceLinks(arr);
      } catch {}
    }
    // files are loaded from server (/api/files)
  }, []);

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth <= 1055);
      setViewportWidth(window.innerWidth || 1280);
    };
    onResize();
    setIsWebView(Boolean(window.ReactNativeWebView));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error('unauthorized');
        const j = await r.json().catch(() => ({}));
        setMe(j?.user || null);
        setAuthed(true);
      })
      .catch(() => {
        localStorage.removeItem('teacher_notebook_token_v1');
        sessionStorage.removeItem('teacher_notebook_token_v1');
        setToken('');
        setMe(null);
        setAuthed(false);
      });
  }, [token]);

  useEffect(() => {
    if (authed) loadAll({ force: false });
  }, [authed, academicYear, token]);

  useEffect(() => {
    if (authed && activeTab === 'files') loadFilesData({ force: false });
  }, [authed, activeTab, token]);

  useEffect(() => {
    if (!authed || String(me?.role || '').toLowerCase() !== 'admin') {
      setAdminUsers([]);
      return;
    }
    apiFetch('/api/admin/users').then((rows) => setAdminUsers(Array.isArray(rows) ? rows : [])).catch(() => setAdminUsers([]));
  }, [authed, me?.username]);

  useEffect(() => {
    if (!authed || (!googleCalendarEmbedUrl && !googleCalendarIcsUrl)) {
      setGoogleCalendarEvents([]);
      return;
    }
    apiFetch('/api/google-calendar/events')
      .then((rows) => setGoogleCalendarEvents(Array.isArray(rows) ? rows : []))
      .catch(() => setGoogleCalendarEvents([]));
  }, [authed, googleCalendarEmbedUrl, googleCalendarIcsUrl]);

  useEffect(() => {
    const canUseRefresh = googleTasksClientId && googleTasksClientSecret && googleTasksRefreshToken;
    if (!authed || (!googleTasksAccessToken && !canUseRefresh)) {
      setGoogleTasksItems([]);
      return;
    }
    apiFetch('/api/google-tasks')
      .then((rows) => setGoogleTasksItems(Array.isArray(rows) ? rows : []))
      .catch(() => setGoogleTasksItems([]));
  }, [authed, googleTasksAccessToken, googleTasksClientId, googleTasksClientSecret, googleTasksRefreshToken, googleTasksListId]);
  useEffect(() => {
    if (!authed) {
      setDashboardLunch(null);
      setDashboardLunchLoading(false);
      setDashboardLunchError('');
      return;
    }
    if (activeTab !== 'dashboard') return;

    const normalizedSchoolName = String(schoolName || '').trim();
    if (!normalizedSchoolName || normalizedSchoolName === '?곕━?숆탳') {
      setDashboardLunch({
        status: 'missing_school',
        schoolName: normalizedSchoolName,
        mealType: '以묒떇',
        mealDate: '',
        dishes: [],
        calories: '',
        message: '설정에서 학교명을 입력해 주세요.',
      });
      setDashboardLunchLoading(false);
      setDashboardLunchError('');
      return;
    }

    let cancelled = false;
    setDashboardLunchLoading(true);
    setDashboardLunchError('');
    apiFetch(`/api/neis/today-lunch?schoolName=${encodeURIComponent(normalizedSchoolName)}`)
      .then((payload) => {
        if (cancelled) return;
        setDashboardLunch(payload && typeof payload === 'object' ? payload : null);
      })
      .catch((e) => {
        if (cancelled) return;
        setDashboardLunch(null);
        setDashboardLunchError(e?.message || '급식 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setDashboardLunchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authed, activeTab, schoolName]);
  useEffect(() => {
    if (!authed) {
      setDashboardWeather(null);
      setDashboardWeatherLoading(false);
      setDashboardWeatherError('');
      return;
    }
    if (activeTab !== 'dashboard') return;

    const normalizedSchoolName = String(schoolName || '').trim();
    if (!normalizedSchoolName || normalizedSchoolName === '?곕━?숆탳') {
      setDashboardWeather({
        status: 'missing_school',
        schoolName: normalizedSchoolName,
        locationName: '',
        current: null,
        hourly: [],
        message: '설정에서 학교명을 입력해 주세요.',
      });
      setDashboardWeatherLoading(false);
      setDashboardWeatherError('');
      return;
    }

    let cancelled = false;
    setDashboardWeatherLoading(true);
    setDashboardWeatherError('');
    apiFetch(`/api/weather/school?schoolName=${encodeURIComponent(normalizedSchoolName)}`)
      .then((payload) => {
        if (cancelled) return;
        setDashboardWeather(payload && typeof payload === 'object' ? payload : null);
      })
      .catch((e) => {
        if (cancelled) return;
        setDashboardWeather(null);
        setDashboardWeatherError(e?.message || '날씨 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setDashboardWeatherLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authed, activeTab, schoolName]);
  useEffect(() => {
    if (!authed || !schoolCodeSetting) {
      setComtimeDateOptions([]);
      setMyTimetableDate('');
      setHomeroomTimetableDate('');
      return;
    }
    apiFetch(`/api/comtime/date-options?schoolCode=${encodeURIComponent(schoolCodeSetting)}`)
      .then((payload) => {
        const nextOptions = Array.isArray(payload?.dates) ? payload.dates : [];
        const requestedDefault = String(payload?.defaultValue || '').trim();
        const defaultValue = nextOptions.some((opt) => opt.value === requestedDefault) ? requestedDefault : (nextOptions[0]?.value || '');
        setComtimeDateOptions(nextOptions);
        if (nextOptions.length) {
          setMyTimetableDate((prev) => (nextOptions.some((opt) => opt.value === prev) ? prev : defaultValue));
          setHomeroomTimetableDate((prev) => (nextOptions.some((opt) => opt.value === prev) ? prev : defaultValue));
        } else {
          setMyTimetableDate('');
          setHomeroomTimetableDate('');
        }
      })
      .catch(() => {
        setComtimeDateOptions([]);
        setMyTimetableDate('');
        setHomeroomTimetableDate('');
      });
  }, [authed, schoolCodeSetting]);

  useEffect(() => {
    localStudentPhotoCacheRef.current = studentPhotos;
    localStorage.setItem('teacher_notebook_student_photos_v1', JSON.stringify(studentPhotos));
  }, [studentPhotos]);

  useEffect(() => {
    if (!authed || studentPhotoSyncAttemptedRef.current) return;
    if (!students.length) return;
    const cachedItems = Object.entries(normalizePhotoCacheMap(localStudentPhotoCacheRef.current))
      .filter(([studentId, item]) => {
        const student = students.find((row) => String(row.id) === String(studentId));
        if (!student) return false;
        if (String(student.photo_url || '').trim()) return false;
        const rawUrl = String(item?.url || '').trim();
        if (!rawUrl || /^data:/i.test(rawUrl)) return false;
        try {
          return new URL(rawUrl, API).pathname.startsWith('/student-photos/');
        } catch {
          return false;
        }
      })
      .map(([studentId, item]) => ({
        studentId: Number(studentId),
        url: String(item?.url || ''),
        updatedAt: String(item?.updatedAt || ''),
      }));

    studentPhotoSyncAttemptedRef.current = true;
    if (!cachedItems.length) return;

    apiFetch('/api/student-photos/sync', {
      method: 'POST',
      body: JSON.stringify({ items: cachedItems }),
    })
      .then((payload) => {
        const syncedItems = Array.isArray(payload?.items) ? payload.items : [];
        if (!syncedItems.length) return;
        setStudents((prev) => prev.map((student) => {
          const hit = syncedItems.find((item) => String(item.studentId) === String(student.id));
          return hit ? { ...student, photo_url: hit.url, photo_updated_at: hit.updatedAt || new Date().toISOString() } : student;
        }));
        setStudentPhotos((prev) => {
          const next = { ...prev };
          syncedItems.forEach((item) => {
            next[String(item.studentId)] = { url: toAbsoluteAssetUrl(item.url), updatedAt: String(item.updatedAt || '') };
          });
          return next;
        });
      })
      .catch(() => null);
  }, [authed, students]);

  useEffect(() => {
    setPdfSelectedIds(new Set());
  }, [selectedStudentId]);

  useEffect(() => {
    const onDocPointer = (e) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (el.closest('[data-inline-select-root="1"]')) return;
      setNoteCategoryOpen(false);
      setRiskLevelOpen(false);
      setStudentClassFilterOpen(false);
    };
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('touchstart', onDocPointer, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('touchstart', onDocPointer);
    };
  }, []);

  // files persist on server-side storage

  // activity logs are server-authoritative (/api/activity-logs)

  // resourceLinks are persisted to server via /api/resource-links on add/remove

  useEffect(() => {
    if (activeTab !== 'timetable') return;
    loadMyTimetable();
    loadHomeroomTimetable();
  }, [activeTab, myTimetableDate, homeroomTimetableDate, schoolCodeSetting, teacherNoSetting, homeroomClass]);

  useEffect(() => {
    if (activeTab !== 'attendance') return;
    if (attendanceMode === 'homeroom') {
      loadAttendanceMemo(true);
      return;
    }
    if (attendanceMode === 'club') {
      if (attendanceClubId) {
        loadAttendanceMemo(true);
      } else {
        setAttendanceRows([]);
      }
      return;
    }
    const periodOk = /^\d+교시$/.test(String(attendancePeriod || '').trim());
    if (attendanceClassName && periodOk) {
      loadAttendanceMemo(true);
    } else {
      setAttendanceRows([]);
    }
  }, [activeTab, attendanceDate, attendanceMode, attendanceClassName, attendanceClubId, attendancePeriod]);

  useEffect(() => {
    if (!actionMessage) return;
    const t = setTimeout(() => setActionMessage(''), 8000);
    return () => clearTimeout(t);
  }, [actionMessage]);

  useEffect(() => {
    if (/^\d{4}-\d{2}/.test(attendanceDate || '')) {
      setAttendanceSavedMonth(String(attendanceDate).slice(0, 7));
    }
  }, [attendanceDate]);

  useEffect(() => {
    if (!clubs.length) {
      if (selectedClubId) setSelectedClubId('');
      return;
    }
    if (!clubs.some((club) => String(club.id) === String(selectedClubId))) {
      setSelectedClubId(String(clubs[0].id));
    }
  }, [clubs, selectedClubId]);

  useEffect(() => {
    const attendanceClubs = clubs.filter((club) => club.use_for_attendance);
    if (!attendanceClubs.length) {
      if (attendanceClubId) setAttendanceClubId('');
      return;
    }
    if (!attendanceClubs.some((club) => String(club.id) === String(attendanceClubId))) {
      setAttendanceClubId(String(attendanceClubs[0].id));
    }
  }, [clubs, attendanceClubId]);

  function isTransferredStudent(s) {
    return Boolean(String(s?.transferred_at || '').trim());
  }

  const toYmd = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

  const eventRangeYmd = (e) => {
    const startDate = String(e.start_date || '').slice(0, 10);
    const endDate = String(e.end_date || '').slice(0, 10);
    if (startDate) {
      return { startYmd: startDate, endYmd: endDate || startDate };
    }
    const start = new Date(e.start_at || '');
    if (Number.isNaN(start.getTime())) return { startYmd: '', endYmd: '' };
    const startYmd = toYmd(start);
    if (!e.end_at) return { startYmd, endYmd: startYmd };
    const endRaw = new Date(e.end_at || '');
    if (Number.isNaN(endRaw.getTime())) return { startYmd, endYmd: startYmd };
    const end = new Date(endRaw.getTime() - 1);
    return { startYmd, endYmd: toYmd(end) };
  };

  const fmtYmd = (ymd) => {
    const [yy, mm, dd] = String(ymd || '').split('-').map(Number);
    if (!yy || !mm || !dd) return '';
    return `${yy}. ${mm}. ${dd}.`;
  };

  const formatGoogleEventText = (e, compactInCalendar = false) => {
    const { startYmd, endYmd } = eventRangeYmd(e);
    const startDt = new Date(e.start_at || '');
    const hasTime = !e.is_all_day && Number.isFinite(startDt.getTime());
    if (compactInCalendar && e.is_all_day) return `${e.title}`;
    if (startYmd && endYmd && startYmd !== endYmd) return `${e.title} (${fmtYmd(startYmd)} - ${fmtYmd(endYmd)})`;
    if (hasTime) {
      const hm = `${String(startDt.getHours()).padStart(2, '0')}:${String(startDt.getMinutes()).padStart(2, '0')}`;
      if (compactInCalendar) return `${e.title} (${hm})`;
      return `${e.title} (${fmtYmd(startYmd)} ${hm})`;
    }
    return `${e.title} (${fmtYmd(startYmd)})`;
  };

  const formatDotDateTime = (raw) => {
    const v = String(raw || '').trim();
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const base = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
    const m = v.match(/T(\d{2}):(\d{2})/);
    const hasTime = Boolean(m) && !(m[1] === '00' && m[2] === '00');
    if (!hasTime) return base;
    return `${base} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const formatNoteDateTime = (raw) => {
    const v = String(raw || '').trim();
    if (!v) return '-';

    const hasExplicitTime = /(?:T|\s)(\d{2}):(\d{2})/.test(v);
    const d = new Date(v.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return v;

    const week = ['일', '월', '화', '수', '목', '금', '토'];
    const pad2 = (n) => String(n).padStart(2, '0');
    const fmt = (dt, withTime) => {
      const y = dt.getFullYear();
      const m = pad2(dt.getMonth() + 1);
      const day = pad2(dt.getDate());
      const w = week[dt.getDay()] || '-';
      if (!withTime) return `${y}. ${m}. ${day}. (${w})`;
      return `${y}. ${m}. ${day}. (${w}) ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
    };

    try {
      const kst = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
      if (!Number.isNaN(kst.getTime())) return fmt(kst, hasExplicitTime);
    } catch {}

    return fmt(d, hasExplicitTime);
  };

  const formatGoogleTaskDue = (raw) => {
    const v = String(raw || '').trim();
    if (!v) return '';
    const m = v.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
    const hasTimeInRaw = Boolean(m) && !(m[1] === '00' && m[2] === '00' && String(m[3] || '00') === '00');
    if (!hasTimeInRaw) {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return '';
      return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
    }
    return formatDotDateTime(v);
  };

  const formatUpcomingItemDate = (it) => {
    const sDate = String(it?.startDate || '').trim();
    const eDate = String(it?.endDate || '').trim();
    if (sDate && eDate && sDate !== eDate) {
      return `${fmtYmd(sDate)} - ${fmtYmd(eDate)}`;
    }
    return formatDotDateTime(it?.dueAt) || '일시 미정';
  };

  const decodeBrokenKorean = (name) => {
    const v = String(name || '');
    if (!v) return v;
    return v;
  };

  const fileExt = (name) => {
    const n = String(name || '').toLowerCase();
    const i = n.lastIndexOf('.');
    return i >= 0 ? n.slice(i + 1) : '';
  };

  const fileNameWithoutExt = (name) => {
    const n = String(name || '');
    const i = n.lastIndexOf('.');
    return i >= 0 ? n.slice(0, i) : n;
  };

  const fileTypeMeta = (item) => {
    const ext = fileExt(item?.name);
    if (['xlsx', 'xls', 'csv'].includes(ext)) return { icon: '📊', label: 'Excel', bg: '#ecfdf3', color: '#166534' };
    if (['ppt', 'pptx'].includes(ext)) return { icon: '📽️', label: 'PowerPoint', bg: '#fff7ed', color: '#c2410c' };
    if (['doc', 'docx'].includes(ext)) return { icon: '📝', label: 'Word', bg: '#eff6ff', color: '#1d4ed8' };
    if (['hwp', 'hwpx'].includes(ext)) return { icon: '📘', label: '한글', bg: '#eef2ff', color: '#4338ca' };
    if (['pdf'].includes(ext)) return { icon: '📕', label: 'PDF', bg: '#fef2f2', color: '#b91c1c' };
    if (['zip', 'rar', '7z', 'alz', 'tar', 'gz'].includes(ext)) return { icon: '📦', label: '압축', bg: '#f8fafc', color: '#334155' };
    if (['wmv', 'mp4', 'mov', 'mkv', 'avi', 'm4v'].includes(ext)) return { icon: '🎬', label: '동영상', bg: '#f1f5f9', color: '#334155' };
    if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return { icon: '🎵', label: '오디오', bg: '#f8fafc', color: '#334155' };
    if (['txt', 'md', 'rtf'].includes(ext)) return { icon: '📄', label: '문서', bg: '#f8fafc', color: '#334155' };
    return { icon: '📁', label: ext ? ext.toUpperCase() : '기타', bg: '#f8fafc', color: '#334155' };
  };



  const layoutContentWidth = Math.min(Number(viewportWidth) || 1280, 1280);
  const compactFieldStyle = { ...inputStyle, minHeight: 36, padding: '7px 10px', fontSize: 13 };
  const clubTabIsSplit = !isMobile && layoutContentWidth >= 1180;
  const attendanceTabIsSplit = !isMobile && layoutContentWidth >= 1260;
  const attendanceMemoColumnCount = isMobile ? 1 : (layoutContentWidth >= 1180 ? 3 : (layoutContentWidth >= 860 ? 2 : 1));
  const attendanceSavedColumnCount = isMobile ? 1 : (attendanceTabIsSplit ? 1 : (layoutContentWidth >= 1080 ? 3 : 2));
  const attendanceMemoCardsGrid = {
    display: 'grid',
    gap: 8,
    gridTemplateColumns: `repeat(${attendanceMemoColumnCount}, minmax(0, 1fr))`,
    alignItems: 'start',
  };
  const attendanceSavedGrid = {
    display: 'grid',
    gap: 6,
    gridTemplateColumns: `repeat(${attendanceSavedColumnCount}, minmax(0, 1fr))`,
    maxHeight: attendanceTabIsSplit ? 520 : 'none',
    overflowY: attendanceTabIsSplit ? 'auto' : 'visible',
  };

  const academicYearRange = useMemo(() => {
    const y = Number(String(academicYear || '').replace(/[^0-9]/g, ''));
    if (!Number.isFinite(y) || y < 2000 || y > 3000) return null;
    const start = new Date(y, 2, 1, 0, 0, 0, 0); // 3/1
    const end = new Date(y + 1, 2, 0, 23, 59, 59, 999); // next year 2/end
    return { start, end };
  }, [academicYear]);
  const inAcademicYear = (raw) => {
    if (!academicYearRange) return true;
    const d = new Date(raw || '');
    if (!Number.isFinite(d.getTime())) return false;
    return d >= academicYearRange.start && d <= academicYearRange.end;
  };
  const googleTasksIncomplete = useMemo(() => (googleTasksItems || []).filter((t) => String(t.status || '') !== 'completed'), [googleTasksItems]);
  const unfinishedTodosCount = useMemo(
    () => schedules.filter((s) => String(s.kind || 'todo') === 'todo' && !s.done).length + googleTasksIncomplete.length,
    [schedules, googleTasksIncomplete]
  );
  const todaysEventsCount = useMemo(() => {
    const now = new Date();
    const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const localCount = schedules.filter((s) => String(s.kind || 'todo') === 'event' && String(s.due_at || '').slice(0, 10) === ymd).length;
    const googleCalCount = (googleCalendarEvents || []).filter((e) => {
      const { startYmd, endYmd } = eventRangeYmd(e);
      return startYmd && endYmd && startYmd <= ymd && ymd <= endYmd;
    }).length;
    return localCount + googleCalCount;
  }, [schedules, googleCalendarEvents]);

  const dashboardUpcomingItems = useMemo(() => {
    const now = new Date();
    const twoWeeks = new Date(now.getTime() + (14 * 24 * 60 * 60 * 1000));
    const localEvents = schedules
      .filter((s) => String(s.kind || 'todo') === 'event' && s.due_at)
      .map((s) => ({ id: `local_event_${s.id}`, source: 'local_event', title: s.title, dueAt: s.due_at, endAt: null, startDate: null, endDate: null }));
    const googleEvents = (googleCalendarEvents || [])
      .map((e, idx) => ({ id: `gcal_${idx}_${e.start_at}`, source: 'google_calendar', title: e.title, dueAt: e.start_at, endAt: e.end_at || null, startDate: e.start_date || null, endDate: e.end_date || null }));

    return [...localEvents, ...googleEvents]
      .filter((x) => {
        const d = new Date(x.dueAt || '');
        return Number.isFinite(d.getTime()) && d >= now && d <= twoWeeks;
      })
      .sort((a, b) => String(a.dueAt || '').localeCompare(String(b.dueAt || '')))
      .slice(0, 30);
  }, [schedules, googleCalendarEvents]);

  const dashboardTodoItems = useMemo(() => {
    const localTodos = schedules
      .filter((s) => String(s.kind || 'todo') === 'todo' && !s.done)
      .map((s) => ({ id: `local_todo_${s.id}`, source: 'local_todo', title: s.title, dueAt: s.due_at }));
    const googleTodos = googleTasksIncomplete
      .map((t) => ({ id: `gtask_${t.id}`, source: 'google_task', title: t.title, dueAt: t.due_at }));
    return [...localTodos, ...googleTodos]
      .sort((a, b) => {
        const av = String(a.dueAt || '9999-12-31T23:59:59');
        const bv = String(b.dueAt || '9999-12-31T23:59:59');
        return av.localeCompare(bv);
      })
      .slice(0, 120);
  }, [schedules, googleTasksIncomplete]);
  const dashboardUpcomingCounts = useMemo(() => ({
    localEvent: dashboardUpcomingItems.filter((it) => it.source === 'local_event').length,
    googleCalendar: dashboardUpcomingItems.filter((it) => it.source === 'google_calendar').length,
  }), [dashboardUpcomingItems]);
  const dashboardTodoCounts = useMemo(() => ({
    localTodo: dashboardTodoItems.filter((it) => it.source === 'local_todo').length,
    googleTask: dashboardTodoItems.filter((it) => it.source === 'google_task').length,
  }), [dashboardTodoItems]);
  const dashboardLunchDishes = useMemo(() => (
    Array.isArray(dashboardLunch?.dishes) ? dashboardLunch.dishes : []
  ), [dashboardLunch]);
  const dashboardLunchMenuText = useMemo(() => dashboardLunchDishes.join(' 쨌 '), [dashboardLunchDishes]);
  const dashboardUpcomingMeals = useMemo(() => (
    Array.isArray(dashboardLunch?.upcomingMeals)
      ? dashboardLunch.upcomingMeals
        .filter((item) => item && typeof item === 'object')
        .slice(0, 3)
      : []
  ), [dashboardLunch]);
  const dashboardLunchHasTodayMenu = dashboardLunch?.status === 'ok' && Boolean(dashboardLunchMenuText);
  const dashboardLunchDisplayMeals = useMemo(() => {
    const meals = dashboardLunchHasTodayMenu
      ? [{
        mealDate: dashboardLunch?.mealDate,
        dishes: dashboardLunchDishes,
      }, ...dashboardUpcomingMeals]
      : dashboardUpcomingMeals;
    return meals
      .filter((item) => Array.isArray(item?.dishes) && item.dishes.length)
      .slice(0, 3);
  }, [dashboardLunchHasTodayMenu, dashboardLunch?.mealDate, dashboardLunchDishes, dashboardUpcomingMeals]);
  const dashboardWeatherHourly = useMemo(() => (
    Array.isArray(dashboardWeather?.hourly) ? dashboardWeather.hourly : []
  ), [dashboardWeather]);
  const dashboardWeatherPreview = useMemo(() => dashboardWeatherHourly.slice(0, 12), [dashboardWeatherHourly]);
  const dashboardWeatherCurrent = dashboardWeather?.current || null;
  const dashboardWeatherCurrentPrecipitationText = useMemo(() => {
    if (!dashboardWeatherCurrent) return '-';
    if (isFiniteNumberValue(dashboardWeatherCurrent.precipitationProbability)) return `${dashboardWeatherCurrent.precipitationProbability}%`;
    const amount = String(dashboardWeatherCurrent.precipitationAmount || '').trim();
    return amount || '-';
  }, [dashboardWeatherCurrent]);
  const dashboardWeatherNote = useMemo(() => String(dashboardWeather?.forecastNote || '').trim(), [dashboardWeather]);
  const dashboardWeatherCompactDesktop = !isMobile && !isWebView && viewportWidth > 980;
  const dashboardTopCardMinHeight = !isMobile && !isWebView && viewportWidth > 980 ? 168 : undefined;
  const dashboardTopInnerBoxMinHeight = !isMobile && !isWebView && viewportWidth > 980 ? 88 : undefined;
  const dashboardQuickGridStyle = isMobile || isWebView
    ? { ...quickGrid, gridTemplateColumns: `repeat(${viewportWidth <= 560 ? 2 : 3}, minmax(0, 1fr))` }
    : quickGrid;
  const dashboardTopInfoGrid = !isMobile && !isWebView && viewportWidth > 980
    ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, alignItems: 'start', marginBottom: 14 }
    : { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, marginBottom: 16 };
  const dashboardBottomGrid = isMobile || isWebView
    ? twoColGrid
    : { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 };
  const settingsCompactDesktop = !isMobile && !isWebView && viewportWidth > 980;

  const dashboardActivityLogs = useMemo(() => {
    return (activityLogs || []).slice(0, 10);
  }, [activityLogs]);
  const weekdayKorean = (dateText) => {
    const map = ['일', '월', '화', '수', '목', '금', '토'];
    const d = new Date(`${String(dateText || '').slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    return map[d.getDay()] || '';
  };

  const memoDateLabel = (raw) => {
    const v = String(raw || '').trim();
    if (!v) return '-';
    return v.slice(0, 10);
  };

  const upcomingMealDateLabel = (raw) => {
    const v = String(raw || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return v || '-';
    const [, month, day] = v.split('-');
    return `${Number(month)}/${Number(day)}(${weekdayKorean(v) || '-'})`;
  };

  const weatherInfo = (code) => {
    const value = Number(code);
    if (value === 0) return { emoji: '☀️', label: '맑음' };
    if ([1].includes(value)) return { emoji: '🌤️', label: '대체로 맑음' };
    if ([2].includes(value)) return { emoji: '⛅', label: '구름 조금' };
    if ([3].includes(value)) return { emoji: '☁️', label: '흐림' };
    if ([45, 48].includes(value)) return { emoji: '🌫️', label: '안개' };
    if ([51, 53, 55, 56, 57].includes(value)) return { emoji: '🌦️', label: '이슬비' };
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return { emoji: '🌧️', label: '비' };
    if ([71, 73, 75, 77, 85, 86].includes(value)) return { emoji: '❄️', label: '눈' };
    if ([95, 96, 99].includes(value)) return { emoji: '⛈️', label: '뇌우' };
    return { emoji: '☁️', label: '구름 많음' };
  };
  function isFiniteNumberValue(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  const formatWeatherHour = (raw) => {
    const value = String(raw || '').trim();
    if (!value) return '-';
    return value.slice(11, 16) || value;
  };

  const memoBadgeDate = (raw) => {
    const v = String(raw || '').trim();
    if (!v) return '-';

    const dateText = v.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return dateText;
    const d = new Date(`${dateText}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateText;

    const week = ['일', '월', '화', '수', '목', '금', '토'];
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}. ${m}. ${day}. (${week[d.getDay()] || '-'})`;
  };

  const trySetActiveTab = (nextTab) => {
    const normalizedNextTab = nextTab === 'announcements' ? 'memos' : nextTab;
    if (normalizedNextTab === activeTab) return true;
    if (memoDirty && activeTab === 'memos' && !confirm('저장되지 않은 메모가 있습니다. 이동할까요?')) return false;
    if (announcementDirty && activeTab === 'memos' && !confirm('저장되지 않은 전달사항이 있습니다. 이동할까요?')) return false;
    setActiveTab(normalizedNextTab);
    if (isMobile) setMenuOpen(false);
    return true;
  };

  const gotoTaskMonthByDate = (raw) => {
    const v = String(raw || '').trim();
    const m = v.match(/^(\d{4}-\d{2})/);
    if (m) setTaskCalendarMonth(m[1]);
    trySetActiveTab('tasks');
  };

  /* const weeklyReportText = useMemo(() => {
    try {
    const byClass = students.reduce((acc, s) => {
      const k = String(s.class_name || '미지정');
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    const classLines = Object.keys(byClass).sort((a, b) => a.localeCompare(b, 'ko')).map((k) => `- ${k}: ${byClass[k]}명`).join('\n') || '- 데이터 없음';

    const byRisk = students.reduce((acc, s) => {
      const k = String(s.risk_level || 'normal');
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    const riskMap = { normal: '일반', watch: '관심', focus: '집중', high: '집중' };
    const riskLines = Object.keys(byRisk).map((k) => `- ${riskMap[k] || k}: ${byRisk[k]}명`).join('\n') || '- 데이터 없음';

    const byCat = reportNotes.reduce((acc, n) => {
      const k = String(n.category || 'general');
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    const catMap = { general: '일반', class: '수업', guidance: '생활지도', parent: '보호자', observe: '관찰' };
    const catLines = Object.keys(byCat).map((k) => `- ${catMap[k] || k}: ${byCat[k]}건`).join('\n') || '- 데이터 없음';

    const totalSchedules = reportSchedules.length;
    const doneSchedules = reportSchedules.filter((s) => s.done).length;
    const pendingSchedules = totalSchedules - doneSchedules;

    const recentNoteLines = reportNotes
      .slice(0, 10)
      .map((n) => `- [${formatNoteDateTime(n.note_date)}] ${n.student_name || ''} ${n.content || ''}`)
      .join('\n') || '- 기간 내 상담 기록 없음';

    const recentScheduleLines = reportSchedules
      .slice(0, 10)
      .map((s) => `- ${s.done ? '?꾨즺' : '誘몄셿猷?} | ${s.title}${s.due_at ? ` (${new Date(s.due_at).toLocaleString()})` : ''}`)
      .join('\n') || '- 기간 내 일정 없음';

    const rangeText = `${reportStartDate || '-'} ~ ${reportEndDate || '-'}`;
    return `리포트\n기간: ${rangeText}\n\n[학생 현황]\n총원: ${students.length}명\n\n반별 현황\n${classLines}\n\n위험도 분포\n${riskLines}\n\n[상담/관찰]\n기간 내 총 ${reportNotes.length}건\n카테고리\n${catLines}\n\n최근 상담 기록\n${recentNoteLines}\n\n[일정]\n기간 내 전체: ${totalSchedules}건 / 완료: ${doneSchedules}건 / 미완료: ${pendingSchedules}건\n\n최근 일정\n${recentScheduleLines}\n\n[활동 로그]\n${reportActivities.slice(0, 12).map((x) => `- [${new Date(x.at).toLocaleString()}] ${x.category}: ${x.text}`).join('\n') || '- 기간 내 활동 로그 없음'}`;
    } catch (e) {
      return `리포트 생성 오류: ${e?.message || 'unknown'}`;
    }
  }, [students, reportNotes, reportSchedules, reportActivities, reportStartDate, reportEndDate]); */

  const hiddenStudentPhotoPathSet = useMemo(() => {
    const toPath = (value) => {
      const raw = String(value || '').trim();
      if (!raw) return '';
      try {
        return new URL(raw, API).pathname || '';
      } catch {
        return raw;
      }
    };
    return new Set(
      Object.values(studentPhotos || {})
        .map((item) => toPath(item?.url))
        .filter(Boolean)
    );
  }, [studentPhotos]);

  const visibleFileItems = useMemo(() => {
    const toPath = (value) => {
      const raw = String(value || '').trim();
      if (!raw) return '';
      try {
        return new URL(raw, API).pathname || '';
      } catch {
        return raw;
      }
    };
    return (fileItems || []).filter((item) => !hiddenStudentPhotoPathSet.has(toPath(item?.url)));
  }, [fileItems, hiddenStudentPhotoPathSet]);

  const sortedFileItems = useMemo(() => {
    const arr = [...visibleFileItems];
    if (fileSort === 'name') return arr.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
    if (fileSort === 'size') return arr.sort((a, b) => Number(b.size || 0) - Number(a.size || 0));
    return arr.sort((a, b) => String(b.created_at || b.createdAt || '').localeCompare(String(a.created_at || a.createdAt || '')));
  }, [visibleFileItems, fileSort]);

  useEffect(() => {
    const [y] = String(taskCalendarMonth || '').split('-').map(Number);
    if (!y) return;
    const fallback = KR_HOLIDAYS_FALLBACK[y] || {};
    let cancelled = false;
    setHolidayMap(fallback);
    if (!token) return () => { cancelled = true; };

    apiFetch(`/api/google-calendar/holidays?year=${encodeURIComponent(String(y))}`)
      .then((payload) => {
        if (cancelled) return;
        const map = { ...fallback };
        const holidays = Array.isArray(payload?.holidays) ? payload.holidays : [];
        holidays.forEach((holiday) => {
          const date = String(holiday?.date || '');
          const name = String(holiday?.name || '').trim();
          if (!date.startsWith(`${y}-`) || !name) return;
          map[date] = name;
        });
        setHolidayMap(map);
      })
      .catch(() => {
        if (!cancelled) setHolidayMap(fallback);
      });

    return () => { cancelled = true; };
  }, [taskCalendarMonth, token]);

  const activeHomeroomStudents = useMemo(() => activeStudents.filter((s) => s.class_name === homeroomClass), [activeStudents, homeroomClass]);
  const activeHomeroomStudentsWithBirthdays = useMemo(() => activeHomeroomStudents.filter((s) => !!s.birth_date), [activeHomeroomStudents]);
  const homeroomBirthdayMap = useMemo(() => {
    const map = {};
    (activeHomeroomStudentsWithBirthdays || []).forEach((s) => {
      const bd = String(s.birth_date || '').slice(0, 10);
      const m = bd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return;
      const year = Number(taskCalendarMonth.slice(0, 4));
      const iso = `${year}-${m[2]}-${m[3]}`;
      if (!map[iso]) map[iso] = [];
      map[iso].push(`${s.name} 생일`);
    });
    return map;
  }, [activeHomeroomStudentsWithBirthdays, taskCalendarMonth]);
  const doLogin = async () => {
    setAuthError('');
    try {
      const j = await fetch(`${API}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword, rememberMe: rememberLogin }),
      }).then((r) => r.json());
      if (!j?.token) {
        setAuthError(j?.error || '로그인 실패: 아이디와 비밀번호를 확인해 주세요.');
        return;
      }
      localStorage.removeItem('teacher_notebook_token_v1');
      sessionStorage.removeItem('teacher_notebook_token_v1');
      (rememberLogin ? localStorage : sessionStorage).setItem('teacher_notebook_token_v1', j.token);
      setToken(j.token);
      setAuthed(true);
      setAuthPassword('');
      setAuthPasswordConfirm('');
    } catch (e) {
      setAuthError(`로그인 실패: ${e?.message || '서버 연결 오류'}`);
    }
  };

  const doRegister = async () => {
    setAuthError('');
    if (authPassword !== authPasswordConfirm) {
      setAuthError('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    try {
      const j = await fetch(`${API}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: authName, username: authUsername, password: authPassword }),
      }).then((r) => r.json());
      if (j?.error) {
        setAuthError(j.error);
        return;
      }
      alert('회원가입 완료');
      setAuthMode('login');
      setAuthError('');
      setAuthPassword('');
      setAuthPasswordConfirm('');
    } catch (e) {
      setAuthError(`회원가입 실패: ${e?.message || '서버 연결 오류'}`);
    }
  };

  const addStudent = async (e) => {
    e.preventDefault();
    await apiFetch('/api/students', {
      method: 'POST',
      body: JSON.stringify({ academicYear, name: studentName, className: className || homeroomClass, studentNo, riskLevel }),
    });
    pushActivity('학생 추가', `${className || homeroomClass} ${studentNo || '-'}번 ${studentName} 추가`);
    setStudentName(''); setStudentNo('');
    await loadAll();
  };

  const importStudentsBulk = async () => {
    const lines = bulkText.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
    if (!lines.length) return;

    const studentsToImport = [];
    for (const line of lines) {
      const parts = line.split(',').map((p) => p.trim());
      if (parts.length < 3) continue;
      const [klass, no, name, genderRaw = '', sPhone = '', gPhone = '', bDateRaw = ''] = parts;
      const gender = ['남', '여'].includes(String(genderRaw || '')) ? String(genderRaw) : '';
      
      // Normalize date: "2013. 7. 12." -> "2013-07-12"
      let birthDate = '';
      if (bDateRaw) {
        const dMatch = bDateRaw.match(/(\d{4})[.\-\s]+(\d{1,2})[.\-\s]+(\d{1,2})/);
        if (dMatch) {
          birthDate = `${dMatch[1]}-${dMatch[2].padStart(2, '0')}-${dMatch[3].padStart(2, '0')}`;
        }
      }

      studentsToImport.push({
        academicYear,
        name,
        className: klass || homeroomClass,
        studentNo: no,
        riskLevel: 'normal',
        gender,
        studentPhone: sPhone,
        guardianPhone: gPhone,
        birthDate: birthDate
      });
    }

    if (studentsToImport.length > 0) {
      try {
        await apiFetch('/api/students/bulk', {
          method: 'POST',
          body: JSON.stringify({ students: studentsToImport }),
        });
        setBulkText('');
        pushActivity('학생 추가', `학생 일괄 추가/갱신 ${studentsToImport.length}건`);
        await loadAll();
        setActionMessage(`학생 ${studentsToImport.length}명이 성공적으로 처리되었습니다.`);
      } catch (e) {
        setActionMessage(`일괄 처리 중 오류가 발생했습니다: ${e.message}`);
      }
    }
  };

  const startEditStudent = () => {
    if (!selectedStudent) return;
    setEditingStudentId(selectedStudent.id);
    setDetailName(selectedStudent.name || '');
    setDetailClassName(selectedStudent.class_name || '');
    setDetailStudentNo(selectedStudent.student_no || '');
    setDetailRiskLevel(selectedStudent.risk_level || 'normal');
  };

  const saveEditStudent = async () => {
    if (!editingStudentId) return;
    try {
      await apiFetch(`/api/students/${editingStudentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: detailName, className: detailClassName, studentNo: detailStudentNo, riskLevel: detailRiskLevel }),
      });
      pushActivity('학생 수정', `${detailClassName || '-'} ${detailStudentNo || '-'}번 ${detailName || ''} 수정`);
      setEditingStudentId(null);
      await loadAll();
      setActionMessage('학생 정보를 수정했습니다.');
    } catch (error) {
      setActionMessage(`학생 수정 실패: ${error?.message || 'API 오류'}`);
    }
  };

  const cycleSelectedStudentRisk = async () => {
    if (!selectedStudent) return;
    const order = ['normal', 'watch', 'focus'];
    const cur = String(selectedStudent.risk_level || 'normal');
    const idx = order.indexOf(cur);
    const next = order[(idx + 1) % order.length] || 'normal';
    try {
      const saved = await apiFetch(`/api/students/${selectedStudent.id}`, { method: 'PATCH', body: JSON.stringify({ riskLevel: next }) });
      setStudents((prev) => prev.map((s) => (String(s.id) === String(selectedStudent.id) ? { ...s, ...saved } : s)));
      setActionMessage(`${selectedStudent.name} 상태가 ${riskBadge(next).label}(으)로 변경되었습니다.`);
      pushActivity('학생 상태 변경', `${selectedStudent.name} 상태 ${riskBadge(cur).label} -> ${riskBadge(next).label}`);
    } catch (e) {
      setActionMessage(`학생 상태 변경 실패: ${e?.message || 'API 오류'}`);
    }
  };

  useEffect(() => {
    if (activeTab !== 'search') return;
    const query = String(deferredGlobalSearchQuery || '').trim();
    if (!query) {
      globalSearchRequestRef.current += 1;
      setGlobalSearchLoading(false);
      setGlobalSearchError('');
      setGlobalSearchResults([]);
      setGlobalSearchCounts({});
      setGlobalSearchTotal(0);
      return;
    }
    setGlobalSearchLoading(true);
    const timer = setTimeout(() => {
      runGlobalSearch({ query, scope: globalSearchScope });
    }, 160);
    return () => clearTimeout(timer);
  }, [activeTab, deferredGlobalSearchQuery, globalSearchScope]);

  const markStudentTransferred = async () => {
    if (!selectedStudent) return;
    const v = String(transferDateInput || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      setActionMessage('전출일 형식이 올바르지 않습니다. 예: 2026-02-27');
      return;
    }
    try {
      await apiFetch(`/api/students/${selectedStudent.id}`, { method: 'PATCH', body: JSON.stringify({ transferredAt: v, transferred_at: v }) });
      const reloaded = await apiFetch(`/api/students/${selectedStudent.id}`);
      const savedAt = String(reloaded?.transferred_at || '').slice(0, 10);
      if (!savedAt) {
        setActionMessage('전출 저장 확인 실패: 서버 DB에 전출일이 반영되지 않았습니다.');
        await loadAll();
        return;
      }
      setStudents((prev) => prev.map((s) => (String(s.id) === String(selectedStudent.id) ? { ...s, ...reloaded } : s)));
      setTransferDateInput(savedAt);
      setShowTransferredStudents(true);
      setStudentInfoEditMode(false);
      pushActivity('학생 전출', `${selectedStudent.name} 전출 처리 (${savedAt})`);
      setActionMessage(`${selectedStudent.name} 학생을 전출 처리했습니다.`);
      await loadAll();
    } catch (e) {
      setActionMessage(`전출 처리 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const clearStudentTransferred = async () => {
    if (!selectedStudent?.transferred_at) return;
    if (!confirm(`${selectedStudent.name} 학생의 전출 처리를 취소할까요?`)) return;
    try {
      await apiFetch(`/api/students/${selectedStudent.id}`, { method: 'PATCH', body: JSON.stringify({ transferredAt: '', transferred_at: '' }) });
      const reloaded = await apiFetch(`/api/students/${selectedStudent.id}`);
      setStudents((prev) => prev.map((s) => (String(s.id) === String(selectedStudent.id) ? { ...s, ...reloaded, transferred_at: '' } : s)));
      setTransferDateInput(toSeoulYmd());
      pushActivity('학생 전출 취소', `${selectedStudent.name} 전출 취소`);
      setActionMessage(`${selectedStudent.name} 학생 전출을 취소했습니다.`);
      await loadAll();
    } catch (e) {
      setActionMessage(`전출 취소 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const deleteStudent = async () => {
    if (!selectedStudentId) return;
    try {
      const deletingName = selectedStudent?.name || '학생';
      await apiFetch(`/api/students/${selectedStudentId}`, { method: 'DELETE' });
      pushActivity('학생 삭제', `${deletingName} 삭제`);
      setStudents((prev) => prev.filter((s) => String(s.id) !== String(selectedStudentId)));
      setNotes((prev) => prev.filter((n) => String(n.student_id) !== String(selectedStudentId)));
      setClubs((prev) => prev.map((club) => ({ ...club, student_ids: (club.student_ids || []).filter((id) => String(id) !== String(selectedStudentId)) })));
      setStudentPhotos((prev) => {
        const next = { ...prev };
        delete next[String(selectedStudentId)];
        return next;
      });
      setSelectedStudentId('');
      setConfirmDeleteStudent(false);
      setActionMessage('학생을 삭제했습니다.');
    } catch (e) {
      setActionMessage(`학생 삭제 실패: ${e?.message || 'API 오류'}`);
      await loadAll();
    }
  };

  const resetClubForm = () => {
    setEditingClubId(null);
    setClubNameDraft('');
    setClubAttendanceEnabled(false);
  };

  const submitClub = async () => {
    const name = String(clubNameDraft || '').trim();
    if (!name) {
      setActionMessage('선택 과목 이름을 입력해 주세요.');
      return;
    }
    try {
      const payload = { academicYear, name, useForAttendance: clubAttendanceEnabled };
      const saved = editingClubId
        ? await apiFetch(`/api/clubs/${editingClubId}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await apiFetch('/api/clubs', { method: 'POST', body: JSON.stringify(payload) });
      setClubs((prev) => sortClubList([saved, ...prev.filter((club) => String(club.id) !== String(saved.id))]));
      setSelectedClubId(String(saved.id));
      if (saved.use_for_attendance && !attendanceClubId) setAttendanceClubId(String(saved.id));
      pushActivity(editingClubId ? '선택 과목 수정' : '선택 과목 추가', `${name}${clubAttendanceEnabled ? ' (수업)' : ''}`);
      setActionMessage(editingClubId ? '선택 과목을 수정했습니다.' : '선택 과목을 추가했습니다.');
      resetClubForm();
    } catch (e) {
      setActionMessage(`선택 과목 저장 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const startEditClub = (club) => {
    setEditingClubId(club.id);
    setSelectedClubId(String(club.id));
    setClubNameDraft(String(club.name || ''));
    setClubAttendanceEnabled(Boolean(club.use_for_attendance));
  };

  const deleteClub = async (club) => {
    if (!club?.id) return;
    if (!confirm(`${club.name} 선택 과목을 삭제할까요?`)) return;
    try {
      await apiFetch(`/api/clubs/${club.id}`, { method: 'DELETE' });
      setClubs((prev) => prev.filter((row) => String(row.id) !== String(club.id)));
      if (String(selectedClubId) === String(club.id)) setSelectedClubId('');
      if (String(attendanceClubId) === String(club.id)) setAttendanceClubId('');
      if (String(editingClubId) === String(club.id)) resetClubForm();
      pushActivity('선택 과목 삭제', `${club.name} 삭제`);
      setActionMessage('선택 과목을 삭제했습니다.');
    } catch (e) {
      setActionMessage(`선택 과목 삭제 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const toggleClubMember = async (club, studentId) => {
    if (!club?.id || !studentId) return;
    const nextIds = new Set((club.student_ids || []).map((id) => String(id)));
    if (nextIds.has(String(studentId))) nextIds.delete(String(studentId));
    else nextIds.add(String(studentId));
    try {
      const saved = await apiFetch(`/api/clubs/${club.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ studentIds: Array.from(nextIds).map((id) => Number(id)) }),
      });
      setClubs((prev) => sortClubList([saved, ...prev.filter((row) => String(row.id) !== String(saved.id))]));
    } catch (e) {
      setActionMessage(`선택 과목 편성 저장 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const onPickStudentPhoto = async (studentId, file) => {
    if (!studentId || !file) return;
    if (file.size > 10 * 1024 * 1024) {
      setActionMessage(`${file.name}: 학생 사진은 10MB 이하만 업로드할 수 있습니다.`);
      return;
    }
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('studentId', String(studentId));
      const res = await fetch(`${API}/api/student-photos/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || '업로드 실패');
      const updatedAt = String(j.updatedAt || new Date().toISOString());
      setStudents((prev) => prev.map((student) => (String(student.id) === String(studentId)
        ? { ...student, photo_url: String(j.url || ''), photo_updated_at: updatedAt }
        : student)));
      setStudentPhotos((prev) => ({
        ...prev,
        [String(studentId)]: { url: toAbsoluteAssetUrl(j.url), updatedAt },
      }));
    } catch (e) {
      setActionMessage(`학생 사진 업로드 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const deleteStudentPhoto = async (studentId) => {
    if (!studentId) return;
    await apiFetch('/api/student-photos', {
      method: 'DELETE',
      body: JSON.stringify({ studentId }),
    }).catch(() => null);
    setStudents((prev) => prev.map((student) => (String(student.id) === String(studentId)
      ? { ...student, photo_url: '', photo_updated_at: '' }
      : student)));
    setStudentPhotos((prev) => {
      const next = { ...prev };
      delete next[String(studentId)];
      return next;
    });
  };

  const toStudentFileCode = (student) => {
    const m = String(student?.class_name || '').match(/(\d+)\s*-\s*(\d+)/);
    const grade = m ? Number(m[1]) : 0;
    const klass = m ? Number(m[2]) : 0;
    const no = Number(String(student?.student_no || '').replace(/[^0-9]/g, ''));
    if (!grade || !klass || !no) return '';
    return `${grade}${String(klass).padStart(2, '0')}${String(no).padStart(2, '0')}`;
  };

  const bulkUploadStudentPhotos = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const mapByCode = {};
    students.forEach((s) => {
      const code = toStudentFileCode(s);
      if (code) mapByCode[code] = s.id;
    });

    let ok = 0;
    let miss = 0;
    const nextPatch = {};

    setFileUploadState({ active: true, total: files.length, done: 0, name: '', percent: 0 });

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setFileUploadState((st) => ({ ...st, name: f.name, done: i }));
      
      const code = String(f.name || '').replace(/\.[^.]+$/, '').trim();
      const studentId = mapByCode[code];
      
      if (!studentId) {
        miss += 1;
        setFileUploadState((st) => ({ ...st, done: i + 1 }));
        continue;
      }

      if (f.size > 10 * 1024 * 1024) {
        miss += 1;
        setFileUploadState((st) => ({ ...st, done: i + 1 }));
        continue;
      }

      try {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('studentId', String(studentId));
        const res = await fetch(`${API}/api/student-photos/upload`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || '업로드 실패');
        
        nextPatch[String(studentId)] = { url: toAbsoluteAssetUrl(j.url), updatedAt: String(j.updatedAt || new Date().toISOString()) };
        ok += 1;
      } catch (e) {
        console.warn(`Bulk photo upload failed for ${f.name}`, e);
        miss += 1;
      }
      setFileUploadState((st) => ({ ...st, done: i + 1 }));
    }

    setFileUploadState((st) => ({ ...st, active: false }));
    if (Object.keys(nextPatch).length) {
      setStudents((prev) => prev.map((student) => {
        const hit = nextPatch[String(student.id)];
        if (!hit) return student;
        const relativeUrl = (() => {
          try {
            return new URL(hit.url, API).pathname || '';
          } catch {
            return hit.url;
          }
        })();
        return { ...student, photo_url: relativeUrl, photo_updated_at: hit.updatedAt };
      }));
      setStudentPhotos((prev) => ({ ...prev, ...nextPatch }));
    }
    setActionMessage(`사진 일괄 추가 완료: ${ok}명 적용${miss ? `, ${miss}건 미매칭 실패` : ''}`);
  };

  const saveStudentContactsAndInfo = async () => {
    if (!selectedStudentId) return;
    try {
      const saved = await apiFetch(`/api/students/${selectedStudentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ studentPhone, guardianPhone, gender: studentGender, birthDate: studentBirthDate, basicInfo: studentBasicInfo }),
      });
      setStudents((prev) => prev.map((s) => (String(s.id) === String(selectedStudentId) ? { ...s, ...saved, gender: (saved?.gender ?? studentGender), birth_date: (saved?.birth_date ?? studentBirthDate) } : s)));
      pushActivity('학생 정보 수정', `${selectedStudent?.name || '학생'} 연락처/성별/생년월일/기본사항 수정`);
      setActionMessage('학생 전화번호/보호자 전화번호/성별/생년월일/기본 사항이 저장되었습니다.');
      setStudentInfoEditMode(false);
    } catch (e) {
      setActionMessage(`학생 상세 정보 저장 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const saveStudentBasicSurvey = async () => {
    if (!selectedStudentId) return;
    try {
      const saved = await apiFetch(`/api/students/${selectedStudentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ basicSurvey: studentBasicSurvey }),
      });
      setStudents((prev) => prev.map((s) => (String(s.id) === String(selectedStudentId) ? { ...s, ...saved } : s)));
      setStudentBasicMemoEditMode(false);
      setActionMessage('학생 기초조사를 저장했습니다.');
    } catch (e) {
      setActionMessage(`기초조사 저장 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const clearStudentBasicSurvey = async () => {
    if (!selectedStudentId) return;
    try {
      const saved = await apiFetch(`/api/students/${selectedStudentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ basicSurvey: '' }),
      });
      setStudents((prev) => prev.map((s) => (String(s.id) === String(selectedStudentId) ? { ...s, ...saved } : s)));
      setStudentBasicSurvey('');
      setStudentBasicMemoEditMode(false);
      setActionMessage('학생 기초조사를 삭제했습니다.');
    } catch (e) {
      setActionMessage(`기초조사 삭제 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const clearStudentField = async (field) => {
    if (!selectedStudentId) return;
    const patch = {};
    if (field === 'studentPhone') {
      setStudentPhone('');
      patch.studentPhone = '';
    } else if (field === 'guardianPhone') {
      setGuardianPhone('');
      patch.guardianPhone = '';
    } else if (field === 'gender') {
      setStudentGender('');
      patch.gender = '';
    } else if (field === 'birthDate') {
      setStudentBirthDate('');
      patch.birthDate = '';
    } else if (field === 'basicInfo') {
      setStudentBasicInfo('');
      patch.basicInfo = '';
    } else {
      return;
    }

    try {
      const saved = await apiFetch(`/api/students/${selectedStudentId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setStudents((prev) => prev.map((s) => (String(s.id) === String(selectedStudentId) ? { ...s, ...saved } : s)));
      pushActivity('학생 정보 수정', `${selectedStudent?.name || '학생'} ${field} 삭제`);
      setActionMessage('선택한 항목을 삭제했습니다.');
    } catch (e) {
      setActionMessage(`항목 삭제 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const saveNote = async (e) => {
    e.preventDefault();
    if (!selectedStudentId) return;
    try {
      if (editingIssueConsultation) {
        const saved = await apiFetch(`/api/issues/${editingIssueConsultation.issueId}/consultations/${editingIssueConsultation.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            participantName: editingIssueConsultation.participantName,
            consultationType: editingIssueConsultation.consultationType,
            consultedAt: editingIssueConsultation.consultedAt,
            content: noteContent,
            attachments: noteAttachments,
          }),
        });
        setStudentIssueConsultations((previous) => previous.map((item) => (Number(item.id) === Number(saved.id) ? saved : item)));
        setIssueConsultations((previous) => previous.map((item) => (Number(item.id) === Number(saved.id) ? saved : item)));
        pushActivity('사안 상담 기록 수정', `${selectedStudent?.name || '학생'} 사안 상담 기록 수정`);
      } else if (editingNoteId) {
        await apiFetch(`/api/notes/${editingNoteId}`, { method: 'PATCH', body: JSON.stringify({ category: noteCategory, content: noteContent, attachments: noteAttachments }) });
        pushActivity('상담일지 수정', `${selectedStudent?.name || '학생'} 상담일지 수정`);
      } else {
        await apiFetch('/api/notes', { method: 'POST', body: JSON.stringify({ academicYear, studentId: Number(selectedStudentId), category: noteCategory, content: noteContent, attachments: noteAttachments, noteDate: new Date().toISOString() }) });
        pushActivity('상담일지 추가', `${selectedStudent?.name || '학생'} 상담일지 추가`);
      }
      await confirmStudentNoteSaved();
      setEditingIssueConsultation(null);
      if (!editingIssueConsultation) {
        const refreshedNotes = await apiFetch(`/api/notes?year=${academicYear}`).catch(() => null);
        if (Array.isArray(refreshedNotes)) setNotes(refreshedNotes);
      }
      setActionMessage(editingNoteId || editingIssueConsultation ? '상담 기록을 수정했습니다.' : '상담 기록을 추가했습니다.');
    } catch (error) {
      setActionMessage(`상담 기록 저장 실패: ${error?.message || 'API 오류'}`);
    }
  };

  const editNote = (n) => {
    if (n?.source === 'issue') {
      setEditingNoteId(null);
      setEditingIssueConsultation({
        id: n.issue_consultation_id,
        issueId: n.issue_id,
        participantName: n.participant_name,
        consultationType: n.consultation_type,
        consultedAt: n.note_date,
      });
    } else {
      setEditingIssueConsultation(null);
      setEditingNoteId(n.id);
    }
    setSelectedStudentId(String(n.student_id));
    beginStudentNoteEdit({
      id: n?.source === 'issue' ? null : n.id,
      category: n.category || 'general',
      content: n.content || '',
      attachments: Array.isArray(n.attachments) ? n.attachments : [],
    });
    setActiveTab('students');
  };

  const deleteNote = async (noteOrId) => {
    if (!confirm('이 기록을 삭제할까요?')) return;
    if (typeof noteOrId === 'object' && noteOrId?.source === 'issue') {
      await apiFetch(`/api/issues/${noteOrId.issue_id}/consultations/${noteOrId.issue_consultation_id}`, { method: 'DELETE' });
      setStudentIssueConsultations((previous) => previous.filter((item) => Number(item.id) !== Number(noteOrId.issue_consultation_id)));
      setIssueConsultations((previous) => previous.filter((item) => Number(item.id) !== Number(noteOrId.issue_consultation_id)));
      if (Number(editingIssueConsultation?.id) === Number(noteOrId.issue_consultation_id)) {
        await confirmStudentNoteSaved();
        setEditingIssueConsultation(null);
      }
      pushActivity('사안 상담 기록 삭제', `${selectedStudent?.name || '학생'} 사안 상담 기록 삭제`);
      return;
    }
    const id = typeof noteOrId === 'object' ? noteOrId?.id : noteOrId;
    await apiFetch(`/api/notes/${id}`, { method: 'DELETE' });
    if (String(editingNoteId) === String(id)) await confirmStudentNoteSaved();
    pushActivity('상담일지 삭제', `${selectedStudent?.name || '학생'} 상담일지 삭제`);
    await loadAll();
  };

  const addSchedule = async (e) => {
    e.preventDefault();
    const wasEditing = Boolean(editingScheduleId);
    try {
      if (wasEditing) {
        await apiFetch(`/api/schedules/${editingScheduleId}`, { method: 'PATCH', body: JSON.stringify({ title: scheduleTitle, dueAt: dueAt || null, kind: scheduleKind }) });
        pushActivity('일정 수정', `${scheduleTitle} 수정`);
      } else {
        await apiFetch('/api/schedules', { method: 'POST', body: JSON.stringify({ title: scheduleTitle, dueAt: dueAt || null, kind: scheduleKind }) });
        pushActivity('일정 추가', `${scheduleTitle} 추가`);
      }
      setEditingScheduleId(null);
      setScheduleTitle('');
      setScheduleKind('todo');
      setDueAt('');
      await loadAll();
      setActionMessage(wasEditing ? '일정을 수정했습니다.' : '일정을 추가했습니다.');
    } catch (error) {
      setActionMessage(`일정 저장 실패: ${error?.message || 'API 오류'}`);
    }
  };

  const startEditSchedule = (s) => {
    setEditingScheduleId(s.id);
    setScheduleTitle(s.title || '');
    setScheduleKind(String(s.kind || 'todo') === 'event' ? 'event' : 'todo');
    setDueAt(s.due_at ? toSeoulDateTimeLocal(s.due_at) : '');
  };

  const deleteSchedule = async (id) => {
    const target = schedules.find((s) => Number(s.id) === Number(id));
    try {
      await apiFetch(`/api/schedules/${id}`, { method: 'DELETE' });
      pushActivity('일정 삭제', `${target?.title || '일정'} 삭제`);
      setSchedules((prev) => prev.filter((s) => Number(s.id) !== Number(id)));
      setConfirmDeleteScheduleId(null);
      setActionMessage('일정을 삭제했습니다.');
    } catch (e) {
      setActionMessage(`일정 삭제 실패: ${e?.message || 'API 오류'}`);
      await loadAll();
      return;
    }
    if (editingScheduleId === id) {
      setEditingScheduleId(null);
      setScheduleTitle('');
      setScheduleKind('todo');
      setDueAt('');
    }
  };

  const toggleSchedule = async (id) => {
    await apiFetch(`/api/schedules/${id}/toggle`, { method: 'PATCH' });
    await loadAll();
  };

  const memoWorkspaceDesktopHeight = 700;
  const memoWorkspaceCardStyle = isMobile
    ? { marginBottom: 0 }
    : { marginBottom: 0, padding: 12, display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: memoWorkspaceDesktopHeight, height: memoWorkspaceDesktopHeight };
  const memoWorkspaceTitleStyle = { margin: '0 0 9px 0' };
  const memoMonthlyListMaxHeight = isMobile ? 288 : 282;
  const openMemoUnifiedSearchResult = (item) => {
    setMemoSearchQuery('');
    if (item?.searchKind === 'announcement') {
      selectAnnouncement(item);
      setAnnouncementPanelMode('write');
      return;
    }
    selectMemo(item);
    const nextMonth = String(item?.memo_date || '').slice(0, 7);
    if (nextMonth) setMemoListMonth(nextMonth);
  };

  const renderAnnouncementWorkspace = () => (
    <Card style={memoWorkspaceCardStyle} title='📣 전달사항' titleStyle={memoWorkspaceTitleStyle}>
      <div style={{ display: 'grid', gap: 6, minHeight: 0, height: '100%', alignContent: 'start', gridTemplateRows: 'auto auto minmax(0, 1fr)' }}>
        <input
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          value={memoSearchQuery}
          onChange={(e) => setMemoSearchQuery(e.target.value)}
          placeholder='메모+전달사항 통합 검색'
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 3, borderRadius: 999, background: '#e2e8f0' }}>
            <button
              type='button'
              style={{ ...tabBtn, minHeight: 32, padding: '5px 11px', fontSize: 13, ...(announcementPanelMode === 'write' ? tabBtnActive : null) }}
              onClick={() => {
                setMemoSearchQuery('');
                setAnnouncementPanelMode('write');
              }}
            >
              작성
            </button>
            <button
              type='button'
              style={{ ...tabBtn, minHeight: 32, padding: '5px 11px', fontSize: 13, ...(announcementPanelMode === 'viewer' ? tabBtnActive : null) }}
              onClick={() => {
                setMemoSearchQuery('');
                setAnnouncementPanelMode('viewer');
              }}
            >
              뷰어
            </button>
          </div>
          {memoSearchQ ? (
            <span style={{ fontSize: 13, color: '#475569', fontWeight: 700 }}>통합 검색 {memoSearchResults.length}건</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button type='button' style={{ ...btnSecondary, minHeight: 36, padding: '6px 12px', fontSize: 13 }} onClick={startNewAnnouncement}>새 전달사항</button>
              {announcementPanelMode === 'viewer' && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569' }}>
                  <input type='checkbox' checked={announcementShowCompleted} onChange={(e) => setAnnouncementShowCompleted(e.target.checked)} />
                  완료된 전달사항 보기
                </label>
              )}
            </div>
          )}
        </div>

        {memoSearchQ ? (
          <div style={{ display: 'grid', gap: 10, minHeight: 0, height: '100%', gridTemplateRows: 'auto minmax(0, 1fr)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#475569' }}>메모+전달사항 검색 결과 {memoSearchResults.length}건</span>
            </div>
            <div style={{ display: 'grid', gap: 8, minHeight: 0, overflowY: 'auto', paddingRight: 2, alignContent: 'start', gridAutoRows: 'max-content' }}>
              {memoSearchResults.map((item) => {
                const isAnnouncement = item.searchKind === 'announcement';
                const normalizedContent = String(item.content || '').trim();
                const itemStateLabel = isAnnouncement ? (item.is_completed ? '전달 완료' : '전달사항') : '메모';
                const itemStateBg = isAnnouncement
                  ? (item.is_completed ? '#e2e8f0' : '#dbeafe')
                  : '#eff6ff';
                const itemStateColor = isAnnouncement
                  ? (item.is_completed ? '#475569' : '#1d4ed8')
                  : '#1d4ed8';
                return (
                  <button
                    key={`memo_announcement_search_${item.searchKind}_${item.id}`}
                    type='button'
                    onClick={() => openMemoUnifiedSearchResult(item)}
                    style={{ ...tabBtn, textAlign: 'left', border: '1px solid #cbd5e1', borderRadius: 12, padding: '12px 12px 10px', margin: 0, width: '100%', background: '#fff', display: 'grid', gap: 8 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                        <span style={{ borderRadius: 999, padding: '2px 9px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{memoBadgeDate(item.memo_date)}</span>
                        <span style={{ borderRadius: 999, padding: '2px 8px', background: itemStateBg, color: itemStateColor, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{itemStateLabel}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', minWidth: 0 }}>{String(item.title || '').trim() || '(제목 없음)'}</span>
                      </div>
                      <span style={{ fontSize: 12, color: '#64748b' }}>{item.updated_at ? formatNoteDateTime(item.updated_at) : memoBadgeDate(item.memo_date)}</span>
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.6, color: isAnnouncement && item.is_completed ? '#64748b' : '#1e293b', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {normalizedContent || '(내용 없음)'}
                    </div>
                  </button>
                );
              })}
              {memoSearchResults.length === 0 && (
                <div style={{ color: '#94a3b8', fontSize: 13, border: '1px dashed #cbd5e1', borderRadius: 12, padding: '18px 16px', background: '#fff' }}>
                  검색 결과가 없습니다.
                </div>
              )}
            </div>
          </div>
        ) : announcementPanelMode === 'write' ? (
          <div style={{ display: 'grid', gap: 8, minHeight: 0, height: '100%', alignContent: 'start', gridTemplateRows: 'auto auto auto minmax(0, 1fr) auto auto' }}>
            <div style={{ ...formRow, alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <DateField compact value={announcementDate} onChange={(v) => { setAnnouncementDate(v); setAnnouncementTouched(true); }} />
                <span style={{ fontSize: 13, color: '#475569', border: '1px solid #cbd5e1', borderRadius: 999, padding: '3px 9px', background: '#fff' }}>{weekdayKorean(announcementDate) || '-'}</span>
              </div>
              <button type='button' style={{ ...btnPrimary, minHeight: 42, height: 42, boxSizing: 'border-box' }} onClick={saveAnnouncement}>저장</button>
              {selectedAnnouncement && <button type='button' style={miniBtnDanger} onClick={() => deleteAnnouncement(selectedAnnouncement.id)}>삭제</button>}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
              왼쪽 메모와 함께 보면서 전달할 문장을 정리할 수 있습니다.
            </div>
            <input
              style={{ ...inputStyle, width: '100%', marginBottom: 0, boxSizing: 'border-box', minHeight: 40 }}
              placeholder='제목 (선택)'
              value={announcementTitle}
              onChange={(e) => { setAnnouncementTitle(e.target.value); setAnnouncementTouched(true); }}
            />
            <textarea
              style={{ ...inputStyle, width: '100%', minHeight: isMobile ? 220 : 248, height: '100%', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5 }}
              placeholder='조례/종례 때 전달할 내용을 입력하세요.'
              value={announcementContent}
              onChange={(e) => { setAnnouncementContent(e.target.value); setAnnouncementTouched(true); }}
            />
            <AttachmentPicker
              attachments={announcementAttachments}
              setAttachments={(next) => { setAnnouncementAttachments(next); setAnnouncementTouched(true); }}
              onUpload={uploadAttachmentFiles}
              onOpen={openAttachment}
              btnSecondary={btnSecondary}
            />
            {announcementDraftInfo.label && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 20, flexWrap: 'wrap', fontSize: 11, color: announcementDraftInfo.status === 'error' ? '#b91c1c' : '#64748b' }}>
                <span>{announcementDraftInfo.label}</span>
                {announcementDraftInfo.recovered && <button type='button' onClick={announcementDraftInfo.discard} style={{ border: 0, background: 'transparent', padding: 0, color: '#b91c1c', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>복구한 초안 버리기</button>}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              {selectedAnnouncement ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '4px 10px', background: selectedAnnouncement.is_completed ? '#e2e8f0' : '#dbeafe', color: selectedAnnouncement.is_completed ? '#475569' : '#1d4ed8', fontSize: 12, fontWeight: 700 }}>
                  {selectedAnnouncement.is_completed ? '전달 완료' : '전달 대기 중'}
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '4px 10px', background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 700 }}>
                  새 전달사항
                </span>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10, minHeight: 0, height: '100%', alignContent: 'start', gridTemplateRows: 'auto minmax(0, 1fr)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#475569' }}>미전달 타임라인 {pendingAnnouncementItemsCount}건</span>
            </div>
            <div style={{ display: 'grid', gap: 12, minHeight: 0, overflowY: 'auto', paddingRight: 2, alignContent: 'start', gridAutoRows: 'max-content' }}>
              {visibleAnnouncementItems.map((item, idx) => {
                const isSelected = String(item.id) === String(editingAnnouncementId);
                const isCompleted = Boolean(item.is_completed);
                const normalizedContent = String(item.content || '').trim();
                const lineColor = isCompleted ? '#cbd5e1' : '#93c5fd';
                return (
                  <div key={`announcement_timeline_${item.id}`} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', gap: 10, alignItems: 'stretch' }}>
                    <div style={{ display: 'grid', justifyItems: 'center', gridTemplateRows: '18px minmax(0, 1fr)' }}>
                      <span style={{ width: 12, height: 12, borderRadius: '50%', background: isCompleted ? '#cbd5e1' : '#2563eb', marginTop: 6 }} />
                      {idx < visibleAnnouncementItems.length - 1 ? <span style={{ width: 2, minHeight: 30, background: lineColor, borderRadius: 999, opacity: 0.85 }} /> : <span />}
                    </div>
                    <div style={{ display: 'grid', gap: 8, border: `1px solid ${isSelected ? '#93c5fd' : (isCompleted ? '#e2e8f0' : '#bfdbfe')}`, borderRadius: 12, padding: '12px 12px 10px', background: isCompleted ? '#f8fafc' : '#fff', opacity: isCompleted ? 0.58 : 1, boxShadow: isSelected ? '0 0 0 2px rgba(147,197,253,0.22)' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ borderRadius: 999, padding: '2px 9px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{memoBadgeDate(item.memo_date)}</span>
                          {String(item.title || '').trim() ? <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{item.title}</span> : null}
                          <span style={{ borderRadius: 999, padding: '2px 8px', background: isCompleted ? '#e2e8f0' : '#dbeafe', color: isCompleted ? '#475569' : '#1d4ed8', fontSize: 11, fontWeight: 700 }}>{isCompleted ? '완료' : '대기'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
                            <input type='checkbox' checked={isCompleted} onChange={() => toggleAnnouncementCompleted(item)} />
                            전달 완료
                          </label>
                          <button type='button' style={miniBtn} onClick={() => selectAnnouncement(item)}>수정</button>
                          <button type='button' style={miniBtnDanger} onClick={() => deleteAnnouncement(item.id)}>삭제</button>
                        </div>
                      </div>
                      {normalizedContent
                        ? <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14, lineHeight: 1.6, color: isCompleted ? '#64748b' : '#1e293b' }}>{normalizedContent}</div>
                        : <div style={{ color: '#94a3b8', fontSize: 13 }}>(내용 없음)</div>}
                      <AttachmentLinks attachments={item.attachments} onOpen={openAttachment} compact />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 12, color: '#94a3b8' }}>
                        <span>수정: {formatNoteDateTime(item.updated_at)}</span>
                        <span>{item.completed_at ? `완료: ${formatNoteDateTime(item.completed_at)}` : '아직 미전달'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {visibleAnnouncementItems.length === 0 && (
                <div style={{ color: '#94a3b8', fontSize: 13, border: '1px dashed #cbd5e1', borderRadius: 12, padding: '18px 16px', background: '#fff' }}>
                  {announcementItems.length === 0 ? '아직 전달사항이 없습니다.' : '미전달 전달사항이 없습니다.'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );

  const loadAttendance = async (fromManual = false) => {
    if (attendanceMode === 'course') {
      const periodText = String(attendancePeriod || '').trim();
      const periodOk = /^\d+교시$/.test(periodText);
      if (!attendanceClassName || !periodOk) {
        setAttendanceRows([]);
        setActionMessage('교과 출석은 반과 교시(숫자 교시)를 선택 후 조회해 주세요.');
        return;
      }
      if (!fromManual) return;
    }

    const classValue = attendanceMode === 'homeroom' ? homeroomClass : attendanceClassName;
    const rows = await apiFetch(`/api/attendance?kind=${attendanceMode}&className=${encodeURIComponent(classValue)}`).catch(() => []);
    const hit = (rows || []).find((r) => String(r.date) === attendanceDate && (attendanceMode === 'homeroom' || String(r.period) === attendancePeriod));

    const baseStudents = (attendanceMode === 'homeroom' ? homeroomStudents : students.filter((s) => !classValue || s.class_name === classValue));
    const sortedBase = [...baseStudents].sort((a, b) => {
      const c = String(a.class_name || '').localeCompare(String(b.class_name || ''), 'ko');
      if (c !== 0) return c;
      return Number(a.student_no || 999) - Number(b.student_no || 999);
    });
    const map = new Map((hit?.entries || []).map((e) => [String(e.student_id), e]));
    const initial = sortedBase.map((s) => {
      const old = map.get(String(s.id));
      const periodStates = old?.period_states || {};
      const normalized = { am: periodStates.am || '출석', hr: periodStates.hr || '출석' };
      for (let i = 1; i <= attendanceMaxPeriod; i += 1) normalized[`p${i}`] = periodStates[`p${i}`] || '출석';
      return {
        student_id: s.id,
        name: s.name,
        class_name: s.class_name,
        student_no: s.student_no,
        status: old?.status || '출석',
        memo: old?.memo || '',
        period_states: normalized,
      };
    });
    setAttendanceRows(initial);

    const dates = Array.from(new Set((rows || []).map((r) => String(r.date || '').slice(0, 10)).filter(Boolean))).sort();
    setAttendanceSavedDates(dates);

    if (attendanceMode === 'course') {
      const items = (rows || [])
        .map((r) => {
          const date = String(r.date || '').slice(0, 10);
          const p = String(r.period || '').replace('교시', '');
          return { key: `${date}/${p}`, date, period: p, label: `${date}/${p}` };
        })
        .filter((x) => x.date)
        .sort((a, b) => a.date.localeCompare(b.date) || Number(a.period || 0) - Number(b.period || 0));
      const uniq = [];
      const seen = new Set();
      items.forEach((x) => { if (!seen.has(x.key)) { seen.add(x.key); uniq.push(x); } });
      setAttendanceSavedItems(uniq);
    } else {
      setAttendanceSavedItems(dates.map((d) => ({ key: d, date: d, period: '', label: d })));
    }
  };

  const updateAttendanceCell = (studentId, key, value) => {
    setAttendanceRows((prev) => prev.map((r) => (String(r.student_id) === String(studentId) ? { ...r, [key]: value } : r)));
  };

  const updateAttendancePeriodCell = (studentId, pkey, value) => {
    setAttendanceRows((prev) => prev.map((r) => {
      if (String(r.student_id) !== String(studentId)) return r;
      return { ...r, period_states: { ...(r.period_states || {}), [pkey]: value } };
    }));
  };

  const applyAttendanceBulk = (studentId, value) => {
    const keys = ['am', ...Array.from({ length: attendanceMaxPeriod }, (_, i) => `p${i + 1}`), 'hr'];
    setAttendanceRows((prev) => prev.map((r) => {
      if (String(r.student_id) !== String(studentId)) return r;
      const nextStates = { ...(r.period_states || {}) };
      keys.forEach((k) => { nextStates[k] = value; });
      return { ...r, period_states: nextStates };
    }));
  };

  const resetAttendanceDraft = async () => {
    if (attendanceMode === 'course') {
      if (!attendanceClassName || !/^\d+교시$/.test(String(attendancePeriod || '').trim())) {
        setAttendanceRows([]);
        setActionMessage('교과 출석은 반과 교시를 선택해야 초기화할 수 있습니다.');
        return;
      }
      await loadAttendance(true);
      pushActivity('출석 초기화', `${attendanceDate} ${attendanceClassName} ${attendancePeriod} 입력 초기화`);
      setActionMessage('입력값이 초기화되었습니다.');
      return;
    }
    await loadAttendance(true);
    pushActivity('출석 초기화', `${attendanceDate} ${homeroomClass} 종합 입력 초기화`);
    setActionMessage('입력값이 초기화되었습니다.');
  };

  const saveAttendance = async () => {
    const classValue = attendanceMode === 'homeroom' ? homeroomClass : attendanceClassName;
    const periodValue = attendanceMode === 'homeroom' ? '종합' : attendancePeriod;

    if (attendanceMode === 'course') {
      const periodOk = /^\d+교시$/.test(String(periodValue || ''));
      if (!classValue || !periodOk) {
        setActionMessage('교과 출석은 반과 교시를 선택한 뒤 저장해 주세요.');
        return;
      }
    }

    if (!attendanceRows.length) {
      setActionMessage('저장할 출석 데이터가 없습니다. 먼저 조회해 주세요.');
      return;
    }

    try {
      const existed = await apiFetch(`/api/attendance?kind=${attendanceMode}&date=${encodeURIComponent(attendanceDate)}&className=${encodeURIComponent(classValue)}&period=${encodeURIComponent(periodValue)}`).catch(() => []);
      const isUpdate = Array.isArray(existed) && existed.length > 0;

      await apiFetch('/api/attendance/upsert', {
        method: 'POST',
        body: JSON.stringify({ kind: attendanceMode, className: classValue, date: attendanceDate, period: periodValue, entries: attendanceRows }),
      });
      pushActivity(isUpdate ? '출석 수정' : '출석 추가', `${attendanceDate} ${classValue} ${periodValue} 저장`);
      setActionMessage('출석이 저장되었습니다.');
      await loadAttendance(true);
    } catch (e) {
      setActionMessage(`출석 저장 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const loadAttendanceMemo = async (fromManual = false) => {
    if (attendanceMode === 'course') {
      const periodText = String(attendancePeriod || '').trim();
      const periodOk = /^\d+교시$/.test(periodText);
      if (!attendanceClassName || !periodOk) {
        setAttendanceRows([]);
        setActionMessage('교과 출석 메모는 반과 교시를 선택하고 조회해 주세요.');
        return;
      }
      if (!fromManual) return;
    }
    if (attendanceMode === 'club' && !selectedAttendanceClub) {
      setAttendanceRows([]);
      setAttendanceSavedItems([]);
      setActionMessage('수업 체크된 선택 과목을 먼저 선택해 주세요.');
      return;
    }

    const { classValue, periodValue, students: baseStudents } = attendanceTargetSummary;
    if (!classValue) {
      setAttendanceRows([]);
      setAttendanceSavedItems([]);
      return;
    }

    const rows = await apiFetch(`/api/attendance?kind=${attendanceMode}&className=${encodeURIComponent(classValue)}`).catch(() => []);
    const hit = (rows || []).find((row) => String(row.date) === attendanceDate && String(row.period || '') === String(periodValue || ''));
    const entryMap = new Map((hit?.entries || []).map((entry) => [String(entry.student_id), entry]));
    setAttendanceRows(
      [...baseStudents].map((student) => {
        const old = entryMap.get(String(student.id));
        return {
          student_id: student.id,
          name: student.name,
          class_name: student.class_name,
          student_no: student.student_no,
          memo: old?.memo || '',
        };
      })
    );

    const items = (rows || [])
      .map((row) => {
        const date = String(row.date || '').slice(0, 10);
        if (!date) return null;
        if (attendanceMode === 'course') {
          return {
            key: `${date}/${row.class_name}/${row.period}`,
            className: String(row.class_name || ''),
            period: String(row.period || ''),
            label: `${date} / ${String(row.class_name || '')} / ${String(row.period || '')}`,
          };
        }
        if (attendanceMode === 'club') {
          return {
            key: `${date}/${row.class_name}/${row.period}`,
            className: String(row.class_name || ''),
            period: String(row.period || ''),
            label: `${date} / ${selectedAttendanceClub?.name || '선택'} / ${String(row.period || '')}`,
          };
        }
        return { key: date, date, className: String(row.class_name || ''), period: String(row.period || ''), label: date };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.label || '').localeCompare(String(b.label || '')));

    const uniqueItems = [];
    const seen = new Set();
    items.forEach((item) => {
      if (seen.has(item.key)) return;
      seen.add(item.key);
      uniqueItems.push(item);
    });
    setAttendanceSavedDates(Array.from(new Set(uniqueItems.map((item) => item.date))));
    setAttendanceSavedItems(uniqueItems);
  };

  const updateAttendanceMemoCell = (studentId, value) => {
    setAttendanceRows((prev) => prev.map((row) => (String(row.student_id) === String(studentId) ? { ...row, memo: value } : row)));
  };

  const resetAttendanceMemoDraft = async () => {
    await loadAttendanceMemo(true);
    setActionMessage('출석 메모 입력값을 마지막 저장 상태로 되돌렸습니다.');
  };

  const saveAttendanceMemo = async () => {
    const { classValue, periodValue, label } = attendanceTargetSummary;

    if (attendanceMode === 'course') {
      const periodOk = /^\d+교시$/.test(String(periodValue || ''));
      if (!classValue || !periodOk) {
        setActionMessage('교과 출석 메모는 반과 교시를 선택하고 저장해 주세요.');
        return;
      }
    }
    if (attendanceMode === 'club' && !selectedAttendanceClub) {
      setActionMessage('수업 체크된 선택 과목을 먼저 선택해 주세요.');
      return;
    }
    if (!attendanceRows.length) {
      setActionMessage('저장할 출석 메모 대상이 없습니다. 먼저 조회해 주세요.');
      return;
    }

    try {
      const existed = await apiFetch(`/api/attendance?kind=${attendanceMode}&date=${encodeURIComponent(attendanceDate)}&className=${encodeURIComponent(classValue)}&period=${encodeURIComponent(periodValue)}`).catch(() => []);
      const isUpdate = Array.isArray(existed) && existed.length > 0;

      await apiFetch('/api/attendance/upsert', {
        method: 'POST',
        body: JSON.stringify({
          kind: attendanceMode,
          className: classValue,
          date: attendanceDate,
          period: periodValue,
          entries: attendanceRows.map((row) => ({ student_id: row.student_id, memo: row.memo || '' })),
        }),
      });
      pushActivity(isUpdate ? '출석 메모 수정' : '출석 메모 저장', `${attendanceDate} ${label || classValue} 저장`);
      setActionMessage('출석 메모가 저장되었습니다.');
      await loadAttendanceMemo(true);
    } catch (e) {
      setActionMessage(`출석 메모 저장 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const shiftTaskCalendarMonth = (delta) => {
    const dt = new Date(`${taskCalendarMonth}-01T00:00:00`);
    dt.setMonth(dt.getMonth() + delta);
    setTaskCalendarMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  };

  const resetTaskEditor = () => {
    setEditingScheduleId(null);
    setScheduleTitle('');
    setScheduleKind('todo');
    setDueAt('');
  };

  const applySavedAttendanceItem = (item) => {
    setAttendanceDate(item.date);
    if (attendanceMode === 'course') {
      if (item.className) setAttendanceClassName(item.className);
      if (item.period) setAttendancePeriod(item.period);
    }
    if (attendanceMode === 'club' && item.period) {
      setAttendancePeriod(item.period);
    }
  };

  const uploadAttachmentFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return [];

    const uploadedRows = [];
    let failedName = '';
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) {
        failedName = failedName || `${file.name}: 50MB 초과`;
        continue;
      }
      try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(`${API}/api/files/upload?scope=attachment`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        const saved = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(saved?.error || `HTTP ${response.status}`);
        uploadedRows.push(saved);
      } catch (error) {
        failedName = failedName || `${file.name}: ${error?.message || '업로드 실패'}`;
      }
    }
    if (uploadedRows.length && !failedName) setActionMessage(`첨부파일 ${uploadedRows.length}개 업로드 완료`);
    else if (uploadedRows.length) setActionMessage(`첨부파일 ${uploadedRows.length}개 업로드, 일부 실패 (${failedName})`);
    else if (failedName) setActionMessage(`첨부파일 업로드 실패: ${failedName}`);
    return uploadedRows;
  };

  const downloadFileItem = async (item) => {
    if (!item?.id) return;
    try {
      const response = await fetch(`${API}/api/files/${item.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = String(item.name || 'download');
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setActionMessage(`파일 다운로드 실패: ${error?.message || 'API 오류'}`);
    }
  };

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    let ok = 0;
    let fail = 0;
    let failReason = '';
    const uploadedRows = [];
    setFileUploadState({ active: true, total: files.length, done: 0, name: '', percent: 0 });

    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      setFileUploadState((st) => ({ ...st, name: f.name, done: i, percent: 0 }));
      if (f.size > 512 * 1024 * 1024) {
        fail += 1;
        failReason = failReason || `${f.name}: 512MB 초과`;
        setFileUploadState((st) => ({ ...st, done: i + 1, percent: 100 }));
        continue;
      }

      try {
        const fd = new FormData();
        fd.append('file', f);
        const res = await fetch(`${API}/api/files/upload`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
        uploadedRows.push(j);
        ok += 1;
      } catch (e) {
        fail += 1;
        failReason = failReason || `${f.name}: ${e?.message || '업로드 실패'}`;
      }
      setFileUploadState((st) => ({ ...st, done: i + 1, percent: 100 }));
    }

    setFileUploadState((st) => ({ ...st, active: false, percent: 100 }));
    if (uploadedRows.length) setFileItems((prev) => [...uploadedRows, ...prev]);
    await loadFilesData({ force: true });

    if (ok > 0 && fail === 0) setActionMessage(`파일 ${ok}개 업로드 완료`);
    else if (ok > 0 && fail > 0) setActionMessage(`파일 ${ok}개 업로드, ${fail}개 실패 (${failReason})`);
    else setActionMessage(`업로드 실패: ${failReason || '업로드한 파일이 없습니다.'}`);
  };

  const onPickFiles = async (e) => {
    await uploadFiles(e.target.files || []);
    e.target.value = '';
  };

  const onFileDragOver = (e) => {
    e.preventDefault();
    setFileDragActive(true);
  };

  const onFileDragLeave = (e) => {
    e.preventDefault();
    setFileDragActive(false);
  };

  const onFileDrop = async (e) => {
    e.preventDefault();
    setFileDragActive(false);
    const files = e.dataTransfer?.files || [];
    await uploadFiles(files);
  };

  const openFileItem = downloadFileItem;
  const openAttachment = downloadFileItem;

  const beginRenameFile = (item) => {
    const currentName = decodeBrokenKorean(item.name || '');
    setEditingFileId(item.id);
    setFileNameDraft(fileNameWithoutExt(currentName));
  };

  const saveRenameFile = async () => {
    if (!editingFileId) return;
    const name = fileNameDraft.trim();
    if (!name) return;
    const item = (fileItems || []).find((x) => String(x.id) === String(editingFileId));
    const orig = String(item?.name || '');
    const ext = orig.includes('.') ? orig.slice(orig.lastIndexOf('.')) : '';
    const nextName = `${name}${ext}`;
    try {
      await apiFetch(`/api/files/${editingFileId}`, { method: 'PATCH', body: JSON.stringify({ name: nextName }) });
      setEditingFileId(null);
      setFileNameDraft('');
      setActionMessage('파일 이름을 변경했습니다.');
      await loadFilesData({ force: true });
    } catch (error) {
      setActionMessage(`파일 이름 변경 실패: ${error?.message || 'API 오류'}. 입력한 이름은 유지됩니다.`);
    }
  };

  const removeFileItem = async (id) => {
    if (!confirm('이 파일을 삭제할까요?')) return;
    try {
      await apiFetch(`/api/files/${id}`, { method: 'DELETE' });
      setActionMessage('파일을 삭제했습니다.');
      await loadFilesData({ force: true });
    } catch (e) {
      setActionMessage(`파일 삭제 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const saveResourceLinksToServer = async (nextLinks, silent = false) => {
    try {
      await apiFetch('/api/resource-links', { method: 'PUT', body: JSON.stringify({ links: nextLinks }) });
      if (!silent) setActionMessage('링크가 서버에 저장되었습니다.');
      localStorage.setItem('teacher_notebook_resource_links_v1', JSON.stringify(nextLinks));
      return true;
    } catch (e) {
      localStorage.setItem('teacher_notebook_resource_links_v1', JSON.stringify(nextLinks));
      setActionMessage(`서버 저장 실패(로컬에는 임시 저장됨): ${e?.message || 'API 오류'}`);
      return false;
    }
  };

  const addResourceLink = async () => {
    const title = String(resourceTitle || '').trim();
    const url = String(resourceUrl || '').trim();
    if (!title || !url) return;
    const next = [{ id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, title, url }, ...(resourceLinks || [])];
    setResourceLinks(next);
    await saveResourceLinksToServer(next);
    setResourceTitle('');
    setResourceUrl('');
  };

  const removeResourceLink = async (id) => {
    const next = (resourceLinks || []).filter((x) => String(x.id) !== String(id));
    setResourceLinks(next);
    await saveResourceLinksToServer(next, true);
  };

  const normalizeTimetableRows = (payload) => {
    const rowsRaw = Array.isArray(payload?.rows) ? payload.rows : (Array.isArray(payload) ? payload : []);
    return rowsRaw
      .map((r, idx) => {
        const period = Number(r?.period ?? r?.p ?? r?.['교시'] ?? r?.lesson ?? (idx + 1));
        const time = String(r?.time ?? r?.label ?? r?.['시간'] ?? r?.slot ?? '').trim() || '-';
        const text = String(r?.text ?? r?.subject ?? r?.value ?? r?.['내용'] ?? r?.course ?? r?.name ?? '').trim() || '-';
        if (!Number.isFinite(period)) return null;
        return { period, time, text, isChanged: Boolean(r?.isChanged) };
      })
      .filter(Boolean)
      .sort((a, b) => a.period - b.period);
  };

  const comtimeDateOptionByValue = useMemo(() => {
    const out = {};
    (comtimeDateOptions || []).forEach((opt) => {
      const value = String(opt?.value || '').trim();
      if (!value) return;
      out[value] = opt;
    });
    return out;
  }, [comtimeDateOptions]);

  const getComtimeWeekOffset = (ymd) => Number(comtimeDateOptionByValue[String(ymd || '')]?.weekOffset || 1);

  const exportStudentDetailPdf = () => {
    if (!selectedStudent) {
      setActionMessage('학생을 먼저 선택해 주세요.');
      return;
    }
    const filteredNotes = selectedStudentNotes.filter(n => pdfSelectedIds.has(String(n.id)));
    const includeBasicSurvey = pdfSelectedIds.has(STUDENT_BASIC_SURVEY_PDF_ID);

    const notesText = (filteredNotes || []).map((n) => `- [${formatNoteDateTime(n.note_date)}] ${noteCategoryMeta(n.category).label}\n${String(n.content || '').trim()}`).join('\n\n') || '- 선택된 상담 기록 없음';
    const basicSurveyText = includeBasicSurvey
      ? (String(selectedStudent.basic_survey || '').trim() || '- 입력된 기초조사 없음')
      : '';
    const clubText = selectedStudentClubs.length ? selectedStudentClubs.map((club) => club.name).join(', ') : '-';
    const txt = `학생 상세정보 / 상담기록\n\n학생: ${selectedStudent.name || '-'}\n학급: ${selectedStudent.class_name || '-'}\n번호: ${selectedStudent.student_no || '-'}\n상태: ${riskBadge(selectedStudent.risk_level).label}\n선택 편성: ${clubText}\n학생 전화: ${selectedStudent.student_phone || '-'}\n보호자 전화: ${selectedStudent.guardian_phone || '-'}\n메모:\n${selectedStudent.basic_info || '-'}${basicSurveyText ? `\n\n기초조사\n${basicSurveyText}` : ''}\n\n상담/관찰 기록\n${notesText}`;
    const escaped = txt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const w = window.open('', '_blank');
    if (!w) {
      setActionMessage('팝업 차단으로 PDF 출력창을 열 수 없습니다.');
      return;
    }
    w.document.write(`<!doctype html><html><head><meta charset='utf-8'><title>학생 상세정보 / 상담기록</title><style>body{font-family:Pretendard,Arial,sans-serif;padding:24px;line-height:1.6}h1{margin:0 0 12px 0;font-size:20px}pre{white-space:pre-wrap;font-size:13px}</style></head><body><h1>학생 상세정보 / 상담기록</h1><pre>${escaped}</pre></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const loadMyTimetable = async () => {
    if (!schoolCodeSetting || !teacherNoSetting || !myTimetableDate) {
      setMyTimetableWeek({});
      return;
    }
    const weekOffset = getComtimeWeekOffset(myTimetableDate);
    const weekdays = [1, 2, 3, 4, 5];
    const result = await Promise.all(
      weekdays.map(async (wd) => {
        try {
          const r = await apiFetch(`/api/comtime/timetable?schoolCode=${encodeURIComponent(schoolCodeSetting)}&teacherNo=${encodeURIComponent(teacherNoSetting)}&weekday=${wd}&week=${weekOffset}`);
          return { wd, rows: normalizeTimetableRows(r) };
        } catch (e) {
          return { wd, rows: [{ period: 1, time: '-', text: `불러오기 실패: ${e?.message || 'API 오류'}`, isChanged: false }] };
        }
      })
    );
    const grouped = {};
    result.forEach(({ wd, rows }) => { grouped[wd] = rows; });
    const total = result.reduce((acc, x) => acc + x.rows.length, 0);
    if (!total) setActionMessage('내 시간표를 불러오지 못했습니다. 학교코드/교사번호를 확인해 주세요.');
    setMyTimetableWeek(grouped);
  };

  const loadHomeroomTimetable = async () => {
    if (!schoolCodeSetting || !homeroomClass || !homeroomTimetableDate) {
      setHomeroomTimetableWeek({});
      return;
    }
    const weekOffset = getComtimeWeekOffset(homeroomTimetableDate);
    const weekdays = [1, 2, 3, 4, 5];
    const result = await Promise.all(
      weekdays.map(async (wd) => {
        try {
          const r = await apiFetch(`/api/comtime/homeroom?schoolCode=${encodeURIComponent(schoolCodeSetting)}&homeroom=${encodeURIComponent(homeroomClass)}&weekday=${wd}&week=${weekOffset}`);
          return { wd, rows: normalizeTimetableRows(r) };
        } catch (e) {
          return { wd, rows: [{ period: 1, time: '-', text: `불러오기 실패: ${e?.message || 'API 오류'}`, isChanged: false }] };
        }
      })
    );
    const grouped = {};
    result.forEach(({ wd, rows }) => { grouped[wd] = rows; });
    const total = result.reduce((acc, x) => acc + x.rows.length, 0);
    if (!total) setActionMessage('담임반 시간표를 불러오지 못했습니다. 학교코드/담임반을 확인해 주세요.');
    setHomeroomTimetableWeek(grouped);
  };

  const saveSettings = async () => {
    const payload = {
      schoolName,
      kmaAuthKey: kmaServiceKey,
      teacherDisplayName,
      academicYear,
      homeroomClass,
      schoolCodeSetting,
      teacherNoSetting,
      weekdayPeriods,
      geminiApiKey,
      geminiModel,
      googleCalendarEmbedUrl,
      googleCalendarIcsUrl,
      googleTasksAccessToken,
      googleTasksClientId,
      googleTasksClientSecret,
      googleTasksRefreshToken,
      googleTasksListId,
      resourceLinks,
    };
    try {
      await apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });
      localStorage.setItem('teacher_notebook_settings_v1', JSON.stringify(payload));
      alert('설정 저장 완료 (서버 저장)');
    } catch (e) {
      localStorage.setItem('teacher_notebook_settings_v1', JSON.stringify(payload));
      alert(`서버 저장 실패(로컬에만 저장됨): ${e?.message || 'API 오류'}`);
    }
  };

  const changeMyPassword = async () => {
    if (!myCurrentPassword || !myNewPassword) {
      alert('현재 비밀번호와 새 비밀번호를 입력해 주세요.');
      return;
    }
    try {
      await apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: myCurrentPassword, newPassword: myNewPassword }) });
      setMyCurrentPassword('');
      setMyNewPassword('');
      setActionMessage('비밀번호가 변경되었습니다.');
    } catch (e) {
      alert(`비밀번호 변경 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const adminChangePassword = async (id) => {
    const pw = String(adminPwDraftById[String(id)] || '');
    if (!pw) return alert('새 비밀번호를 입력해 주세요.');
    try {
      await apiFetch(`/api/admin/users/${id}/change-password`, { method: 'POST', body: JSON.stringify({ newPassword: pw }) });
      setAdminPwDraftById((p) => ({ ...p, [String(id)]: '' }));
      setActionMessage('회원 비밀번호가 변경되었습니다.');
    } catch (e) {
      alert(`회원 비밀번호 변경 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const adminDeleteUser = async (id, username) => {
    if (!confirm(`${username} 계정을 삭제할까요?`)) return;
    try {
      await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      setAdminUsers((prev) => prev.filter((u) => String(u.id) !== String(id)));
      setActionMessage('회원 계정을 삭제했습니다.');
    } catch (e) {
      alert(`회원 삭제 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const deleteMyAccount = async () => {
    const typed = prompt('회원 탈퇴 전에 본인의 아이디를 입력해 주세요.');
    if (typed === null) return;
    const username = String(typed || '').trim();
    if (!username) {
      alert('아이디를 입력해야 탈퇴할 수 있습니다.');
      return;
    }
    try {
      await apiFetch('/api/auth/delete-account', {
        method: 'DELETE',
        body: JSON.stringify({ username }),
      });
      localStorage.removeItem('teacher_notebook_token_v1');
      sessionStorage.removeItem('teacher_notebook_token_v1');
      setToken('');
      setAuthed(false);
      alert('회원 탈퇴가 완료되었습니다.');
    } catch (e) {
      alert(`회원 탈퇴 실패: ${e?.message || '아이디 확인 필요'}`);
    }
  };

  const logout = async () => {
    try {
      if (token) await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Local logout must still complete if the server session already expired.
    } finally {
      localStorage.removeItem('teacher_notebook_token_v1');
      sessionStorage.removeItem('teacher_notebook_token_v1');
      setToken('');
      setAuthed(false);
      setMe(null);
      setAuthUsername('');
      setAuthPassword('');
      setAuthPasswordConfirm('');
    }
  };

  const openQuickMemo = () => {
    if (activeTab === 'memos' && memoDirty && !confirm('작성 중인 메모를 새 초안으로 바꿀까요?')) return;
    if (trySetActiveTab('memos')) startNewMemo();
  };

  const openQuickAnnouncement = () => {
    if (activeTab === 'memos' && announcementDirty && !confirm('작성 중인 전달사항을 새 초안으로 바꿀까요?')) return;
    if (trySetActiveTab('memos')) startNewAnnouncement();
  };

  const openQuickSchedule = () => {
    if (!trySetActiveTab('tasks')) return;
    resetTaskEditor();
    setScheduleKind('todo');
  };

  const openQuickStudent = (student) => {
    if (!student || !trySetActiveTab('students')) return;
    startNewStudentNote();
    setEditingIssueConsultation(null);
    setStudentClassFilter(String(student.class_name || 'all'));
    setSelectedStudentId(String(student.id));
  };

  const quickRecordActions = [
    { id: 'memo', label: '새 메모', description: '날짜 메모를 바로 작성합니다.', onSelect: openQuickMemo },
    { id: 'announcement', label: '새 전달사항', description: '조례·종례 전달 내용을 기록합니다.', onSelect: openQuickAnnouncement },
    { id: 'schedule', label: '새 할 일', description: '일정 탭에서 할 일을 등록합니다.', onSelect: openQuickSchedule },
    { id: 'issue', label: '새 사안', description: '다음 호수의 사안을 작성합니다.', onSelect: () => { if (trySetActiveTab('issues')) startNewIssue(); } },
    { id: 'attendance', label: '출석 메모', description: '오늘 출석 메모를 엽니다.', onSelect: () => trySetActiveTab('attendance') },
  ];

  const askGemini = async (tab) => {
    const q = (aiQuestionByTab[tab] || '').trim();
    if (!geminiApiKey.trim()) {
      setAiErrorByTab((prev) => ({ ...prev, [tab]: 'Gemini API Key를 설정 탭에 입력해 주세요.' }));
      return;
    }
    if (!q) {
      setAiErrorByTab((prev) => ({ ...prev, [tab]: '질문을 입력해 주세요.' }));
      return;
    }
    setAiLoadingTab(tab);
    setAiErrorByTab((prev) => ({ ...prev, [tab]: '' }));
    setAiAnswerByTab((prev) => ({ ...prev, [tab]: '' }));
    setAiLastQuestionByTab((prev) => ({ ...prev, [tab]: q }));
    setAiChatByTab((prev) => ({ ...prev, [tab]: [...(prev[tab] || []), { role: 'user', text: q }] }));
    setAiQuestionByTab((prev) => ({ ...prev, [tab]: '' }));
    try {
      const contextData = {
        dashboard: {
          students: activeStudents.length,
          notes: notes.length,
          pendingTodos: unfinishedTodosCount,
        },
        students: {
          selected: selectedStudent ? { name: selectedStudent.name, class_name: selectedStudent.class_name, risk_level: selectedStudent.risk_level } : null,
          noteCount: selectedStudentNotes.length,
        },
        tasks: {
          month: taskCalendarMonth,
          todoCount: schedules.filter((s) => String(s.kind || 'todo') === 'todo' && !s.done).length,
          eventCount: schedules.filter((s) => String(s.kind || 'todo') === 'event').length,
        },
        attendance: {
          mode: attendanceMode,
          date: attendanceDate,
          className: attendanceMode === 'homeroom' ? homeroomClass : attendanceClassName,
          rowCount: attendanceRows.length,
        },
      };
      const context = JSON.stringify(contextData[tab] || {});
      const isMutationIntent = /(지금 바로|실행|적용|반영|저장|등록|삭제|수정|추가).*(해줘|해주세요|해 줘|할래|부탁)/.test(q)
        || /(추가|수정|삭제|저장).*해줘/.test(q)
        || /(적용|반영).*해줘/.test(q);
      const prompt = `교무수첩 AI 도우미 역할로 짧고 명확하게 답해.
isMutationIntent=${isMutationIntent}
context=${context}
question=${q}`;
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
      let data = null;
      let lastErr = '';
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            signal: controller.signal,
          });
          data = await res.json().catch(() => ({}));
          const code = Number(data?.error?.code || res.status || 0);
          if (!res.ok && [429, 500, 502, 503, 504].includes(code) && attempt < 2) {
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
            continue;
          }
          break;
        } catch (err) {
          lastErr = err?.name === 'AbortError' ? '응답 시간이 길어져 요청을 중단했습니다. 잠시 후 다시 시도해 주세요.' : (err?.message || '요청 실패');
          if (attempt < 2) {
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
            continue;
          }
        } finally {
          clearTimeout(timer);
        }
      }
      if (!data && lastErr) {
        throw new Error(lastErr);
      }
      if (data?.error?.message) {
        const err = String(data.error.message).includes('high demand') ? '모델 요청이 몰려 일시 지연되고 있습니다. 잠깐 후 다시 시도해 주세요.' : data.error.message;
        setAiErrorByTab((prev) => ({ ...prev, [tab]: err }));
        setAiAnswerByTab((prev) => ({ ...prev, [tab]: '' }));
        setAiChatByTab((prev) => ({ ...prev, [tab]: [...(prev[tab] || []), { role: 'assistant', text: `오류: ${err}` }] }));
      } else {
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('\n').trim() || '응답 없음';
        setAiAnswerByTab((prev) => ({ ...prev, [tab]: text }));
        setAiErrorByTab((prev) => ({ ...prev, [tab]: '' }));
        setAiChatByTab((prev) => ({ ...prev, [tab]: [...(prev[tab] || []), { role: 'assistant', text }] }));
      }
    } catch (e) {
      setAiErrorByTab((prev) => ({ ...prev, [tab]: e?.message || '요청 실패' }));
      setAiAnswerByTab((prev) => ({ ...prev, [tab]: '' }));
    } finally {
      setAiLoadingTab('');
    }
  };

  if (!authed) {
    return (
      <AuthScreen
        appVersion={APP_VERSION}
        viewportWidth={viewportWidth}
        isMobile={isMobile}
        isWebView={isWebView}
        authMode={authMode}
        authName={authName}
        authUsername={authUsername}
        authPassword={authPassword}
        authPasswordConfirm={authPasswordConfirm}
        rememberLogin={rememberLogin}
        authError={authError}
        setAuthMode={setAuthMode}
        setAuthName={setAuthName}
        setAuthUsername={setAuthUsername}
        setAuthPassword={setAuthPassword}
        setAuthPasswordConfirm={setAuthPasswordConfirm}
        setRememberLogin={setRememberLogin}
        setAuthError={setAuthError}
        onLogin={doLogin}
        onRegister={doRegister}
        styles={{ pageWrap, heroCard, versionBadge, card, inputStyle, btnPrimary, btnSecondary }}
      />
    );
  }

  return (
    <main style={{ ...pageWrap, maxWidth: 1280, width: '100%', boxSizing: 'border-box', padding: isMobile || isWebView ? 8 : pageWrap.padding, paddingTop: (isMobile || isWebView) ? 'calc(34px + env(safe-area-inset-top, 0px))' : pageWrap.padding, paddingBottom: (isMobile || isWebView) ? 'calc(86px + env(safe-area-inset-bottom, 0px))' : pageWrap.padding }}>
      <section style={heroCard}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => trySetActiveTab('dashboard')}>
            {isMobile && (
              <button
                type='button'
                onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
                style={{ border: '1px solid rgba(191,219,254,0.45)', background: 'rgba(30,64,175,0.45)', color: '#dbeafe', borderRadius: 8, padding: '5px 8px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                메뉴
              </button>
            )}
            <h1 style={{ margin: 0 }}>디지털 교무수첩</h1>
            <button
              type='button'
              onClick={(e) => { e.stopPropagation(); trySetActiveTab('patchnotes'); }}
              style={{ border: 'none', background: 'transparent', padding: 0, margin: 0, cursor: 'pointer' }}
              aria-label='패치 노트'
              title='패치 노트'
            >
              <span style={versionBadge}>{APP_VERSION}</span>
            </button>
            {!isMobile && (
              <button
                type='button'
                onClick={(e) => { e.stopPropagation(); setQuickRecordOpen(true); }}
                style={{ border: '1px solid rgba(191,219,254,0.5)', background: 'rgba(30,64,175,0.38)', color: '#fff', borderRadius: 8, padding: '5px 9px', fontSize: 13, fontWeight: 700, lineHeight: 1.2, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                aria-label='빠른 기록 열기'
                title='빠른 기록 열기 (Ctrl+K)'
              >
                ⌨ Ctrl+K
              </button>
            )}
          </div>
          <p style={{ margin: '6px 0 0 0', color: '#bfdbfe', fontSize: 13, cursor: 'pointer' }} onClick={() => trySetActiveTab('dashboard')}>{schoolName} {teacherDisplayName} 선생님</p>
        </div>
        <div style={
          (!isMobile && !isWebView && viewportWidth > 1055)
            ? { display: 'flex', gap: 8, flexWrap: 'nowrap' }
            : (viewportWidth <= 631
              ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, width: '100%' }
              : { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(118px, 1fr))', gap: 8, width: '100%' })
        }>
          <Stat title='학생' value={`${activeStudents.length}명`} />
          <Stat title='오늘 기록' value={`${notes.filter(n => String(n.note_date).slice(0, 10) === toSeoulYmd()).length}건`} />
          <Stat title='미완료 할 일' value={`${unfinishedTodosCount}건`} />
          <Stat title='오늘의 일정' value={`${todaysEventsCount}건`} />
        </div>
      </section>

      {isMobile ? (
        <div style={{ marginBottom: 10 }}>
          {menuOpen && <>
            <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 80 }} />
            <aside style={{ position: 'fixed', top: 0, left: 0, width: 240, height: '100vh', background: '#fff', borderRight: '1px solid #e2e8f0', zIndex: 81, padding: 12, display: 'grid', gap: 8, alignContent: 'start' }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>메뉴</div>
              {[{ id: 'dashboard', label: '🏠 대시보드' }, { id: 'search', label: '🔎 통합 검색' }, { id: 'students', label: '👥 학생' }, { id: 'issues', label: '🚨 사안' }, { id: 'clubs', label: '🧩 선택 편성' }, { id: 'attendance', label: '☑️ 출석 메모' }, { id: 'timetable', label: '🗓️ 시간표' }, { id: 'tasks', label: '📅 일정' }, { id: 'memos', label: '📝 메모' }, { id: 'files', label: '📁 자료' }].map((m) => (
                <button key={m.id} style={{ ...tabBtn, textAlign: 'left' }} onClick={() => trySetActiveTab(m.id)}>{m.label}</button>
              ))}
              <button style={{ ...tabBtn, textAlign: 'left' }} onClick={() => { setQuickRecordOpen(true); setMenuOpen(false); }}>⌨️ 빠른 기록 Ctrl+K</button>
              <button style={{ ...tabBtn, textAlign: 'left' }} onClick={() => trySetActiveTab('settings')}>⚙️ 설정</button>
              <button style={{ ...tabBtn, textAlign: 'left', color: '#b91c1c' }} onClick={logout}>로그아웃</button>
            </aside>
          </>}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 10, minWidth: 0 }}>
          <div style={{ ...tabRow, flex: '1 1 auto', minWidth: 0, marginTop: 0, marginBottom: 0 }}>
            <TabButton id='dashboard' activeTab={activeTab} setActiveTab={trySetActiveTab} label='🏠 대시보드' />
            <TabButton id='search' activeTab={activeTab} setActiveTab={trySetActiveTab} label='🔎 통합 검색' />
            <TabButton id='students' activeTab={activeTab} setActiveTab={trySetActiveTab} label='👥 학생' />
            <TabButton id='issues' activeTab={activeTab} setActiveTab={trySetActiveTab} label='🚨 사안' />
            <TabButton id='clubs' activeTab={activeTab} setActiveTab={trySetActiveTab} label='🧩 선택 편성' />
            <TabButton id='attendance' activeTab={activeTab} setActiveTab={trySetActiveTab} label='☑️ 출석 메모' />
            <TabButton id='timetable' activeTab={activeTab} setActiveTab={trySetActiveTab} label='🗓️ 시간표' />
            <TabButton id='tasks' activeTab={activeTab} setActiveTab={trySetActiveTab} label='📅 일정' />
            <TabButton id='memos' activeTab={activeTab} setActiveTab={trySetActiveTab} label='📝 메모' />
            <TabButton id='files' activeTab={activeTab} setActiveTab={trySetActiveTab} label='📁 자료' />
            <TabButton id='settings' activeTab={activeTab} setActiveTab={trySetActiveTab} label='⚙️ 설정' />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <button style={{ ...btnSecondary, minHeight: 34, padding: '6px 11px', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={logout}>로그아웃</button>
          </div>
        </div>
      )}

      {!!actionMessage && (
        <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', color: actionMessage.includes('실패') ? '#b91c1c' : '#166534', fontWeight: 600 }}>
          {actionMessage}
        </div>
      )}

      {activeTab === 'search' && <SearchTab
        query={globalSearchQuery}
        setQuery={setGlobalSearchQuery}
        scope={globalSearchScope}
        setScope={setGlobalSearchScope}
        onSearch={runGlobalSearch}
        onOpenResult={openGlobalSearchResult}
        loading={globalSearchLoading}
        error={globalSearchError}
        results={globalSearchResults}
        counts={globalSearchCounts}
        total={globalSearchTotal}
        isMobile={isMobile}
        inputStyle={inputStyle}
        btnPrimary={btnPrimary}
        btnSecondary={btnSecondary}
      />}

      {activeTab === 'dashboard' && <DashboardTab
        quickGridStyle={dashboardQuickGridStyle}
        topInfoGridStyle={dashboardTopInfoGrid}
        bottomGridStyle={dashboardBottomGrid}
        dashboardTopCardMinHeight={dashboardTopCardMinHeight}
        dashboardTopInnerBoxMinHeight={dashboardTopInnerBoxMinHeight}
        dashboardWeatherCompactDesktop={dashboardWeatherCompactDesktop}
        activeStudentsCount={activeStudents.length}
        notesCount={notes.length}
        unfinishedTodosCount={unfinishedTodosCount}
        todaysEventsCount={todaysEventsCount}
        homeroomClass={homeroomClass}
        activeHomeroomStudentsCount={activeHomeroomStudents.length}
        riskStudentCount={activeStudents.filter((s) => ['watch', 'focus', 'high'].includes(String(s.risk_level || 'normal'))).length}
        dashboardLunch={dashboardLunch}
        schoolName={schoolName}
        dashboardLunchHasTodayMenu={dashboardLunchHasTodayMenu}
        dashboardLunchDisplayMeals={dashboardLunchDisplayMeals}
        dashboardLunchLoading={dashboardLunchLoading}
        dashboardLunchError={dashboardLunchError}
        upcomingMealDateLabel={upcomingMealDateLabel}
        dashboardWeather={dashboardWeather}
        dashboardWeatherCurrent={dashboardWeatherCurrent}
        dashboardWeatherPreview={dashboardWeatherPreview}
        dashboardWeatherCurrentPrecipitationText={dashboardWeatherCurrentPrecipitationText}
        dashboardWeatherNote={dashboardWeatherNote}
        dashboardWeatherLoading={dashboardWeatherLoading}
        dashboardWeatherError={dashboardWeatherError}
        weatherInfo={weatherInfo}
        formatWeatherHour={formatWeatherHour}
        isFiniteNumberValue={isFiniteNumberValue}
        dashboardActivityLogs={dashboardActivityLogs}
        onClearActivityLogs={async () => {
          if (!activityLogs.length) return;
          if (!confirm('최근 기록을 모두 삭제할까요?')) return;
          await apiFetch('/api/activity-logs', { method: 'DELETE' }).catch(() => null);
          setActivityLogs([]);
          setActionMessage('최근 기록을 모두 삭제했습니다.');
        }}
        onActivityLogClick={(log) => {
          const found = students.find((s) => String(log.text || '').includes(String(s.name || '').trim()) && String(s.name || '').trim());
          if (found) {
            setSelectedStudentId(String(found.id));
            trySetActiveTab('students');
          }
        }}
        dashboardMemos={dashboardMemos}
        onDashboardMemoClick={(memo) => {
          if (memo.dashboardKind === 'announcement') {
            setEditingAnnouncementId(memo.id);
            setAnnouncementPanelMode('write');
          } else {
            setEditingMemoId(memo.id);
            setMemoListMonth(String(memo.memo_date || '').slice(0, 7));
            setMemoDate(String(memo.memo_date || '').slice(0, 10));
          }
          trySetActiveTab('memos');
        }}
        dashboardUpcomingCounts={dashboardUpcomingCounts}
        dashboardUpcomingItems={dashboardUpcomingItems}
        onUpcomingClick={(item) => gotoTaskMonthByDate(item.startDate || item.dueAt)}
        formatUpcomingItemDate={formatUpcomingItemDate}
        dashboardTodoCounts={dashboardTodoCounts}
        dashboardTodoItems={dashboardTodoItems}
        onTodoClick={(item) => gotoTaskMonthByDate(item.dueAt)}
        formatGoogleTaskDue={formatGoogleTaskDue}
        formatDotDateTime={formatDotDateTime}
        memoDateLabel={memoDateLabel}
        miniBtnDanger={miniBtnDanger}
      />}
      {activeTab === 'students' && <StudentsTab
        addStudent={addStudent}
        allClasses={allClasses}
        apiFetch={apiFetch}
        btnPrimary={btnPrimary}
        btnSecondary={btnSecondary}
        bulkText={bulkText}
        bulkUploadStudentPhotos={bulkUploadStudentPhotos}
        Card={Card}
        className={className}
        clearStudentBasicSurvey={clearStudentBasicSurvey}
        clearStudentField={clearStudentField}
        clearStudentTransferred={clearStudentTransferred}
        confirmDeleteStudent={confirmDeleteStudent}
        cycleSelectedStudentRisk={cycleSelectedStudentRisk}
        DateField={DateField}
        deleteNote={deleteNote}
        deleteStudent={deleteStudent}
        deleteStudentPhoto={deleteStudentPhoto}
        detailActionBtn={detailActionBtn}
        detailActionDangerBtn={detailActionDangerBtn}
        detailClassName={detailClassName}
        detailName={detailName}
        detailRiskLevel={detailRiskLevel}
        detailStudentNo={detailStudentNo}
        isEditingIssueConsultation={Boolean(editingIssueConsultation)}
        editingNoteId={editingNoteId}
        editingStudentId={editingStudentId}
        editNote={editNote}
        expandedNotes={expandedNotes}
        exportStudentDetailPdf={exportStudentDetailPdf}
        fmtYmd={fmtYmd}
        formatNoteDateTime={formatNoteDateTime}
        formRow={formRow}
        guardianPhone={guardianPhone}
        importStudentsBulk={importStudentsBulk}
        inputStyle={inputStyle}
        isMobile={isMobile}
        markStudentTransferred={markStudentTransferred}
        miniBtn={miniBtn}
        miniBtnDanger={miniBtnDanger}
        noteCategory={noteCategory}
        noteCategoryMeta={noteCategoryMeta}
        noteCategoryOpen={noteCategoryOpen}
        noteContent={noteContent}
        noteAttachments={noteAttachments}
        onPickStudentPhoto={onPickStudentPhoto}
        openAttachment={openAttachment}
        pdfSelectedIds={pdfSelectedIds}
        riskBadge={riskBadge}
        riskLevel={riskLevel}
        riskLevelOpen={riskLevelOpen}
        saveEditStudent={saveEditStudent}
        saveNote={saveNote}
        saveStudentBasicSurvey={saveStudentBasicSurvey}
        saveStudentContactsAndInfo={saveStudentContactsAndInfo}
        selectedClassCount={selectedClassCount}
        selectedStudent={selectedStudent}
        selectedStudentClubs={selectedStudentClubs}
        selectedStudentId={selectedStudentId}
        selectedStudentNotes={selectedStudentNotes}
        setBulkText={setBulkText}
        setClassName={setClassName}
        setConfirmDeleteStudent={setConfirmDeleteStudent}
        setDetailClassName={setDetailClassName}
        setDetailName={setDetailName}
        setDetailRiskLevel={setDetailRiskLevel}
        setDetailStudentNo={setDetailStudentNo}
        setEditingStudentId={setEditingStudentId}
        setExpandedNotes={setExpandedNotes}
        setGuardianPhone={setGuardianPhone}
        setNoteCategory={setNoteCategory}
        setNoteCategoryOpen={setNoteCategoryOpen}
        setNoteContent={setNoteContent}
        setNoteAttachments={setNoteAttachments}
        setPdfSelectedIds={setPdfSelectedIds}
        uploadAttachments={uploadAttachmentFiles}
        setRiskLevel={setRiskLevel}
        setRiskLevelOpen={setRiskLevelOpen}
        setSelectedStudentId={setSelectedStudentId}
        setShowTransferredStudents={setShowTransferredStudents}
        setStudentBasicInfo={setStudentBasicInfo}
        setStudentBasicMemoEditMode={setStudentBasicMemoEditMode}
        setStudentBasicSurvey={setStudentBasicSurvey}
        setStudentBirthDate={setStudentBirthDate}
        setStudentClassFilter={setStudentClassFilter}
        setStudentClassFilterOpen={setStudentClassFilterOpen}
        setStudentGender={setStudentGender}
        setStudentInfoEditMode={setStudentInfoEditMode}
        setStudentManagePanelOpen={setStudentManagePanelOpen}
        setStudentName={setStudentName}
        setStudentNameQuery={setStudentNameQuery}
        setStudentNo={setStudentNo}
        setStudentNoteQuery={setStudentNoteQuery}
        setStudentPhone={setStudentPhone}
        setTransferDateInput={setTransferDateInput}
        showTransferredStudents={showTransferredStudents}
        sortedFilteredStudents={deferredSortedFilteredStudents}
        startEditStudent={startEditStudent}
        studentBasicInfo={studentBasicInfo}
        studentBasicMemoEditMode={studentBasicMemoEditMode}
        studentBasicSurvey={studentBasicSurvey}
        studentBasicSurveyPdfId={STUDENT_BASIC_SURVEY_PDF_ID}
        studentBirthDate={studentBirthDate}
        studentClassFilter={studentClassFilter}
        studentClassFilterOpen={studentClassFilterOpen}
        studentGender={studentGender}
        studentInfoEditMode={studentInfoEditMode}
        studentManagePanelOpen={studentManagePanelOpen}
        studentName={studentName}
        studentNameQuery={studentNameQuery}
        studentNo={studentNo}
        studentNoteMatchedStudents={deferredStudentNoteMatchedStudents}
        studentNoteQuery={studentNoteQuery}
        studentPhone={studentPhone}
        studentPhotos={studentPhotos}
        studentNoteDraft={studentNoteDraftInfo}
        studentSplitGrid={studentSplitGrid}
        tabBtn={tabBtn}
        transferDateInput={transferDateInput}
        ttTable={ttTable}
        ttTd={ttTd}
        ttTh={ttTh}
        twoColGrid={twoColGrid}
      />}

      {activeTab === 'issues' && <IssuesTab
        isMobile={isMobile}
        issues={issues}
        values={{
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
        }}
        derived={{
          selectedIssue,
          filteredConsultations,
          issueStudentSearchResults,
          consultationStudentSearchResults,
        }}
        drafts={{ issue: issueDraftInfo, consultation: issueConsultationDraftInfo }}
        actions={{
          onSelectIssue: selectIssue,
          onIssueCaseNoChange: setIssueCaseNo,
          onIssueTitleChange: setIssueTitle,
          onIssueStatusChange: setIssueStatus,
          onIssueStudentQueryChange: setIssueStudentQuery,
          onIssueStudentRoleChange: setIssueStudentRole,
          onAddIssueStudent: addIssueStudent,
          onUpdateIssueStudentRole: updateIssueStudentRole,
          onRemoveIssueStudent: removeIssueStudent,
          onSaveIssue: saveIssue,
          onStartNewIssue: startNewIssue,
          onDeleteIssue: deleteIssue,
          onConsultationTypeChange: setConsultationType,
          onConsultationStudentQueryChange: changeConsultationStudentQuery,
          onSelectConsultationStudent: selectConsultationStudent,
          onConsultationAtChange: setConsultationAt,
          onConsultationContentChange: setConsultationContent,
          onConsultationAttachmentsChange: setConsultationAttachments,
          onConsultationNameFilterChange: setConsultationNameFilter,
          onAddConsultation: addIssueConsultation,
          onEditConsultation: editConsultation,
          onCancelConsultationEdit: cancelConsultationEdit,
          onToggleConsultationExpanded: toggleConsultationExpanded,
          onDeleteConsultation: deleteIssueConsultation,
        }}
        styles={{ twoColGrid, inputStyle, btnPrimary, btnSecondary, miniBtn, miniBtnDanger, tabBtn }}
        uploadAttachments={uploadAttachmentFiles}
        openAttachment={openAttachment}
      />}

      {activeTab === 'clubs' && <ClubsTab
        ui={{ clubTabIsSplit }}
        values={{
          selectedClubId,
          clubNameDraft,
          clubAttendanceEnabled,
          clubStudentQuery,
        }}
        derived={{
          sortedClubs,
          selectedClub,
          selectedClubStudentIdSet,
          filteredClubStudents,
          clubsByStudentId,
        }}
        actions={{
          setSelectedClubId,
          setClubNameDraft,
          setClubAttendanceEnabled,
          setClubStudentQuery,
          submitClub,
          resetClubForm,
          startEditClub,
          deleteClub,
          toggleClubMember,
        }}
        styles={{
          clubSplitGrid,
          compactFieldStyle,
          btnPrimary,
          btnSecondary,
          miniBtn,
          miniBtnDanger,
        }}
      />}

      {activeTab === 'tasks' && <TasksTab
        ui={{ isMobile }}
        values={{
          scheduleTitle,
          taskSearchQuery,
          scheduleKind,
          dueAt,
          editingScheduleId,
          taskCalendarMonth,
          confirmDeleteScheduleId,
        }}
        derived={{
          taskDatesInMonth,
          taskMonthTitle,
          isCurrentTaskMonth,
          holidayMap,
          homeroomBirthdayMap,
          taskBottomLocalTodos,
          taskBottomLocalEvents,
          taskBottomGoogleTasks,
          taskBottomGoogleEvents,
          taskSearchQ,
          taskSearchTodoResults,
          taskSearchEventResults,
          taskSearchGoogleTaskResults,
          taskSearchGoogleEventResults,
        }}
        actions={{
          onShiftMonth: shiftTaskCalendarMonth,
          onTaskCalendarMonthChange: setTaskCalendarMonth,
          onScheduleKindChange: setScheduleKind,
          onScheduleTitleChange: setScheduleTitle,
          onDueAtChange: setDueAt,
          onTaskSearchQueryChange: setTaskSearchQuery,
          onSubmitSchedule: addSchedule,
          onStartEditSchedule: startEditSchedule,
          onToggleSchedule: toggleSchedule,
          onRequestDeleteSchedule: setConfirmDeleteScheduleId,
          onCancelDeleteSchedule: () => setConfirmDeleteScheduleId(null),
          onDeleteSchedule: deleteSchedule,
          onResetScheduleEditor: resetTaskEditor,
        }}
        styles={{
          twoColGrid,
          formRow,
          inputStyle,
          btnPrimary,
          btnSecondary,
          listStyle,
          checkBtn,
          miniBtn,
          miniBtnDanger,
        }}
        helpers={{
          DateTimeFieldComponent: DateTimeField,
          formatGoogleEventText,
          formatGoogleTaskDue,
        }}
      />}

      {activeTab === 'memos' && <MemosTab
        isMobile={isMobile}
        announcementSplitGrid={announcementSplitGrid}
        memoWorkspaceCardStyle={memoWorkspaceCardStyle}
        memoWorkspaceTitleStyle={memoWorkspaceTitleStyle}
        formRow={formRow}
        inputStyle={inputStyle}
        btnSecondary={btnSecondary}
        btnPrimary={btnPrimary}
        miniBtnDanger={miniBtnDanger}
        tabBtn={tabBtn}
        DateFieldComponent={DateField}
        weekdayKorean={weekdayKorean}
        memoBadgeDate={memoBadgeDate}
        memoDate={memoDate}
        setMemoDate={setMemoDate}
        setMemoListMonth={setMemoListMonth}
        setMemoTouched={setMemoTouched}
        startNewMemo={startNewMemo}
        saveTaskMemo={saveTaskMemo}
        selectedMemo={selectedMemo}
        deleteTaskMemo={deleteTaskMemo}
        memoTitle={memoTitle}
        setMemoTitle={setMemoTitle}
        memoShowOnDashboard={memoShowOnDashboard}
        setMemoShowOnDashboard={setMemoShowOnDashboard}
        memoContent={memoContent}
        setMemoContent={setMemoContent}
        memoAttachments={memoAttachments}
        setMemoAttachments={setMemoAttachments}
        uploadAttachments={uploadAttachmentFiles}
        openAttachment={openAttachment}
        memoListMonth={memoListMonth}
        setMemoListMonthOnly={setMemoListMonth}
        memosByMonth={deferredMemosByMonth}
        editingMemoId={editingMemoId}
        selectMemo={selectMemo}
        memoMonthlyListMaxHeight={memoMonthlyListMaxHeight}
        renderAnnouncementWorkspace={renderAnnouncementWorkspace}
        memoDraft={memoDraftInfo}
      />}

      {activeTab === 'attendance' && <AttendanceTab
        values={{
          attendanceMode,
          attendanceDate,
          attendanceClassName,
          attendanceClubId,
          attendancePeriod,
          attendanceSavedMonth,
          attendanceRows,
        }}
        derived={{
          attendanceWeekdayLabel: weekdayKorean(attendanceDate),
          allClasses,
          attendanceEligibleClubs,
          attendanceMaxPeriod,
          attendanceTargetSummary,
          filteredAttendanceSavedItems,
          attendanceTabIsSplit,
        }}
        actions={{
          setAttendanceMode,
          setAttendanceDate,
          setAttendanceClassName,
          setAttendanceClubId,
          setAttendancePeriod,
          setAttendanceSavedMonth,
          loadAttendanceMemo,
          saveAttendanceMemo,
          resetAttendanceMemoDraft,
          updateAttendanceMemoCell,
          applySavedAttendanceItem,
        }}
        styles={{
          attendanceMemoGrid,
          attendanceMemoCardsGrid,
          attendanceSavedGrid,
          compactFieldStyle,
          tabBtn,
          tabBtnActive,
          btnPrimary,
          btnSecondary,
          miniBtn,
          miniBtnDanger,
        }}
        components={{
          DateFieldComponent: DateField,
        }}
      />}

      {activeTab === 'timetable' && <TimetableTab
        sectionStyle={twoColGrid}
        schoolCodeSetting={schoolCodeSetting}
        teacherNoSetting={teacherNoSetting}
        homeroomClass={homeroomClass}
        inputStyle={inputStyle}
        btnSecondary={btnSecondary}
        myTimetableDate={myTimetableDate}
        onMyTimetableDateChange={setMyTimetableDate}
        homeroomTimetableDate={homeroomTimetableDate}
        onHomeroomTimetableDateChange={setHomeroomTimetableDate}
        comtimeDateOptions={comtimeDateOptions}
        myTimetableWeek={myTimetableWeek}
        homeroomTimetableWeek={homeroomTimetableWeek}
        loadMyTimetable={loadMyTimetable}
        loadHomeroomTimetable={loadHomeroomTimetable}
      />}

      {activeTab === 'files' && <FilesTab
        apiBase={API}
        onFileDragOver={onFileDragOver}
        onFileDragLeave={onFileDragLeave}
        onFileDrop={onFileDrop}
        fileDragActive={fileDragActive}
        fileUploadState={fileUploadState}
        formRow={formRow}
        inputStyle={inputStyle}
        btnPrimary={btnPrimary}
        btnSecondary={btnSecondary}
        fileSort={fileSort}
        setFileSort={setFileSort}
        onPickFiles={onPickFiles}
        visibleFileItems={visibleFileItems}
        sortedFileItems={sortedFileItems}
        editingFileId={editingFileId}
        fileNameDraft={fileNameDraft}
        setFileNameDraft={setFileNameDraft}
        saveRenameFile={saveRenameFile}
        setEditingFileId={setEditingFileId}
        openFileItem={openFileItem}
        beginRenameFile={beginRenameFile}
        removeFileItem={removeFileItem}
        fileGrid={fileGrid}
        fileCard={fileCard}
        miniBtn={miniBtn}
        miniBtnDanger={miniBtnDanger}
        resourceTitle={resourceTitle}
        setResourceTitle={setResourceTitle}
        resourceUrl={resourceUrl}
        setResourceUrl={setResourceUrl}
        addResourceLink={addResourceLink}
        resourceLinks={resourceLinks}
        removeResourceLink={removeResourceLink}
      />}

      {activeTab === 'patchnotes' && <PatchNotesView onScrollTop={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />}

      {activeTab === 'settings' && <SettingsTab
        ui={{
          isMobile,
          compactDesktop: settingsCompactDesktop,
          isMasterAdmin: String(me?.role || '').toLowerCase() === 'admin',
        }}
        values={{
          academicYear,
          schoolName,
          teacherDisplayName,
          homeroomClass,
          schoolCodeSetting,
          teacherNoSetting,
          kmaServiceKey,
          myCurrentPassword,
          myNewPassword,
          googleCalendarIcsUrl,
          googleCalendarEmbedUrl,
          googleTasksClientId,
          googleTasksClientSecret,
          googleTasksRefreshToken,
          googleTasksListId,
          googleTasksAccessToken,
          weekdayPeriods,
        }}
        setters={{
          setAcademicYear,
          setSchoolName,
          setTeacherDisplayName,
          setHomeroomClass,
          setSchoolCodeSetting,
          setTeacherNoSetting,
          setKmaServiceKey,
          setMyCurrentPassword,
          setMyNewPassword,
          setGoogleCalendarIcsUrl,
          setGoogleCalendarEmbedUrl,
          setGoogleTasksClientId,
          setGoogleTasksClientSecret,
          setGoogleTasksRefreshToken,
          setGoogleTasksListId,
          setGoogleTasksAccessToken,
          setWeekdayPeriods,
        }}
        admin={{
          users: adminUsers,
          passwordDraftById: adminPwDraftById,
          setPasswordDraftById: setAdminPwDraftById,
        }}
        actions={{
          saveSettings,
          changeMyPassword,
          adminChangePassword,
          adminDeleteUser,
          deleteMyAccount,
        }}
        styles={{
          inputStyle,
          btnPrimary,
          btnSecondary,
          btnSoftDanger,
        }}
      />}

      <QuickRecordPalette
        open={quickRecordOpen}
        onClose={() => setQuickRecordOpen(false)}
        students={activeStudents}
        actions={quickRecordActions}
        onSelectStudent={openQuickStudent}
      />
    </main>
  );
}

const parseYmdDate = (ymd) => {
  if (!ymd) return null;
  const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const toYmd = (d) => {
  if (!d || Number.isNaN(d.getTime?.())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const parseLocalDateTime = (value) => {
  const s = String(value || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const toLocalDateTime = (d) => {
  if (!d || Number.isNaN(d.getTime?.())) return '';
  return `${toYmd(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function DateField({ value, onChange, compact = false }) {
  const selected = parseYmdDate(value);
  return (
    <DatePicker
      selected={selected}
      onChange={(d) => onChange(toYmd(d || new Date()))}
      dateFormat='yyyy-MM-dd'
      locale={ko}
      showPopperArrow={false}
      portalId='root'
      popperPlacement='bottom-start'
      shouldCloseOnSelect
      withPortal={typeof window !== 'undefined' && window.innerWidth <= 768}
      customInput={<input style={compact ? { ...inputStyle, minHeight: 36, height: 36, padding: '5px 9px', fontSize: 13, boxSizing: 'border-box' } : inputStyle} inputMode='none' />}
    />
  );
}

function DateTimeField({ value, onChange, compact = false }) {
  const selected = parseLocalDateTime(value);
  return (
    <DatePicker
      selected={selected}
      onChange={(d) => onChange(toLocalDateTime(d || new Date()))}
      dateFormat='yyyy-MM-dd HH:mm'
      locale={ko}
      showTimeSelect
      timeIntervals={10}
      timeCaption='시간'
      showPopperArrow={false}
      portalId='root'
      popperPlacement='bottom-start'
      withPortal={typeof window !== 'undefined' && window.innerWidth <= 768}
      customInput={<input style={compact ? { ...inputStyle, minHeight: 34, height: 34, padding: '5px 9px', fontSize: 13, boxSizing: 'border-box' } : inputStyle} inputMode='none' />}
    />
  );
}

function TabButton({ id, activeTab, setActiveTab, label }) {
  return <button onClick={() => setActiveTab(id)} style={{ ...tabBtn, ...(activeTab === id ? tabBtnActive : null) }}>{label}</button>;
}

function Card({ title, children, style, titleStyle }) {
  return <section style={{ ...card, ...(style || {}) }}><h2 style={{ marginTop: 0, ...(titleStyle || {}) }}>{title}</h2>{children}</section>;
}

function Stat({ title, value }) {
  return <div style={statCard}><div style={{ color: '#bfdbfe', fontSize: 13 }}>{title}</div><div style={{ color: '#fff', fontSize: 21, fontWeight: 800 }}>{value}</div></div>;
}

const pageWrap = { width: '100%', maxWidth: 1280, margin: '0 auto', padding: 16, boxSizing: 'border-box', fontFamily: 'Pretendard, sans-serif', fontSize: 15, background: '#f1f5f9', minHeight: '100dvh', overflowX: 'hidden' };
const heroCard = { background: 'linear-gradient(135deg, #1d4ed8, #0f172a)', color: '#fff', borderRadius: 16, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 12 };
const statCard = { background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '9px 11px', minWidth: 118 };
const versionBadge = { fontSize: 13, color: '#bfdbfe', border: '1px solid rgba(191,219,254,0.5)', borderRadius: 999, padding: '2px 8px' };
const tabRow = { display: 'flex', gap: 8, marginTop: 6, marginBottom: 10, flexWrap: 'nowrap', overflowX: 'auto' };
const tabBtn = { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 999, padding: '9px 13px', cursor: 'pointer', fontWeight: 600, fontSize: 14, lineHeight: 1.2, whiteSpace: 'nowrap', flexShrink: 0, outline: 'none', boxSizing: 'border-box', boxShadow: 'none' };
const tabBtnActive = { background: '#dbeafe', color: '#1d4ed8' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 12, boxShadow: '0 4px 14px rgba(15,23,42,0.04)' };
const quickGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 12 };
const twoColGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 12 };
const clubSplitGrid = { display: 'grid', gridTemplateColumns: 'minmax(300px, 0.86fr) minmax(0, 1.14fr)', gap: 10 };
const studentSplitGrid = { display: 'grid', gridTemplateColumns: 'minmax(0, 0.48fr) minmax(0, 0.52fr)', gap: 12 };
const announcementSplitGrid = { display: 'grid', gridTemplateColumns: 'minmax(320px, 0.92fr) minmax(0, 1.08fr)', gap: 12, alignItems: 'stretch' };
const attendanceMemoGrid = { display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(220px, 0.55fr)', gap: 10, alignItems: 'start' };
const formRow = { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 };
const inputStyle = { padding: '10px 11px', border: '1px solid #cbd5e1', borderRadius: 8, minHeight: 42, fontSize: 14 };
const inputMini = { padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: 6, minHeight: 30, fontSize: 13, maxWidth: 80 };
const btnPrimary = { padding: '10px 13px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const btnSecondary = { padding: '10px 13px', borderRadius: 8, border: '1px solid #94a3b8', background: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const listStyle = { margin: 0, paddingLeft: 0, lineHeight: 1.7, listStyle: 'none' };
const checkBtn = { marginRight: 8, border: 'none', background: 'transparent', cursor: 'pointer' };
const linkBtn = { border: '1px solid #dbeafe', background: '#eff6ff', color: '#1e3a8a', cursor: 'pointer', padding: '4px 10px', borderRadius: 999, fontWeight: 700, textDecoration: 'none', fontSize: 13 };
const miniBtn = { marginLeft: 6, border: '1px solid #93c5fd', background: '#eff6ff', borderRadius: 6, padding: '3px 7px', fontSize: 13, cursor: 'pointer' };
const miniBtnDanger = { marginLeft: 6, border: '1px solid #fca5a5', background: '#fef2f2', borderRadius: 6, padding: '3px 7px', fontSize: 13, cursor: 'pointer' };
const btnSoft = { padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: 'pointer', minHeight: 40 };
const btnSoftDanger = { padding: '8px 12px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff5f5', color: '#b91c1c', fontWeight: 700, cursor: 'pointer', minHeight: 40 };
const detailActionBtn = { padding: '4px 8px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontWeight: 700, fontSize: 12, lineHeight: 1.15, cursor: 'pointer', minHeight: 28, minWidth: 96, boxSizing: 'border-box', textAlign: 'center' };
const detailActionDangerBtn = { padding: '4px 8px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff1f2', color: '#be123c', fontWeight: 700, fontSize: 12, lineHeight: 1.15, cursor: 'pointer', minHeight: 28, minWidth: 96, boxSizing: 'border-box', textAlign: 'center' };
const preBox = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, fontSize: 13, overflowX: 'auto' };
const ttTable = { width: '100%', borderCollapse: 'collapse', border: '1px solid #cbd5e1', background: '#fff', tableLayout: 'auto' };
const ttTh = { border: '1px solid #cbd5e1', background: '#eff6ff', padding: '6px 6px', fontSize: 13, textAlign: 'left' };
const ttTd = { border: '1px solid #e2e8f0', padding: '4px 6px', fontSize: 13, wordBreak: 'break-word' };
const fileGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 };
const fileCard = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, display: 'grid', gap: 6 };







