import React from 'react';

export function Modal({ open, title, children, onClose, footer }) {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(27,37,35,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-surface-white)', borderRadius: 'var(--radius-card)',
          padding: 24, width: 320, boxSizing: 'border-box', fontFamily: 'var(--font-body)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, color: 'var(--color-ink)' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--color-text-muted)' }}>✕</button>
        </div>
        <div style={{ fontSize: 14, color: 'var(--color-ink-secondary)', lineHeight: 1.5 }}>{children}</div>
        {footer && <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>{footer}</div>}
      </div>
    </div>
  );
}
