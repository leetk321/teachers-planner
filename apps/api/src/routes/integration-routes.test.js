import assert from 'node:assert/strict';
import test from 'node:test';

import { registerIntegrationRoutes } from './integration-routes.js';

const createResponseRecorder = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(value) {
    this.body = value;
    return this;
  },
});

const createRouteHarness = (settings, overrides = {}) => {
  const handlers = new Map();
  const app = {
    get(path, ...callbacks) {
      handlers.set(path, callbacks.at(-1));
    },
  };
  registerIntegrationRoutes({
    app,
    auth: (_req, _res, next) => next(),
    phase1Store: { getSettings: () => settings },
    googleCalendarService: overrides.googleCalendarService || {
      listEvents: async () => [],
      listKoreanHolidays: async () => [],
    },
    schoolDashboardService: overrides.schoolDashboardService || {
      fetchTodayLunchBySchoolName: async () => ({}),
      fetchSchoolWeatherBySchoolName: async () => ({}),
    },
  });
  return handlers;
};

test('날씨 인증키는 사용자 설정을 우선하고 환경변수를 fallback으로 사용한다', async () => {
  const originalEnvKey = process.env.KMA_AUTH_KEY;
  process.env.KMA_AUTH_KEY = 'environment-key';
  const receivedKeys = [];
  const schoolDashboardService = {
    fetchTodayLunchBySchoolName: async () => ({}),
    fetchSchoolWeatherBySchoolName: async (_schoolName, authKey) => {
      receivedKeys.push(authKey);
      return { status: 'ok', current: null, hourly: [] };
    },
  };

  try {
    const configuredHandlers = createRouteHarness(
      { schoolName: '테스트중학교', kmaAuthKey: 'settings-key' },
      { schoolDashboardService },
    );
    await configuredHandlers.get('/api/weather/school')({ user: { id: 1 }, query: {} }, createResponseRecorder());

    const environmentHandlers = createRouteHarness(
      { schoolName: '테스트중학교' },
      { schoolDashboardService },
    );
    await environmentHandlers.get('/api/weather/school')({ user: { id: 1 }, query: {} }, createResponseRecorder());

    assert.deepEqual(receivedKeys, ['settings-key', 'environment-key']);
  } finally {
    if (originalEnvKey === undefined) delete process.env.KMA_AUTH_KEY;
    else process.env.KMA_AUTH_KEY = originalEnvKey;
  }
});

test('한국 공휴일 라우트는 요청 연도를 서비스에 전달하고 제한된 응답 계약을 유지한다', async () => {
  const googleCalendarService = {
    listEvents: async () => [],
    listKoreanHolidays: async (year) => {
      assert.equal(year, '2026');
      return [{ date: '2026-01-01', name: '신정' }];
    },
  };
  const handlers = createRouteHarness({}, { googleCalendarService });
  const res = createResponseRecorder();

  await handlers.get('/api/google-calendar/holidays')({ user: { id: 1 }, query: { year: '2026' } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    year: 2026,
    holidays: [{ date: '2026-01-01', name: '신정' }],
  });
});

test('한국 공휴일 라우트는 잘못된 연도 오류를 400으로 반환한다', async () => {
  const invalidYearError = new Error('공휴일 조회 연도는 YYYY 형식이어야 합니다.');
  invalidYearError.statusCode = 400;
  const handlers = createRouteHarness({}, {
    googleCalendarService: {
      listEvents: async () => [],
      listKoreanHolidays: async () => { throw invalidYearError; },
    },
  });
  const res = createResponseRecorder();

  await handlers.get('/api/google-calendar/holidays')({ user: { id: 1 }, query: { year: 'bad' } }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: '공휴일 조회 연도는 YYYY 형식이어야 합니다.' });
});

test('Google Tasks 성공 응답 형식과 한글 기본 제목을 유지한다', async () => {
  const handlers = createRouteHarness({ googleTasksAccessToken: 'test-token' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /^https:\/\/tasks\.googleapis\.com\//);
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    assert.equal(init.signal instanceof AbortSignal, true);
    return new Response(JSON.stringify({
      items: [{ id: 'task-1', title: '', notes: '내용', status: 'needsAction' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const res = createResponseRecorder();
    await handlers.get('/api/google-tasks')({ user: { id: 1 } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, [{
      id: 'task-1',
      title: '(제목 없음)',
      notes: '내용',
      status: 'needsAction',
      due_at: null,
      updated_at: null,
      source: 'google_tasks',
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Google Tasks HTTP 실패를 확인하고 기존 오류 객체 형태로 응답한다', async () => {
  const handlers = createRouteHarness({ googleTasksAccessToken: 'test-token' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('권한 없음', { status: 403 });

  try {
    const res = createResponseRecorder();
    await handlers.get('/api/google-tasks')({ user: { id: 1 } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Google 할 일을 불러오지 못했습니다.');
    assert.equal(res.body.details, '권한 없음');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
