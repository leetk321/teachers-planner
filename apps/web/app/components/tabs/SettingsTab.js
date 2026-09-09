'use client';

import { Card } from '../common/Card.js';
import { TrashPanel } from '../settings/TrashPanel.js';

export function SettingsTab({ ui, values, setters, admin, actions, styles }) {
  const { isMobile, compactDesktop, isMasterAdmin } = ui;
  const { inputStyle, btnPrimary, btnSecondary, btnSoftDanger } = styles;

  const settingsPageGrid = compactDesktop
    ? { display: 'grid', gridTemplateColumns: 'minmax(0, 0.88fr) minmax(0, 1.12fr)', gap: 10, alignItems: 'start' }
    : { display: 'grid', gap: 8 };
  const settingsPageColumn = { display: 'grid', gap: 8, minWidth: 0 };
  const settingsSectionStyle = { border: '1px solid #e2e8f0', borderRadius: 10, padding: compactDesktop ? 8 : 10, marginBottom: 0, background: '#f8fafc' };
  const settingsSectionDenseStyle = { display: 'grid', gap: 6 };
  const settingsTitleStyle = { margin: '0 0 6px 0', fontSize: compactDesktop ? 13 : 14, color: '#334155' };
  const settingsGridCompact = {
    display: 'grid',
    gridTemplateColumns: compactDesktop ? 'repeat(2, minmax(0, 1fr))' : '1fr',
    gap: compactDesktop ? 8 : 10,
  };
  const settingsWeekdayGrid = {
    display: 'grid',
    gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))',
    gap: compactDesktop ? 8 : 10,
  };
  const settingsLabelStyle = { fontSize: compactDesktop ? 12 : 13, lineHeight: 1.2, fontWeight: 700 };
  const settingsItemStyle = { display: 'grid', gap: compactDesktop ? 4 : 6 };
  const settingsInputStyle = {
    ...inputStyle,
    minHeight: compactDesktop ? 36 : 42,
    height: compactDesktop ? 36 : undefined,
    padding: compactDesktop ? '6px 9px' : inputStyle.padding,
    fontSize: compactDesktop ? 13 : 14,
    width: '100%',
    boxSizing: 'border-box',
  };
  const settingsHelpStyle = { fontSize: compactDesktop ? 11 : 12, color: '#64748b', lineHeight: 1.35 };
  const settingsInlineActions = { marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' };

  return (
    <Card title='⚙️ 설정' style={!isMobile ? { padding: 12 } : undefined}>
      <section style={settingsPageGrid}>
        <div style={settingsPageColumn}>
          <section style={settingsSectionStyle}>
            <h3 style={settingsTitleStyle}>기본 정보</h3>
            <div style={settingsGridCompact}>
              <label style={settingsItemStyle}><span style={settingsLabelStyle}>학년도</span><input style={settingsInputStyle} value={values.academicYear} onChange={(e) => setters.setAcademicYear(e.target.value)} /></label>
              <label style={settingsItemStyle}><span style={settingsLabelStyle}>학교명</span><input style={settingsInputStyle} value={values.schoolName} onChange={(e) => setters.setSchoolName(e.target.value)} /></label>
              <label style={settingsItemStyle}><span style={settingsLabelStyle}>선생님 표기명</span><input style={settingsInputStyle} value={values.teacherDisplayName} onChange={(e) => setters.setTeacherDisplayName(e.target.value)} /></label>
              <label style={settingsItemStyle}><span style={settingsLabelStyle}>담임반</span><input style={settingsInputStyle} value={values.homeroomClass} onChange={(e) => setters.setHomeroomClass(e.target.value)} /></label>
            </div>
          </section>

          <section style={settingsSectionStyle}>
            <h3 style={settingsTitleStyle}>컴시간 설정</h3>
            <div style={settingsGridCompact}>
              <label style={settingsItemStyle}><span style={settingsLabelStyle}>학교코드</span><input style={settingsInputStyle} value={values.schoolCodeSetting} onChange={(e) => setters.setSchoolCodeSetting(e.target.value)} /></label>
              <label style={settingsItemStyle}><span style={settingsLabelStyle}>교사번호</span><input style={settingsInputStyle} value={values.teacherNoSetting} onChange={(e) => setters.setTeacherNoSetting(e.target.value)} /></label>
            </div>
          </section>

          <section style={settingsSectionStyle}>
            <h3 style={settingsTitleStyle}>날씨 연동</h3>
            <div style={settingsSectionDenseStyle}>
              <label style={settingsItemStyle}>
                <span style={settingsLabelStyle}>기상청 API 허브 인증키</span>
                <input
                  style={settingsInputStyle}
                  value={values.kmaServiceKey}
                  onChange={(e) => setters.setKmaServiceKey(e.target.value)}
                  placeholder='apihub.kma.go.kr authKey'
                />
              </label>
              <div style={settingsHelpStyle}>오늘 날씨 카드는 기상청 API 허브의 초단기실황, 초단기예보 인증키를 사용합니다.</div>
            </div>
          </section>

          <section style={settingsSectionStyle}>
            <h3 style={settingsTitleStyle}>비밀번호 변경</h3>
            <div style={{ ...settingsGridCompact, gridTemplateColumns: compactDesktop ? 'repeat(2, minmax(0, 1fr))' : '1fr' }}>
              <input type='password' style={settingsInputStyle} value={values.myCurrentPassword} onChange={(e) => setters.setMyCurrentPassword(e.target.value)} placeholder='현재 비밀번호' />
              <input type='password' style={settingsInputStyle} value={values.myNewPassword} onChange={(e) => setters.setMyNewPassword(e.target.value)} placeholder='새 비밀번호' />
            </div>
            <div style={settingsInlineActions}>
              <button type='button' style={{ ...btnSecondary, minHeight: compactDesktop ? 36 : 40, padding: compactDesktop ? '7px 11px' : btnSecondary.padding, fontSize: 13 }} onClick={actions.changeMyPassword}>내 비밀번호 변경</button>
            </div>
          </section>
        </div>

        <div style={settingsPageColumn}>
          <section style={settingsSectionStyle}>
            <h3 style={settingsTitleStyle}>일정 연동</h3>
            <div style={settingsSectionDenseStyle}>
              <div style={settingsGridCompact}>
                <label style={settingsItemStyle}>
                  <span style={settingsLabelStyle}>Google 캘린더 iCal 주소</span>
                  <input
                    style={settingsInputStyle}
                    value={values.googleCalendarIcsUrl}
                    onChange={(e) => setters.setGoogleCalendarIcsUrl(e.target.value)}
                    placeholder='https://calendar.google.com/calendar/ical/...'
                  />
                </label>
                <label style={settingsItemStyle}>
                  <span style={settingsLabelStyle}>Google 캘린더 공개 주소</span>
                  <input
                    style={settingsInputStyle}
                    value={values.googleCalendarEmbedUrl}
                    onChange={(e) => setters.setGoogleCalendarEmbedUrl(e.target.value)}
                    placeholder='https://calendar.google.com/calendar/embed?...'
                  />
                </label>
                <label style={settingsItemStyle}>
                  <span style={settingsLabelStyle}>Tasks Client ID</span>
                  <input
                    style={settingsInputStyle}
                    value={values.googleTasksClientId}
                    onChange={(e) => setters.setGoogleTasksClientId(e.target.value)}
                    placeholder='xxxxxxxx.apps.googleusercontent.com'
                  />
                </label>
                <label style={settingsItemStyle}>
                  <span style={settingsLabelStyle}>Tasks Client Secret</span>
                  <input
                    style={settingsInputStyle}
                    value={values.googleTasksClientSecret}
                    onChange={(e) => setters.setGoogleTasksClientSecret(e.target.value)}
                    placeholder='GOCSPX-...'
                  />
                </label>
                <label style={settingsItemStyle}>
                  <span style={settingsLabelStyle}>Tasks Refresh Token</span>
                  <input
                    style={settingsInputStyle}
                    value={values.googleTasksRefreshToken}
                    onChange={(e) => setters.setGoogleTasksRefreshToken(e.target.value)}
                    placeholder='1//0g....'
                  />
                </label>
                <label style={settingsItemStyle}>
                  <span style={settingsLabelStyle}>Tasks List ID</span>
                  <input
                    style={settingsInputStyle}
                    value={values.googleTasksListId}
                    onChange={(e) => setters.setGoogleTasksListId(e.target.value)}
                    placeholder='@default'
                  />
                </label>
              </div>
              <details style={settingsHelpStyle}>
                <summary style={{ cursor: 'pointer', fontWeight: 700 }}>수동 Access Token 입력(선택)</summary>
                <label style={{ ...settingsItemStyle, marginTop: 6 }}>
                  <span style={settingsLabelStyle}>Google Tasks Access Token</span>
                  <input
                    style={settingsInputStyle}
                    value={values.googleTasksAccessToken}
                    onChange={(e) => setters.setGoogleTasksAccessToken(e.target.value)}
                    placeholder='ya29....'
                  />
                </label>
              </details>
              <div style={settingsHelpStyle}>Client ID, Secret, Refresh Token을 저장하면 서버가 Access Token을 자동 갱신해 일정 탭에 Google Tasks를 표시합니다.</div>
              <div style={settingsHelpStyle}>iCal 주소가 있으면 iCal을 우선 사용합니다. 설정 저장 후에는 일정 탭에서 바로 보입니다.</div>
            </div>
          </section>

          <section style={settingsSectionStyle}>
            <h3 style={settingsTitleStyle}>출석 교시 수 설정</h3>
            <div style={settingsWeekdayGrid}>
              <label style={settingsItemStyle}><span style={settingsLabelStyle}>월</span><input style={settingsInputStyle} value={values.weekdayPeriods.mon} onChange={(e) => setters.setWeekdayPeriods((prev) => ({ ...prev, mon: Number(e.target.value || 0) }))} /></label>
              <label style={settingsItemStyle}><span style={settingsLabelStyle}>화</span><input style={settingsInputStyle} value={values.weekdayPeriods.tue} onChange={(e) => setters.setWeekdayPeriods((prev) => ({ ...prev, tue: Number(e.target.value || 0) }))} /></label>
              <label style={settingsItemStyle}><span style={settingsLabelStyle}>수</span><input style={settingsInputStyle} value={values.weekdayPeriods.wed} onChange={(e) => setters.setWeekdayPeriods((prev) => ({ ...prev, wed: Number(e.target.value || 0) }))} /></label>
              <label style={settingsItemStyle}><span style={settingsLabelStyle}>목</span><input style={settingsInputStyle} value={values.weekdayPeriods.thu} onChange={(e) => setters.setWeekdayPeriods((prev) => ({ ...prev, thu: Number(e.target.value || 0) }))} /></label>
              <label style={settingsItemStyle}><span style={settingsLabelStyle}>금</span><input style={settingsInputStyle} value={values.weekdayPeriods.fri} onChange={(e) => setters.setWeekdayPeriods((prev) => ({ ...prev, fri: Number(e.target.value || 0) }))} /></label>
            </div>
          </section>

          <section style={settingsSectionStyle}>
            <h3 style={settingsTitleStyle}>휴지통과 복구</h3>
            <TrashPanel compact={compactDesktop} buttonStyle={btnSecondary} dangerButtonStyle={btnSoftDanger} />
          </section>

          {isMasterAdmin && (
            <section style={settingsSectionStyle}>
              <h3 style={settingsTitleStyle}>마스터 관리자: 회원 관리</h3>
              <div style={{ display: 'grid', gap: 6 }}>
                {admin.users.map((user) => (
                  <div key={user.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: compactDesktop ? 7 : 8, background: '#fff', display: 'grid', gap: 5 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{user.username} ({user.name || '-'})</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <input type='password' style={{ ...settingsInputStyle, flex: 1, minWidth: 160 }} value={admin.passwordDraftById[String(user.id)] || ''} onChange={(e) => admin.setPasswordDraftById((prev) => ({ ...prev, [String(user.id)]: e.target.value }))} placeholder='새 비밀번호' />
                      <button type='button' style={{ ...btnSecondary, minHeight: compactDesktop ? 34 : 36, padding: compactDesktop ? '6px 10px' : '7px 11px', fontSize: 12 }} onClick={() => actions.adminChangePassword(user.id)}>비밀번호 변경</button>
                      <button type='button' style={{ ...btnSoftDanger, minHeight: compactDesktop ? 34 : 36, padding: compactDesktop ? '6px 10px' : '7px 11px', fontSize: 12 }} onClick={() => actions.adminDeleteUser(user.id, user.username)}>계정 삭제</button>
                    </div>
                  </div>
                ))}
                {admin.users.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>회원 목록이 없습니다.</div>}
              </div>
            </section>
          )}
        </div>
      </section>

      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={{ ...btnPrimary, minHeight: compactDesktop ? 38 : 42, padding: compactDesktop ? '8px 12px' : btnPrimary.padding }} onClick={actions.saveSettings}>설정 저장</button>
        <button type='button' style={{ ...btnSoftDanger, minHeight: compactDesktop ? 38 : 40, padding: compactDesktop ? '8px 12px' : btnSoftDanger.padding }} onClick={actions.deleteMyAccount}>회원 탈퇴</button>
      </div>
    </Card>
  );
}
