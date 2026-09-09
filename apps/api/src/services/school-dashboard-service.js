import { fetchWithTimeout } from '../utils/fetchWithTimeout.js';
import {
  SEOUL_TIME_ZONE as KST_TIME_ZONE,
  getSeoulCompactDate as getKstDateValue,
  getSeoulDateText as getKstDateText,
  getTimeZoneDateTimeParts as getLocaleDateTimeParts,
} from '../utils/dateTime.js';

const NEIS_API_BASE = 'https://open.neis.go.kr/hub';
const SCHOOL_INFO_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const SCHOOL_LOCATION_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const MEAL_CACHE_TTL_MS = 1000 * 60 * 15;
const WEATHER_CACHE_TTL_MS = 1000 * 60 * 15;
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const KMA_API_HUB_FORECAST_SERVICE_BASE = 'https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0';
const KMA_ULTRA_SRT_NCST_URL = `${KMA_API_HUB_FORECAST_SERVICE_BASE}/getUltraSrtNcst`;
const KMA_ULTRA_SRT_FCST_URL = `${KMA_API_HUB_FORECAST_SERVICE_BASE}/getUltraSrtFcst`;
const KMA_VILLAGE_FCST_URL = `${KMA_API_HUB_FORECAST_SERVICE_BASE}/getVilageFcst`;
const EXTERNAL_API_TIMEOUT_MS = 10_000;
const KMA_VILLAGE_BASE_TIMES = ['2300', '2000', '1700', '1400', '1100', '0800', '0500', '0200'];
const KMA_ULTRA_FCST_MAX_HOURS = 6;
const KMA_GRID_CONFIG = {
  RE: 6371.00877,
  GRID: 5.0,
  SLAT1: 30.0,
  SLAT2: 60.0,
  OLON: 126.0,
  OLAT: 38.0,
  XO: 43,
  YO: 136,
};

const schoolInfoCache = new Map();
const schoolLocationCache = new Map();
const mealCache = new Map();
const weatherCache = new Map();

const getKstShiftedDate = (offsetDays = 0) => new Date(Date.now() + (offsetDays * 24 * 60 * 60 * 1000));

const formatCompactYmd = (raw = '') => {
  const value = String(raw || '').trim();
  if (!/^\d{8}$/.test(value)) return value;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
};

const decodeHtmlEntities = (value = '') => String(value || '')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'");

const splitNeisLines = (value = '') => decodeHtmlEntities(value)
  .split(/<br\s*\/?>/i)
  .map((item) => item.replace(/\u00a0/g, ' ').trim())
  .filter(Boolean);

const normalizeMealDishName = (value = '') => decodeHtmlEntities(value)
  .replace(/\s*\((?:\d+\.?)+\)\s*$/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const getCachedValue = (store, key) => {
  const cached = store.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return cached.value;
};

const setCachedValue = (store, key, value, ttlMs) => {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
};

const formatIsoFromKmaDateTime = (rawDate = '', rawTime = '') => {
  const date = String(rawDate || '').trim();
  const time = String(rawTime || '').trim().padStart(4, '0');
  if (!/^\d{8}$/.test(date) || !/^\d{4}$/.test(time)) return '';
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:00`;
};

const normalizeKmaAuthKey = (raw = '') => {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const toKmaGrid = (latitude, longitude) => {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const DEGRAD = Math.PI / 180.0;
  const { RE, GRID, SLAT1, SLAT2, OLON, OLAT, XO, YO } = KMA_GRID_CONFIG;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + (lat * DEGRAD) * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = (lon * DEGRAD) - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor((ra * Math.sin(theta)) + XO + 0.5),
    ny: Math.floor((ro - (ra * Math.cos(theta))) + YO + 0.5),
  };
};

const getLatestKmaHourCandidates = (count = 8) => {
  const out = [];
  const seen = new Set();
  for (let idx = 0; idx < count * 2 && out.length < count; idx += 1) {
    const cursor = new Date(Date.now() - (idx * 60 * 60 * 1000));
    const { year, month, day, hour } = getLocaleDateTimeParts(cursor, KST_TIME_ZONE);
    const baseDate = `${year}${month}${day}`;
    const baseTime = `${hour}00`;
    const key = `${baseDate}${baseTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ baseDate, baseTime });
  }
  return out;
};

