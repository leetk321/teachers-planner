'use client';

import { Card } from '../common/Card.js';

export function TasksTab({ ui, values, derived, actions, styles, helpers }) {
  const { isMobile } = ui;
  const {
    scheduleTitle,
    taskSearchQuery,
    scheduleKind,
    dueAt,
    editingScheduleId,
    taskCalendarMonth,
    confirmDeleteScheduleId,
  } = values;
  const {
    taskDatesInMonth,
    taskMonthTitle,
    isCurrentTaskMonth,
    holidayMap,
    homeroomBirthdayMap,
    taskBottomLocalTodos,
    taskBottomLocalEvents,
    taskBottomGoogleTasks,
    taskBottomGoogleEvents,
    taskSearchQ,
    taskSearchTodoResults,
    taskSearchEventResults,
    taskSearchGoogleTaskResults,
    taskSearchGoogleEventResults,
  } = derived;
  const {
    onShiftMonth,
    onTaskCalendarMonthChange,
    onScheduleKindChange,
    onScheduleTitleChange,
    onDueAtChange,
    onTaskSearchQueryChange,
    onSubmitSchedule,
    onStartEditSchedule,
    onToggleSchedule,
    onRequestDeleteSchedule,
    onCancelDeleteSchedule,
    onDeleteSchedule,
    onResetScheduleEditor,
  } = actions;
  const {
    twoColGrid,
    formRow,
    inputStyle,
    btnPrimary,
    btnSecondary,
    listStyle,
    checkBtn,
    miniBtn,
    miniBtnDanger,
  } = styles;
  const { DateTimeFieldComponent, formatGoogleEventText, formatGoogleTaskDue } = helpers;

  return (
    <section style={isMobile ? { display: 'grid', gap: 12 } : twoColGrid}>
      <Card title='📅 일정 / 할 일'>
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button type='button' style={{ ...btnSecondary, minHeight: 42, height: 42, boxSizing: 'border-box' }} onClick={() => onShiftMonth(-1)}>이전달</button>
            <input type='month' style={{ ...inputStyle, minHeight: 42, height: 42, boxSizing: 'border-box' }} value={taskCalendarMonth} onChange={(e) => onTaskCalendarMonthChange(e.target.value)} />
            <button type='button' style={{ ...btnSecondary, minHeight: 42, height: 42, boxSizing: 'border-box' }} onClick={() => onShiftMonth(1)}>다음달</button>
          </div>
          <span style={{ display: 'none' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 6, marginBottom: 12 }}>
          {['월', '화', '수', '목', '금', '토', '일'].map((w) => <div key={w} style={{ fontSize: 14, color: '#64748b', fontWeight: 700 }}>{w}</div>)}
          {Array.from({ length: taskDatesInMonth.pad }, (_, i) => <div key={`pad_${i}`} />)}
          {taskDatesInMonth.days.map((d) => {
            const now = new Date();
            const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const isToday = d.iso === localToday;
            const holidayName = holidayMap[d.iso] || '';
            const birthdayBadges = homeroomBirthdayMap[d.iso] || [];
            const numberColor = holidayName ? '#dc2626' : (d.weekday === 0 ? '#dc2626' : (d.weekday === 6 ? '#2563eb' : '#0f172a'));
            return (
              <div key={d.iso} style={{ border: '1px solid #e2e8f0', borderRadius: 8, minHeight: 72, padding: 6, background: d.items.length ? '#eff6ff' : '#fff' }}>
                <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                  <span style={{ color: numberColor }}>{d.day}</span>
                  <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    {holidayName ? <span style={{ fontSize: 11, color: '#dc2626' }}>{holidayName}</span> : null}
                    {isToday ? <span style={{ fontSize: 11, background: '#2563eb', color: '#fff', borderRadius: 999, padding: '1px 6px' }}>Today</span> : null}
                    {birthdayBadges.map((b, bi) => <span key={`${d.iso}_bd_${bi}`} style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '1px 6px' }}>{b}</span>)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#334155' }}>
                  {d.items.slice(0, 2).length === 0 ? '-' : d.items.slice(0, 2).map((x, idx) => (
                    <div key={`${d.iso}_item_${idx}`} style={{ whiteSpace: 'pre-wrap', paddingLeft: 12, textIndent: -10, lineHeight: 1.35 }}>
                      {`• ${x.isGoogle ? formatGoogleEventText(x, true) : x.title}`}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <form onSubmit={onSubmitSchedule} style={formRow}>
          <select style={{ ...inputStyle, minHeight: 34, height: 34, boxSizing: 'border-box' }} value={scheduleKind} onChange={(e) => onScheduleKindChange(e.target.value)}>
            <option value='todo'>할 일</option>
            <option value='event'>일정</option>
          </select>
          <input style={{ ...inputStyle, flex: '0 1 320px', minHeight: 34, height: 34, boxSizing: 'border-box' }} value={scheduleTitle} onChange={(e) => onScheduleTitleChange(e.target.value)} placeholder='제목' required />
          <DateTimeFieldComponent value={dueAt} onChange={onDueAtChange} compact />
          <button style={{ ...btnPrimary, minHeight: 34, height: 34, padding: '0 12px' }}>{editingScheduleId ? '수정 저장' : '추가'}</button>
          <input style={{ ...inputStyle, width: 210, minHeight: 34, height: 34, fontSize: 13, marginLeft: 'auto' }} value={taskSearchQuery} onChange={(e) => onTaskSearchQueryChange(e.target.value)} placeholder='전체 일정/할 일 검색' />
          {editingScheduleId && <button type='button' style={btnSecondary} onClick={onResetScheduleEditor}>취소</button>}
        </form>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#334155', borderTop: '1px dashed #cbd5e1', borderBottom: '1px dashed #cbd5e1', padding: '6px 2px' }}>✅ 할 일 ({isCurrentTaskMonth ? `${taskMonthTitle}~` : taskMonthTitle})</div>
          <ul style={listStyle}>
            {taskBottomLocalTodos.map((s) => (
              <li key={s.id}>
                <button style={checkBtn} onClick={() => onToggleSchedule(s.id)}>{s.done ? '✅' : '⬜'}</button>
                {s.title} {s.due_at ? `(${new Date(s.due_at).toLocaleString()})` : ''}
                <button type='button' style={miniBtn} onClick={() => onStartEditSchedule(s)}>수정</button>
                {confirmDeleteScheduleId === s.id ? (
                  <>
                    <button type='button' style={miniBtnDanger} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteSchedule(s.id); }}>삭제 확인</button>
                    <button type='button' style={miniBtn} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancelDeleteSchedule(); }}>취소</button>
                  </>
                ) : (
                  <button type='button' style={miniBtnDanger} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRequestDeleteSchedule(s.id); }}>삭제</button>
                )}
              </li>
            ))}
            {taskBottomLocalTodos.length === 0 && <li style={{ color: '#94a3b8' }}>할 일이 없습니다.</li>}
          </ul>

          <div style={{ fontSize: 15, fontWeight: 800, color: '#334155', borderTop: '1px dashed #cbd5e1', borderBottom: '1px dashed #cbd5e1', padding: '6px 2px' }}>📅 일정 ({isCurrentTaskMonth ? `${taskMonthTitle}~` : taskMonthTitle})</div>
          <ul style={listStyle}>
            {taskBottomLocalEvents.map((s) => (
              <li key={s.id}>
                {s.title} {s.due_at ? `(${new Date(s.due_at).toLocaleString()})` : ''}
                <button type='button' style={miniBtn} onClick={() => onStartEditSchedule(s)}>수정</button>
                {confirmDeleteScheduleId === s.id ? (
                  <>
                    <button type='button' style={miniBtnDanger} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteSchedule(s.id); }}>삭제 확인</button>
                    <button type='button' style={miniBtn} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancelDeleteSchedule(); }}>취소</button>
                  </>
                ) : (
                  <button type='button' style={miniBtnDanger} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRequestDeleteSchedule(s.id); }}>삭제</button>
                )}
              </li>
            ))}
            {taskBottomLocalEvents.length === 0 && <li style={{ color: '#94a3b8' }}>일정이 없습니다.</li>}
          </ul>

          <div style={{ fontSize: 15, fontWeight: 800, color: '#334155', borderTop: '1px dashed #cbd5e1', borderBottom: '1px dashed #cbd5e1', padding: '6px 2px' }}>✅ Google 할 일 ({isCurrentTaskMonth ? `${taskMonthTitle}~` : taskMonthTitle})</div>
          <ul style={listStyle}>
            {taskBottomGoogleTasks.map((t) => (
              <li key={t.id} style={{ color: t.status === 'completed' ? '#64748b' : '#0f172a' }}>
                {t.status === 'completed' ? '☑' : '☐'} {t.title} {t.due_at ? `(${formatGoogleTaskDue(t.due_at)})` : ''}
              </li>
            ))}
            {taskBottomGoogleTasks.length === 0 && <li style={{ color: '#94a3b8' }}>Google 할 일 항목이 없습니다.</li>}
          </ul>

          <div style={{ fontSize: 15, fontWeight: 800, color: '#334155', borderTop: '1px dashed #cbd5e1', borderBottom: '1px dashed #cbd5e1', padding: '6px 2px' }}>📆 Google 캘린더 ({isCurrentTaskMonth ? `${taskMonthTitle}~` : taskMonthTitle})</div>
          <ul style={listStyle}>
            {taskBottomGoogleEvents.map((s, idx) => (
              <li key={`${s.start_at}_${idx}`}>
                {formatGoogleEventText(s)}
              </li>
            ))}
            {taskBottomGoogleEvents.length === 0 && <li style={{ color: '#94a3b8' }}>Google 캘린더 일정이 없습니다.</li>}
          </ul>

          {taskSearchQ && (
            <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                전체 검색 결과 (로컬 할 일 {taskSearchTodoResults.length}건 · 로컬 일정 {taskSearchEventResults.length}건 · Google 할 일 {taskSearchGoogleTaskResults.length}건 · Google 일정 {taskSearchGoogleEventResults.length}건)
              </div>
              <ul style={listStyle}>
                {taskSearchTodoResults.map((s) => <li key={`sr_todo_${s.id}`}>✅ {s.title} {s.due_at ? `(${new Date(s.due_at).toLocaleString()})` : ''}</li>)}
                {taskSearchEventResults.map((s) => <li key={`sr_event_${s.id}`}>📅 {s.title} {s.due_at ? `(${new Date(s.due_at).toLocaleString()})` : ''}</li>)}
                {taskSearchGoogleTaskResults.map((t) => <li key={`sr_gt_${t.id}`}>☁️ 할 일: {t.title} {t.due_at ? `(${formatGoogleTaskDue(t.due_at)})` : ''}</li>)}
                {taskSearchGoogleEventResults.map((e, idx) => <li key={`sr_ge_${idx}_${e.start_at || ''}`}>☁️ 일정: {formatGoogleEventText(e)}</li>)}
                {(taskSearchTodoResults.length + taskSearchEventResults.length + taskSearchGoogleTaskResults.length + taskSearchGoogleEventResults.length) === 0 && <li style={{ color: '#94a3b8' }}>검색 결과가 없습니다.</li>}
              </ul>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
