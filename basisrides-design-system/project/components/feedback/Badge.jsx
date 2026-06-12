import React from 'react';

export function Badge({ label, variant = 'default', size = 'md' }) {
  const colors = {
    default: { bg: '#F7F8F9', color: '#6A707C', border: '#DADADA' },
    success: { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' },
    warning: { bg: '#FFF7ED', color: '#FF9500', border: '#FED7AA' },
    error:   { bg: '#FFF1F1', color: '#DC143C', border: '#FECACA' },
    info:    { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' },
  };

  const sizes = {
    sm: { fontSize: '11px', padding: '2px 8px', height: '20px' },
    md: { fontSize: '12px', padding: '4px 10px', height: '24px' },
  };

  const c = colors[variant];
  const s = sizes[size];

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      background: c.bg,
      color: c.color,
      border: `1px solid ${c.border}`,
      borderRadius: '9999px',
      fontSize: s.fontSize,
      fontWeight: 600,
      padding: s.padding,
      height: s.height,
      fontFamily: "Urbanist, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      letterSpacing: '0.01em',
      lineHeight: 1,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}