const getLatestKmaVillageCandidates = (count = 10) => {
  const out = [];
  const seen = new Set();
  for (let idx = 0; idx < 48 && out.length < count; idx += 1) {
    const cursor = new Date(Date.now() - (idx * 60 * 60 * 1000));
    const { year, month, day, hour, minute } = getLocaleDateTimeParts(cursor, KST_TIME_ZONE);
    const baseDate = `${year}${month}${day}`;
    const currentMinutes = (Number(hour) * 60) + Number(minute);
    const baseTime = KMA_VILLAGE_BASE_TIMES.find((slot) => {
      const slotMinutes = (Number(slot.slice(0, 2)) * 60) + Number(slot.slice(2, 4));
      return slotMinutes <= currentMinutes;
    });
    if (!baseTime) continue;
    const key = `${baseDate}${baseTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ baseDate, baseTime });
  }
  return out;
};

const getLatestKmaUltraCandidates = (count = 10) => {
  const out = [];
  const seen = new Set();
  for (let idx = 0; idx < count * 3 && out.length < count; idx += 1) {
    const cursor = new Date(Date.now() - (idx * 60 * 60 * 1000) - (30 * 60 * 1000));
    const { year, month, day, hour } = getLocaleDateTimeParts(cursor, KST_TIME_ZONE);
    const baseDate = `${year}${month}${day}`;
    const baseTime = `${hour}30`;
    const key = `${baseDate}${baseTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ baseDate, baseTime });
  }
  return out;
};

const getKmaCurrentHourIso = () => {
  const { year, month, day, hour } = getLocaleDateTimeParts(new Date(), KST_TIME_ZONE);
  return `${year}-${month}-${day}T${hour}:00:00`;
};

const parseFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const mapKmaConditionToWeatherCode = (sky, pty) => {
  const precipitationType = Number(pty || 0);
  if ([1, 4, 5].includes(precipitationType)) return 61;
  if ([2, 6].includes(precipitationType)) return 68;
  if ([3, 7].includes(precipitationType)) return 71;

  const skyValue = Number(sky || 0);
  if (skyValue === 1) return 0;
  if (skyValue === 3) return 2;
  if (skyValue === 4) return 3;
  return 3;
};

const buildKmaForecastGroups = (rows = []) => {
  const grouped = new Map();
  rows.forEach((item) => {
    const fcstDate = String(item?.fcstDate || '').trim();
    const fcstTime = String(item?.fcstTime || '').trim().padStart(4, '0');
    const category = String(item?.category || '').trim();
    const iso = formatIsoFromKmaDateTime(fcstDate, fcstTime);
    if (!iso || !category) return;
    const current = grouped.get(iso) || { time: iso };
    current[category] = item?.fcstValue;
    grouped.set(iso, current);
  });

  return [...grouped.values()]
    .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))
    .map((item) => ({
      time: item.time,
      temperature: parseFiniteNumber(item.T1H) ?? parseFiniteNumber(item.TMP),
      humidity: parseFiniteNumber(item.REH),
      windSpeed: parseFiniteNumber(item.WSD),
      precipitationProbability: parseFiniteNumber(item.POP),
      precipitationAmount: String(item.RN1 || '').trim(),
      weatherCode: mapKmaConditionToWeatherCode(item.SKY, item.PTY),
      raw: item,
    }));
};

const fetchKmaItems = async (endpoint, authKey, params = {}) => {
  const normalizedKey = normalizeKmaAuthKey(authKey);
  if (!normalizedKey) throw new Error('기상청 API 허브 인증키가 설정되지 않았습니다.');

  const url = new URL(endpoint);
  url.searchParams.set('authKey', normalizedKey);
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '1000');
  url.searchParams.set('dataType', 'JSON');
  Object.entries(params || {}).forEach(([key, value]) => {
    const normalized = String(value ?? '').trim();
    if (normalized) url.searchParams.set(key, normalized);
  });

  let res;
  try {
    res = await fetchWithTimeout(url, {}, {
      timeoutMs: EXTERNAL_API_TIMEOUT_MS,
      serviceName: '기상청 API 허브',
    });
  } catch (error) {
    if (error?.status === 401) {
      throw new Error('기상청 API 허브 인증키가 올바르지 않거나 아직 활성화되지 않았습니다.');
    }
    if (error?.status === 403) {
      throw new Error('기상청 API 허브 활용신청이 필요한 상태입니다.');
    }
    if (error?.status) throw new Error(`기상청 API 허브 오류 (${error.status})`);
    throw error;
  }

  const payload = await res.json().catch(() => null);
  if (!payload) throw new Error('기상청 API 허브 응답 형식이 올바르지 않습니다.');
  const resultStatus = Number(payload?.result?.status);
  const resultMessage = String(payload?.result?.message || '').trim();
  if (Number.isFinite(resultStatus) && resultStatus !== 200) {
    throw new Error(resultMessage || `기상청 API 허브 오류 (${resultStatus})`);
  }
  const resultCode = String(payload?.response?.header?.resultCode || '');
  const resultMsg = String(payload?.response?.header?.resultMsg || '');
  if (resultCode && resultCode !== '00') {
    throw new Error(`기상청 API 허브 오류 (${resultMsg || resultCode})`);
  }
  const items = payload?.response?.body?.items?.item;
  return Array.isArray(items) ? items : [];
};

