'use client';

import { AttachmentLinks, AttachmentPicker } from '../common/AttachmentPicker.js';
import { AuthenticatedImage } from '../common/AuthenticatedImage.js';
import { StudentHistoryPanel } from '../students/StudentHistoryPanel.js';
import { toSeoulYmd } from '../../lib/date-time.js';

export function StudentsTab({
  addStudent,
  allClasses,
  apiFetch,
  btnPrimary,
  btnSecondary,
  bulkText,
  bulkUploadStudentPhotos,
  Card,
  className,
  clearStudentBasicSurvey,
  clearStudentField,
  clearStudentTransferred,
  confirmDeleteStudent,
  cycleSelectedStudentRisk,
  DateField,
  deleteNote,
  deleteStudent,
  deleteStudentPhoto,
  detailActionBtn,
  detailActionDangerBtn,
  detailClassName,
  detailName,
  detailRiskLevel,
  detailStudentNo,
  isEditingIssueConsultation,
  editingNoteId,
  editingStudentId,
  editNote,
  expandedNotes,
  exportStudentDetailPdf,
  fmtYmd,
  formatNoteDateTime,
  formRow,
  guardianPhone,
  importStudentsBulk,
  inputStyle,
  isMobile,
  markStudentTransferred,
  miniBtn,
  miniBtnDanger,
  noteCategory,
  noteCategoryMeta,
  noteCategoryOpen,
  noteContent,
  noteAttachments,
  onPickStudentPhoto,
  openAttachment,
  pdfSelectedIds,
  riskBadge,
  riskLevel,
  riskLevelOpen,
  saveEditStudent,
  saveNote,
  saveStudentBasicSurvey,
  saveStudentContactsAndInfo,
  selectedClassCount,
  selectedStudent,
  selectedStudentClubs,
  selectedStudentId,
  selectedStudentNotes,
  setBulkText,
  setClassName,
  setConfirmDeleteStudent,
  setDetailClassName,
  setDetailName,
  setDetailRiskLevel,
  setDetailStudentNo,
  setEditingStudentId,
  setExpandedNotes,
  setGuardianPhone,
  setNoteCategory,
  setNoteCategoryOpen,
  setNoteContent,
  setNoteAttachments,
  setPdfSelectedIds,
  uploadAttachments,
  setRiskLevel,
  setRiskLevelOpen,
  setSelectedStudentId,
  setShowTransferredStudents,
  setStudentBasicInfo,
  setStudentBasicMemoEditMode,
  setStudentBasicSurvey,
  setStudentBirthDate,
  setStudentClassFilter,
  setStudentClassFilterOpen,
  setStudentGender,
  setStudentInfoEditMode,
  setStudentManagePanelOpen,
  setStudentName,
  setStudentNameQuery,
  setStudentNo,
  setStudentNoteQuery,
  setStudentPhone,
  setTransferDateInput,
  showTransferredStudents,
  sortedFilteredStudents,
  startEditStudent,
  studentBasicInfo,
  studentBasicMemoEditMode,
  studentBasicSurvey,
  studentBasicSurveyPdfId,
  studentBirthDate,
  studentClassFilter,
  studentClassFilterOpen,
  studentGender,
  studentInfoEditMode,
  studentManagePanelOpen,
  studentName,
  studentNameQuery,
  studentNo,
  studentNoteMatchedStudents,
  studentNoteQuery,
  studentPhone,
  studentPhotos,
  studentNoteDraft,
  studentSplitGrid,
  tabBtn,
  transferDateInput,
  ttTable,
  ttTd,
  ttTh,
  twoColGrid,
}) {
  return (
<section style={isMobile ? twoColGrid : { ...studentSplitGrid, alignItems: 'stretch' }}>
        <div style={{ display: 'grid', gap: 12, gridTemplateRows: 'auto 1fr', minHeight: '100%', height: '100%' }}>
        <Card style={{ marginBottom: 0 }} title={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><span>👥 학생 관리</span><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input style={{ ...inputStyle, width: 150, minHeight: 38, height: 38, padding: '4px 8px', fontSize: 12, boxSizing: 'border-box' }} value={studentNameQuery} onChange={(e) => setStudentNameQuery(e.target.value)} placeholder='이름으로 검색' /><div data-inline-select-root='1' style={{ position: 'relative', width: 120 }}><button type='button' style={{ ...inputStyle, width: '100%', minHeight: 38, height: 38, padding: '4px 8px', fontSize: 12, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', boxSizing: 'border-box' }} onClick={() => setStudentClassFilterOpen((v) => !v)}><span>{studentClassFilter === 'all' ? '전체 학급' : studentClassFilter}</span><span style={{ color: '#64748b', fontSize: 11 }}>▾</span></button>{studentClassFilterOpen && (<div style={{ position: 'absolute', top: 'calc(100% - 1px)', left: 0, width: '100%', zIndex: 40, border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', boxShadow: '0 10px 20px rgba(15,23,42,0.12)', maxHeight: 260, overflowY: 'auto' }}>{[{ value: 'all', label: '전체 학급' }, ...allClasses.map((c) => ({ value: c, label: c }))].map((opt) => (<button key={opt.value} type='button' style={{ width: '100%', border: 'none', borderTop: '1px solid #e2e8f0', background: opt.value === studentClassFilter ? '#eff6ff' : '#fff', color: '#0f172a', textAlign: 'left', padding: '8px 9px', fontSize: 12, cursor: 'pointer' }} onClick={() => { setStudentClassFilter(opt.value); setStudentClassFilterOpen(false); }}>{opt.label}</button>))}</div>)}</div></div></div>}>
          <div style={{ border: '1px solid #fecaca', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
            <button type='button' style={{ width: '100%', border: 'none', background: '#fef2f2', color: '#991b1b', textAlign: 'left', padding: '10px 12px', fontWeight: 700, cursor: 'pointer' }} onClick={() => setStudentManagePanelOpen((v) => !v)}>
              학생 추가 / 사진 추가 {studentManagePanelOpen ? '접기 ▲' : '펼치기 ▼'}
            </button>
            {studentManagePanelOpen && (
              <div style={{ padding: 10, background: '#fff' }}>
                <form onSubmit={addStudent} style={{ display: 'grid', gridTemplateColumns: '74px 62px 128px 78px 56px', gap: 6, marginBottom: 10, alignItems: 'center' }}>
            <input style={{ ...inputStyle, minHeight: 32, padding: '5px 7px', fontSize: 13 }} value={className} onChange={(e) => setClassName(e.target.value)} placeholder='학급' />
            <input style={{ ...inputStyle, minHeight: 32, padding: '5px 7px', fontSize: 13 }} value={studentNo} onChange={(e) => setStudentNo(e.target.value)} placeholder='번호' />
            <input style={{ ...inputStyle, minHeight: 32, padding: '5px 7px', fontSize: 13 }} value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder='이름' required />
            <div data-inline-select-root='1' style={{ position: 'relative' }}>
              <button type='button' style={{ ...inputStyle, minHeight: 32, height: 32, padding: '5px 7px', fontSize: 13, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff' }} onClick={() => setRiskLevelOpen((v) => !v)}>
                <span>{riskBadge(riskLevel).label}</span><span style={{ color: '#64748b', fontSize: 11 }}>▾</span>
              </button>
              {riskLevelOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, width: '100%', zIndex: 40, border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', boxShadow: '0 10px 20px rgba(15,23,42,0.12)', overflow: 'hidden' }}>
                  {[
                    { value: 'normal', label: '일반' },
                    { value: 'watch', label: '관심' },
                    { value: 'focus', label: '집중' },
                  ].map((opt) => (
                    <button key={opt.value} type='button' style={{ width: '100%', border: 'none', borderTop: '1px solid #e2e8f0', background: opt.value === riskLevel ? '#eff6ff' : '#fff', color: '#0f172a', textAlign: 'left', padding: '7px 8px', fontSize: 13, cursor: 'pointer' }} onClick={() => { setRiskLevel(opt.value); setRiskLevelOpen(false); }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button style={{ ...btnPrimary, minHeight: 32, padding: 0, fontSize: 13 }}>추가</button>
          </form>
          <div style={{ marginBottom: 10 }}>
            <p style={{ margin: '6px 0', color: '#475569', fontSize: 13 }}>일괄 추가 형식: 학급, 번호, 이름, 성별, 학생 전화, 보호자 전화, 생년월일</p>
            <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={'1-1, 1, 한진주, 여, 010-1234-5678, 010-2345-6789, 2007. 1. 1.\n1-1, 2, 이민정, 여, , 010-1111-2222 (학생 전화 생략)\n1-1, 4, 권형준, 남 (이후 항목 생략)'} style={{ width: '100%', minHeight: 86, borderRadius: 8, border: '1px solid #cbd5e1', padding: 10, boxSizing: 'border-box', resize: 'vertical' }} />
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type='button' style={{ ...btnSecondary, minHeight: 42 }} onClick={importStudentsBulk}>학생 일괄 추가</button>
              <label style={{ ...btnSecondary, minHeight: 42, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', boxSizing: 'border-box' }}>
                사진 일괄 추가
                <input
                  type='file'
                  accept='image/*'
                  multiple
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    await bulkUploadStudentPhotos(e.target.files || []);
                    e.target.value = '';
                  }}
                />
              </label>
              <span style={{ fontSize: 12, color: '#64748b' }}>파일명 규칙 예: 10505.jpg</span>
            </div>
          </div>
              </div>
            )}
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              {studentClassFilter !== 'all' && (
                <span style={{ display: 'inline-block', background: '#dbeafe', color: '#1d4ed8', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                  {studentClassFilter} · {selectedClassCount}명
                </span>
              )}
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#334155' }}>
              <input type='checkbox' checked={showTransferredStudents} onChange={(e) => setShowTransferredStudents(e.target.checked)} />
              전출 표시
            </label>
          </div>
          {studentClassFilter === 'all' && !String(studentNameQuery || '').trim() ? (
            <div style={{ marginTop: 14, padding: '10px 12px', border: '1px dashed #cbd5e1', borderRadius: 8, color: '#64748b', fontSize: 13 }}>
              학급을 선택하면 해당 반 학생 목록이 표시됩니다.
            </div>
          ) : (
            <div style={{ marginTop: 14, border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', maxHeight: 248, overflowY: 'auto' }}>
              <table style={{ ...ttTable, margin: 0 }}>
                <thead>
                  <tr>
                    <th style={ttTh}>학급</th>
                    <th style={ttTh}>번호</th>
                    <th style={ttTh}>이름</th>
                    <th style={ttTh}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFilteredStudents.map((s) => {
                    const b = riskBadge(s.risk_level);
                    return (
                      <tr key={s.id} onClick={() => setSelectedStudentId(String(s.id))} style={{ ...(String(s.id) === String(selectedStudentId) ? { background: '#eff6ff' } : null), cursor: 'pointer' }}>
                        <td style={ttTd}>{s.class_name || '-'}</td>
                        <td style={ttTd}>{s.student_no || '-'}</td>
                        <td style={{ ...ttTd, fontWeight: 700, color: '#1e3a8a' }}>{s.name}</td>
                        <td style={ttTd}><span style={{ background: b.bg, color: b.color, borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>{b.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {String(studentNoteQuery || '').trim() && (
            <div style={{ marginTop: 12, borderTop: '1px dashed #cbd5e1', paddingTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6 }}>상담 내용 검색 결과 ({studentNoteMatchedStudents.length}명)</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {studentNoteMatchedStudents.map((s) => (
                  <button key={`note_match_${s.id}`} type='button' style={{ ...tabBtn, textAlign: 'left' }} onClick={() => { setSelectedStudentId(String(s.id)); setStudentClassFilter(String(s.class_name || 'all')); }}>
                    {s.class_name || '-'} · {s.student_no || '-'}번 · {s.name}
                  </button>
                ))}
                {studentNoteMatchedStudents.length === 0 && <div style={{ color: '#94a3b8', fontSize: 12 }}>일치하는 상담 내용이 없습니다.</div>}
              </div>
            </div>
          )}
        </Card>

        {!!selectedStudent && <Card style={{ marginBottom: 0, display: 'flex', flexDirection: 'column' }} title={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><span>📝 학생 기초조사</span><div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#475569' }}><input type="checkbox" checked={pdfSelectedIds.has(studentBasicSurveyPdfId)} onChange={(e) => { const next = new Set(pdfSelectedIds); if (e.target.checked) next.add(studentBasicSurveyPdfId); else next.delete(studentBasicSurveyPdfId); setPdfSelectedIds(next); }} style={{ margin: 0 }} /> PDF</label>{!studentBasicMemoEditMode && <button type='button' style={miniBtn} onClick={() => setStudentBasicMemoEditMode(true)}>수정</button>}</div></div>}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {studentBasicMemoEditMode ? (
            <>
              <textarea style={{ ...inputStyle, minWidth: 0, width: '100%', boxSizing: 'border-box', minHeight: 78, resize: 'vertical' }} value={studentBasicSurvey} onChange={(e) => setStudentBasicSurvey(e.target.value)} placeholder='학생 기초조사 내용을 입력하세요.' />
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type='button' style={miniBtn} onClick={saveStudentBasicSurvey}>저장</button>
                <button type='button' style={miniBtnDanger} onClick={clearStudentBasicSurvey}>삭제</button>
                <button type='button' style={miniBtn} onClick={() => { setStudentBasicSurvey(String(selectedStudent?.basic_survey || '')); setStudentBasicMemoEditMode(false); }}>취소</button>
              </div>
            </>
          ) : (
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, color: '#334155', lineHeight: 1.6, minHeight: 36, paddingLeft: 4 }}>
              {String(selectedStudent.basic_survey || '').trim() || '등록된 내용이 없습니다.'}
            </div>
          )}
          </div>
        </Card>}
        </div>

        <Card style={{ marginBottom: 0, display: 'flex', flexDirection: 'column' }} title={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><span>🧾 학생 상세정보 / 상담기록</span><div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input style={{ ...inputStyle, width: 226, minHeight: 26, height: 26, padding: '2px 8px', fontSize: 12 }} value={studentNoteQuery} onChange={(e) => setStudentNoteQuery(e.target.value)} placeholder='상담 내용 검색' /></div></div>}>
          {!selectedStudent ? <p>왼쪽에서 학생을 선택하세요.</p> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '84px minmax(180px, 1fr) auto', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                <div style={{ width: 84, height: 84, borderRadius: 12, overflow: 'hidden', border: '1px solid #cbd5e1', background: '#f1f5f9', display: 'grid', placeItems: 'center' }}>
                  {studentPhotos[String(selectedStudent.id)]?.url
                    ? <AuthenticatedImage src={studentPhotos[String(selectedStudent.id)].url} alt='학생 사진' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 26, color: '#475569' }}>{String(selectedStudent.name || '?').slice(0, 1)}</span>}
                </div>
                <div>
                  <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}><b>{selectedStudent.class_name || '-'}</b> · {selectedStudent.name} / {selectedStudent.student_no || '-'} <button type='button' style={{ ...miniBtn, marginLeft: 2 }} onClick={exportStudentDetailPdf}>PDF</button></p>
                  {(() => { const b = riskBadge(selectedStudent.risk_level); return <button type='button' onClick={cycleSelectedStudentRisk} style={{ display: 'inline-block', margin: '4px 0', background: b.bg, color: b.color, borderRadius: 999, padding: '2px 8px', fontSize: 12, border: 'none', cursor: 'pointer' }} title='클릭하여 상태 변경'>{b.label}</button>; })()}
<p style={{ margin: '4px 0', color: '#64748b', fontSize: 12 }}>사진 업데이트: {studentPhotos[String(selectedStudent.id)]?.updatedAt ? new Date(studentPhotos[String(selectedStudent.id)].updatedAt).toLocaleString() : '없음'}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {selectedStudentClubs.length
                      ? selectedStudentClubs.map((club) => (
                        <span key={`student_club_badge_${club.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700, background: club.use_for_attendance ? '#dbeafe' : '#eef2ff', color: club.use_for_attendance ? '#1d4ed8' : '#4338ca', border: `1px solid ${club.use_for_attendance ? '#93c5fd' : '#c7d2fe'}` }}>
                          {club.name}
                        </span>
                      ))
                      : <span style={{ color: '#94a3b8', fontSize: 12 }}>선택 편성 없음</span>}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 92px)', gap: 5, justifyContent: 'start', paddingRight: 8 }}>
                  <label style={{ ...detailActionBtn, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    사진 변경
                    <input type='file' accept='image/*' style={{ display: 'none' }} onChange={(e) => onPickStudentPhoto(selectedStudent.id, e.target.files?.[0])} />
                  </label>
                  <button type='button' style={detailActionDangerBtn} onClick={() => deleteStudentPhoto(selectedStudent.id)}>사진 삭제</button>
                  {!confirmDeleteStudent ? (
                    <button type='button' style={detailActionBtn} onClick={startEditStudent}>정보 수정</button>
                  ) : (
                    <button type='button' style={detailActionBtn} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteStudent(false); }}>취소</button>
                  )}
                  {!confirmDeleteStudent ? (
                    <button type='button' style={detailActionDangerBtn} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteStudent(true); }}>학생 삭제</button>
                  ) : (
                    <button type='button' style={detailActionDangerBtn} onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteStudent(); }}>삭제 확인</button>
                  )}
                </div>
              </div>

              {!!selectedStudent?.transferred_at && (
                <div style={{ border: '1px solid #ef4444', background: '#fee2e2', color: '#7f1d1d', borderRadius: 12, padding: '10px 12px', marginBottom: 10, fontWeight: 800 }}>
                  {`${String(selectedStudent?.transferred_at || '').slice(0, 10).replace(/-/g, '.')}. 전출 처리된 학생입니다.`}
                </div>
              )}

              {editingStudentId && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, marginBottom: 10, background: '#f8fafc' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>학생 정보 수정</div>
                  <div style={formRow}>
                    <input style={inputStyle} value={detailName} onChange={(e) => setDetailName(e.target.value)} placeholder='이름' />
                    <input style={inputStyle} value={detailClassName} onChange={(e) => setDetailClassName(e.target.value)} placeholder='반' />
                    <input style={inputStyle} value={detailStudentNo} onChange={(e) => setDetailStudentNo(e.target.value)} placeholder='번호' />
                    <select style={inputStyle} value={detailRiskLevel} onChange={(e) => setDetailRiskLevel(e.target.value)}>
                      <option value='normal'>일반</option>
                      <option value='watch'>관심</option>
                      <option value='focus'>집중</option>
                    </select>
                    <button type='button' style={btnPrimary} onClick={saveEditStudent}>저장</button>
                    <button type='button' style={btnSecondary} onClick={() => setEditingStudentId(null)}>취소</button>
                  </div>
                </div>
              )}

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, marginBottom: 10, background: '#f8fafc' }}>
                {!studentInfoEditMode ? (
                  <div style={{ display: 'grid', fontSize: 15, gridTemplateColumns: 'minmax(0,1fr) 44px', columnGap: 4, alignItems: 'stretch' }}>
                    <div style={{ minWidth: 0, display: 'grid', rowGap: 6 }}>
                      <div style={{ minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', columnGap: 14 }}>
                        <div style={{ minWidth: 0, display: 'grid', gridTemplateColumns: '74px minmax(0,1fr)', columnGap: 4 }}><b style={{ whiteSpace: 'nowrap' }}>학생 전화:</b><span>{String(selectedStudent?.student_phone || '').trim() ? String(selectedStudent?.student_phone || '') : <span style={{ color: '#94a3b8' }}>입력된 내용 없음</span>}</span></div>
                        <div style={{ minWidth: 0, display: 'grid', gridTemplateColumns: '108px minmax(0,1fr)', columnGap: 4 }}><b style={{ whiteSpace: 'nowrap' }}>성별/생년월일:</b><span>{String(selectedStudent?.gender || studentGender || '').trim() || '-'} / {fmtYmd(String(selectedStudent?.birth_date || studentBirthDate || '').slice(0, 10)) || '-'}</span></div>
                      </div>
                      <div style={{ minWidth: 0, display: 'grid', gridTemplateColumns: '74px minmax(0,1fr)', columnGap: 4 }}>
                        <b style={{ whiteSpace: 'nowrap' }}>{'보호자 전화:\u00A0\u00A0'}</b>
                        <div style={{ paddingLeft: 14 }}>{String(selectedStudent?.guardian_phone || '').trim() ? String(selectedStudent?.guardian_phone || '') : <span style={{ color: '#94a3b8' }}>입력된 내용 없음</span>}</div>
                      </div>
                      <div style={{ minWidth: 0, display: 'grid', gridTemplateColumns: '56px minmax(0,1fr)', columnGap: 2 }}>
                        <b style={{ whiteSpace: 'nowrap' }}>메모:</b>
                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{String(selectedStudent?.basic_info || '').trim() ? String(selectedStudent?.basic_info || '') : <span style={{ color: '#94a3b8' }}>입력된 내용 없음</span>}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <button type='button' style={{ ...miniBtn, marginLeft: 0, whiteSpace: 'nowrap', width: 44, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }} onClick={() => setStudentInfoEditMode(true)}>수정</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <DateField value={transferDateInput} onChange={setTransferDateInput} compact />
                        {!!selectedStudent?.transferred_at
                          ? <button type='button' style={{ ...miniBtnDanger, marginLeft: 0, whiteSpace: 'nowrap' }} onClick={clearStudentTransferred}>전출 취소</button>
                          : <button type='button' style={{ ...miniBtnDanger, marginLeft: 0, whiteSpace: 'nowrap' }} onClick={markStudentTransferred}>전출</button>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button type='button' style={{ ...miniBtn, marginLeft: 0, whiteSpace: 'nowrap' }} onClick={saveStudentContactsAndInfo}>저장</button>
                        <button type='button' style={{ ...miniBtnDanger, marginLeft: 0, whiteSpace: 'nowrap' }} onClick={() => { setStudentPhone(String(selectedStudent?.student_phone || '')); setGuardianPhone(String(selectedStudent?.guardian_phone || '')); setStudentGender(String(selectedStudent?.gender || '')); setStudentBirthDate(String(selectedStudent?.birth_date || '').slice(0, 10)); setStudentBasicInfo(String(selectedStudent?.basic_info || '')); setTransferDateInput(String(selectedStudent?.transferred_at || '').slice(0, 10) || toSeoulYmd()); setStudentInfoEditMode(false); }}>취소</button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 86px 1fr 86px', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                      <input style={{ ...inputStyle, minHeight: 36, height: 36, boxSizing: 'border-box' }} value={studentPhone} onChange={(e) => setStudentPhone(e.target.value)} placeholder='학생 전화번호' />
                      <button type='button' style={{ ...btnSecondary, minHeight: 36, height: 36, whiteSpace: 'nowrap', padding: '6px 8px' }} onClick={() => clearStudentField('studentPhone')}>지우기</button>
                      <select style={{ ...inputStyle, minHeight: 36, height: 36, boxSizing: 'border-box' }} value={studentGender} onChange={(e) => setStudentGender(e.target.value)}>
                        <option value=''>성별</option>
                        <option value='남'>남</option>
                        <option value='여'>여</option>
                      </select>
                      <button type='button' style={{ ...btnSecondary, minHeight: 36, height: 36, whiteSpace: 'nowrap', padding: '6px 8px' }} onClick={() => clearStudentField('gender')}>지우기</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 86px 1fr 86px', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                      <input style={{ ...inputStyle, minHeight: 36, height: 36, boxSizing: 'border-box' }} value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} placeholder='보호자 전화번호' />
                      <button type='button' style={{ ...btnSecondary, minHeight: 36, height: 36, whiteSpace: 'nowrap', padding: '6px 8px' }} onClick={() => clearStudentField('guardianPhone')}>지우기</button>
                      <input type='date' style={{ ...inputStyle, minHeight: 36, height: 36, boxSizing: 'border-box' }} value={studentBirthDate} onChange={(e) => setStudentBirthDate(e.target.value)} />
                      <button type='button' style={{ ...btnSecondary, minHeight: 36, height: 36, whiteSpace: 'nowrap', padding: '6px 8px' }} onClick={() => clearStudentField('birthDate')}>지우기</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 86px', gap: 6, alignItems: 'start' }}>
                      <textarea style={{ ...inputStyle, minWidth: 0, width: '100%', boxSizing: 'border-box', minHeight: 64, resize: 'vertical' }} value={studentBasicInfo} onChange={(e) => setStudentBasicInfo(e.target.value)} placeholder='기본 사항 (알레르기, 특이사항, 가정연계 메모 등)' />
                      <button type='button' style={{ ...btnSecondary, minHeight: 36, height: 36, whiteSpace: 'nowrap', padding: '6px 8px' }} onClick={() => clearStudentField('basicInfo')}>지우기</button>
                    </div>
                  </>
                )}
              </div>

              <div style={{ marginBottom: 10 }}>
                <StudentHistoryPanel
                  studentId={selectedStudentId}
                  apiFetch={apiFetch}
                  miniBtn={miniBtn}
                  recordsRevision={selectedStudentNotes}
                  studentRevision={selectedStudent}
                />
              </div>

              <form onSubmit={saveNote} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 10, alignItems: 'end' }}>
                <textarea style={{ ...inputStyle, gridColumn: '1 / span 2', minHeight: 128, resize: 'vertical' }} value={noteContent} onChange={(e) => setNoteContent(e.target.value)} placeholder='상담/관찰 내용을 자세히 입력하세요' required />
                {!isEditingIssueConsultation && <div style={{ gridColumn: '1 / span 2' }}>
                  <AttachmentPicker
                    attachments={noteAttachments}
                    setAttachments={setNoteAttachments}
                    onUpload={uploadAttachments}
                    onOpen={openAttachment}
                    btnSecondary={btnSecondary}
                  />
                </div>}
                {studentNoteDraft?.label && (
                  <div style={{ gridColumn: '1 / span 2', display: 'flex', alignItems: 'center', gap: 7, minHeight: 20, flexWrap: 'wrap', fontSize: 11, color: studentNoteDraft.status === 'error' ? '#b91c1c' : '#64748b' }}>
                    <span>{studentNoteDraft.label}</span>
                    {studentNoteDraft.recovered && <button type='button' onClick={studentNoteDraft.discard} style={{ border: 0, background: 'transparent', padding: 0, color: '#b91c1c', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>복구한 초안 버리기</button>}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isEditingIssueConsultation ? (
                    <span style={{ minHeight: 42, display: 'inline-flex', alignItems: 'center', borderRadius: 8, padding: '0 12px', fontSize: 13, fontWeight: 800, background: noteCategoryMeta(noteCategory).bg, color: noteCategoryMeta(noteCategory).color }}>
                      {noteCategoryMeta(noteCategory).label}
                    </span>
                  ) : <div data-inline-select-root='1' style={{ position: 'relative', width: 150 }}>
                    <button
                      type='button'
                      style={{ ...inputStyle, minHeight: 42, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff' }}
                      onClick={() => setNoteCategoryOpen((v) => !v)}
                    >
                      <span>{noteCategoryMeta(noteCategory).label}</span>
                      <span style={{ color: '#64748b', fontSize: 12 }}>▾</span>
                    </button>
                    {noteCategoryOpen && (
                      <div style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, width: '100%', zIndex: 40, border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', boxShadow: '0 10px 20px rgba(15,23,42,0.12)', overflow: 'hidden' }}>
                        {[
                          { value: 'general', label: '일반' },
                          { value: 'guidance', label: '생활지도' },
                          { value: 'parent', label: '보호자' },
                          { value: 'class', label: '수업' },
                          { value: 'observe', label: '관찰' },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type='button'
                            style={{ width: '100%', border: 'none', borderTop: '1px solid #e2e8f0', background: opt.value === noteCategory ? '#eff6ff' : '#fff', color: '#0f172a', textAlign: 'left', padding: '9px 10px', fontSize: 13, cursor: 'pointer' }}
                            onClick={() => { setNoteCategory(opt.value); setNoteCategoryOpen(false); }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>}
                  <button
                    type='button'
                    style={{ ...btnSecondary, minHeight: 42, height: 42, padding: '0 10px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={() => {
                      const selectableIds = [studentBasicSurveyPdfId, ...selectedStudentNotes.map((n) => String(n.id))];
                      if (selectableIds.length > 0 && pdfSelectedIds.size === selectableIds.length) {
                        setPdfSelectedIds(new Set());
                      } else {
                        const allIds = new Set(selectableIds);
                        setPdfSelectedIds(allIds);
                      }
                    }}
                  >
                    <input 
                      type="checkbox" 
                      readOnly 
                      checked={(selectedStudentNotes.length + 1) > 0 && pdfSelectedIds.size === (selectedStudentNotes.length + 1)} 
                      style={{ pointerEvents: 'none', margin: 0 }} 
                    />
                    모두 선택 (PDF)
                  </button>
                </div>
                <button style={{ ...btnPrimary, minWidth: 108, height: 42 }}>{editingNoteId || isEditingIssueConsultation ? '수정 저장' : '기록 추가'}</button>
              </form>
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8, maxHeight: 260, overflowY: 'auto', paddingRight: 2, flex: 1, minHeight: 0 }}>
                {selectedStudentNotes.map((n) => {
                  const cm = noteCategoryMeta(n.category);
                  const content = String(n.content || '');
                  const isLong = content.split(/\r?\n/).length > 3 || content.length > 120;
                  const expanded = !!expandedNotes[String(n.id)];
                  const isPdfSelected = pdfSelectedIds.has(String(n.id));
                  return (
                    <li key={n.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, background: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', background: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: 999, padding: '4px 10px', fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em' }}>{formatNoteDateTime(n.note_date)}</span>
                        <span style={{ background: cm.bg, color: cm.color, borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>{cm.label}</span>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#475569' }}>
                          <input 
                            type="checkbox" 
                            checked={isPdfSelected} 
                            onChange={(e) => {
                              const next = new Set(pdfSelectedIds);
                              if (e.target.checked) next.add(String(n.id));
                              else next.delete(String(n.id));
                              setPdfSelectedIds(next);
                            }} 
                            style={{ margin: 0 }}
                          /> PDF
                        </label>
                      </div>
                      <div style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        lineHeight: 1.5,
                        color: '#0f172a',
                        display: expanded ? 'block' : '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: expanded ? 'unset' : 3,
                        overflow: 'hidden',
                      }}>{content}</div>
                      <AttachmentLinks attachments={n.attachments} onOpen={openAttachment} />
                      <div style={{ marginTop: 8 }}>
                        {isLong && <button style={miniBtn} onClick={() => setExpandedNotes((p) => ({ ...p, [String(n.id)]: !expanded }))}>{expanded ? '접기' : '더보기'}</button>}
                        <button style={miniBtn} onClick={() => editNote(n)}>수정</button>
                        <button style={miniBtnDanger} onClick={() => deleteNote(n)}>삭제</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      </section>
  );
}
