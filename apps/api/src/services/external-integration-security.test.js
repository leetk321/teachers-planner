import assert from 'node:assert/strict';
import test from 'node:test';

import { createComtimeService, normalizeComtimeApiBase } from './comtime-service.js';
import { createGoogleCalendarService, normalizeGoogleIcsUrl, parseGoogleCalendarIcsEvents } from './google-calendar-service.js';
import { createSchoolDashboardService } from './school-dashboard-service.js';

const withMockFetch = async (mockFetch, callback) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

const toIcsUtc = (date) => date.toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d{3}Z$/, 'Z');

test('Google Calendar ICS 주소는 HTTPS calendar.google.com 계열만 허용한다', () => {
  assert.match(
    normalizeGoogleIcsUrl('https://calendar.google.com/calendar/ical/test/public/basic.ics'),
    /^https:\/\/calendar\.google\.com\//,
  );
  assert.match(
    normalizeGoogleIcsUrl('https://sub.calendar.google.com/calendar/ical/test/public/basic.ics'),
    /^https:\/\/sub\.calendar\.google\.com\//,
  );
  assert.equal(normalizeGoogleIcsUrl('http://calendar.google.com/calendar/ical/test/public/basic.ics'), '');
  assert.equal(normalizeGoogleIcsUrl('https://calendar.google.com:8443/calendar/ical/test/public/basic.ics'), '');
  assert.equal(normalizeGoogleIcsUrl('https://calendar.google.com.evil.test/calendar/ical/test/public/basic.ics'), '');
  assert.equal(normalizeGoogleIcsUrl('https://127.0.0.1/calendar/ical/test/public/basic.ics'), '');
});

test('Google Calendar는 허용되지 않은 리다이렉트를 차단한다', async () => {
  await withMockFetch(async () => new Response(null, {
    status: 302,
    headers: { location: 'https://example.test/private.ics' },
  }), async () => {
    const service = createGoogleCalendarService();
    await assert.rejects(
      service.listEvents({
        googleCalendarIcsUrl: 'https://calendar.google.com/calendar/ical/test/public/basic.ics',
      }),
      /허용되지 않은 주소/,
    );
  });
});

