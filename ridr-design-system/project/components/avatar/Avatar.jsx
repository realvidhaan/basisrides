import React from 'react';

export function Avatar({ name = '', src, size = 'md' }) {
  const sizes = { sm: 32, md: 44, lg: 64 };
  const px = sizes[size];
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

  const base = {
    width: px, height: px, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-heading)', fontWeight: 700,
    fontSize: px * 0.38, color: 'var(--color-brand-teal-dark)',
    background: 'var(--color-brand-teal-light)', overflow: 'hidden', flexShrink: 0,
  };

  if (src) {
    return <img src={src} alt={name} style={{ ...base, objectFit: 'cover' }} />;
  }
  return <div style={base}>{initials || '?'}</div>;
}
