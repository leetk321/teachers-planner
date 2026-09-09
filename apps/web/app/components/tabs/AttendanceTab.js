'use client';

import { Card } from '../common/Card.js';

export function AttendanceTab({ values, derived, actions, styles, components }) {
  const {
    attendanceMode,
    attendanceDate,
    attendanceClassName,
    attendanceClubId,
    attendancePeriod,
    attendanceSavedMonth,
    attendanceRows,
  } = values;
  const {
    attendanceWeekdayLabel,
    allClasses,
    attendanceEligibleClubs,
    attendanceMaxPeriod,
    attendanceTargetSummary,
    filteredAttendanceSavedItems,
    attendanceTabIsSplit,
  } = derived;
  const {
    setAttendanceMode,
    setAttendanceDate,
    setAttendanceClassName,
    setAttendanceClubId,
    setAttendancePeriod,
    setAttendanceSavedMonth,
    loadAttendanceMemo,
    saveAttendanceMemo,
    resetAttendanceMemoDraft,
    updateAttendanceMemoCell,
    applySavedAttendanceItem,
  } = actions;
  const {
    attendanceMemoGrid,
    attendanceMemoCardsGrid,
    attendanceSavedGrid,
    compactFieldStyle,
    tabBtn,
    tabBtnActive,
    btnPrimary,
    btnSecondary,
    miniBtn,
    miniBtnDanger,
  } = styles;
  const { DateFieldComponent } = components;

  return (
    <Card title='✅ 출석 메모'>
      <section style={attendanceTabIsSplit ? attendanceMemoGrid : { display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ padding: 10, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button style={{ ...tabBtn, minHeight: 34, padding: '5px 10px', fontSize: 13, ...(attendanceMode === 'homeroom' ? tabBtnActive : null) }} onClick={() => setAttendanceMode('homeroom')}>학급</button>
              <button style={{ ...tabBtn, minHeight: 34, padding: '5px 10px', fontSize: 13, ...(attendanceMode === 'course' ? tabBtnActive : null) }} onClick={() => setAttendanceMode('course')}>교과</button>
              <button style={{ ...tabBtn, minHeight: 34, padding: '5px 10px', fontSize: 13, ...(attendanceMode === 'club' ? tabBtnActive : null) }} onClick={() => setAttendanceMode('club')}>선택</button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <DateFieldComponent compact value={attendanceDate} onChange={setAttendanceDate} />
                <span style={{ fontSize: 13, color: '#475569', border: '1px solid #cbd5e1', borderRadius: 999, padding: '3px 9px', background: '#fff' }}>{attendanceWeekdayLabel || '-'}</span>
              </div>
              {attendanceMode === 'course' && <>
                <select style={compactFieldStyle} value={attendanceClassName} onChange={(e) => setAttendanceClassName(e.target.value)}>
                  <option value=''>반 선택</option>
                  {allClasses.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select style={compactFieldStyle} value={attendancePeriod} onChange={(e) => setAttendancePeriod(e.target.value)}>
                  {Array.from({ length: attendanceMaxPeriod }, (_, i) => `${i + 1}교시`).map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </>}
              {attendanceMode === 'club' && <>
                <select style={{ ...compactFieldStyle, minWidth: 180 }} value={attendanceClubId} onChange={(e) => setAttendanceClubId(e.target.value)}>
                  {!attendanceEligibleClubs.length && <option value=''>(없음)</option>}
                  {attendanceEligibleClubs.map((club) => <option key={`attendance_club_${club.id}`} value={club.id}>{club.name}</option>)}
                </select>
                <select style={compactFieldStyle} value={attendancePeriod} onChange={(e) => setAttendancePeriod(e.target.value)}>
                  {Array.from({ length: attendanceMaxPeriod }, (_, i) => `${i + 1}교시`).map((p) => <option key={`club_period_${p}`} value={p}>{p}</option>)}
                </select>
              </>}
              <button style={{ ...btnSecondary, minHeight: 38, padding: '6px 12px', fontSize: 13 }} onClick={() => loadAttendanceMemo(true)}>조회</button>
              <button style={{ ...btnPrimary, minHeight: 38, padding: '6px 12px', fontSize: 13 }} onClick={saveAttendanceMemo}>저장</button>
              <button style={{ ...miniBtnDanger, minHeight: 38, padding: '6px 12px', fontSize: 13 }} onClick={resetAttendanceMemoDraft}>되돌리기</button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '3px 9px', background: '#dbeafe', color: '#1d4ed8', fontSize: 11, fontWeight: 700 }}>{attendanceTargetSummary.label || '-'}</span>
              <span style={{ color: '#64748b', fontSize: 13 }}>{attendanceRows.length}명 메모 대상</span>
            </div>
          </div>

          <div style={attendanceMemoCardsGrid}>
            {attendanceRows.map((row) => (
              <div key={`attendance_memo_${row.student_id}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(92px, 116px) minmax(0, 1fr)', alignItems: 'center', gap: 8, minWidth: 0, border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', padding: '7px 8px' }}>
                <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</div>
                  <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.class_name || '-'} · {row.student_no || '-'}번</div>
                </div>
                <input
                  style={{ ...compactFieldStyle, minHeight: 30, height: 30, width: '100%', boxSizing: 'border-box', padding: '4px 8px' }}
                  value={row.memo || ''}
                  onChange={(e) => updateAttendanceMemoCell(row.student_id, e.target.value)}
                  placeholder='출석 메모를 입력하세요.'
                />
              </div>
            ))}
            {attendanceRows.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13, border: '1px dashed #cbd5e1', borderRadius: 12, padding: '18px 16px', background: '#fff' }}>현재 조건에 맞는 학생이 없습니다.</div>}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <div style={{ padding: 10, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, color: '#475569', fontWeight: 700 }}>저장된 메모 빠른 이동</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button type='button' style={miniBtn} onClick={() => { const dt = new Date(`${attendanceSavedMonth}-01T00:00:00`); dt.setMonth(dt.getMonth() - 1); setAttendanceSavedMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`); }}>◀</button>
                <span style={{ fontSize: 12, color: '#64748b', minWidth: 58, textAlign: 'center' }}>{attendanceSavedMonth}</span>
                <button type='button' style={miniBtn} onClick={() => { const dt = new Date(`${attendanceSavedMonth}-01T00:00:00`); dt.setMonth(dt.getMonth() + 1); setAttendanceSavedMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`); }}>▶</button>
              </div>
            </div>
            <div style={attendanceSavedGrid}>
              {filteredAttendanceSavedItems.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: 12 }}>선택한 월의 저장 항목 없음</div>
              ) : filteredAttendanceSavedItems.slice(-30).reverse().map((item) => (
                <button
                  key={item.key}
                  type='button'
                  onClick={() => applySavedAttendanceItem(item)}
                  style={{ border: '1px solid #dbeafe', background: '#fff', color: '#1e3a8a', textAlign: 'left', borderRadius: 8, padding: '7px 8px', whiteSpace: 'normal', lineHeight: 1.35, fontSize: 12, cursor: 'pointer' }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </Card>
  );
}
