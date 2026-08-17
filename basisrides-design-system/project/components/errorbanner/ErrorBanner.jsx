import React from 'react';

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      background: 'var(--color-error-light)', borderRadius: 'var(--radius-banner)',
      padding: '12px 14px', fontFamily: 'var(--font-body)',
    }}>
      <span style={{ color: 'var(--color-error)', fontSize: 15, lineHeight: 1.3 }}>⚠</span>
      <span style={{ fontSize: 13.5, color: 'var(--color-error)', lineHeight: 1.4 }}>{message}</span>
    </div>
  );
}
