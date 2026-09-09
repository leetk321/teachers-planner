'use client';

const defaultInputStyle = {
  padding: '10px 11px',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  minHeight: 42,
  fontSize: 14,
};
const defaultSecondaryButtonStyle = {
  padding: '10px 13px',
  borderRadius: 8,
  border: '1px solid #94a3b8',
  background: '#fff',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
};
const defaultDangerButtonStyle = {
  marginLeft: 6,
  border: '1px solid #fca5a5',
  background: '#fef2f2',
  borderRadius: 6,
  padding: '3px 7px',
  fontSize: 13,
  cursor: 'pointer',
};

export function AiPanel({
  question,
  chat,
  error,
  loading,
  onChange,
  onAsk,
  onClear,
  styles = {},
}) {
  const items = Array.isArray(chat) ? chat : [];
  const inputStyle = styles.inputStyle || defaultInputStyle;
  const btnSecondary = styles.btnSecondary || defaultSecondaryButtonStyle;
  const miniBtnDanger = styles.miniBtnDanger || defaultDangerButtonStyle;
  const bubbleTextStyle = {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 6,
    overflow: 'hidden',
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 10, marginBottom: 10, background: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>AI 도우미</span>
      </div>

      <div style={{ display: 'grid', gap: 8, marginBottom: 8, maxHeight: 220, overflowY: 'auto', paddingRight: 2 }}>
        {items.length === 0 && !loading ? (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ maxWidth: '92%', background: '#fff', border: '1px solid #e2e8f0', color: '#334155', borderRadius: 12, padding: '8px 10px', fontSize: 13 }}>
              안녕하세요. 무엇을 도와드릴까요?
            </div>
          </div>
        ) : (
          items.map((message, index) => (
            <div key={`${message.role}_${index}`} style={{ display: 'flex', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '92%', background: message.role === 'user' ? '#dbeafe' : '#fff', border: '1px solid #e2e8f0', color: message.role === 'user' ? '#1e3a8a' : '#334155', borderRadius: 12, padding: '8px 10px', fontSize: 13, ...bubbleTextStyle }}>
                {message.text}
              </div>
            </div>
          ))
        )}
        {loading && <div style={{ color: '#64748b', fontSize: 12 }}>응답 생성 중...</div>}
        {!loading && error && <div style={{ color: '#b91c1c', fontSize: 12 }}>오류: {error}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
        <textarea
          style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
          value={question}
          onChange={(event) => onChange(event.target.value)}
          placeholder='AI에게 질문하기'
        />
        <div style={{ display: 'grid', gap: 6 }}>
          <button type='button' style={{ ...miniBtnDanger, minHeight: 42, width: 88, padding: '6px 8px', fontSize: 13, marginLeft: 0 }} onClick={onClear}>대화 삭제</button>
          <button type='button' style={{ ...btnSecondary, minHeight: 42, width: 88, padding: '6px 8px', fontSize: 13 }} onClick={onAsk}>{loading ? '요청 중...' : 'AI 질문'}</button>
        </div>
      </div>
    </div>
  );
}
