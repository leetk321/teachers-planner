'use client';

export function Card({ title, children, style, titleStyle }) {
  const cardStyle = {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    boxShadow: '0 4px 14px rgba(15,23,42,0.04)',
    ...(style || {}),
  };

  return (
    <section style={cardStyle}>
      <h2 style={{ marginTop: 0, ...(titleStyle || {}) }}>{title}</h2>
      {children}
    </section>
  );
}
