import React, { useState } from 'react';

export function Input({ label, placeholder, value, onChange, type = 'text', error, disabled = false }) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? 'var(--color-border-error)' : focused ? 'var(--color-border-focus)' : 'var(--color-border-default)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-body)' }}>
      {label && <label style={{ fontSize: 'var(--fs-body-sm)', fontWeight: 'var(--fw-medium)', color: 'var(--color-ink)' }}>{label}</label>}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          height: 48,
          borderRadius: 'var(--radius-input)',
          background: disabled ? 'var(--color-surface-overlay)' : 'var(--color-surface-subtle)',
          boxShadow: 'inset 0 0 0 1.5px ' + borderColor,
          border: 'none',
          outline: 'none',
          padding: '0 14px',
          fontSize: 'var(--fs-body)',
          color: 'var(--color-ink)',
          boxSizing: 'border-box',
          transition: 'box-shadow var(--transition-fast)',
        }}
      />
      {error && <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--color-error)' }}>{error}</span>}
    </div>
  );
}
