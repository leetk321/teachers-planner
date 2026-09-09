const DEFAULT_TIMEOUT_MS = 10_000;

const normalizeTimeoutMs = (value) => {
  const timeoutMs = Number(value);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
};

export class ExternalFetchError extends Error {
  constructor(message, {
    code = 'EXTERNAL_FETCH_FAILED',
    status = 0,
    response = null,
    serviceName = '',
    cause,
  } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ExternalFetchError';
    this.code = code;
    this.status = Number(status) || 0;
    this.statusCode = this.status;
    this.response = response;
    this.serviceName = serviceName;
  }
}

export const fetchWithTimeout = async (input, init = {}, options = {}) => {
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const serviceName = String(options.serviceName || '외부 서비스').trim() || '외부 서비스';
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new ExternalFetchError(`${serviceName} 호출 기능을 사용할 수 없습니다.`, {
      code: 'EXTERNAL_FETCH_UNAVAILABLE',
      serviceName,
    });
  }

  const controller = new AbortController();
  const callerSignal = init?.signal;
  let timedOut = false;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);

  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener?.('abort', abortFromCaller, { once: true });

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`${serviceName} 요청 시간 초과`));
  }, timeoutMs);

  try {
    const response = await fetchImpl(input, { ...init, signal: controller.signal });
    if (!response || typeof response.ok !== 'boolean') {
      throw new ExternalFetchError(`${serviceName} 응답 형식이 올바르지 않습니다.`, {
        code: 'EXTERNAL_FETCH_INVALID_RESPONSE',
        serviceName,
      });
    }
    const isRedirect = [301, 302, 303, 307, 308].includes(Number(response.status));
    if (!response.ok && !(options.allowRedirects === true && isRedirect)) {
      throw new ExternalFetchError(`${serviceName} 요청에 실패했습니다. (${response.status})`, {
        code: 'EXTERNAL_FETCH_HTTP_ERROR',
        status: response.status,
        response,
        serviceName,
      });
    }
    return response;
  } catch (error) {
    if (error instanceof ExternalFetchError) throw error;
    if (timedOut) {
      throw new ExternalFetchError(`${serviceName} 응답 시간이 초과되었습니다.`, {
        code: 'EXTERNAL_FETCH_TIMEOUT',
        serviceName,
        cause: error,
      });
    }
    if (callerSignal?.aborted) {
      throw new ExternalFetchError(`${serviceName} 요청이 취소되었습니다.`, {
        code: 'EXTERNAL_FETCH_ABORTED',
        serviceName,
        cause: error,
      });
    }
    throw new ExternalFetchError(`${serviceName}에 연결하지 못했습니다.`, {
      code: 'EXTERNAL_FETCH_NETWORK_ERROR',
      serviceName,
      cause: error,
    });
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener?.('abort', abortFromCaller);
  }
};
