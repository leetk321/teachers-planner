import { fetchWithTimeout } from '../utils/fetchWithTimeout.js';

const COMTIME_TEACHER_ROOT = 'http://xn--s39aqy283b66bj2x.kr/';
const COMTIME_API_FALLBACK = 'http://comci.net:4082';
const COMTIME_TIMEOUT_MS = 10_000;
const COMTIME_API_PORTS = new Set(['4082']);
const COMTIME_ALLOWED_DOMAINS = [
  'comci.net',
  'comci.kr',
  'comcigan.com',
  'comcigan.co.kr',
  'xn--s39aqy283b66bj2x.kr',
];

const findKey = (obj, suffix) => Object.keys(obj || {}).find((key) => key.endsWith(suffix));

export const normalizeComtimeApiBase = (rawUrl = '') => {
  try {
    const url = new URL(String(rawUrl || '').trim(), COMTIME_TEACHER_ROOT);
    const hostname = url.hostname.toLowerCase();
    const allowedDomain = COMTIME_ALLOWED_DOMAINS.some((domain) => (
      hostname === domain || hostname.endsWith(`.${domain}`)
    ));
    if (!allowedDomain) return '';
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (!COMTIME_API_PORTS.has(url.port)) return '';
    if (url.username || url.password) return '';
    return url.origin;
  } catch {
    return '';
  }
};

const resolveComtimeApiBase = async () => {
  try {
    const rootRes = await fetchWithTimeout(COMTIME_TEACHER_ROOT, {}, {
      timeoutMs: COMTIME_TIMEOUT_MS,
      serviceName: '컴시간 교사 사이트',
    });
    const rootHtml = await rootRes.text();
    const match = rootHtml.match(/<FRAME\s+src=['"]([^'"]+)['"]/i);
    if (match?.[1]) {
      const apiBase = normalizeComtimeApiBase(match[1]);
      if (apiBase) return apiBase;
    }
  } catch {
    // 컴시간 대표 사이트가 응답하지 않아도 검증된 고정 API 주소로 조회를 시도합니다.
  }
  return COMTIME_API_FALLBACK;
};

const fetchComtimeRaw = async (schoolCode, requestValue = 1) => {
  const query = Buffer.from(`73629_${schoolCode}_0_${requestValue}`).toString('base64');
  const apiBase = await resolveComtimeApiBase();
  const response = await fetchWithTimeout(`${apiBase}/36179_T?${query}`, {}, {
    timeoutMs: COMTIME_TIMEOUT_MS,
    serviceName: '컴시간 API',
  });
  const text = await response.text();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('컴시간 응답 파싱 실패');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('컴시간 응답 형식이 올바르지 않습니다.');
  }
};

const parseSlots = (data) => {
  const timetableKey = findKey(data, '강');
  const rawSlots = Array.isArray(data?.['일과시간'])
    ? data['일과시간']
    : (timetableKey && Array.isArray(data[timetableKey]) ? data[timetableKey] : []);
  return rawSlots
    .map((item, index) => {
      const period = index + 1;
      if (period > 7) return null;
      const match = String(item).match(/(\d{1,2}):(\d{2})/);
      if (!match) return { period, label: String(item || `${period}교시`) };
      return { period, label: `${String(match[1]).padStart(2, '0')}:${match[2]}` };
    })
    .filter(Boolean);
};

const getComtimeSep = (data) => Number(data['분리'] || data['遺꾨━'] || 100);
const getComtimeTh = (code, sep) => (sep === 100 ? Math.floor(Number(code || 0) / sep) : Number(code || 0) % sep);
const getComtimeSb = (code, sep) => (sep === 100 ? Number(code || 0) % sep : Math.floor(Number(code || 0) / sep));

const getTeacherCodes = (data, teacherNo, weekdayIdx) => {
  const key = findKey(data, '542');
  const teacherTable = key ? data[key] : [];
  if (!teacherTable[teacherNo] || !teacherTable[teacherNo][weekdayIdx]) return [];
  const day = teacherTable[teacherNo][weekdayIdx];
  return Array.isArray(day) ? day.slice(1) : [];
};

const getTeacherBaseCodes = (data, teacherNo, weekdayIdx) => {
  const sep = getComtimeSep(data);
  const teacherCount = Number(data['교사수'] || 0);
  const classKey = findKey(data, '481');
  const classTable = classKey ? data[classKey] : [];
  const teacherTable = Array.from({ length: teacherCount + 1 }, () => Array.from({ length: 6 }, () => Array(9).fill(0)));

  for (let grade = 1; grade < classTable.length; grade += 1) {
    const gradeRows = classTable[grade] || [];
    for (let klass = 1; klass < gradeRows.length; klass += 1) {
      for (let weekday = 1; weekday <= 5; weekday += 1) {
        for (let period = 1; period <= 8; period += 1) {
          const originalCode = Number(gradeRows?.[klass]?.[weekday]?.[period] || 0);
          if (!originalCode) continue;
          const teacherIdx = getComtimeTh(originalCode, sep);
          if (!teacherTable[teacherIdx]?.[weekday]) continue;
          const subjectIdx = getComtimeSb(originalCode, sep);
          teacherTable[teacherIdx][weekday][period] = sep === 100
            ? (((grade * 100) + klass) * sep) + subjectIdx
            : (subjectIdx * sep) + (grade * 100) + klass;
        }
      }
    }
  }

  const day = teacherTable[teacherNo]?.[weekdayIdx];
  return Array.isArray(day) ? day.slice(1) : [];
};

