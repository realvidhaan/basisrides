import React from 'react';

export function ErrorBanner({ message }) {
  if (!message) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '8px',
      background: '#FFF1F1',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '16px',
      fontFamily: "Urbanist, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <span style={{ fontSize: '14px', lineHeight: '20px', flexShrink: 0 }}>⚠️</span>
      <span style={{
        flex: 1,
        fontSize: '14px',
        color: '#DC143C',
        lineHeight: '20px',
        fontWeight: 500,
      }}>
        {message}
      </span>
    </div>
  );
}
