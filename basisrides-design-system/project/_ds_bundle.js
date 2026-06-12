/* @ds-bundle: {"format":3,"namespace":"BasisRidesDesignSystem_e37a2c","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"ErrorBanner","sourcePath":"components/core/ErrorBanner.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Badge","sourcePath":"components/feedback/Badge.jsx"}],"sourceHashes":{"components/core/Button.jsx":"6838ed739dc4","components/core/ErrorBanner.jsx":"93834b862757","components/core/Input.jsx":"77a7619620b7","components/feedback/Badge.jsx":"e0dc03ccb48b"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.BasisRidesDesignSystem_e37a2c = window.BasisRidesDesignSystem_e37a2c || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Button.jsx
try { (() => {
function Button({
  label,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick
}) {
  const heights = {
    sm: '40px',
    md: '52px',
    lg: '56px'
  };
  const fontSizes = {
    sm: '13px',
    md: '15px',
    lg: '15px'
  };
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
    boxSizing: 'border-box'
  };
  const variants = {
    primary: {
      background: '#DC143C',
      color: '#FFFFFF',
      boxShadow: 'none'
    },
    outline: {
      background: '#FFFFFF',
      color: '#1E232C',
      boxShadow: 'inset 0 0 0 1.5px #1E232C'
    },
    ghost: {
      background: 'transparent',
      color: '#DC143C',
      boxShadow: 'none'
    }
  };
  const style = {
    ...base,
    ...variants[variant]
  };
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
  return /*#__PURE__*/React.createElement("button", {
    style: style,
    disabled: disabled || loading,
    onClick: onClick,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave
  }, loading ? /*#__PURE__*/React.createElement(LoadingDots, null) : label);
}
function LoadingDots() {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      gap: '4px',
      alignItems: 'center'
    }
  }, [0, 1, 2].map(i => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: 'currentColor',
      animation: `buttonDotBounce 1s ease-in-out ${i * 0.15}s infinite`
    }
  })), /*#__PURE__*/React.createElement("style", null, `
        @keyframes buttonDotBounce {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/ErrorBanner.jsx
try { (() => {
function ErrorBanner({
  message
}) {
  if (!message) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '8px',
      background: '#FFF1F1',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '16px',
      fontFamily: "Urbanist, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '14px',
      lineHeight: '20px',
      flexShrink: 0
    }
  }, "\u26A0\uFE0F"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: '14px',
      color: '#DC143C',
      lineHeight: '20px',
      fontWeight: 500
    }
  }, message));
}
Object.assign(__ds_scope, { ErrorBanner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/ErrorBanner.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
const {
  useState
} = React;
function Input({
  label,
  value = '',
  placeholder = '',
  type = 'text',
  error = null,
  disabled = false,
  helper = '',
  onChange
}) {
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(error);
  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: '16px',
    width: '100%',
    fontFamily: "Urbanist, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  };
  const labelStyle = {
    fontSize: '13px',
    fontWeight: 500,
    color: disabled ? '#A0A0A0' : '#0A0A0A',
    marginBottom: '6px'
  };
  const inputWrapStyle = {
    display: 'flex',
    alignItems: 'center',
    height: '52px',
    backgroundColor: disabled ? '#F7F8F9' : '#FFFFFF',
    borderRadius: '10px',
    boxShadow: hasError ? 'inset 0 0 0 1.5px #DC143C' : focused ? 'inset 0 0 0 1.5px #DC143C' : 'inset 0 0 0 1.5px #E0E0E0',
    paddingLeft: '16px',
    paddingRight: '16px',
    transition: 'box-shadow 150ms ease',
    boxSizing: 'border-box'
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
    padding: 0
  };
  const errorStyle = {
    fontSize: '12px',
    color: '#DC143C',
    marginTop: '4px',
    fontWeight: 500
  };
  const helperStyle = {
    fontSize: '12px',
    color: '#6B6B6B',
    marginTop: '4px'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: containerStyle
  }, /*#__PURE__*/React.createElement("label", {
    style: labelStyle
  }, label), /*#__PURE__*/React.createElement("div", {
    style: inputWrapStyle
  }, /*#__PURE__*/React.createElement("input", {
    type: type,
    value: value,
    placeholder: placeholder,
    disabled: disabled,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onChange: e => onChange && onChange(e.target.value),
    style: inputStyle
  })), hasError && /*#__PURE__*/React.createElement("span", {
    style: errorStyle
  }, error), !hasError && helper && /*#__PURE__*/React.createElement("span", {
    style: helperStyle
  }, helper));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Badge.jsx
try { (() => {
function Badge({
  label,
  variant = 'default',
  size = 'md'
}) {
  const colors = {
    default: {
      bg: '#F7F8F9',
      color: '#6A707C',
      border: '#DADADA'
    },
    success: {
      bg: '#F0FDF4',
      color: '#16A34A',
      border: '#BBF7D0'
    },
    warning: {
      bg: '#FFF7ED',
      color: '#FF9500',
      border: '#FED7AA'
    },
    error: {
      bg: '#FFF1F1',
      color: '#DC143C',
      border: '#FECACA'
    },
    info: {
      bg: '#EFF6FF',
      color: '#2563EB',
      border: '#BFDBFE'
    }
  };
  const sizes = {
    sm: {
      fontSize: '11px',
      padding: '2px 8px',
      height: '20px'
    },
    md: {
      fontSize: '12px',
      padding: '4px 10px',
      height: '24px'
    }
  };
  const c = colors[variant];
  const s = sizes[size];
  return /*#__PURE__*/React.createElement("span", {
    style: {
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
      whiteSpace: 'nowrap'
    }
  }, label);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Badge.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.ErrorBanner = __ds_scope.ErrorBanner;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Badge = __ds_scope.Badge;

})();
