'use client';

import { useCallback, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
const TYPE_LABELS = {
  student: '학생',
  note: '상담 기록',
  task_memo: '메모·전달사항',
  schedule: '일정',
  issue: '사안',
  issue_consultation: '사안 상담',
};

const token = () => {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('teacher_notebook_token_v1')
    || localStorage.getItem('teacher_notebook_token_v1')
    || '';
};

const request = async (path, options = {}) => {
  const authToken = token();
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
};

const koreanError = (error, fallback) => {
  const status = Number(error?.status || 0);
  const message = String(error?.message || '').trim();
  if (status === 401) return '로그인 시간이 만료되었습니다. 다시 로그인해 주세요.';
  if (status === 403) return '이 항목을 처리할 권한이 없습니다.';
  if (status === 404) return '휴지통 항목을 찾을 수 없습니다. 목록을 새로고침해 주세요.';
  if (status === 409) return '같은 데이터가 이미 있어 복구할 수 없습니다. 기존 데이터를 확인해 주세요.';
  if (status >= 500) return '서버에서 휴지통을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  if (/[가-힣]/.test(message)) return message;
  return fallback;
};

const formatDateTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('ko-KR');
};

export function TrashPanel({ compact = false, buttonStyle = {}, dangerButtonStyle = {} }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await request('/api/trash?limit=100');
      if (!Array.isArray(result?.items)) throw new Error('INVALID_TRASH_RESPONSE');
      setItems(result.items);
    } catch (loadError) {
      setError(koreanError(loadError, '휴지통 목록을 불러오지 못했습니다. 기존 목록은 그대로 유지합니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const restore = async (item) => {
    if (!confirm(`'${item.label || TYPE_LABELS[item.entity_type] || '항목'}'을 복구할까요?`)) return;
    setBusyId(item.id);
    setError('');
    setNotice('');
    try {
      await request(`/api/trash/${item.id}/restore`, { method: 'POST' });
      setItems((current) => current.filter((row) => String(row.id) !== String(item.id)));
      setNotice('항목을 복구했습니다. 최신 데이터를 반영하기 위해 화면을 새로고침합니다.');
      window.setTimeout(() => window.location.reload(), 150);
    } catch (restoreError) {
      setError(koreanError(restoreError, '항목을 복구하지 못했습니다. 목록은 변경하지 않았습니다.'));
    } finally {
      setBusyId(null);
    }
  };

  const removeForever = async (item) => {
    if (!confirm(`'${item.label || TYPE_LABELS[item.entity_type] || '항목'}'을 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    setBusyId(item.id);
    setError('');
    setNotice('');
    try {
      await request(`/api/trash/${item.id}`, { method: 'DELETE' });
      setItems((current) => current.filter((row) => String(row.id) !== String(item.id)));
      setNotice('항목을 영구 삭제했습니다.');
    } catch (removeError) {
      setError(koreanError(removeError, '항목을 영구 삭제하지 못했습니다. 목록은 변경하지 않았습니다.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 7 }} aria-busy={loading || busyId !== null}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <span style={{ color: '#64748b', fontSize: compact ? 11 : 12 }}>삭제 항목은 기본 30일 동안 보관됩니다.</span>
        <button type='button' style={{ ...buttonStyle, minHeight: 30, padding: '4px 8px', fontSize: 11 }} onClick={load} disabled={loading || busyId !== null}>새로고침</button>
      </div>
      {error && <div role='alert' aria-live='assertive' style={{ padding: '7px 8px', borderRadius: 7, background: '#fef2f2', color: '#b91c1c', fontSize: 12 }}>{error}</div>}
      {notice && <div role='status' aria-live='polite' style={{ padding: '7px 8px', borderRadius: 7, background: '#ecfdf5', color: '#166534', fontSize: 12 }}>{notice}</div>}
      <div style={{ display: 'grid', gap: 6, maxHeight: compact ? 190 : 250, overflowY: 'auto', paddingRight: 2 }}>
        {items.map((item) => (
          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: 8, padding: compact ? 7 : 8, background: '#fff' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
                <span style={{ flex: '0 0 auto', borderRadius: 999, padding: '2px 6px', background: '#e2e8f0', color: '#334155', fontSize: 10, fontWeight: 800 }}>{TYPE_LABELS[item.entity_type] || item.entity_type}</span>
                <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{item.label || '(제목 없음)'}</strong>
              </div>
              <div style={{ marginTop: 3, color: '#94a3b8', fontSize: 10 }}>삭제 {formatDateTime(item.deleted_at)} · 만료 {formatDateTime(item.expires_at)}</div>
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <button type='button' style={{ ...buttonStyle, minHeight: 30, padding: '4px 7px', fontSize: 11 }} onClick={() => restore(item)} disabled={busyId !== null}>{busyId === item.id ? '처리 중' : '복구'}</button>
              <button type='button' style={{ ...dangerButtonStyle, minHeight: 30, padding: '4px 7px', fontSize: 11 }} onClick={() => removeForever(item)} disabled={busyId !== null}>{busyId === item.id ? '처리 중' : '영구 삭제'}</button>
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && <div style={{ padding: 12, color: '#94a3b8', textAlign: 'center', fontSize: 12 }}>휴지통이 비어 있습니다.</div>}
        {loading && <div style={{ padding: 12, color: '#64748b', textAlign: 'center', fontSize: 12 }}>휴지통을 불러오는 중...</div>}
      </div>
    </div>
  );
}
