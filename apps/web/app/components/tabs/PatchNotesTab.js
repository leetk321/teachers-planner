'use client';

import { Card } from '../common/Card.js';

export function PatchNotesTab({ patchNotes, onScrollTop }) {
  return (
    <>
      <Card title='📜 패치 노트'>
        <div style={{ display: 'grid', gap: 6 }}>
          {patchNotes.map((patch) => (
            <div key={patch.version} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <b style={{ fontSize: 15 }}>{patch.version}</b>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{patch.date}</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#0f172a', lineHeight: 1.6 }}>
                {patch.items.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </Card>
      <button
        type='button'
        onClick={onScrollTop}
        style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 90, border: 'none', background: '#1d4ed8', color: '#fff', borderRadius: 999, width: 46, height: 46, fontSize: 18, fontWeight: 800, boxShadow: '0 10px 22px rgba(29,78,216,0.35)', cursor: 'pointer' }}
        aria-label='맨 위로 이동'
        title='맨 위로'
      >
        ↑
      </button>
    </>
  );
}
