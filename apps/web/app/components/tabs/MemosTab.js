'use client';

import { Card } from '../common/Card.js';
import { AttachmentPicker } from '../common/AttachmentPicker.js';

const DraftStatus = ({ status, label, recovered, discard }) => {
  if (!label) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 20, flexWrap: 'wrap', fontSize: 11, color: status === 'error' ? '#b91c1c' : '#64748b' }}>
      <span>{label}</span>
      {recovered && <button type='button' onClick={discard} style={{ border: 0, background: 'transparent', padding: 0, color: '#b91c1c', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>복구한 초안 버리기</button>}
    </div>
  );
};

export function MemosTab({
  isMobile,
  announcementSplitGrid,
  memoWorkspaceCardStyle,
  memoWorkspaceTitleStyle,
  formRow,
  inputStyle,
  btnSecondary,
  btnPrimary,
  miniBtnDanger,
  tabBtn,
  DateFieldComponent,
  weekdayKorean,
  memoBadgeDate,
  memoDate,
  setMemoDate,
  setMemoListMonth,
  setMemoTouched,
  startNewMemo,
  saveTaskMemo,
  selectedMemo,
  deleteTaskMemo,
  memoTitle,
  setMemoTitle,
  memoShowOnDashboard,
  setMemoShowOnDashboard,
  memoContent,
  setMemoContent,
  memoAttachments,
  setMemoAttachments,
  uploadAttachments,
  openAttachment,
  memoListMonth,
  setMemoListMonthOnly,
  memosByMonth,
  editingMemoId,
  selectMemo,
  memoMonthlyListMaxHeight,
  renderAnnouncementWorkspace,
  memoDraft,
}) {
  return (
    <section style={isMobile ? { display: 'grid', gap: 12 } : announcementSplitGrid}>
      <Card title='📝 메모' style={memoWorkspaceCardStyle} titleStyle={memoWorkspaceTitleStyle}>
        <div style={{ display: 'grid', gap: 2, minHeight: 0, height: '100%', alignContent: 'start' }}>
          <div style={{ ...formRow, alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <DateFieldComponent
                compact
                value={memoDate}
                onChange={(value) => {
                  setMemoDate(value);
                  setMemoListMonth(String(value || '').slice(0, 7));
                  setMemoTouched(true);
                }}
              />
              <span style={{ fontSize: 13, color: '#475569', border: '1px solid #cbd5e1', borderRadius: 999, padding: '3px 9px', background: '#fff' }}>
                {weekdayKorean(memoDate) || '-'}
              </span>
            </div>
            <button type='button' style={{ ...btnSecondary, minHeight: 42, height: 42, boxSizing: 'border-box' }} onClick={startNewMemo}>
              새 메모
            </button>
            <button type='button' style={{ ...btnPrimary, minHeight: 42, height: 42, boxSizing: 'border-box' }} onClick={saveTaskMemo}>
              저장
            </button>
            {selectedMemo && <button type='button' style={miniBtnDanger} onClick={() => deleteTaskMemo(selectedMemo.id)}>삭제</button>}
          </div>
          <input
            style={{ ...inputStyle, width: '100%', marginBottom: 10, boxSizing: 'border-box' }}
            placeholder='메모 제목'
            value={memoTitle}
            onChange={(e) => { setMemoTitle(e.target.value); setMemoTouched(true); }}
          />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 8 }}>
            <input type='checkbox' checked={memoShowOnDashboard} onChange={(e) => { setMemoShowOnDashboard(e.target.checked); setMemoTouched(true); }} />
            대시보드에 표시
          </label>
          <textarea
            style={{ ...inputStyle, width: '100%', minHeight: isMobile ? 204 : 216, resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.42 }}
            placeholder={'메모 내용을 입력하세요.\n날짜별 메모를 작성할 수 있습니다.\n(수업 아이디어, 학급 공지 초안, 회의 메모 등)'}
            value={memoContent}
            onChange={(e) => { setMemoContent(e.target.value); setMemoTouched(true); }}
          />
          <AttachmentPicker
            attachments={memoAttachments}
            setAttachments={(next) => { setMemoAttachments(next); setMemoTouched(true); }}
            onUpload={uploadAttachments}
            onOpen={openAttachment}
            btnSecondary={btnSecondary}
          />
          <DraftStatus {...memoDraft} />
          <div style={{ marginTop: 10, borderTop: '1px solid #e2e8f0', paddingTop: 10, minHeight: 0, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: '#475569' }}>월별 메모 목록</div>
              <input
                type='month'
                style={{ ...inputStyle, minHeight: 42, height: 42, width: 150, maxWidth: '100%', padding: '0 8px', lineHeight: '42px', boxSizing: 'border-box' }}
                value={memoListMonth}
                onChange={(e) => setMemoListMonthOnly(e.target.value)}
              />
            </div>
            <div style={{ display: 'grid', gap: 6, maxHeight: memoMonthlyListMaxHeight, overflowY: 'auto' }}>
              {memosByMonth.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 12 }}>선택한 월의 메모가 없습니다.</div> : memosByMonth.map((memo) => (
                <button
                  key={memo.id}
                  type='button'
                  onClick={() => selectMemo(memo)}
                  style={{ ...tabBtn, textAlign: 'left', border: '1px solid #cbd5e1', borderRadius: 999, padding: 0, margin: 0, width: '100%', height: 38, minHeight: 38, background: String(memo.id) === String(editingMemoId) ? '#eff6ff' : '#fff', display: 'grid', gridTemplateColumns: '144px 1fr', alignItems: 'stretch', overflow: 'hidden' }}
                >
                  <div style={{ padding: '4px 9px', borderRight: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 700, whiteSpace: 'nowrap' }}>{memoBadgeDate(memo.memo_date)}</span>
                  </div>
                  <div style={{ padding: '4px 9px', fontSize: 14, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center' }}>
                    {String(memo.title || '').trim() || '(제목 없음)'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>
      {renderAnnouncementWorkspace()}
    </section>
  );
}
