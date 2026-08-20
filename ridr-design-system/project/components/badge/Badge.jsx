import React from 'react';

export function Badge({ label, variant = 'neutral' }) {
  const variants = {
    success: { bg: 'var(--color-success-light)', fg: 'var(--color-success)' },
    warning: { bg: 'var(--color-warning-light)', fg: 'var(--color-warning)' },
    error: { bg: 'var(--color-error-light)', fg: 'var(--color-error)' },
    neutral: { bg: 'var(--color-surface-subtle)', fg: 'var(--color-ink-secondary)' },
  };
  const c = variants[variant] || variants.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '4px 10px',
      borderRadius: 999, fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)',
      background: c.bg, color: c.fg,
    }}>
      {label}
    </span>
  );
}
