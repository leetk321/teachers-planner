'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const isBrowserFile = (value) => typeof File !== 'undefined' && value instanceof File;
const isBrowserBlob = (value) => typeof Blob !== 'undefined' && value instanceof Blob;

export const sanitizeDraftValue = (value, seen = new WeakSet()) => {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') return undefined;
  if (value instanceof Date) return value.toISOString();
  if (isBrowserFile(value)) {
    return {
      draft_file: true,
      name: String(value.name || ''),
      size: Number(value.size || 0),
      type: String(value.type || ''),
      last_modified: Number(value.lastModified || 0),
    };
  }
  if (isBrowserBlob(value)) {
    return {
      draft_blob: true,
      size: Number(value.size || 0),
      type: String(value.type || ''),
    };
  }
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => sanitizeDraftValue(item, seen)).filter((item) => item !== undefined);
    seen.delete(value);
    return result;
  }
  const result = {};
  Object.entries(value).forEach(([key, item]) => {
    const sanitized = sanitizeDraftValue(item, seen);
    if (sanitized !== undefined) result[key] = sanitized;
  });
  seen.delete(value);
  return result;
};

const draftSignature = (value) => {
  try {
    return JSON.stringify(sanitizeDraftValue(value));
  } catch {
    return '';
  }
};