const shouldStopKmaRetry = (error) => {
  const message = String(error?.message || '');
  return ['EXTERNAL_FETCH_TIMEOUT', 'EXTERNAL_FETCH_NETWORK_ERROR', 'EXTERNAL_FETCH_ABORTED'].includes(error?.code)
    || message.includes('인증키')
    || message.includes('활용신청');
};

const fetchLatestKmaNowcast = async (authKey, grid) => {
  let lastError = null;
  for (const candidate of getLatestKmaHourCandidates(8)) {
    try {
      const rows = await fetchKmaItems(KMA_ULTRA_SRT_NCST_URL, authKey, {
        base_date: candidate.baseDate,
        base_time: candidate.baseTime,
        nx: grid.nx,
        ny: grid.ny,
      });
      if (rows.length) return { rows, ...candidate };
    } catch (error) {
      lastError = error;
      if (shouldStopKmaRetry(error)) throw error;
    }
  }
  if (lastError) throw lastError;
  return null;
};

const fetchLatestKmaForecast = async (endpoint, authKey, grid) => {
  let lastError = null;
  for (const candidate of getLatestKmaVillageCandidates(10)) {
    try {
      const rows = await fetchKmaItems(endpoint, authKey, {
        base_date: candidate.baseDate,
        base_time: candidate.baseTime,
        nx: grid.nx,
        ny: grid.ny,
      });
      if (rows.length) return { rows, ...candidate };
    } catch (error) {
      lastError = error;
      if (shouldStopKmaRetry(error)) throw error;
    }
  }
  if (lastError) throw lastError;
  return null;
};

const fetchLatestKmaVillageForecast = async (authKey, grid) => fetchLatestKmaForecast(KMA_VILLAGE_FCST_URL, authKey, grid);

const fetchLatestKmaUltraForecast = async (authKey, grid) => {
  let lastError = null;
  for (const candidate of getLatestKmaUltraCandidates(10)) {
    try {
      const rows = await fetchKmaItems(KMA_ULTRA_SRT_FCST_URL, authKey, {
        base_date: candidate.baseDate,
        base_time: candidate.baseTime,
        nx: grid.nx,
        ny: grid.ny,
      });
      if (rows.length) return { rows, ...candidate };
    } catch (error) {
      lastError = error;
      if (shouldStopKmaRetry(error)) throw error;
    }
  }
  if (lastError) throw lastError;
  return null;
};

const neisFetchJson = async (datasetName, params = {}) => {
  const url = new URL(`${NEIS_API_BASE}/${datasetName}`);
  url.searchParams.set('Type', 'json');
  url.searchParams.set('pIndex', '1');
  url.searchParams.set('pSize', '100');
  Object.entries(params || {}).forEach(([key, value]) => {
    const normalized = String(value ?? '').trim();
    if (normalized) url.searchParams.set(key, normalized);
  });
  const res = await fetchWithTimeout(url, {}, {
    timeoutMs: EXTERNAL_API_TIMEOUT_MS,
    serviceName: 'NEIS API',
  });
  const payload = await res.json().catch(() => null);
  if (!payload) throw new Error('NEIS API 응답 형식이 올바르지 않습니다.');
  return payload;
};

const extractNeisRows = (payload, datasetName) => {
  if (String(payload?.RESULT?.CODE || '') === 'INFO-200') return [];
  const blocks = Array.isArray(payload?.[datasetName]) ? payload[datasetName] : [];
  const rowBlock = blocks.find((item) => Array.isArray(item?.row));
  return Array.isArray(rowBlock?.row) ? rowBlock.row : [];
};

