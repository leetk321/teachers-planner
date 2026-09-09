'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'consultation', label: '상담' },
  { key: 'issue', label: '사안' },
  { key: 'attendance', label: '출석' },
  { key: 'student', label: '학생정보' },
];

const TYPE_LABELS = {
  consultation: '상담',
  issue: '사안',
  attendance: '출석',
  student: '학생정보',
};

const TYPE_COLORS = {
  consultation: { background: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
  issue: { background: '#fff7ed', border: '#fed7aa', color: '#c2410c' },
  attendance: { background: '#ecfdf5', border: '#a7f3d0', color: '#047857' },
  student: { background: '#f8fafc', border: '#cbd5e1', color: '#475569' },
};

const META_LABELS = {
  academicYear: '학년도',
  category: '분류',
  caseNo: '사안',
  issueTitle: '사안명',
  consultationType: '상담 대상',
  studentCode: '학번',
  participantName: '학생',
  kind: '구분',
  className: '학급/선택',
  period: '교시',
  status: '상태',
};

const META_VALUES = {
  general: '일반',
  guidance: '생활지도',
  parent: '보호자',
  class: '수업',
  observe: '관찰',
  student: '학생',
  guardian: '보호자',
  homeroom: '학급',
  course: '교과',
  club: '선택',
};

const normalizeType = (value) => {
  const type = String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (type.includes('issue') || type.includes('case') || type.includes('사안')) return 'issue';
  if (type.includes('attendance') || type.includes('absence') || type.includes('출석') || type.includes('출결')) return 'attendance';
  if (type.includes('consult') || type.includes('counsel') || type === 'note' || type.includes('상담')) return 'consultation';
  if (type.includes('student') || type.includes('profile') || type.includes('info') || type.includes('학생')) return 'student';
  return 'student';
};

const toTimeValue = (value) => {
  const text = String(value || '').trim();
  const time = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? Date.parse(`${text}T00:00:00+09:00`)
    : Date.parse(text);
  return Number.isFinite(time) ? time : 0;
};

const formatOccurredAt = (value) => {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    }).format(new Date(`${text}T00:00:00+09:00`));
  }
  const time = toTimeValue(value);
  if (!time) return String(value || '-');
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(time));
};

const visibleMeta = (meta) => {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return [];
  return Object.entries(meta)
    .filter(([key, value]) => META_LABELS[key] && ['string', 'number', 'boolean'].includes(typeof value) && String(value).trim())
    .slice(0, 4)
    .map(([key, value]) => [META_LABELS[key], META_VALUES[String(value)] || value]);
};

