'use client';

import { AuthenticatedImage } from '../common/AuthenticatedImage.js';

import { Card } from '../common/Card.js';
import { decodeBrokenKorean, fileExt, fileNameWithoutExt, fileTypeMeta } from '../../lib/file-utils.js';

export function FilesTab({
  apiBase,
  onFileDragOver,
  onFileDragLeave,
  onFileDrop,
  fileDragActive,
  fileUploadState,
  formRow,
  inputStyle,
  btnPrimary,
  btnSecondary,
  fileSort,
  setFileSort,
  onPickFiles,
  visibleFileItems,
  sortedFileItems,
  editingFileId,
  fileNameDraft,
  setFileNameDraft,
  saveRenameFile,
  setEditingFileId,
  openFileItem,
  beginRenameFile,
  removeFileItem,
  fileGrid,
  fileCard,
  miniBtn,
  miniBtnDanger,
  resourceTitle,
  setResourceTitle,
  resourceUrl,
  setResourceUrl,
  addResourceLink,
  resourceLinks,
  removeResourceLink,
}) {
  return (
    <Card title='📚 파일'>
      <div
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onFileDrop}
        style={{ border: fileDragActive ? '2px dashed #3b82f6' : '2px dashed #cbd5e1', background: fileDragActive ? '#eff6ff' : '#f8fafc', borderRadius: 10, padding: 10, marginBottom: 10, color: '#475569', fontSize: 13 }}
      >
        파일을 이 영역으로 드래그해 업로드할 수 있습니다. (파일당 최대 512MB)
        {fileUploadState.active && (
          <div style={{ marginTop: 8, color: '#1d4ed8', fontWeight: 700 }}>
            업로드 중 {fileUploadState.done}/{fileUploadState.total} · {fileUploadState.name} · {fileUploadState.percent}%
          </div>
        )}
      </div>
      <div style={{ ...formRow, justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#475569' }}>저장 파일 {visibleFileItems.length}개</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select style={{ ...inputStyle, minHeight: 36 }} value={fileSort} onChange={(e) => setFileSort(e.target.value)}>
            <option value='newest'>최신순</option>
            <option value='name'>이름순</option>
            <option value='size'>용량순</option>
          </select>
          <label style={{ ...btnSecondary, display: 'inline-block', cursor: 'pointer' }}>
            파일 업로드
            <input type='file' multiple style={{ display: 'none' }} onChange={onPickFiles} />
          </label>
        </div>
      </div>
      <div style={fileGrid}>
        {sortedFileItems.map((file) => {
          const isImage = String(file.type || '').startsWith('image/');
          const meta = fileTypeMeta(file);
          return (
            <div key={file.id} style={{ ...fileCard, borderRadius: 12, padding: 10, gridTemplateRows: 'auto auto auto 1fr auto', minHeight: 238 }}>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(file.created_at || file.createdAt || Date.now()).toLocaleString()}</div>
              {isImage ? (
                <AuthenticatedImage
                  src={`${apiBase}${file.url || ''}`}
                  alt={file.name}
                  style={{ width: '100%', height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
              ) : (
                <div style={{ height: 96, borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: meta.bg, color: meta.color, fontWeight: 800 }}>
                  <span style={{ fontSize: 24, lineHeight: 1 }}>{meta.icon}</span>
                  <span style={{ fontSize: 14 }}>{meta.label}</span>
                </div>
              )}
              {editingFileId === file.id ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  <input style={{ ...inputStyle, width: '100%', minHeight: 34, height: 34, boxSizing: 'border-box' }} value={fileNameDraft} onChange={(e) => setFileNameDraft(e.target.value)} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type='button' style={{ ...miniBtn, marginLeft: 0, minHeight: 30, height: 30 }} onClick={saveRenameFile}>저장</button>
                    <button type='button' style={{ ...miniBtn, marginLeft: 0, minHeight: 30, height: 30 }} onClick={() => { setEditingFileId(null); setFileNameDraft(''); }}>취소</button>
                  </div>
                </div>
              ) : (
                <div style={{ fontWeight: 800, wordBreak: 'break-all', lineHeight: 1.35, minHeight: 38 }}>{decodeBrokenKorean(fileNameWithoutExt(file.name))}</div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#64748b' }}>
                <span style={{ fontSize: 11, borderRadius: 999, padding: '2px 7px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>{fileExt(file.name).toUpperCase() || 'FILE'}</span>
                <span>{Math.round((file.size || 0) / 1024)} KB</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6 }}>
                <button type='button' style={{ ...miniBtn, marginLeft: 0, minHeight: 30, height: 30, padding: '0 6px', width: '100%' }} onClick={() => openFileItem(file)}>다운로드</button>
                <button type='button' style={{ ...miniBtn, marginLeft: 0, minHeight: 30, height: 30, padding: '0 6px', width: '100%' }} onClick={() => beginRenameFile(file)}>이름 변경</button>
                <button type='button' style={{ ...miniBtnDanger, marginLeft: 0, minHeight: 30, height: 30, padding: '0 6px', width: '100%' }} onClick={() => removeFileItem(file.id)}>삭제</button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, borderTop: '1px dashed #cbd5e1', paddingTop: 12 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#334155', marginBottom: 14 }}>🔗 링크</div>
        <div style={{ ...formRow, alignItems: 'center' }}>
          <input style={{ ...inputStyle, minWidth: 180, flex: 1 }} value={resourceTitle} onChange={(e) => setResourceTitle(e.target.value)} placeholder='제목 (또는 원본번호)' />
          <input style={{ ...inputStyle, minWidth: 260, flex: 2 }} value={resourceUrl} onChange={(e) => setResourceUrl(e.target.value)} placeholder='링크 (예: https://docs.google.com/...)' />
          <button type='button' style={btnPrimary} onClick={addResourceLink}>링크 추가</button>
        </div>
        <div style={fileGrid}>
          {resourceLinks.map((item) => (
            <div key={item.id} style={{ ...fileCard, borderRadius: 12, padding: 12, background: '#f8fafc' }}>
              <div style={{ fontWeight: 800, color: '#0f172a' }}>🔗 {item.title}</div>
              <a href={item.url} target='_blank' rel='noreferrer' style={{ color: '#1d4ed8', fontSize: 13, wordBreak: 'break-all', textDecoration: 'none' }}>{item.url}</a>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type='button' style={miniBtn} onClick={() => window.open(item.url, '_blank')}>열기</button>
                <button type='button' style={miniBtnDanger} onClick={() => removeResourceLink(item.id)}>삭제</button>
              </div>
            </div>
          ))}
          {resourceLinks.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>등록된 링크가 없습니다.</div>}
        </div>
      </div>
    </Card>
  );
}