const fetchNeisLunchRowForDate = async (school, mealDateValue) => {
  const payload = await neisFetchJson('mealServiceDietInfo', {
    ATPT_OFCDC_SC_CODE: school.officeCode,
    SD_SCHUL_CODE: school.schoolCode,
    MLSV_YMD: mealDateValue,
    MMEAL_SC_CODE: '2',
  });
  const rows = extractNeisRows(payload, 'mealServiceDietInfo');
  return rows.find((item) => String(item?.MMEAL_SC_CODE || '') === '2') || rows[0] || null;
};

const normalizeNeisLunchRow = (school, row, fallbackMealDate = '') => {
  if (!row) return null;
  const dishes = splitNeisLines(row.DDISH_NM)
    .map((item) => normalizeMealDishName(item))
    .filter(Boolean);
  return {
    schoolName: school.schoolName,
    officeName: school.officeName,
    mealType: String(row.MMEAL_SC_NM || '중식').trim() || '중식',
    mealDate: formatCompactYmd(row.MLSV_YMD) || fallbackMealDate,
    dishes,
    calories: String(row.CAL_INFO || '').trim(),
  };
};

const collectUpcomingNeisMeals = async (school, startOffset = 1, limit = 3) => {
  const meals = [];
  for (let offset = startOffset; offset <= 14 && meals.length < limit; offset += 1) {
    const nextDate = getKstShiftedDate(offset);
    const nextMealDate = getKstDateText(nextDate);
    const nextMealDateValue = getKstDateValue(nextDate);
    const nextRow = await fetchNeisLunchRowForDate(school, nextMealDateValue);
    const nextMeal = normalizeNeisLunchRow(school, nextRow, nextMealDate);
    if (nextMeal?.dishes?.length) meals.push(nextMeal);
  }
  return meals;
};

const resolveSchoolInfoByName = async (rawSchoolName = '') => {
  const schoolName = String(rawSchoolName || '').trim();
  if (!schoolName) return null;
  const cacheKey = schoolName.toLowerCase();
  const cached = getCachedValue(schoolInfoCache, cacheKey);
  if (cached) return cached;

  const payload = await neisFetchJson('schoolInfo', { SCHUL_NM: schoolName });
  const rows = extractNeisRows(payload, 'schoolInfo');
  const exact = rows.find((row) => String(row?.SCHUL_NM || '').trim() === schoolName) || rows[0];
  if (!exact) return null;

  const normalized = {
    schoolName: String(exact.SCHUL_NM || schoolName).trim(),
    officeCode: String(exact.ATPT_OFCDC_SC_CODE || '').trim(),
    officeName: String(exact.ATPT_OFCDC_SC_NM || '').trim(),
    schoolCode: String(exact.SD_SCHUL_CODE || '').trim(),
    roadAddress: `${String(exact.ORG_RDNMA || '').trim()} ${String(exact.ORG_RDNDA || '').trim()}`.replace(/\s+/g, ' ').trim(),
  };
  if (!normalized.officeCode || !normalized.schoolCode) return null;
  return setCachedValue(schoolInfoCache, cacheKey, normalized, SCHOOL_INFO_CACHE_TTL_MS);
};

const resolveSchoolLocation = async (school) => {
  const schoolName = String(school?.schoolName || '').trim();
  if (!schoolName) return null;
  const cacheKey = schoolName.toLowerCase();
  const cached = getCachedValue(schoolLocationCache, cacheKey);
  if (cached) return cached;

  const searchQueries = Array.from(new Set([
    schoolName,
    [schoolName, String(school?.roadAddress || '').trim()].filter(Boolean).join(' '),
    String(school?.roadAddress || '').trim(),
  ].map((item) => String(item || '').trim()).filter(Boolean)));

  for (const query of searchQueries) {
    const url = new URL(NOMINATIM_SEARCH_URL);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('q', query);
    let res;
    try {
      res = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': 'teacher-notebook/1.0',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.7',
        },
      }, {
        timeoutMs: EXTERNAL_API_TIMEOUT_MS,
        serviceName: '학교 위치 검색 서비스',
      });
    } catch {
      continue;
    }
    const rows = await res.json().catch(() => []);
    const first = Array.isArray(rows) ? rows[0] : null;
    const latitude = Number(first?.lat);
    const longitude = Number(first?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const displayParts = String(first?.display_name || '').split(',').map((part) => part.trim()).filter(Boolean);
    const normalized = {
      latitude,
      longitude,
      locationName: displayParts.slice(1, 4).join(' · ') || String(first?.name || '').trim() || schoolName,
      displayName: String(first?.display_name || '').trim(),
    };
    return setCachedValue(schoolLocationCache, cacheKey, normalized, SCHOOL_LOCATION_CACHE_TTL_MS);
  }

  return null;
};

