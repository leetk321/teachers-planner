import { getSeoulDateText } from '../utils/dateTime.js';

const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 200;

const ALLOWED_SCOPES = ['all', 'students', 'notes', 'schedules', 'memos', 'files', 'links', 'clubs', 'issues'];

const scopeLabels = {
  students: '학생',
  notes: '상담기록',
  schedules: '일정/할 일',
  memos: '메모/전달사항',
  files: '자료',
  links: '링크',
  clubs: '선택 편성',
  issues: '사안',
};

const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalizeForSearch = (value) => normalizeText(value).toLowerCase();
const splitTerms = (query) => normalizeForSearch(query).split(' ').filter(Boolean);

const includesAllTerms = (haystack, terms) => {
  if (!terms.length) return false;
  return terms.every((term) => haystack.includes(term));
};

const trimSnippet = (value, max = 180) => {
  const text = normalizeText(value);
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const formatDate = (value) => {
  const text = normalizeText(value);
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text.slice(0, 16);
  return getSeoulDateText(date);
};

const scheduleKindLabel = (kind) => {
  if (kind === 'event') return '일정';
  return '할 일';
};

const memoKindLabel = (kind) => (String(kind || 'memo') === 'announcement' ? '전달사항' : '메모');

const getScore = ({ normalized, title, subtitle, snippet }, queryNormalized, terms) => {
  let score = 0;
  const normalizedTitle = normalizeForSearch(title);
  const normalizedSubtitle = normalizeForSearch(subtitle);
  const normalizedSnippet = normalizeForSearch(snippet);
  if (normalizedTitle.includes(queryNormalized)) score += 15;
  if (normalizedSubtitle.includes(queryNormalized)) score += 10;
  if (normalizedSnippet.includes(queryNormalized)) score += 8;
  score += terms.filter((term) => normalizedTitle.includes(term)).length * 4;
  score += terms.filter((term) => normalizedSubtitle.includes(term)).length * 3;
  score += terms.filter((term) => normalizedSnippet.includes(term)).length * 2;
  if (normalized.includes(queryNormalized)) score += 6;
  return score;
};

const sortResults = (results) => results.sort((a, b) => {
  if (b.score !== a.score) return b.score - a.score;
  const dateA = Date.parse(a.sortDate || '') || 0;
  const dateB = Date.parse(b.sortDate || '') || 0;
  if (dateB !== dateA) return dateB - dateA;
  return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
});

export const createSearchService = ({ phase1Store, phase2Store, phase3Store, phase6Store = null, searchIndexStore = null }) => {
  const search = (ownerId, { q = '', scope = 'all', limit = DEFAULT_LIMIT, year = '' } = {}) => {
    const query = normalizeText(q);
    const queryNormalized = normalizeForSearch(query);
    const terms = splitTerms(query);
    const normalizedScope = ALLOWED_SCOPES.includes(String(scope || 'all')) ? String(scope || 'all') : 'all';
    const normalizedLimit = Math.max(1, Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT));

    if (!query || !terms.length) {
      return { query, scope: normalizedScope, total: 0, counts: {}, results: [] };
    }

    if (searchIndexStore) {
      const indexed = searchIndexStore.search(ownerId, {
        q: query,
        scope: normalizedScope,
        limit: normalizedLimit,
        year,
      });
      return {
        query: indexed.query,
        scope: indexed.scope,
        total: indexed.total,
        counts: indexed.counts,
        indexMode: indexed.mode,
        results: indexed.results.map((result) => ({
          ...result,
          scopeLabel: scopeLabels[result.scope] || result.scope,
          title: normalizeText(result.title),
          subtitle: normalizeText(result.subtitle),
          snippet: trimSnippet(result.snippet),
          date: formatDate(result.date),
        })),
      };
    }

    const students = phase2Store.listStudents(ownerId, year ? { year } : {});
    const studentsById = new Map(students.map((student) => [Number(student.id), student]));
    const phase1Settings = phase1Store.getSettings(ownerId) || {};
    const resourceLinks = Array.isArray(phase1Settings.resourceLinks) ? phase1Settings.resourceLinks : [];

    const results = [];

    const pushIfMatched = ({ scopeKey, type, title, subtitle = '', snippet = '', searchParts = [], date = '', id = '', studentId = '', clubId = '', className = '', period = '', kind = '', meta = {} }) => {
      if (normalizedScope !== 'all' && normalizedScope !== scopeKey) return;
      const normalized = normalizeForSearch([title, subtitle, snippet, ...searchParts].join(' '));
      if (!includesAllTerms(normalized, terms)) return;
      const result = {
        scope: scopeKey,
        scopeLabel: scopeLabels[scopeKey] || scopeKey,
        type,
        title: normalizeText(title),
        subtitle: normalizeText(subtitle),
        snippet: trimSnippet(snippet || searchParts.join(' ')),
        date: formatDate(date),
        id,
        studentId,
        clubId,
        className,
        period,
        kind,
        sortDate: String(date || ''),
        score: getScore({ normalized, title, subtitle, snippet }, queryNormalized, terms),
        ...meta,
      };
      results.push(result);
    };

    students.forEach((student) => {
      pushIfMatched({
        scopeKey: 'students',
        type: 'student',
        title: student.name || '(이름 없음)',
        subtitle: [student.class_name, student.student_no ? `${student.student_no}번` : '', student.transferred_at ? '전출' : ''].filter(Boolean).join(' · '),
        snippet: [student.memo, student.tags, student.basic_info, student.basic_survey, student.student_phone, student.guardian_phone, student.birth_date].filter(Boolean).join(' · '),
        searchParts: [student.name, student.class_name, student.student_no, student.memo, student.tags, student.basic_info, student.basic_survey, student.student_phone, student.guardian_phone, student.birth_date, student.transferred_at],
        date: student.updated_at || student.created_at || '',
        id: student.id,
        studentId: student.id,
        className: student.class_name,
      });
    });

    phase2Store.listNotes(ownerId, year ? { year } : {}).forEach((note) => {
      const student = studentsById.get(Number(note.student_id));
      const studentName = normalizeText(note.student_name || student?.name || '');
      pushIfMatched({
        scopeKey: 'notes',
        type: 'note',
        title: studentName ? `${studentName} 상담기록` : '상담기록',
        subtitle: [normalizeText(note.category), normalizeText(note.note_date)].filter(Boolean).join(' · '),
        snippet: note.content,
        searchParts: [studentName, note.category, note.content, note.note_date, student?.class_name, student?.student_no],
        date: note.note_date || note.created_at || '',
        id: note.id,
        studentId: note.student_id,
        className: student?.class_name || '',
      });
    });

    phase2Store.listSchedules(ownerId).forEach((schedule) => {
      pushIfMatched({
        scopeKey: 'schedules',
        type: schedule.kind === 'event' ? 'event' : 'todo',
        title: schedule.title || '(제목 없음)',
        subtitle: [scheduleKindLabel(schedule.kind), normalizeText(schedule.importance), schedule.done ? '완료' : '미완료'].filter(Boolean).join(' · '),
        snippet: schedule.due_at ? `일정 시각 ${schedule.due_at}` : '',
        searchParts: [schedule.title, schedule.due_at, schedule.importance, schedule.kind, schedule.done ? '완료' : '미완료'],
        date: schedule.due_at || schedule.created_at || '',
        id: schedule.id,
      });
    });

    phase1Store.listTaskMemos(ownerId).forEach((memo) => {
      pushIfMatched({
        scopeKey: 'memos',
        type: String(memo.kind || 'memo'),
        title: memo.title || '(제목 없음)',
        subtitle: [memoKindLabel(memo.kind), memo.memo_date, memo.is_completed ? '완료' : '미완료'].filter(Boolean).join(' · '),
        snippet: memo.content,
        searchParts: [memo.title, memo.content, memo.memo_date, memo.kind, memo.is_completed ? '완료' : '미완료'],
        date: memo.memo_date || memo.updated_at || memo.created_at || '',
        id: memo.id,
      });
    });

    phase1Store.listFiles(ownerId).forEach((file) => {
      pushIfMatched({
        scopeKey: 'files',
        type: 'file',
        title: file.name || '(파일명 없음)',
        subtitle: [normalizeText(file.type), file.size ? `${Math.round(Number(file.size || 0) / 1024)} KB` : ''].filter(Boolean).join(' · '),
        snippet: file.url || '',
        searchParts: [file.name, file.type, file.url],
        date: file.created_at || file.createdAt || '',
        id: file.id,
      });
    });

    resourceLinks.forEach((link, index) => {
      pushIfMatched({
        scopeKey: 'links',
        type: 'link',
        title: link.title || '(제목 없음)',
        subtitle: link.url || '',
        snippet: link.url || '',
        searchParts: [link.title, link.url],
        date: link.created_at || '',
        id: link.id || `link_${index}`,
      });
    });

    phase3Store.listClubs(ownerId).forEach((club) => {
      const memberNames = (Array.isArray(club.student_ids) ? club.student_ids : [])
        .map((id) => studentsById.get(Number(id))?.name)
        .filter(Boolean);
      pushIfMatched({
        scopeKey: 'clubs',
        type: 'club',
        title: club.name || '(선택 편성 없음)',
        subtitle: [club.academic_year, club.use_for_attendance ? '출석 사용' : ''].filter(Boolean).join(' · '),
        snippet: memberNames.length ? `편성 학생: ${memberNames.slice(0, 8).join(', ')}` : '편성 학생 없음',
        searchParts: [club.name, club.academic_year, memberNames.join(' ')],
        date: club.updated_at || club.created_at || '',
        id: club.id,
        clubId: club.id,
      });
    });

    phase6Store?.listIssues(ownerId).forEach((issue) => {
      pushIfMatched({
        scopeKey: 'issues',
        type: 'issue',
        title: issue.case_no || '(사안 번호 없음)',
        subtitle: [issue.title, issue.status === 'open' ? '진행 중' : '종결'].filter(Boolean).join(' · '),
        snippet: (Array.isArray(issue.related_students) && issue.related_students.length) ? `관련 학생: ${issue.related_students.join(', ')}` : '관련 학생 없음',
        searchParts: [issue.case_no, issue.title, ...(issue.related_students || []), issue.status],
        date: issue.updated_at || issue.created_at || '',
        id: issue.id,
      });
    });

    const counts = {};
    results.forEach((result) => {
      counts[result.scope] = Number(counts[result.scope] || 0) + 1;
    });

    const total = results.length;
    const sorted = sortResults(results).slice(0, normalizedLimit).map(({ score, sortDate, ...rest }) => rest);

    return {
      query,
      scope: normalizedScope,
      total,
      counts,
      results: sorted,
    };
  };

  return {
    search,
    reindex: searchIndexStore ? (ownerId) => searchIndexStore.reindexOwner(ownerId) : null,
    indexMode: searchIndexStore?.mode || 'legacy-js',
  };
};
