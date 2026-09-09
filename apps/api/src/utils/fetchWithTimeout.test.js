import assert from 'node:assert/strict';
import test from 'node:test';

import { ExternalFetchError, fetchWithTimeout } from './fetchWithTimeout.js';

test('fetchWithTimeout은 정상 응답을 그대로 반환한다', async () => {
  const expected = new Response('{"ok":true}', { status: 200 });
  const actual = await fetchWithTimeout('https://example.test', {}, {
    fetchImpl: async () => expected,
    timeoutMs: 100,
    serviceName: '테스트 서비스',
  });
  assert.equal(actual, expected);
});

test('fetchWithTimeout은 HTTP 실패 상태를 오류로 변환한다', async () => {
  await assert.rejects(
    fetchWithTimeout('https://example.test', {}, {
      fetchImpl: async () => new Response('실패', { status: 503 }),
      timeoutMs: 100,
      serviceName: '테스트 서비스',
    }),
    (error) => {
      assert.ok(error instanceof ExternalFetchError);
      assert.equal(error.code, 'EXTERNAL_FETCH_HTTP_ERROR');
      assert.equal(error.status, 503);
      assert.match(error.message, /테스트 서비스/);
      return true;
    },
  );
});

test('fetchWithTimeout은 제한 시간이 지나면 요청을 중단한다', async () => {
  const neverCompletes = (_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  });

  await assert.rejects(
    fetchWithTimeout('https://example.test', {}, {
      fetchImpl: neverCompletes,
      timeoutMs: 20,
      serviceName: '느린 서비스',
    }),
    (error) => {
      assert.equal(error.code, 'EXTERNAL_FETCH_TIMEOUT');
      assert.match(error.message, /응답 시간이 초과/);
      return true;
    },
  );
});

test('fetchWithTimeout은 호출자가 취소한 요청을 구분한다', async () => {
  const callerController = new AbortController();
  const neverCompletes = (_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  });
  const request = fetchWithTimeout('https://example.test', { signal: callerController.signal }, {
    fetchImpl: neverCompletes,
    timeoutMs: 1_000,
    serviceName: '테스트 서비스',
  });
  callerController.abort();

  await assert.rejects(request, (error) => {
    assert.equal(error.code, 'EXTERNAL_FETCH_ABORTED');
    return true;
  });
});
