import React, { useState } from 'react';

export function Tabs({ tabs = [], activeId, onChange }) {
  const [internal, setInternal] = useState(tabs[0] && tabs[0].id);
  const active = activeId ?? internal;
  function select(id) {
    setInternal(id);
    if (onChange) onChange(id);
  }
  return (
    <div style={{ display: 'flex', gap: 24, borderBottom: '1.5px solid var(--color-border-subtle)', fontFamily: 'var(--font-heading)' }}>
      {tabs.map(t => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => select(t.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 0 12px', fontSize: 14, fontWeight: isActive ? 700 : 600,
              color: isActive ? 'var(--color-brand-teal-dark)' : 'var(--color-text-muted)',
              borderBottom: isActive ? '2px solid var(--color-brand-teal)' : '2px solid transparent',
              marginBottom: -1.5,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
