import React from 'react';

export function Card({ children, padding = 20, bordered = true }) {
  return (
    <div style={{
      background: 'var(--color-surface-white)',
      borderRadius: 'var(--radius-card)',
      boxShadow: bordered ? 'inset 0 0 0 1px var(--color-border-default)' : 'none',
      padding,
      boxSizing: 'border-box',
      fontFamily: 'var(--font-body)',
      color: 'var(--color-ink)',
    }}>
      {children}
    </div>
  );
}