function TimelineContent({ content, miniBtn }) {
  const text = String(content || '').trim();
  const contentRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  useEffect(() => {
    const element = contentRef.current;
    if (!element || expanded) return undefined;

    const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1);
    const frame = window.requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(element);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [expanded, text]);

  if (!text) return null;

  return (
    <div style={{ marginTop: 7 }}>
      <p
        ref={contentRef}
        style={{
          margin: 0,
          color: '#334155',
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          ...(expanded ? {} : {
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 3,
            overflow: 'hidden',
          }),
        }}
      >
        {text}
      </p>
      {(overflowing || expanded) && (
        <button
          type='button'
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          style={{
            ...(miniBtn || {}),
            margin: '6px 0 0',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {expanded ? '접기' : '더보기'}
        </button>
      )}
    </div>
  );
}

function TimelineItem({ item, miniBtn }) {
  const type = normalizeType(item?.type);
  const colors = TYPE_COLORS[type] || TYPE_COLORS.student;
  const meta = visibleMeta(item?.meta);

  return (
    <li style={{ position: 'relative', display: 'grid', gridTemplateColumns: '14px minmax(0, 1fr)', gap: 9, listStyle: 'none' }}>
      <span aria-hidden='true' style={{ position: 'relative', zIndex: 1, width: 11, height: 11, marginTop: 14, borderRadius: '50%', border: '2px solid #fff', background: colors.color, boxShadow: `0 0 0 2px ${colors.border}` }} />
      <article style={{ minWidth: 0, border: '1px solid #dbe4ef', borderRadius: 10, padding: '10px 11px', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ flexShrink: 0, border: `1px solid ${colors.border}`, borderRadius: 999, padding: '2px 7px', background: colors.background, color: colors.color, fontSize: 12, fontWeight: 800, lineHeight: 1.3, whiteSpace: 'nowrap' }}>
            {String(item?.label || TYPE_LABELS[type] || '학생정보')}
          </span>
          <time dateTime={String(item?.occurredAt || '')} style={{ color: '#64748b', fontSize: 12, lineHeight: 1.35, whiteSpace: 'nowrap' }}>
            {formatOccurredAt(item?.occurredAt)}
          </time>
        </div>
        <strong style={{ display: 'block', marginTop: 6, color: '#0f172a', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
          {String(item?.title || item?.label || TYPE_LABELS[type] || '학생 이력')}
        </strong>
        <TimelineContent content={item?.content} miniBtn={miniBtn} />
        {meta.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 7 }}>
            {meta.map(([key, value]) => (
              <span key={key} style={{ maxWidth: '100%', borderRadius: 999, padding: '2px 7px', background: '#f1f5f9', color: '#64748b', fontSize: 11, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {key}: {String(value)}
              </span>
            ))}
          </div>
        )}
      </article>
    </li>
  );
}

export function StudentHistoryPanel({ studentId, apiFetch, miniBtn, recordsRevision, studentRevision }) {
  const studentKey = String(studentId ?? '').trim();
  const [stateStudentKey, setStateStudentKey] = useState(studentKey);
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryVersion, setRetryVersion] = useState(0);
  const requestIdRef = useRef(0);
  const apiFetchRef = useRef(apiFetch);
  const panelId = useId();
  apiFetchRef.current = apiFetch;

  const currentStudent = stateStudentKey === studentKey;
  const isExpanded = currentStudent && expanded;

  useEffect(() => {
    requestIdRef.current += 1;
    setStateStudentKey(studentKey);
    setExpanded(false);
    setItems([]);
    setFilter('all');
    setLoading(false);
    setError('');
    setRetryVersion(0);
  }, [studentKey]);

  useEffect(() => {
    if (!isExpanded || !studentKey) return undefined;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError('');

    Promise.resolve(apiFetchRef.current?.(`/api/students/${encodeURIComponent(studentKey)}/timeline`, {
      method: 'GET',
      signal: controller.signal,
    }))
      .then((response) => {
        if (!active || requestId !== requestIdRef.current) return;
        const rows = Array.isArray(response?.items) ? response.items : [];
        const sorted = rows
          .map((item, index) => ({ item, index }))
          .sort((left, right) => toTimeValue(right.item?.occurredAt) - toTimeValue(left.item?.occurredAt) || left.index - right.index)
          .map(({ item }) => item);
        setItems(sorted);
      })
      .catch((reason) => {
        if (!active || requestId !== requestIdRef.current || reason?.name === 'AbortError') return;
        setItems([]);
        setError(String(reason?.message || '학생 이력을 불러오지 못했습니다.'));
      })
      .finally(() => {
        if (active && requestId === requestIdRef.current) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [isExpanded, recordsRevision, retryVersion, studentKey, studentRevision]);

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => normalizeType(item?.type) === filter);
  }, [filter, items]);

  const buttonStyle = {
    ...(miniBtn || {}),
    marginLeft: 0,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };

  return (
    <section aria-label='학생 이력' style={{ border: '1px solid #dbe4ef', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 9, padding: '10px 12px', background: '#f8fafc' }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', color: '#0f172a', lineHeight: 1.35 }}>학생 이력</strong>
          {!studentKey && <span style={{ display: 'block', marginTop: 2, color: '#64748b', fontSize: 12 }}>학생을 선택해 주세요.</span>}
        </div>
        <button
          type='button'
          aria-expanded={isExpanded}
          aria-controls={panelId}
          disabled={!studentKey}
          onClick={() => setExpanded((value) => !value)}
          style={{ ...buttonStyle, opacity: studentKey ? 1 : 0.55, cursor: studentKey ? 'pointer' : 'not-allowed' }}
        >
          {isExpanded ? '접기' : '펼치기'}
        </button>
      </div>

      {isExpanded && (
        <div id={panelId} style={{ borderTop: '1px solid #e2e8f0', padding: 11 }}>
          <div role='group' aria-label='학생 이력 유형 필터' style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 3, scrollbarWidth: 'thin' }}>
            {FILTERS.map((option) => {
              const selected = filter === option.key;
              return (
                <button
                  key={option.key}
                  type='button'
                  aria-pressed={selected}
                  onClick={() => setFilter(option.key)}
                  style={{
                    ...buttonStyle,
                    borderColor: selected ? '#60a5fa' : (buttonStyle.borderColor || '#cbd5e1'),
                    background: selected ? '#dbeafe' : (buttonStyle.background || '#fff'),
                    color: selected ? '#1d4ed8' : (buttonStyle.color || '#334155'),
                    fontWeight: selected ? 800 : 600,
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div aria-live='polite' aria-busy={loading} style={{ marginTop: 9 }}>
            {loading && <div style={{ padding: '24px 12px', color: '#64748b', textAlign: 'center' }}>학생 이력을 불러오는 중입니다.</div>}

            {!loading && error && (
              <div role='alert' style={{ display: 'grid', justifyItems: 'center', gap: 9, padding: '22px 12px', borderRadius: 9, background: '#fff7ed', color: '#9a3412', textAlign: 'center' }}>
                <span>{error}</span>
                <button type='button' onClick={() => setRetryVersion((value) => value + 1)} style={buttonStyle}>다시 시도</button>
              </div>
            )}

            {!loading && !error && filteredItems.length === 0 && (
              <div style={{ padding: '24px 12px', borderRadius: 9, background: '#f8fafc', color: '#64748b', textAlign: 'center' }}>
                {items.length === 0 ? '등록된 학생 이력이 없습니다.' : '선택한 유형의 학생 이력이 없습니다.'}
              </div>
            )}

            {!loading && !error && filteredItems.length > 0 && (
              <div style={{ position: 'relative', maxHeight: 360, overflowY: 'auto', padding: '1px 4px 1px 0', scrollbarWidth: 'thin' }}>
                <span aria-hidden='true' style={{ position: 'absolute', top: 15, bottom: 15, left: 5, width: 2, background: '#dbeafe' }} />
                <ol style={{ position: 'relative', display: 'grid', gap: 9, margin: 0, padding: 0 }}>
                  {filteredItems.map((item, index) => (
                    <TimelineItem
                      key={`${studentKey}:${String(item?.type || '')}:${String(item?.id ?? index)}:${String(item?.occurredAt || '')}`}
                      item={item}
                      miniBtn={miniBtn}
                    />
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default StudentHistoryPanel;
