'use client';

import { Card } from '../common/Card.js';

export function ClubsTab({ ui, values, derived, actions, styles }) {
  const { clubTabIsSplit } = ui;
  const {
    selectedClubId,
    clubNameDraft,
    clubAttendanceEnabled,
    clubStudentQuery,
  } = values;
  const {
    sortedClubs,
    selectedClub,
    selectedClubStudentIdSet,
    filteredClubStudents,
    clubsByStudentId,
  } = derived;
  const {
    setSelectedClubId,
    setClubNameDraft,
    setClubAttendanceEnabled,
    setClubStudentQuery,
    submitClub,
    resetClubForm,
    startEditClub,
    deleteClub,
    toggleClubMember,
  } = actions;
  const {
    clubSplitGrid,
    compactFieldStyle,
    btnPrimary,
    btnSecondary,
    miniBtn,
    miniBtnDanger,
  } = styles;

  return (
    <section style={clubTabIsSplit ? clubSplitGrid : { display: 'grid', gap: 10 }}>
      <Card title='🧩 선택 편성'>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              style={{ ...compactFieldStyle, flex: 1, minWidth: 180 }}
              value={clubNameDraft}
              onChange={(e) => setClubNameDraft(e.target.value)}
              placeholder='선택 과목 이름'
            />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', whiteSpace: 'nowrap' }}>
              <input type='checkbox' checked={clubAttendanceEnabled} onChange={(e) => setClubAttendanceEnabled(e.target.checked)} />
              수업
            </label>
            <button type='button' style={btnPrimary} onClick={submitClub}>추가/저장</button>
            <button type='button' style={btnSecondary} onClick={resetClubForm}>취소</button>
          </div>
          <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.5 }}>
            수업에 체크한 선택 과목은 출석 메모 탭에서 바로 선택할 수 있습니다.
          </div>
          <div style={{ display: 'grid', gap: 6, maxHeight: 500, overflowY: 'auto' }}>
            {sortedClubs.map((club) => {
              const isSelected = String(club.id) === String(selectedClubId);
              return (
                <div key={club.id} style={{ border: `1px solid ${isSelected ? '#93c5fd' : '#e2e8f0'}`, borderRadius: 10, background: isSelected ? '#eff6ff' : '#fff', padding: '8px 10px', display: 'grid', gap: 6 }}>
                  <button type='button' onClick={() => setSelectedClubId(String(club.id))} style={{ border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 14, color: '#0f172a' }}>{club.name}</strong>
                        {club.use_for_attendance ? <span style={{ borderRadius: 999, padding: '3px 8px', fontSize: 12, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8' }}>수업</span> : null}
                      </div>
                      <span style={{ fontSize: 12, color: '#64748b' }}>{(club.student_ids || []).length}명 편성</span>
                    </div>
                  </button>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button type='button' style={miniBtn} onClick={() => startEditClub(club)}>수정</button>
                    <button type='button' style={miniBtnDanger} onClick={() => deleteClub(club)}>삭제</button>
                  </div>
                </div>
              );
            })}
            {sortedClubs.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>등록된 선택 과목이 없습니다.</div>}
          </div>
        </div>
      </Card>

      <Card title={selectedClub ? `👥 ${selectedClub.name} 학생 편성` : '👥 학생 편성'}>
        {!selectedClub ? (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>왼쪽에서 선택 과목을 선택해 주세요.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ borderRadius: 999, padding: '4px 10px', background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 700 }}>{(selectedClub.student_ids || []).length}명 편성</span>
                {selectedClub.use_for_attendance ? <span style={{ borderRadius: 999, padding: '4px 10px', background: '#dbeafe', color: '#1d4ed8', fontSize: 12, fontWeight: 700 }}>출석 메모 연동</span> : null}
              </div>
              <input
                style={{ ...compactFieldStyle, width: 220 }}
                value={clubStudentQuery}
                onChange={(e) => setClubStudentQuery(e.target.value)}
                placeholder='학생 검색'
              />
            </div>
            <div style={{ display: 'grid', gap: 6, maxHeight: 620, overflowY: 'auto', paddingRight: 2 }}>
              {filteredClubStudents.map((student) => {
                const checked = selectedClubStudentIdSet.has(String(student.id));
                const otherClubs = (clubsByStudentId[String(student.id)] || []).filter((club) => String(club.id) !== String(selectedClub.id));
                return (
                  <label key={`club_member_${selectedClub.id}_${student.id}`} style={{ display: 'grid', gridTemplateColumns: '20px minmax(0,1fr)', gap: 8, alignItems: 'start', border: `1px solid ${checked ? '#93c5fd' : '#e2e8f0'}`, background: checked ? '#eff6ff' : '#fff', borderRadius: 10, padding: '8px 10px', cursor: 'pointer' }}>
                    <input type='checkbox' checked={checked} onChange={() => toggleClubMember(selectedClub, student.id)} style={{ marginTop: 3 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ color: '#0f172a' }}>{student.class_name || '-'} · {student.student_no || '-'}번 · {student.name}</strong>
                        {checked ? <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb' }}>편성됨</span> : null}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {otherClubs.map((club) => (
                          <span key={`other_club_${student.id}_${club.id}`} style={{ borderRadius: 999, padding: '2px 6px', fontSize: 10.5, fontWeight: 700, background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}>
                            {club.name}
                          </span>
                        ))}
                        {otherClubs.length === 0 ? <span style={{ color: '#94a3b8', fontSize: 12 }}>다른 선택 과목 없음</span> : null}
                      </div>
                    </div>
                  </label>
                );
              })}
              {filteredClubStudents.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>조건에 맞는 학생이 없습니다.</div>}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
