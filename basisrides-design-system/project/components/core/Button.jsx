import React from 'react';

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
}) {
  const heights = { sm: '40px', md: '52px', lg: '56px' };
  const fontSizes = { sm: '13px', md: '15px', lg: '15px' };

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: heights[size],
    borderRadius: '10px',
    fontSize: fontSizes[size],
    fontWeight: 700,
    fontFamily: "Urbanist, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'opacity 150ms ease, background 150ms ease',
    border: 'none',
    outline: 'none',
    letterSpacing: '0.01em',
    userSelect: 'none',
    boxSizing: 'border-box',
  };

  const variants = {
    primary: {
      background: '#DC143C',
      color: '#FFFFFF',
      boxShadow: 'none',
    },
    outline: {
      background: '#FFFFFF',
      color: '#1E232C',
      boxShadow: 'inset 0 0 0 1.5px #1E232C',
    },
    ghost: {
      background: 'transparent',
      color: '#DC143C',
      boxShadow: 'none',
    },
  };

  const style = { ...base, ...variants[variant] };

  function handleMouseEnter(e) {
    if (disabled || loading) return;
    if (variant === 'primary') e.currentTarget.style.background = '#B01030';
    if (variant === 'outline') e.currentTarget.style.background = '#F7F8F9';
    if (variant === 'ghost') e.currentTarget.style.opacity = '0.7';
  }

  function handleMouseLeave(e) {
    if (disabled || loading) return;
    if (variant === 'primary') e.currentTarget.style.background = '#DC143C';
    if (variant === 'outline') e.currentTarget.style.background = '#FFFFFF';
    if (variant === 'ghost') e.currentTarget.style.opacity = '1';
  }

  return (
    <button
      style={style}
      disabled={disabled || loading}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {loading ? <LoadingDots /> : label}
    </button>
  );
}

function LoadingDots() {
  return (
    <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: 'currentColor',
            animation: `buttonDotBounce 1s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes buttonDotBounce {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </span>
  );
}
