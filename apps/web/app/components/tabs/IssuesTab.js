'use client';

import { AttachmentLinks, AttachmentPicker } from '../common/AttachmentPicker.js';
import { Card } from '../common/Card.js';

const statusMeta = {
  open: { label: '진행 중', bg: '#dbeafe', color: '#1d4ed8' },
  simple_close: { label: '단순종결', bg: '#e2e8f0', color: '#475569' },
  mediation: { label: '화해중재', bg: '#dcfce7', color: '#166534' },
  school_violence: { label: '학폭접수', bg: '#fee2e2', color: '#b91c1c' },
};

const roleMeta = {
  attacker: { label: '가해', bg: '#fee2e2', color: '#b91c1c' },
  victim: { label: '피해', bg: '#dbeafe', color: '#1d4ed8' },
  related: { label: '관련', bg: '#e2e8f0', color: '#475569' },
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).replace('T', ' ').slice(0, 16);
  return date.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
};

const studentLabel = (student) => `${student?.student_code || ''} ${student?.student_name || student?.name || ''}`.trim();

const DraftStatus = ({ status, label, recovered, discard } = {}) => {
  if (!label) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 20, flexWrap: 'wrap', fontSize: 11, color: status === 'error' ? '#b91c1c' : '#64748b' }}>
      <span>{label}</span>
      {recovered && <button type='button' onClick={discard} style={{ border: 0, background: 'transparent', padding: 0, color: '#b91c1c', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>복구한 초안 버리기</button>}
    </div>
  );
};