const subjectInfo = (data, code) => {
  const sep = getComtimeSep(data);
  const roomCode = getComtimeTh(code, sep);
  const subjectCode = getComtimeSb(code, sep);
  const key = findKey(data, '492');
  const subjects = key ? data[key] : [];
  const subject = String(subjects[subjectCode] || subjects[roomCode] || '').trim();
  return { roomCode, subj: subject || '-' };
};

const formatHomeroom = (roomCode) => {
  const numeric = Number(roomCode);
  if (!Number.isFinite(numeric)) return String(roomCode);
  if (numeric >= 100) return `${Math.floor(numeric / 100)}-${numeric % 100}`;
  return String(numeric);
};

const buildComtimeDateOptions = (data) => {
  const entry = Object.entries(data || {}).find(([, value]) => (
    Array.isArray(value) &&
    value.length > 0 &&
    Array.isArray(value[0]) &&
    value[0].length >= 2 &&
    typeof value[0][0] === 'number' &&
    typeof value[0][1] === 'string' &&
    value[0][1].includes('~')
  ));
  const list = entry ? entry[1] : [];
  return list
    .map((item) => ({
      value: String(item?.[0] ?? ''),
      label: String(item?.[1] || '').trim(),
      weekOffset: Number(item?.[0] ?? 1),
    }))
    .filter((item) => item.value && item.label);
};

export const createComtimeService = () => ({
  async getTeachers(schoolCode) {
    const raw = await fetchComtimeRaw(String(schoolCode), 1);
    const key = findKey(raw, '446');
    const names = key ? raw[key] : [];
    const teachers = names
      .map((name, index) => ({ no: index, name: String(name || '') }))
      .filter((item) => item.no > 0 && item.name.trim());
    return { teachers };
  },

  async getDateOptions(schoolCode) {
    const raw = await fetchComtimeRaw(String(schoolCode), 1);
    const dates = buildComtimeDateOptions(raw);
    const defaultValue = String(raw['오늘r'] || dates[0]?.value || '1');
    return { dates, defaultValue };
  },

  async getTeacherTimetable(schoolCode, teacherNo, weekday, weekOffset) {
    const raw = await fetchComtimeRaw(String(schoolCode), weekOffset);
    const slots = parseSlots(raw);
    const codes = getTeacherCodes(raw, Number(teacherNo), weekday);
    const baseCodes = getTeacherBaseCodes(raw, Number(teacherNo), weekday);

    const rows = slots.map((slot) => {
      const code = Number(codes[slot.period - 1] || 0);
      const baseCode = Number(baseCodes[slot.period - 1] || 0);
      const isChanged = code !== baseCode;
      if (!code) return { period: slot.period, time: slot.label, text: '-', isChanged };
      const { roomCode, subj } = subjectInfo(raw, code);
      if (subj === '-') return { period: slot.period, time: slot.label, text: '-', isChanged };
      return { period: slot.period, time: slot.label, text: `${formatHomeroom(roomCode)}\n${subj}`, isChanged };
    });
    return { weekday, weekOffset, rows, startDate: raw['시작일'] };
  },

  async getHomeroomTimetable(schoolCode, homeroom, weekday, weekOffset) {
    const match = String(homeroom).match(/(\d+)\s*[-]\s*(\d+)/);
    if (!match) throw new Error('담임반은 학년-반 형식으로 입력해 주세요. (예: 1-5)');
    const grade = Number(match[1]);
    const klass = Number(match[2]);

    const raw = await fetchComtimeRaw(String(schoolCode), weekOffset);
    if (weekday === 0 || weekday === 6) return { weekday, weekOffset, rows: [], startDate: raw['시작일'] };
    const slots = parseSlots(raw);

    const dailyKey = findKey(raw, '147');
    const frozenKey = findKey(raw, '481');
    const dailyBlock = dailyKey ? raw[dailyKey]?.[grade]?.[klass]?.[weekday] : null;
    const frozenBlock = frozenKey ? raw[frozenKey]?.[grade]?.[klass]?.[weekday] : null;

    const rows = slots.map((slot) => {
      const code = Number(dailyBlock?.[slot.period] || 0);
      const frozenCode = Number(frozenBlock?.[slot.period] || 0);
      const isChanged = code !== frozenCode;
      if (!code) return { period: slot.period, time: slot.label, text: '-', isChanged };
      const { subj } = subjectInfo(raw, code);
      if (subj === '-') return { period: slot.period, time: slot.label, text: '-', isChanged };
      return { period: slot.period, time: slot.label, text: `${subj}`, isChanged };
    });
    return { weekday, weekOffset, rows, startDate: raw['시작일'] };
  },
});