export const createSchoolDashboardService = () => ({
  async fetchTodayLunchBySchoolName(rawSchoolName = '') {
    const schoolName = String(rawSchoolName || '').trim();
    const mealDate = getKstDateText();
    const mealDateValue = getKstDateValue();

    if (!schoolName) {
      return {
        status: 'missing_school',
        schoolName: '',
        mealType: '중식',
        mealDate,
        dishes: [],
        calories: '',
        upcomingMeals: [],
        message: '설정에서 학교명을 입력해 주세요.',
      };
    }

    const cacheKey = `${schoolName.toLowerCase()}|${mealDateValue}`;
    const cached = getCachedValue(mealCache, cacheKey);
    if (cached) return cached;

    const school = await resolveSchoolInfoByName(schoolName);
    if (!school) {
      return setCachedValue(mealCache, cacheKey, {
        status: 'school_not_found',
        schoolName,
        mealType: '중식',
        mealDate,
        dishes: [],
        calories: '',
        upcomingMeals: [],
        message: '학교명으로 오늘 급식 정보를 찾지 못했습니다.',
      }, MEAL_CACHE_TTL_MS);
    }

    const todayRow = await fetchNeisLunchRowForDate(school, mealDateValue);
    const todayMeal = normalizeNeisLunchRow(school, todayRow, mealDate);

    if (todayMeal?.dishes?.length) {
      const upcomingMeals = await collectUpcomingNeisMeals(school, 1, 2);
      return setCachedValue(mealCache, cacheKey, {
        status: 'ok',
        ...todayMeal,
        upcomingMeals,
        message: '',
        updatedAt: formatCompactYmd(todayRow?.LOAD_DTM),
      }, MEAL_CACHE_TTL_MS);
    }

    const upcomingMeals = await collectUpcomingNeisMeals(school, 1, 3);

    return setCachedValue(mealCache, cacheKey, {
      status: upcomingMeals.length ? 'upcoming' : 'no_meal',
      schoolName: school.schoolName,
      officeName: school.officeName,
      mealType: '중식',
      mealDate,
      dishes: [],
      calories: '',
      upcomingMeals,
      message: upcomingMeals.length
        ? '오늘 급식 정보가 없어 다음 급식일을 함께 표시합니다.'
        : '오늘 급식 정보가 없습니다.',
    }, MEAL_CACHE_TTL_MS);
  },

  async fetchSchoolWeatherBySchoolName(rawSchoolName = '', rawAuthKey = '') {
    const schoolName = String(rawSchoolName || '').trim();
    const authKey = normalizeKmaAuthKey(rawAuthKey);
    if (!schoolName) {
      return {
        status: 'missing_school',
        schoolName: '',
        locationName: '',
        current: null,
        hourly: [],
        message: '설정에서 학교명을 입력해 주세요.',
      };
    }
    if (!authKey) {
      return {
        status: 'missing_auth_key',
        schoolName,
        locationName: '',
        current: null,
        hourly: [],
        message: '설정에서 기상청 API 허브 인증키를 입력해 주세요.',
      };
    }

    const school = await resolveSchoolInfoByName(schoolName);
    if (!school) {
      return {
        status: 'school_not_found',
        schoolName,
        locationName: '',
        current: null,
        hourly: [],
        message: '학교명으로 날씨 정보를 찾지 못했습니다.',
      };
    }

    const cacheKey = school.schoolName.toLowerCase();
    const cached = getCachedValue(weatherCache, cacheKey);
    if (cached) return cached;

    const location = await resolveSchoolLocation(school);
    if (!location) {
      return setCachedValue(weatherCache, cacheKey, {
        status: 'location_not_found',
        schoolName: school.schoolName,
        officeName: school.officeName,
        locationName: '',
        current: null,
        hourly: [],
        message: '학교 위치를 찾지 못해 날씨를 불러올 수 없습니다.',
      }, WEATHER_CACHE_TTL_MS);
    }

    const grid = toKmaGrid(location.latitude, location.longitude);
    if (!grid) {
      return setCachedValue(weatherCache, cacheKey, {
        status: 'location_not_found',
        schoolName: school.schoolName,
        officeName: school.officeName,
        locationName: location.locationName,
        current: null,
        hourly: [],
        message: '학교 위치를 기상청 예보 격자로 변환하지 못했습니다.',
      }, WEATHER_CACHE_TTL_MS);
    }

    const nowcastBundle = await fetchLatestKmaNowcast(authKey, grid);
    let forecastBundle = null;
    let forecastError = null;
    let forecastSource = 'village';
    let forecastNote = '';
    try {
      forecastBundle = await fetchLatestKmaVillageForecast(authKey, grid);
    } catch (error) {
      forecastError = error;
    }
    if (!forecastBundle) {
      try {
        forecastBundle = await fetchLatestKmaUltraForecast(authKey, grid);
        forecastSource = 'ultra';
        const fallbackMessage = String(forecastError?.message || '').trim();
        if (fallbackMessage.includes('활용신청')) {
          forecastNote = `현재 인증키는 단기예보(getVilageFcst) 활용신청이 되지 않아 초단기예보 기준으로 최대 ${KMA_ULTRA_FCST_MAX_HOURS}시간까지만 표시됩니다.`;
        } else if (fallbackMessage) {
          forecastNote = `단기예보를 바로 불러오지 못해 초단기예보 기준으로 최대 ${KMA_ULTRA_FCST_MAX_HOURS}시간까지만 표시합니다.`;
        }
      } catch (fallbackError) {
        throw forecastError || fallbackError;
      }
    }

    const nowcastRows = Array.isArray(nowcastBundle?.rows) ? nowcastBundle.rows : [];
    const forecastRows = Array.isArray(forecastBundle?.rows) ? forecastBundle.rows : [];
    const forecastGroups = buildKmaForecastGroups(forecastRows);
    const currentHourIso = getKmaCurrentHourIso();
    const futureGroups = forecastGroups.filter((item) => String(item.time || '') >= currentHourIso);
    const currentForecast = futureGroups[0] || forecastGroups[0] || null;

    const nowcastCategoryMap = {};
    nowcastRows.forEach((item) => {
      const category = String(item?.category || '').trim();
      if (!category) return;
      nowcastCategoryMap[category] = item?.obsrValue;
    });

    const currentTime = formatIsoFromKmaDateTime(nowcastBundle?.baseDate, nowcastBundle?.baseTime)
      || currentForecast?.time
      || currentHourIso;
    const currentTemperature = parseFiniteNumber(nowcastCategoryMap.T1H) ?? currentForecast?.temperature ?? null;
    const currentWindMs = parseFiniteNumber(nowcastCategoryMap.WSD) ?? currentForecast?.windSpeed ?? null;
    const currentHumidity = parseFiniteNumber(nowcastCategoryMap.REH) ?? currentForecast?.humidity ?? null;
    const currentPrecipitation = currentForecast?.precipitationProbability ?? null;
    const currentPrecipitationAmount = String(currentForecast?.precipitationAmount || '').trim();
    const currentWeatherCode = Number.isFinite(Number(currentForecast?.weatherCode))
      ? Number(currentForecast.weatherCode)
      : mapKmaConditionToWeatherCode(nowcastCategoryMap.SKY, nowcastCategoryMap.PTY);
    const hasCurrentData = Number.isFinite(currentTemperature)
      || Number.isFinite(currentWindMs)
      || Number.isFinite(currentHumidity)
      || Number.isFinite(currentPrecipitation)
      || nowcastRows.length > 0
      || Boolean(currentForecast);

    const hourly = futureGroups
      .slice(0, 12)
      .map((item) => ({
        time: item.time,
        temperature: item.temperature,
        weatherCode: item.weatherCode,
        precipitationProbability: item.precipitationProbability,
        precipitationAmount: item.precipitationAmount,
        humidity: item.humidity,
        windSpeed: item.windSpeed,
      }));

    return setCachedValue(weatherCache, cacheKey, {
      status: 'ok',
      schoolName: school.schoolName,
      officeName: school.officeName,
      locationName: location.locationName,
      forecastSource,
      forecastNote,
      current: hasCurrentData ? {
        time: currentTime,
        temperature: currentTemperature,
        apparentTemperature: null,
        humidity: currentHumidity,
        weatherCode: currentWeatherCode,
        windSpeed: Number.isFinite(currentWindMs) ? currentWindMs * 3.6 : null,
        precipitationProbability: currentPrecipitation,
        precipitationAmount: currentPrecipitationAmount,
      } : null,
      hourly,
      message: hourly.length || hasCurrentData ? '' : '시간별 예보 정보가 없습니다.',
    }, WEATHER_CACHE_TTL_MS);
  },
});
