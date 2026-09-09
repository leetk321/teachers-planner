'use client';

import { Card } from '../common/Card.js';

function QuickCard({ emoji, title, value }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, display: 'grid', gap: 4 }}>
      <div style={{ fontSize: 18 }}>{emoji}</div>
      <div style={{ fontSize: 13, color: '#64748b' }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{value}</div>
    </div>
  );
}

export function DashboardTab({
  quickGridStyle,
  topInfoGridStyle,
  bottomGridStyle,
  dashboardTopCardMinHeight,
  dashboardTopInnerBoxMinHeight,
  dashboardWeatherCompactDesktop,
  activeStudentsCount,
  notesCount,
  unfinishedTodosCount,
  todaysEventsCount,
  homeroomClass,
  activeHomeroomStudentsCount,
  riskStudentCount,
  dashboardLunch,
  schoolName,
  dashboardLunchHasTodayMenu,
  dashboardLunchDisplayMeals,
  dashboardLunchLoading,
  dashboardLunchError,
  upcomingMealDateLabel,
  dashboardWeather,
  dashboardWeatherCurrent,
  dashboardWeatherPreview,
  dashboardWeatherCurrentPrecipitationText,
  dashboardWeatherNote,
  dashboardWeatherLoading,
  dashboardWeatherError,
  weatherInfo,
  formatWeatherHour,
  isFiniteNumberValue,
  dashboardActivityLogs,
  onClearActivityLogs,
  onActivityLogClick,
  dashboardMemos,
  onDashboardMemoClick,
  dashboardUpcomingCounts,
  dashboardUpcomingItems,
  onUpcomingClick,
  formatUpcomingItemDate,
  dashboardTodoCounts,
  dashboardTodoItems,
  onTodoClick,
  formatGoogleTaskDue,
  formatDotDateTime,
  memoDateLabel,
  miniBtnDanger,
}) {
  const lunchSchoolName = String(dashboardLunch?.schoolName || schoolName || '학교 미설정').trim() || '학교 미설정';
  const weatherSchoolName = String(dashboardWeather?.schoolName || schoolName || '학교 미설정').trim() || '학교 미설정';

  return (
    <>
      <section style={quickGridStyle}>
        <QuickCard emoji='👥' title='전체 학생 수' value={`${activeStudentsCount}명`} />
        <QuickCard emoji='📝' title='상담 기록' value={`${notesCount}건`} />
        <QuickCard emoji='📌' title='미완료 할 일' value={`${unfinishedTodosCount}건`} />
        <QuickCard emoji='🗓️' title='오늘의 일정' value={`${todaysEventsCount}건`} />
        <QuickCard emoji='🏫' title='담임반' value={`${homeroomClass || '-'} · ${activeHomeroomStudentsCount}명`} />
        <QuickCard emoji='🟡' title='관심/집중' value={`${riskStudentCount}명`} />
      </section>

      <section style={topInfoGridStyle}>
        <Card title='🍽️ 오늘 급식' titleStyle={{ margin: 0, marginBottom: 5 }} style={{ marginBottom: 0, display: 'grid', gap: 5, overflow: 'hidden', minHeight: dashboardTopCardMinHeight }}>
          <div style={{ display: 'grid', gap: 5, minWidth: 0, alignContent: 'start' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{lunchSchoolName}</span>
                {!!dashboardLunch?.officeName && <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{dashboardLunch.officeName}</span>}
                {dashboardLunchHasTodayMenu && dashboardLunchDisplayMeals.length <= 1 && !!dashboardLunch?.mealDate && <span style={{ fontSize: 11, color: '#64748b' }}>{dashboardLunch.mealDate}</span>}
                {dashboardLunchHasTodayMenu && dashboardLunchDisplayMeals.length <= 1 && !!dashboardLunch?.mealType && (
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                    {dashboardLunch.mealType}
                  </span>
                )}
              </div>
              {dashboardLunchHasTodayMenu && dashboardLunchDisplayMeals.length <= 1 && !!dashboardLunch?.calories && (
                <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                  {dashboardLunch.calories}
                </span>
              )}
            </div>
            {dashboardLunchLoading ? (
              <div style={{ color: '#64748b', fontSize: 13 }}>오늘 급식 정보를 불러오는 중입니다.</div>
            ) : dashboardLunchError ? (
              <div style={{ color: '#b91c1c', fontSize: 13 }}>{dashboardLunchError}</div>
            ) : dashboardLunchDisplayMeals.length ? (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', padding: '8px 10px', display: 'grid', gap: 0, minHeight: dashboardTopInnerBoxMinHeight, height: dashboardTopInnerBoxMinHeight, alignContent: 'stretch', gridTemplateRows: `repeat(${dashboardLunchDisplayMeals.length || 1}, minmax(0, 1fr))` }}>
                {dashboardLunchDisplayMeals.map((meal, idx) => {
                  const mealText = Array.isArray(meal?.dishes) ? meal.dishes.join(' · ') : '';
                  return (
                    <div key={`${meal?.mealDate || 'meal'}_${idx}`} style={{ display: 'grid', gridTemplateColumns: '58px minmax(0, 1fr)', gap: 2, alignItems: 'center', minHeight: 0, padding: '3px 0', borderTop: idx ? '1px solid #e2e8f0' : 'none' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8', whiteSpace: 'nowrap', lineHeight: 1.5 }}>{upcomingMealDateLabel(meal?.mealDate)}</span>
                      <span title={mealText || '급식 정보 없음'} style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mealText || '급식 정보 없음'}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: '#64748b', fontSize: 13 }}>{dashboardLunch?.message || '오늘 급식 정보가 없습니다.'}</div>
            )}
          </div>
        </Card>

        <Card title='🌤️ 오늘 날씨' titleStyle={{ margin: 0, marginBottom: 5 }} style={{ marginBottom: 0, display: 'grid', gap: 5, overflow: 'hidden', minHeight: dashboardTopCardMinHeight }}>
          <div style={{ display: 'grid', gap: 5, minWidth: 0, alignContent: 'start' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{weatherSchoolName}</span>
                {!!dashboardWeather?.locationName && <span style={{ fontSize: 11, color: '#64748b' }}>{dashboardWeather.locationName}</span>}
                {dashboardWeather?.forecastSource === 'ultra' && (
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74' }}>
                    초단기예보
                  </span>
                )}
              </div>
              {!!dashboardWeatherCurrent?.time && <span style={{ fontSize: 11, color: '#64748b' }}>{formatWeatherHour(dashboardWeatherCurrent.time)} 기준</span>}
            </div>
            {dashboardWeatherLoading ? (
              <div style={{ color: '#64748b', fontSize: 13 }}>오늘 날씨를 불러오는 중입니다.</div>
            ) : dashboardWeatherError ? (
              <div style={{ color: '#b91c1c', fontSize: 13 }}>{dashboardWeatherError}</div>
            ) : dashboardWeather?.status === 'ok' && dashboardWeatherCurrent ? (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', padding: '8px 10px 4px', display: 'grid', gap: 4, minWidth: 0, minHeight: dashboardTopInnerBoxMinHeight, height: dashboardTopInnerBoxMinHeight, alignContent: 'start' }}>
                <div style={dashboardWeatherCompactDesktop ? { display: 'grid', gridTemplateColumns: 'minmax(210px, auto) minmax(0, 1fr)', gap: 10, alignItems: 'center', minWidth: 0 } : { display: 'grid', gap: 8, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 24, lineHeight: 1 }}>{weatherInfo(dashboardWeatherCurrent.weatherCode).emoji}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: dashboardWeatherCompactDesktop ? 21 : 22, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{isFiniteNumberValue(dashboardWeatherCurrent.temperature) ? `${dashboardWeatherCurrent.temperature.toFixed(1)}℃` : '-'}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{weatherInfo(dashboardWeatherCurrent.weatherCode).label}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'normal', lineHeight: 1.4 }}>
                        습도 {isFiniteNumberValue(dashboardWeatherCurrent.humidity) ? `${dashboardWeatherCurrent.humidity.toFixed(0)}%` : '-'} · 강수 {dashboardWeatherCurrentPrecipitationText} · 바람 {isFiniteNumberValue(dashboardWeatherCurrent.windSpeed) ? `${dashboardWeatherCurrent.windSpeed.toFixed(1)}km/h` : '-'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 0, minWidth: 0 }}>
                    {dashboardWeatherPreview.map((item, idx) => (
                      <div key={`${item.time || 'weather'}_${idx}`} style={{ minWidth: dashboardWeatherCompactDesktop ? 74 : 76, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', padding: dashboardWeatherCompactDesktop ? '5px 7px' : '6px 7px', display: 'grid', gap: 1, textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#334155' }}>{formatWeatherHour(item.time)}</div>
                        <div style={{ fontSize: dashboardWeatherCompactDesktop ? 15 : 16, lineHeight: 1 }}>{weatherInfo(item.weatherCode).emoji}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>{isFiniteNumberValue(item.temperature) ? `${item.temperature.toFixed(1)}℃` : '-'}</div>
                        <div style={{ fontSize: 9, color: '#64748b', whiteSpace: 'nowrap' }}>
                          {String(item.precipitationAmount || '').trim() && String(item.precipitationAmount || '').trim() !== '강수없음'
                            ? `강수 ${String(item.precipitationAmount || '').trim()}`
                            : isFiniteNumberValue(item.humidity)
                              ? `습도 ${item.humidity.toFixed(0)}%`
                              : isFiniteNumberValue(item.windSpeed)
                                ? `바람 ${item.windSpeed.toFixed(0)}m/s`
                                : '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {!!dashboardWeatherNote && <div style={{ fontSize: 11, color: '#92400e', lineHeight: 1.45 }}>{dashboardWeatherNote}</div>}
              </div>
            ) : (
              <div style={{ color: '#64748b', fontSize: 13 }}>{dashboardWeather?.message || '날씨 정보가 없습니다.'}</div>
            )}
          </div>
        </Card>
      </section>

      <section style={bottomGridStyle}>
        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 12, boxShadow: '0 4px 14px rgba(15,23,42,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>🧾 최근 기록</h2>
            <button type='button' style={{ ...miniBtnDanger, marginLeft: 0, padding: '5px 12px', fontSize: 12, minHeight: 32, lineHeight: 1.2 }} onClick={onClearActivityLogs}>전체 삭제</button>
          </div>
          <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto', paddingRight: 2, paddingTop: 5 }}>
            {dashboardActivityLogs.map((log) => {
              const danger = String(log.category || '').includes('삭제');
              return (
                <div key={log.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, background: '#fff', cursor: 'pointer' }} onClick={() => onActivityLogClick(log)}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 9px', background: danger ? '#fee2e2' : '#eff6ff', color: danger ? '#b91c1c' : '#1d4ed8' }}>{log.category || '기록'}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(log.at).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: 14, color: '#0f172a', lineHeight: 1.45 }}>{log.text}</div>
                </div>
              );
            })}
            {dashboardActivityLogs.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13, lineHeight: '20px', minHeight: 20, display: 'flex', alignItems: 'center', marginTop: 6 }}>해당 학년의 최근 기록이 없습니다.</div>}
          </div>
        </section>

        <Card title='📝 주요 메모'>
          <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto', overflowX: 'hidden', paddingRight: 2 }}>
            {dashboardMemos.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 13 }}>표시할 메모가 없습니다.</div> : dashboardMemos.map((memo) => (
              <div key={memo.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, background: '#fff', cursor: 'pointer' }} onClick={() => onDashboardMemoClick(memo)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{memoDateLabel(memo.memo_date)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: memo.dashboardKind === 'announcement' ? '#eff6ff' : '#f8fafc', color: memo.dashboardKind === 'announcement' ? '#1d4ed8' : '#475569', border: `1px solid ${memo.dashboardKind === 'announcement' ? '#bfdbfe' : '#e2e8f0'}` }}>
                    {memo.dashboardKind === 'announcement' ? '전달사항' : '메모'}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{String(memo.title || '').trim() || '(제목 없음)'}</div>
                <div style={{ fontSize: 13, color: '#0f172a', whiteSpace: 'pre-wrap' }}>{String(memo.content || '').slice(0, 120) || '(내용 없음)'}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title='📅 다가오는 일정'>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>교무수첩 일정 {dashboardUpcomingCounts.localEvent}건</span>
            <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: '#ede9fe', color: '#6d28d9', border: '1px solid #ddd6fe' }}>Google 일정 {dashboardUpcomingCounts.googleCalendar}건</span>
          </div>
          <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto', paddingRight: 2, paddingTop: 5 }}>
            {dashboardUpcomingItems.map((item) => (
              <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, background: '#fff', cursor: 'pointer' }} onClick={() => onUpcomingClick(item)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: item.source.includes('google') ? '#ede9fe' : '#eff6ff', color: item.source.includes('google') ? '#6d28d9' : '#1d4ed8' }}>
                    {item.source === 'google_calendar' ? 'Google 캘린더' : item.source === 'google_task' ? 'Google 할 일' : '교무수첩'}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{item.title}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{formatUpcomingItemDate(item)}</div>
              </div>
            ))}
            {dashboardUpcomingItems.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>다가오는 일정이 없습니다.</div>}
          </div>
        </Card>

        <Card title='✅ 미완료 할 일'>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>교무수첩 할 일 {dashboardTodoCounts.localTodo}건</span>
            <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: '#ede9fe', color: '#6d28d9', border: '1px solid #ddd6fe' }}>Google 할 일 {dashboardTodoCounts.googleTask}건</span>
          </div>
          <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto', overflowX: 'hidden', paddingRight: 2 }}>
            {dashboardTodoItems.map((item) => (
              <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, background: '#fff', cursor: 'pointer' }} onClick={() => onTodoClick(item)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', background: item.source.includes('google') ? '#ede9fe' : '#eff6ff', color: item.source.includes('google') ? '#6d28d9' : '#1d4ed8' }}>
                    {item.source === 'google_task' ? 'Google 할 일' : '교무수첩'}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{item.title}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{item.source === 'google_task' ? (formatGoogleTaskDue(item.dueAt) || '일시 미지정') : (formatDotDateTime(item.dueAt) || '일시 미지정')}</div>
              </div>
            ))}
            {dashboardTodoItems.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13, lineHeight: '20px', minHeight: 20, display: 'flex', alignItems: 'center' }}>미완료 할 일이 없습니다.</div>}
          </div>
        </Card>
      </section>
    </>
  );
}