export function useServerDraft({
  apiFetch,
  draftKey,
  active,
  value,
  shouldSave,
  isEmpty,
  canRestore,
  onRestore,
  delay = 800,
}) {
  const [status, setStatus] = useState('idle');
  const [updatedAt, setUpdatedAt] = useState('');
  const apiRef = useRef(apiFetch);
  const restoreRef = useRef(onRestore);
  const emptyRef = useRef(isEmpty);
  const canRestoreRef = useRef(canRestore);
  const hydratedKeyRef = useRef('');
  const currentDraftKeyRef = useRef(draftKey);
  const hydrationRequestRef = useRef(0);
  const saveSequenceRef = useRef(0);
  const latestSaveByKeyRef = useRef(new Map());
  const generationByKeyRef = useRef(new Map());
  const suppressedSignatureByKeyRef = useRef(new Map());
  const latestByKeyRef = useRef(new Map());
  const saveTimerRef = useRef(null);
  const writeQueueRef = useRef(Promise.resolve());
  const mountedRef = useRef(true);

  apiRef.current = apiFetch;
  restoreRef.current = onRestore;
  emptyRef.current = isEmpty;
  canRestoreRef.current = canRestore;
  currentDraftKeyRef.current = draftKey;
  if (draftKey) {
    latestByKeyRef.current.set(draftKey, { active, shouldSave, value });
    if (!shouldSave) suppressedSignatureByKeyRef.current.delete(draftKey);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const enqueueWrite = useCallback((key, draftValue, { reportStatus = true, force = false } = {}) => {
    if (!key) return Promise.resolve({ skipped: true });
    const signature = draftSignature(draftValue);
    const suppressedSignature = suppressedSignatureByKeyRef.current.get(key);
    if (!force && suppressedSignature === signature) return Promise.resolve({ skipped: true });
    if (suppressedSignature && suppressedSignature !== signature) {
      suppressedSignatureByKeyRef.current.delete(key);
    }

    const generation = generationByKeyRef.current.get(key) || 0;
    const sequence = saveSequenceRef.current + 1;
    saveSequenceRef.current = sequence;
    latestSaveByKeyRef.current.set(key, sequence);
    const deleting = Boolean(emptyRef.current(draftValue));
    const sanitizedValue = sanitizeDraftValue(draftValue);

    if (reportStatus && mountedRef.current && currentDraftKeyRef.current === key) setStatus('saving');

    const operation = writeQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if ((generationByKeyRef.current.get(key) || 0) !== generation) return { skipped: true };
        if (!force && suppressedSignatureByKeyRef.current.get(key) === signature) return { skipped: true };
        const saved = deleting
          ? await apiRef.current(`/api/drafts/${encodeURIComponent(key)}`, { method: 'DELETE' })
          : await apiRef.current(`/api/drafts/${encodeURIComponent(key)}`, {
            method: 'PUT',
            body: JSON.stringify({ payload: sanitizedValue }),
          });
        return { deleting, saved };
      });

    writeQueueRef.current = operation.catch(() => undefined);
    operation
      .then((result) => {
        if (result?.skipped || !reportStatus || !mountedRef.current) return;
        if (currentDraftKeyRef.current !== key || latestSaveByKeyRef.current.get(key) !== sequence) return;
        setUpdatedAt(result.deleting ? '' : String(result.saved?.updatedAt || new Date().toISOString()));
        setStatus(result.deleting ? 'idle' : 'saved');
      })
      .catch(() => {
        if (!reportStatus || !mountedRef.current) return;
        if (currentDraftKeyRef.current === key && latestSaveByKeyRef.current.get(key) === sequence) setStatus('error');
      });
    return operation;
  }, []);

  useEffect(() => {
    if (!active || !draftKey) {
      hydratedKeyRef.current = '';
      setStatus('idle');
      return undefined;
    }

    let cancelled = false;
    const requestId = hydrationRequestRef.current + 1;
    hydrationRequestRef.current = requestId;
    hydratedKeyRef.current = '';
    setStatus('loading');

    apiRef.current(`/api/drafts/${encodeURIComponent(draftKey)}`)
      .then((draft) => {
        if (cancelled || requestId !== hydrationRequestRef.current) return;
        const payload = draft?.payload;
        if (payload && !emptyRef.current(payload) && canRestoreRef.current()) {
          restoreRef.current(payload);
          setUpdatedAt(String(draft.updatedAt || ''));
          setStatus('recovered');
        } else {
          setUpdatedAt('');
          setStatus('idle');
        }
      })
      .catch(() => {
        if (!cancelled && requestId === hydrationRequestRef.current) setStatus('error');
      })
      .finally(() => {
        if (!cancelled && requestId === hydrationRequestRef.current) hydratedKeyRef.current = draftKey;
      });

    return () => {
      cancelled = true;
    };
  }, [active, draftKey]);

  useEffect(() => {
    if (!active || !draftKey || hydratedKeyRef.current !== draftKey || !shouldSave) return undefined;
    const timer = setTimeout(() => {
      saveTimerRef.current = null;
      void enqueueWrite(draftKey, value);
    }, delay);
    saveTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (saveTimerRef.current === timer) saveTimerRef.current = null;
    };
  }, [active, draftKey, delay, enqueueWrite, shouldSave, value]);

  useEffect(() => {
    const key = draftKey;
    const wasActive = active;
    return () => {
      if (!wasActive || !key) return;
      const latest = latestByKeyRef.current.get(key);
      if (!latest?.shouldSave) return;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      void enqueueWrite(key, latest.value, { reportStatus: false });
    };
  }, [active, draftKey, enqueueWrite]);

  const flushDraft = useCallback(async () => {
    if (!draftKey) return true;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const latest = latestByKeyRef.current.get(draftKey);
    if (!latest?.shouldSave) {
      await writeQueueRef.current.catch(() => undefined);
      return true;
    }
    try {
      const result = await enqueueWrite(draftKey, latest.value, { reportStatus: true, force: true });
      return !result?.skipped;
    } catch {
      return false;
    }
  }, [draftKey, enqueueWrite]);

  const clearDraft = useCallback(async () => {
    if (!draftKey) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const latest = latestByKeyRef.current.get(draftKey);
    suppressedSignatureByKeyRef.current.set(draftKey, draftSignature(latest?.value));
    generationByKeyRef.current.set(draftKey, (generationByKeyRef.current.get(draftKey) || 0) + 1);
    hydrationRequestRef.current += 1;
    hydratedKeyRef.current = '';
    try {
      await writeQueueRef.current.catch(() => undefined);
      await apiRef.current(`/api/drafts/${encodeURIComponent(draftKey)}`, { method: 'DELETE' });
    } catch {
      // The record itself is already saved or the user explicitly discarded the draft.
    }
    if (mountedRef.current && currentDraftKeyRef.current === draftKey) {
      hydratedKeyRef.current = draftKey;
      setStatus('idle');
      setUpdatedAt('');
    }
  }, [draftKey]);

  return {
    status,
    updatedAt,
    clearDraft,
    flushDraft,
    recovered: status === 'recovered',
  };
}

export const draftStatusLabel = (status) => ({
  loading: '초안 확인 중',
  recovered: '저장되지 않은 초안을 복구했습니다',
  saving: '초안 저장 중',
  saved: '초안 자동 저장됨',
  error: '초안 저장 실패 - 입력 내용은 현재 화면에 유지됩니다',
}[status] || '');
