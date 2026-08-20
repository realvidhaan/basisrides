import React from 'react';

export function Button({ label, variant = 'primary', size = 'md', disabled = false, loading = false, onClick }) {
  const heights = { sm: '40px', md: '48px', lg: '56px' };
  const fontSizes = { sm: '13px', md: 'var(--fs-button)', lg: '16px' };

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: heights[size],
    borderRadius: 'var(--radius-button)',
    fontSize: fontSizes[size],
    fontWeight: 700,
    fontFamily: 'var(--font-heading)',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'opacity var(--transition-fast), background var(--transition-fast)',
    border: 'none',
    outline: 'none',
    letterSpacing: '0.01em',
    userSelect: 'none',
    boxSizing: 'border-box',
  };

  const variants = {
    primary: { background: 'var(--color-brand-teal)', color: '#FFFFFF' },
    outline: { background: 'var(--color-surface-white)', color: 'var(--color-ink)', boxShadow: 'inset 0 0 0 1.5px var(--color-ink)' },
    ghost: { background: 'transparent', color: 'var(--color-brand-teal)' },
  };

  const style = { ...base, ...variants[variant] };

  function onEnter(e) {
    if (disabled || loading) return;
    if (variant === 'primary') e.currentTarget.style.background = 'var(--color-brand-teal-dark)';
    if (variant === 'outline') e.currentTarget.style.background = 'var(--color-surface-subtle)';
    if (variant === 'ghost') e.currentTarget.style.opacity = '0.7';
  }
  function onLeave(e) {
    if (disabled || loading) return;
    if (variant === 'primary') e.currentTarget.style.background = 'var(--color-brand-teal)';
    if (variant === 'outline') e.currentTarget.style.background = 'var(--color-surface-white)';
    if (variant === 'ghost') e.currentTarget.style.opacity = '1';
  }

  return (
    <button style={style} disabled={disabled || loading} onClick={onClick} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {loading ? 'Loading…' : label}
    </button>
  );
}
