import React, { useState } from 'react';

export function Input({
  label,
  value = '',
  placeholder = '',
  type = 'text',
  error = null,
  disabled = false,
  helper = '',
  onChange,
}) {
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(error);

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: '16px',
    width: '100%',
    fontFamily: "Urbanist, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  };

  const labelStyle = {
    fontSize: '13px',
    fontWeight: 500,
    color: disabled ? '#A0A0A0' : '#0A0A0A',
    marginBottom: '6px',
  };

  const inputWrapStyle = {
    display: 'flex',
    alignItems: 'center',
    height: '52px',
    backgroundColor: disabled ? '#F7F8F9' : '#FFFFFF',
    borderRadius: '10px',
    boxShadow: hasError
      ? 'inset 0 0 0 1.5px #DC143C'
      : focused
      ? 'inset 0 0 0 1.5px #DC143C'
      : 'inset 0 0 0 1.5px #E0E0E0',
    paddingLeft: '16px',
    paddingRight: '16px',
    transition: 'box-shadow 150ms ease',
    boxSizing: 'border-box',
  };

  const inputStyle = {
    flex: 1,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: '15px',
    fontWeight: 500,
    color: disabled ? '#A0A0A0' : '#0A0A0A',
    fontFamily: 'inherit',
    padding: 0,
  };

  const errorStyle = {
    fontSize: '12px',
    color: '#DC143C',
    marginTop: '4px',
    fontWeight: 500,
  };

  const helperStyle = {
    fontSize: '12px',
    color: '#6B6B6B',
    marginTop: '4px',
  };

  return (
    <div style={containerStyle}>
      <label style={labelStyle}>{label}</label>
      <div style={inputWrapStyle}>
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange && onChange(e.target.value)}
          style={inputStyle}
        />
      </div>
      {hasError && <span style={errorStyle}>{error}</span>}
      {!hasError && helper && <span style={helperStyle}>{helper}</span>}
    </div>
  );
}
