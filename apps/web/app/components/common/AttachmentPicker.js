'use client';

import { useId, useRef, useState } from 'react';

const normalizeAttachments = (value) => (Array.isArray(value) ? value : [])
  .map((item) => ({
    id: Number(item?.id || 0),
    name: String(item?.name || '첨부파일'),
    url: String(item?.url || ''),
    type: String(item?.type || ''),
    size: Number(item?.size || 0),
  }))
  .filter((item) => item.id || item.url);

export function AttachmentLinks({ attachments, onOpen, compact = false }) {
  const items = normalizeAttachments(attachments);
  if (!items.length) return null;

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: compact ? 6 : 8 }}>
      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>첨부</span>
      {items.map((item) => (
        <button
          key={`${item.id}_${item.url}`}
          type='button'
          onClick={() => onOpen?.(item)}
          style={{ border: '1px solid #bfdbfe', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', padding: '3px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={item.name}
        >
          📎 {item.name}
        </button>
      ))}
    </div>
  );
}

export function AttachmentPicker({
  attachments,
  setAttachments,
  onUpload,
  onOpen,
  btnSecondary,
  label = '첨부파일',
}) {
  const inputRef = useRef(null);
  const inputId = useId();
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [retryFiles, setRetryFiles] = useState([]);
  const items = normalizeAttachments(attachments);

  const appendUploadedFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || uploading) return false;
    setUploadError('');
    setUploading(true);
    try {
      if (typeof onUpload !== 'function') throw new Error('첨부파일 업로드 기능을 사용할 수 없습니다.');
      const saved = normalizeAttachments(await onUpload(files));
      if (saved.length) {
        setAttachments((previous) => {
          const merged = [...normalizeAttachments(previous), ...saved];
          return merged.filter((item, index) => merged.findIndex((candidate) => String(candidate.id || candidate.url) === String(item.id || item.url)) === index);
        });
      }
      if (saved.length < files.length) {
        const unmatchedSaved = [...saved];
        const unresolved = files.filter((file) => {
          const savedIndex = unmatchedSaved.findIndex((item) => (
            item.name === file.name && (!item.size || item.size === file.size)
          ));
          if (savedIndex < 0) return true;
          unmatchedSaved.splice(savedIndex, 1);
          return false;
        });
        setRetryFiles(unresolved);
        setUploadError(`${unresolved.length}개 파일을 업로드하지 못했습니다. 선택은 유지되며 다시 시도할 수 있습니다.`);
        return false;
      }
      setRetryFiles([]);
      return true;
    } catch (error) {
      setRetryFiles(files);
      setUploadError(`첨부파일 업로드 실패: ${error?.message || '서버 응답을 확인해 주세요.'} 선택은 유지됩니다.`);
      return false;
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
      <div
        role='group'
        aria-label={`${label} 업로드`}
        onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          void appendUploadedFiles(event.dataTransfer?.files || []);
        }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', border: `1px dashed ${dragActive ? '#2563eb' : '#cbd5e1'}`, borderRadius: 8, padding: '7px 8px', background: dragActive ? '#eff6ff' : '#f8fafc' }}
      >
        <input
          id={inputId}
          ref={inputRef}
          type='file'
          multiple
          style={{ display: 'none' }}
          onChange={async (event) => {
            try {
              await appendUploadedFiles(event.target.files || []);
            } finally {
              event.target.value = '';
            }
          }}
        />
        <button type='button' aria-controls={inputId} style={{ ...btnSecondary, minHeight: 32, padding: '4px 9px', fontSize: 12 }} onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? '업로드 중...' : `📎 ${label} 추가`}
        </button>
        {retryFiles.length > 0 && (
          <button type='button' style={{ ...btnSecondary, minHeight: 32, padding: '4px 9px', fontSize: 12 }} onClick={() => void appendUploadedFiles(retryFiles)} disabled={uploading}>
            실패한 파일 다시 시도 ({retryFiles.length})
          </button>
        )}
        <span style={{ color: '#64748b', fontSize: 12 }}>파일을 이 영역으로 끌어 놓아도 됩니다.</span>
      </div>
      {uploadError && <div role='alert' aria-live='assertive' style={{ color: '#b91c1c', fontSize: 12 }}>{uploadError}</div>}
      {items.length > 0 && (
        <div style={{ display: 'grid', gap: 5 }}>
          {items.map((item) => (
            <div key={`${item.id}_${item.url}`} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <button type='button' onClick={() => onOpen?.(item)} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: 'none', background: 'transparent', color: '#1d4ed8', padding: 0, fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }} title={item.name}>📎 {item.name}</button>
              <button type='button' onClick={() => setAttachments((previous) => normalizeAttachments(previous).filter((candidate) => String(candidate.id || candidate.url) !== String(item.id || item.url)))} style={{ border: '1px solid #fecaca', borderRadius: 6, background: '#fff7f7', color: '#b91c1c', padding: '2px 6px', fontSize: 11, cursor: 'pointer', flex: '0 0 auto' }}>제거</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
