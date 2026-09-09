'use client';

import { Card } from '../common/Card.js';
import { TimetableWeekTable } from '../common/TimetableWeekTable.js';

export function TimetableTab({
  sectionStyle,
  schoolCodeSetting,
  teacherNoSetting,
  homeroomClass,
  inputStyle,
  btnSecondary,
  myTimetableDate,
  onMyTimetableDateChange,
  homeroomTimetableDate,
  onHomeroomTimetableDateChange,
  comtimeDateOptions,
  myTimetableWeek,
  homeroomTimetableWeek,
  loadMyTimetable,
  loadHomeroomTimetable,
}) {
  return (
    <section style={sectionStyle}>
      <Card title='👨‍🏫 내 시간표 (컴시간)'>
        <p style={{ color: '#64748b', marginTop: 0 }}>학교코드 {schoolCodeSetting} / 교사번호 {teacherNoSetting}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <select style={{ ...inputStyle, minHeight: 36, fontSize: 13 }} value={myTimetableDate} onChange={(e) => onMyTimetableDateChange(e.target.value)}>
            {!comtimeDateOptions.length && <option value=''>날짜 없음</option>}
            {comtimeDateOptions.map((opt) => <option key={`my_${opt.value}`} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <TimetableWeekTable weekData={myTimetableWeek} emptyText='시간표 데이터가 없습니다.' />
        <button style={{ ...btnSecondary, marginTop: 10 }} onClick={loadMyTimetable}>새로고침</button>
      </Card>
      <Card title='🏫 담임반 시간표 (컴시간)'>
        <p style={{ color: '#64748b', marginTop: 0 }}>학교코드 {schoolCodeSetting} / 담임반 {homeroomClass}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <select style={{ ...inputStyle, minHeight: 36, fontSize: 13 }} value={homeroomTimetableDate} onChange={(e) => onHomeroomTimetableDateChange(e.target.value)}>
            {!comtimeDateOptions.length && <option value=''>날짜 없음</option>}
            {comtimeDateOptions.map((opt) => <option key={`hr_${opt.value}`} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <TimetableWeekTable weekData={homeroomTimetableWeek} emptyText='시간표 데이터가 없습니다.' />
        <button style={{ ...btnSecondary, marginTop: 10 }} onClick={loadHomeroomTimetable}>새로고침</button>
      </Card>
    </section>
  );
}
