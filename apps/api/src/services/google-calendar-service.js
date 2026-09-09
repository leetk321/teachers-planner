import { fetchWithTimeout } from '../utils/fetchWithTimeout.js';
import { dateFromSeoulParts, shiftCalendarDateText } from '../utils/dateTime.js';

const GOOGLE_CALENDAR_TIMEOUT_MS = 10_000;
const MAX_GOOGLE_CALENDAR_REDIRECTS = 3;
const KOREAN_HOLIDAY_CALENDAR_ICS_URL = 'https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics';
const KOREAN_HOLIDAY_MAX_RESULTS = 100;
const KOREAN_HOLIDAY_MIN_YEAR = 2000;
const KOREAN_HOLIDAY_MAX_YEAR = 2100;

const parseGoogleCalendarIdFromEmbed = (embedUrl = '') => {
  try {
    const url = new URL(String(embedUrl));
    const src = url.searchParams.get('src') || '';
    return decodeURIComponent(src || '').trim();
  } catch {
    return '';
  }
};

export const normalizeGoogleIcsUrl = (icsUrl = '') => {
  try {
    const url = new URL(String(icsUrl || '').trim());
    if (url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    if (url.port && url.port !== '443') return '';
    const hostname = url.hostname.toLowerCase();
    if (hostname !== 'calendar.google.com' && !hostname.endsWith('.calendar.google.com')) return '';
    if (!url.pathname.startsWith('/calendar/ical/')) return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
};

const createGoogleCalendarError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const normalizeHolidayYear = (rawYear) => {
  const value = String(rawYear ?? '').trim();
  if (!/^\d{4}$/.test(value)) {
    throw createGoogleCalendarError('공휴일 조회 연도는 YYYY 형식이어야 합니다.');
  }
  const year = Number(value);
  if (year < KOREAN_HOLIDAY_MIN_YEAR || year > KOREAN_HOLIDAY_MAX_YEAR) {
    throw createGoogleCalendarError(`공휴일 조회 연도는 ${KOREAN_HOLIDAY_MIN_YEAR}~${KOREAN_HOLIDAY_MAX_YEAR} 범위여야 합니다.`);
  }
  return year;
};

const fetchGoogleCalendarIcs = async (initialUrl) => {
  let currentUrl = normalizeGoogleIcsUrl(initialUrl);
  if (!currentUrl) throw createGoogleCalendarError('Google 캘린더 ICS 주소가 올바르지 않습니다.');

  for (let redirectCount = 0; redirectCount <= MAX_GOOGLE_CALENDAR_REDIRECTS; redirectCount += 1) {
    let response;
    try {
      response = await fetchWithTimeout(currentUrl, { redirect: 'manual' }, {
        timeoutMs: GOOGLE_CALENDAR_TIMEOUT_MS,
        serviceName: 'Google 캘린더',
        allowRedirects: true,
      });
    } catch (error) {
      throw createGoogleCalendarError(error?.message || 'Google 캘린더를 불러오지 못했습니다.');
    }

    if (response.ok) return response;
    const location = String(response.headers.get('location') || '').trim();
    if (!location) throw createGoogleCalendarError('Google 캘린더 이동 주소가 비어 있습니다.');
    let redirectedUrl = '';
    try {
      redirectedUrl = normalizeGoogleIcsUrl(new URL(location, currentUrl).toString());
    } catch {
      redirectedUrl = '';
    }
    if (!redirectedUrl) {
      throw createGoogleCalendarError('Google 캘린더가 허용되지 않은 주소로 이동하려고 했습니다.');
    }
    currentUrl = redirectedUrl;
  }

  throw createGoogleCalendarError('Google 캘린더 이동 횟수가 너무 많습니다.');
};

const parseIcsDate = (raw) => {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (/^\d{8}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    return dateFromSeoulParts({ year, month, day });
  }
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map((item) => Number(item));
  if (value.endsWith('Z')) return new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return dateFromSeoulParts({ year: y, month: mo, day: d, hour: h, minute: mi, second: s });
};

const unescapeIcsText = (value = '') => String(value || '')
  .replace(/\\n/gi, '\n')
  .replace(/\\,/g, ',')
  .replace(/\\;/g, ';')
  .replace(/\\\\/g, '\\')
  .trim();

export const parseGoogleCalendarIcsEvents = (icsText = '') => {
  const unfolded = String(icsText).replace(/\r\n[ \t]/g, '');
  const blocks = unfolded.split('BEGIN:VEVENT').slice(1).map((item) => item.split('END:VEVENT')[0] || '');
  const out = [];
  for (const block of blocks) {
    const read = (key) => {
      const line = block.split(/\r?\n/).find((entry) => entry.startsWith(`${key}:`) || entry.startsWith(`${key};`));
      if (!line) return '';
      const idx = line.indexOf(':');
      return idx >= 0 ? line.slice(idx + 1).trim() : '';
    };
    const title = unescapeIcsText(read('SUMMARY'));
    const startRaw = read('DTSTART');
    const endRaw = read('DTEND');
    const location = unescapeIcsText(read('LOCATION'));
    const start = parseIcsDate(startRaw);
    const end = parseIcsDate(endRaw);
    if (!start || !title) continue;

    const isAllDay = /^\d{8}$/.test(String(startRaw || '').trim());
    let startDate = null;
    let endDate = null;
    if (isAllDay) {
      startDate = `${String(startRaw).slice(0, 4)}-${String(startRaw).slice(4, 6)}-${String(startRaw).slice(6, 8)}`;
      if (/^\d{8}$/.test(String(endRaw || '').trim())) {
        const exclusiveEndDate = `${String(endRaw).slice(0, 4)}-${String(endRaw).slice(4, 6)}-${String(endRaw).slice(6, 8)}`;
        endDate = shiftCalendarDateText(exclusiveEndDate, -1);
      } else {
        endDate = startDate;
      }
    }

    out.push({
      title,
      location,
      start_at: start.toISOString(),
      end_at: end ? end.toISOString() : null,
      start_date: startDate,
      end_date: endDate,
      is_all_day: isAllDay,
      source: 'google',
    });
  }
  return out;
};

export const createGoogleCalendarService = () => ({
  async listEvents(settings = {}) {
    const embedUrl = String(settings?.googleCalendarEmbedUrl || '');
    const privateOrPublicIcsUrl = normalizeGoogleIcsUrl(String(settings?.googleCalendarIcsUrl || ''));
    const calendarId = parseGoogleCalendarIdFromEmbed(embedUrl);
    const icsUrl = privateOrPublicIcsUrl || (calendarId ? `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics` : '');
    if (!icsUrl) return [];

    const response = await fetchGoogleCalendarIcs(icsUrl);

    const text = await response.text();
    const now = Date.now();
    const min = now - 1000 * 60 * 60 * 24 * 365 * 2;
    const max = now + 1000 * 60 * 60 * 24 * 365 * 2;
    return parseGoogleCalendarIcsEvents(text)
      .filter((item) => {
        const time = new Date(item.start_at).getTime();
        return Number.isFinite(time) && time >= min && time <= max;
      })
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  },

  async listKoreanHolidays(rawYear) {
    const year = normalizeHolidayYear(rawYear);
    const yearPrefix = `${year}-`;
    const response = await fetchGoogleCalendarIcs(KOREAN_HOLIDAY_CALENDAR_ICS_URL);
    const text = await response.text();

    return parseGoogleCalendarIcsEvents(text)
      .filter((item) => item.is_all_day && String(item.start_date || '').startsWith(yearPrefix))
      .sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')))
      .slice(0, KOREAN_HOLIDAY_MAX_RESULTS)
      .map((item) => ({
        date: item.start_date,
        name: item.title,
      }));
  },
});