export function IssuesTab({
  isMobile,
  issues,
  values,
  derived,
  drafts = {},
  actions,
  styles,
  uploadAttachments,
  openAttachment,
}) {
  const {
    selectedIssueId,
    isCreatingIssue,
    issueCaseNo,
    issueTitle,
    issueStatus,
    issueStudentQuery,
    issueStudentRole,
    issueStudentsDraft,
    consultationType,
    consultationParticipantName,
    consultationStudentId,
    consultationAt,
    consultationContent,
    consultationAttachments,
    consultationNameFilter,
    editingConsultationId,
    expandedConsultations,
  } = values;
  const { selectedIssue, filteredConsultations, issueStudentSearchResults, consultationStudentSearchResults } = derived;
  const {
    onSelectIssue,
    onIssueCaseNoChange,
    onIssueTitleChange,
    onIssueStatusChange,
    onIssueStudentQueryChange,
    onIssueStudentRoleChange,
    onAddIssueStudent,
    onUpdateIssueStudentRole,
    onRemoveIssueStudent,
    onSaveIssue,
    onStartNewIssue,
    onDeleteIssue,
    onConsultationTypeChange,
    onConsultationStudentQueryChange,
    onSelectConsultationStudent,
    onConsultationAtChange,
    onConsultationContentChange,
    onConsultationAttachmentsChange,
    onConsultationNameFilterChange,
    onAddConsultation,
    onEditConsultation,
    onCancelConsultationEdit,
    onToggleConsultationExpanded,
    onDeleteConsultation,
  } = actions;
  const { twoColGrid, inputStyle, btnPrimary, btnSecondary, miniBtn, miniBtnDanger, tabBtn } = styles;

  return (
    <section style={isMobile ? { display: 'grid', gap: 12 } : twoColGrid}>
      <Card title='🚨 사안 관리'>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button type='button' style={btnSecondary} onClick={onStartNewIssue}>새 사안</button>
            {selectedIssue && <button type='button' style={miniBtnDanger} onClick={() => onDeleteIssue(selectedIssue.id)}>사안 삭제</button>}
          </div>
          <input style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} value={issueCaseNo} onChange={(event) => onIssueCaseNoChange(event.target.value)} placeholder='사안 번호 (예: 2026-01호)' />
          <input style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} value={issueTitle} onChange={(event) => onIssueTitleChange(event.target.value)} placeholder='사안 제목 또는 간단한 구분 (선택)' />

          <div style={{ display: 'grid', gap: 6 }}>
            <strong style={{ fontSize: 13, color: '#334155' }}>관련 학생 편성</strong>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 100px', gap: 7 }}>
              <div style={{ position: 'relative', minWidth: 0 }}>
                <input
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                  value={issueStudentQuery}
                  onChange={(event) => onIssueStudentQueryChange(event.target.value)}
                  placeholder='학번 또는 이름으로 학생 검색'
                />
                {issueStudentSearchResults.length > 0 && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30, display: 'grid', gap: 3, padding: 5, border: '1px solid #cbd5e1', borderRadius: 9, background: '#fff', boxShadow: '0 10px 24px rgba(15,23,42,0.14)', maxHeight: 220, overflowY: 'auto' }}>
                    {issueStudentSearchResults.map((student) => (
                      <button key={student.id} type='button' style={{ ...tabBtn, textAlign: 'left', padding: '8px 9px', borderRadius: 7, background: '#fff' }} onClick={() => onAddIssueStudent(student)}>
                        <strong>{student.student_code}</strong> {student.name} <span style={{ color: '#64748b' }}>({student.class_name} {student.student_no}번)</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <select style={inputStyle} value={issueStudentRole} onChange={(event) => onIssueStudentRoleChange(event.target.value)}>
                <option value='attacker'>가해</option>
                <option value='victim'>피해</option>
                <option value='related'>관련</option>
              </select>
            </div>
            <div style={{ display: 'grid', gap: 5 }}>
              {issueStudentsDraft.map((student, index) => {
                const role = roleMeta[student.role] || roleMeta.related;
                const rowKey = student.row_key || `issue-student:${student.student_id || `${student.student_code}_${student.student_name}`}:${index}`;
                return (
                  <div key={rowKey} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 92px auto', gap: 6, alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 8px', background: '#f8fafc' }}>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{studentLabel(student)}</span>
                    <select style={{ ...inputStyle, minHeight: 34, padding: '4px 7px', background: role.bg, color: role.color, fontWeight: 800 }} value={student.role} onChange={(event) => onUpdateIssueStudentRole(rowKey, event.target.value)}>
                      <option value='attacker'>가해</option>
                      <option value='victim'>피해</option>
                      <option value='related'>관련</option>
                    </select>
                    <button type='button' style={miniBtnDanger} onClick={() => onRemoveIssueStudent(rowKey)}>제거</button>
                  </div>
                );
              })}
              {issueStudentsDraft.length === 0 && <span style={{ color: '#94a3b8', fontSize: 12 }}>검색 결과에서 학생을 선택해 편성해 주세요.</span>}
            </div>
          </div>

          <select style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} value={issueStatus} onChange={(event) => onIssueStatusChange(event.target.value)}>
            <option value='open'>진행 중</option>
            <option value='simple_close'>단순종결</option>
            <option value='mediation'>화해중재</option>
            <option value='school_violence'>학폭접수</option>
          </select>
          <button type='button' style={btnPrimary} onClick={onSaveIssue}>{isCreatingIssue || !selectedIssue ? '사안 등록' : '사안 저장'}</button>
          <DraftStatus {...drafts.issue} />
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, display: 'grid', gap: 6, maxHeight: 250, overflowY: 'auto' }}>
            {issues.map((issue) => {
              const meta = statusMeta[issue.status] || statusMeta.open;
              const assignments = Array.isArray(issue.issue_students) ? issue.issue_students : [];
              return (
                <button key={issue.id} type='button' onClick={() => onSelectIssue(String(issue.id))} style={{ ...tabBtn, textAlign: 'left', border: '1px solid #cbd5e1', background: String(selectedIssueId) === String(issue.id) ? '#eff6ff' : '#fff', borderRadius: 10, padding: '9px 10px', display: 'grid', gap: 5 }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontWeight: 800, color: '#0f172a' }}><span>{issue.case_no}</span><span style={{ borderRadius: 999, padding: '2px 7px', fontSize: 11, background: meta.bg, color: meta.color }}>{meta.label}</span></span>
                  {issue.title && <span style={{ fontSize: 13, color: '#334155' }}>{issue.title}</span>}
                  <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{assignments.map((student) => `${roleMeta[student.role]?.label || '관련'} ${studentLabel(student)}`).join(' · ') || '관련 학생 미편성'}</span>
                </button>
              );
            })}
            {issues.length === 0 && <span style={{ color: '#94a3b8', fontSize: 13 }}>등록된 사안이 없습니다.</span>}
          </div>
        </div>
      </Card>

      <Card title={selectedIssue ? `🗂️ ${selectedIssue.case_no} 상담 기록` : '🗂️ 상담 기록'}>
        {!selectedIssue ? <div style={{ color: '#94a3b8', fontSize: 13 }}>{isCreatingIssue ? '사안을 먼저 등록하면 상담 기록을 추가할 수 있습니다.' : '왼쪽에서 사안을 등록하거나 선택해 주세요.'}</div> : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '120px minmax(0, 1fr)', gap: 8 }}>
              <select style={inputStyle} value={consultationType} onChange={(event) => onConsultationTypeChange(event.target.value)}><option value='student'>학생 상담</option><option value='guardian'>학부모 상담</option></select>
              <div style={{ position: 'relative', minWidth: 0 }}>
                <input
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', borderColor: consultationStudentId ? '#60a5fa' : inputStyle.borderColor, background: editingConsultationId ? '#f1f5f9' : '#fff' }}
                  value={consultationParticipantName}
                  onChange={(event) => onConsultationStudentQueryChange(event.target.value)}
                  placeholder='학번 또는 이름으로 상담 학생 검색'
                  readOnly={Boolean(editingConsultationId)}
                  title={editingConsultationId ? '상담 대상 학생은 수정할 수 없습니다.' : undefined}
                />
                {consultationStudentSearchResults.length > 0 && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30, display: 'grid', gap: 3, padding: 5, border: '1px solid #cbd5e1', borderRadius: 9, background: '#fff', boxShadow: '0 10px 24px rgba(15,23,42,0.14)', maxHeight: 200, overflowY: 'auto' }}>
                    {consultationStudentSearchResults.map((student) => (
                      <button key={student.id} type='button' style={{ ...tabBtn, textAlign: 'left', padding: '8px 9px', borderRadius: 7, background: '#fff' }} onClick={() => onSelectConsultationStudent(student)}>
                        <strong>{student.student_code}</strong> {student.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input type='datetime-local' style={inputStyle} value={consultationAt} onChange={(event) => onConsultationAtChange(event.target.value)} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifySelf: 'start', flexWrap: 'wrap' }}>
                <button type='button' style={{ ...btnPrimary, width: 'auto', minWidth: 88, minHeight: 34, height: 34, padding: '4px 10px', fontSize: 12, whiteSpace: 'nowrap' }} onClick={onAddConsultation}>{editingConsultationId ? '수정 저장' : '상담 기록 추가'}</button>
                {editingConsultationId && <button type='button' style={miniBtn} onClick={onCancelConsultationEdit}>취소</button>}
              </div>
            </div>
            <textarea style={{ ...inputStyle, width: '100%', minHeight: 108, resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5 }} value={consultationContent} onChange={(event) => onConsultationContentChange(event.target.value)} placeholder='학생 또는 학부모 상담 내용을 입력하세요.' />
            <AttachmentPicker attachments={consultationAttachments} setAttachments={onConsultationAttachmentsChange} onUpload={uploadAttachments} onOpen={openAttachment} btnSecondary={btnSecondary} />
            <DraftStatus {...drafts.consultation} />
            <input style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} value={consultationNameFilter} onChange={(event) => onConsultationNameFilterChange(event.target.value)} placeholder='상담 대상 이름으로 필터링' />
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, display: 'grid', gap: 8, maxHeight: 260, minHeight: 0, overflowY: 'auto', paddingRight: 2 }}>
              {filteredConsultations.map((consultation) => {
                const content = String(consultation.content || '');
                const isLong = content.split(/\r?\n/).length > 3 || content.length > 120;
                const expanded = Boolean(expandedConsultations?.[String(consultation.id)]);
                const isEditing = String(editingConsultationId) === String(consultation.id);
                return (
                  <article key={consultation.id} style={{ border: `1px solid ${isEditing ? '#93c5fd' : '#e2e8f0'}`, borderRadius: 10, padding: 10, background: isEditing ? '#eff6ff' : '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}><span style={{ borderRadius: 999, padding: '3px 8px', background: consultation.consultation_type === 'guardian' ? '#ede9fe' : '#dbeafe', color: consultation.consultation_type === 'guardian' ? '#6d28d9' : '#1d4ed8', fontSize: 12, fontWeight: 700 }}>{consultation.consultation_type === 'guardian' ? '학부모 상담' : '학생 상담'}</span><strong>{consultation.participant_name}</strong></div>
                      <span style={{ fontSize: 12, color: '#64748b' }}>{formatDateTime(consultation.consulted_at)}</span>
                    </div>
                    <div style={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontSize: 14,
                      lineHeight: 1.55,
                      color: '#1e293b',
                      display: expanded ? 'block' : '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: expanded ? 'unset' : 3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>{content}</div>
                    <AttachmentLinks attachments={consultation.attachments} onOpen={openAttachment} />
                    <div style={{ marginTop: 8, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {isLong && <button type='button' style={miniBtn} onClick={() => onToggleConsultationExpanded(consultation.id)}>{expanded ? '접기' : '더보기'}</button>}
                      <button type='button' style={miniBtn} onClick={() => onEditConsultation(consultation)}>수정</button>
                      <button type='button' style={miniBtnDanger} onClick={() => onDeleteConsultation(consultation.id)}>삭제</button>
                    </div>
                  </article>
                );
              })}
              {filteredConsultations.length === 0 && <span style={{ color: '#94a3b8', fontSize: 13 }}>{consultationNameFilter ? '조건에 맞는 상담 기록이 없습니다.' : '등록된 상담 기록이 없습니다.'}</span>}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
