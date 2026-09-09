'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

const studentCode = (student) => {
  const match = String(student?.class_name || '').match(/^(\d+)-(\d+)$/);
  const no = Number(student?.student_no);
  if (!match || !Number.isFinite(no)) return '';
  return `${match[1]}${String(Number(match[2])).padStart(2, '0')}${String(no).padStart(2, '0')}`;
};

export function QuickRecordPalette({ open, onClose, students, actions, onSelectStudent }) {
  const [query, setQuery] = useState('');
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const optionListId = useId();
  const titleId = useId();
  const descriptionId = useId();
  onCloseRef.current = onClose;

  const close = () => onCloseRef.current?.();

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    setQuery('');
    setActiveOptionIndex(0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      const previous = previousFocusRef.current;
      previousFocusRef.current = null;
      window.setTimeout(() => {
        if (previous?.isConnected && typeof previous.focus === 'function') previous.focus();
      }, 0);
    };
  }, [open]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleActions = useMemo(() => (actions || []).filter((action) => (
    !normalizedQuery || `${action.label} ${action.description || ''}`.toLowerCase().includes(normalizedQuery)
  )), [actions, normalizedQuery]);
  const visibleStudents = useMemo(() => {
    if (!normalizedQuery) return [];
    return (students || []).filter((student) => {
      const code = studentCode(student);
      const text = `${code} ${student.class_name || ''} ${student.student_no || ''} ${student.name || ''}`.toLowerCase();
      return text.includes(normalizedQuery);
    }).slice(0, 8);
  }, [students, normalizedQuery]);
  const optionCount = visibleStudents.length + visibleActions.length;

  useEffect(() => {
    setActiveOptionIndex(0);
  }, [normalizedQuery, optionCount]);

  if (!open) return null;

  const optionElements = () => Array.from(dialogRef.current?.querySelectorAll('[data-quick-record-option="true"]') || []);
  const focusOption = (index) => {
    const options = optionElements();
    if (!options.length) return;
    const nextIndex = (index + options.length) % options.length;
    setActiveOptionIndex(nextIndex);
    options[nextIndex]?.focus();
  };
  const run = (callback) => {
    const result = callback?.();
    if (result === false) return;
    close();
  };
  const handleDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const options = optionElements();
      if (!options.length) return;
      event.preventDefault();
      const currentIndex = options.indexOf(document.activeElement);
      const nextIndex = currentIndex >= 0
        ? currentIndex + (event.key === 'ArrowDown' ? 1 : -1)
        : (event.key === 'ArrowDown' ? activeOptionIndex : Math.max(0, optionCount - 1));
      focusOption(nextIndex);
      return;
    }
    if (event.key === 'Enter' && event.target === inputRef.current && optionCount > 0) {
      event.preventDefault();
      optionElements()[activeOptionIndex]?.click();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll('input:not([disabled]), button:not([disabled])') || []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div role='presentation' onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }} style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'grid', placeItems: 'start center', padding: '12vh 14px 20px', background: 'rgba(15,23,42,0.46)', backdropFilter: 'blur(3px)' }}>
      <section ref={dialogRef} role='dialog' aria-modal='true' aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={handleDialogKeyDown} style={{ width: 'min(680px, 100%)', maxHeight: '72vh', overflow: 'hidden', border: '1px solid #bfdbfe', borderRadius: 16, background: '#fff', boxShadow: '0 24px 70px rgba(15,23,42,0.28)' }}>
        <h2 id={titleId} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>빠른 기록</h2>
        <p id={descriptionId} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>기능이나 학생을 검색하고 Enter 또는 화살표 키로 선택할 수 있습니다. Escape 키를 누르면 닫힙니다.</p>
        <div style={{ padding: 14, borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <strong style={{ color: '#1d4ed8', whiteSpace: 'nowrap' }}>Ctrl+K</strong>
            <input
              ref={inputRef}
              role='combobox'
              aria-label='빠른 기록 기능 또는 학생 검색'
              aria-controls={optionListId}
              aria-expanded={optionCount > 0}
              aria-autocomplete='list'
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder='기능, 학번 또는 학생 이름 검색'
              style={{ width: '100%', minHeight: 42, border: 0, outline: 0, fontSize: 16, color: '#0f172a' }}
            />
            <button type='button' aria-label='빠른 기록 닫기' onClick={close} style={{ flexShrink: 0, minHeight: 42, border: 0, background: '#f1f5f9', borderRadius: 8, padding: '7px 9px', whiteSpace: 'nowrap', cursor: 'pointer' }}>닫기</button>
          </div>
        </div>
        <div id={optionListId} style={{ maxHeight: 'calc(72vh - 72px)', overflowY: 'auto', padding: 12, display: 'grid', gap: 12 }}>
          {visibleStudents.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>학생 바로 열기</span>
              {visibleStudents.map((student, index) => (
                <button key={student.id} data-quick-record-option='true' type='button' onFocus={() => setActiveOptionIndex(index)} onClick={() => run(() => onSelectStudent(student))} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, border: '1px solid #dbeafe', borderRadius: 10, padding: '10px 12px', background: '#eff6ff', textAlign: 'left', cursor: 'pointer' }}>
                  <strong>{student.name}</strong>
                  <span style={{ color: '#475569' }}>{studentCode(student)} · {student.class_name} {student.student_no}번</span>
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>빠른 기록</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 7 }}>
              {visibleActions.map((action, index) => {
                const optionIndex = visibleStudents.length + index;
                return (
                  <button key={action.id} data-quick-record-option='true' type='button' onFocus={() => setActiveOptionIndex(optionIndex)} onClick={() => run(action.onSelect)} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: 11, background: '#fff', textAlign: 'left', cursor: 'pointer' }}>
                    <strong style={{ display: 'block', color: '#0f172a' }}>{action.label}</strong>
                    {action.description && <span style={{ display: 'block', marginTop: 3, color: '#64748b', fontSize: 12 }}>{action.description}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          {visibleStudents.length === 0 && visibleActions.length === 0 && <div style={{ padding: 18, color: '#64748b', textAlign: 'center' }}>검색 결과가 없습니다.</div>}
        </div>
      </section>
    </div>
  );
}