test('Google Calendar 성공 응답 계약을 유지한다', async () => {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:교직원 회의',
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    'LOCATION:회의실',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  await withMockFetch(async (_url, init) => {
    assert.equal(init.redirect, 'manual');
    assert.equal(init.signal instanceof AbortSignal, true);
    return new Response(ics, { status: 200 });
  }, async () => {
    const rows = await createGoogleCalendarService().listEvents({
      googleCalendarIcsUrl: 'https://calendar.google.com/calendar/ical/test/public/basic.ics',
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, '교직원 회의');
    assert.equal(rows[0].location, '회의실');
    assert.equal(rows[0].source, 'google');
  });
});

test('Google Calendar 종일 및 floating 일정은 서울 시간 기준으로 해석한다', () => {
  const rows = parseGoogleCalendarIcsEvents([
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:종일 일정',
    'DTSTART;VALUE=DATE:20260723',
    'DTEND;VALUE=DATE:20260725',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:자정 회의',
    'DTSTART;TZID=Asia/Seoul:20260723T003000',
    'DTEND;TZID=Asia/Seoul:20260723T013000',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n'));

  assert.equal(rows[0].start_at, '2026-07-22T15:00:00.000Z');
  assert.equal(rows[0].start_date, '2026-07-23');
  assert.equal(rows[0].end_date, '2026-07-24');
  assert.equal(rows[1].start_at, '2026-07-22T15:30:00.000Z');
});

test('한국 공휴일 조회는 고정 Google 캘린더만 사용하고 요청 연도만 반환한다', async () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:이전 연도 공휴일',
    'DTSTART;VALUE=DATE:20251225',
    'DTEND;VALUE=DATE:20251226',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:신정',
    'DTSTART;VALUE=DATE:20260101',
    'DTEND;VALUE=DATE:20260102',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:시간 일정 제외',
    'DTSTART:20260102T090000Z',
    'DTEND:20260102T100000Z',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:다음 연도 공휴일',
    'DTSTART;VALUE=DATE:20270101',
    'DTEND;VALUE=DATE:20270102',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  await withMockFetch(async (url, init) => {
    assert.equal(
      String(url),
      'https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics',
    );
    assert.equal(init.redirect, 'manual');
    assert.equal(init.signal instanceof AbortSignal, true);
    return new Response(ics, { status: 200 });
  }, async () => {
    const rows = await createGoogleCalendarService().listKoreanHolidays('2026');
    assert.deepEqual(rows, [{ date: '2026-01-01', name: '신정' }]);
  });
});

test('한국 공휴일 조회는 임의 입력을 거부하고 결과를 최대 100건으로 제한한다', async () => {
  let fetchCount = 0;
  const events = Array.from({ length: 105 }, (_, index) => [
    'BEGIN:VEVENT',
    `SUMMARY:공휴일 ${index + 1}`,
    'DTSTART;VALUE=DATE:20260101',
    'DTEND;VALUE=DATE:20260102',
    'END:VEVENT',
  ].join('\r\n'));
  const ics = ['BEGIN:VCALENDAR', ...events, 'END:VCALENDAR'].join('\r\n');

  await withMockFetch(async () => {
    fetchCount += 1;
    return new Response(ics, { status: 200 });
  }, async () => {
    const service = createGoogleCalendarService();
    await assert.rejects(service.listKoreanHolidays('https://evil.test/calendar.ics'), /YYYY 형식/);
    await assert.rejects(service.listKoreanHolidays('1999'), /2000~2100/);
    assert.equal(fetchCount, 0);

    const rows = await service.listKoreanHolidays('2026');
    assert.equal(rows.length, 100);
    assert.equal(fetchCount, 1);
  });
});

test('컴시간 API 주소는 허용 도메인과 4082 포트만 허용한다', () => {
  assert.equal(normalizeComtimeApiBase('http://comci.net:4082/th'), 'http://comci.net:4082');
  assert.equal(normalizeComtimeApiBase('https://api.comcigan.co.kr:4082/th'), 'https://api.comcigan.co.kr:4082');
  assert.equal(normalizeComtimeApiBase('http://comci.net/th'), '');
  assert.equal(normalizeComtimeApiBase('http://comci.net:8080/th'), '');
  assert.equal(normalizeComtimeApiBase('http://comci.net.evil.test:4082/th'), '');
  assert.equal(normalizeComtimeApiBase('http://169.254.169.254:4082/latest/meta-data'), '');
});

test('컴시간 프레임이 임의 호스트를 반환하면 안전한 고정 주소를 사용한다', async () => {
  const calls = [];
  await withMockFetch(async (url, init) => {
    calls.push(String(url));
    assert.equal(init.signal instanceof AbortSignal, true);
    if (calls.length === 1) {
      return new Response('<FRAME src="http://evil.test:4082/th">', { status: 200 });
    }
    assert.match(String(url), /^http:\/\/comci\.net:4082\/36179_T\?/);
    return new Response(`callback(${JSON.stringify({ 자료446: ['', '홍길동'] })})`, { status: 200 });
  }, async () => {
    const result = await createComtimeService().getTeachers('12345');
    assert.deepEqual(result, { teachers: [{ no: 1, name: '홍길동' }] });
  });
  assert.equal(calls.length, 2);
});

test('학교 대시보드 서비스에는 기본 KMA 인증키가 포함되지 않는다', async () => {
  const service = createSchoolDashboardService();
  assert.equal(service.defaultKmaAuthKey, undefined);
  const result = await service.fetchSchoolWeatherBySchoolName('테스트중학교', '');
  assert.equal(result.status, 'missing_auth_key');
  assert.match(result.message, /인증키/);
});
