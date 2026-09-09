'use client';

import { Card } from '../common/Card.js';

const scopeOptions = [
  { value: 'all', label: '전체' },
  { value: 'students', label: '학생' },
  { value: 'notes', label: '상담기록' },
  { value: 'schedules', label: '일정/할 일' },
  { value: 'memos', label: '메모/전달사항' },
  { value: 'files', label: '자료' },
  { value: 'links', label: '링크' },
  { value: 'clubs', label: '선택 편성' },
  { value: 'issues', label: '사안' },
];

const scopeMeta = {
  students: { label: '학생', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  notes: { label: '상담기록', color: '#0f766e', bg: '#ecfeff', border: '#a5f3fc' },
  schedules: { label: '일정/할 일', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  memos: { label: '메모/전달사항', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  files: { label: '자료', color: '#334155', bg: '#f8fafc', border: '#cbd5e1' },
  links: { label: '링크', color: '#0f766e', bg: '#f0fdfa', border: '#99f6e4' },
  clubs: { label: '선택 편성', color: '#4338ca', bg: '#eef2ff', border: '#c7d2fe' },
  issues: { label: '사안', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
};

const order = ['students', 'notes', 'schedules', 'memos', 'files', 'links', 'clubs', 'issues'];

export function SearchTab({
  query,
  setQuery,
  scope,
  setScope,
  onSearch,
  onOpenResult,
  loading,
  error,
  results,
  counts,
  total,
  isMobile,
  inputStyle,
  btnPrimary,
  btnSecondary,
}) {
  const orderedCounts = order.filter((key) => Number(counts?.[key] || 0) > 0);

  return (
    <Card title='🔎 통합 검색'>
      <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
        <div style={{ color: '#64748b', fontSize: 13 }}>
          학생, 상담기록, 일정, 메모, 자료, 링크, 선택 편성, 사안을 한 번에 검색합니다.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ ...inputStyle, flex: '1 1 320px', minWidth: isMobile ? '100%' : 320 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearch();
            }}
            placeholder='이름, 상담 내용, 일정 제목, 메모, 파일명 등으로 검색'
          />
          <select
            style={{ ...inputStyle, minWidth: 132 }}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            {scopeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button type='button' style={btnPrimary} onClick={onSearch}>
            {loading ? '검색 중...' : '검색'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 10, color: '#b91c1c', fontSize: 13, fontWeight: 700 }}>
          {error}
        </div>
      )}

      {query.trim() && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: '#334155', fontWeight: 700 }}>
              검색 결과 {total || 0}건
            </div>
            {orderedCounts.map((key) => {
              const meta = scopeMeta[key] || scopeMeta.files;
              return (
                <span
                  key={key}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: meta.color,
                    background: meta.bg,
                    border: `1px solid ${meta.border}`,
                    borderRadius: 999,
                    padding: '3px 8px',
                  }}
                >
                  {meta.label} {counts[key]}건
                </span>
              );
            })}
          </div>

          {!loading && !results.length && !error && (
            <div style={{ color: '#94a3b8', fontSize: 13, border: '1px dashed #cbd5e1', borderRadius: 12, padding: '18px 16px', background: '#fff' }}>
              검색 결과가 없습니다.
            </div>
          )}

          <div style={{ display: 'grid', gap: 8 }}>
            {results.map((item, index) => {
              const meta = scopeMeta[item.scope] || scopeMeta.files;
              return (
                <div
                  key={`${item.scope}_${item.type}_${item.id || index}`}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    background: '#fff',
                    padding: 12,
                    display: 'grid',
                    gap: 7,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ display: 'grid', gap: 5, minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: meta.color,
                            background: meta.bg,
                            border: `1px solid ${meta.border}`,
                            borderRadius: 999,
                            padding: '2px 8px',
                          }}
                        >
                          {meta.label}
                        </span>
                        {item.type && item.type !== item.scope && (
                          <span style={{ fontSize: 12, color: '#64748b' }}>{item.type}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', wordBreak: 'break-word' }}>
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div style={{ fontSize: 13, color: '#475569', wordBreak: 'break-word' }}>
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                      {item.date && <div style={{ fontSize: 12, color: '#64748b' }}>{item.date}</div>}
                      {typeof onOpenResult === 'function' && (
                        <button type='button' style={{ ...btnSecondary, minHeight: 34, padding: '6px 10px', fontSize: 13 }} onClick={() => onOpenResult(item)}>
                          위치로 이동
                        </button>
                      )}
                    </div>
                  </div>
                  {item.snippet && (
                    <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {item.snippet}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
