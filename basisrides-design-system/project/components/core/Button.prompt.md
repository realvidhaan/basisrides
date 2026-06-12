What & when: Primary tap target. Use `variant="primary"` for main CTAs (Login, Register, Verify), `variant="outline"` for secondary actions, `variant="ghost"` for tertiary/link-style.

```jsx
<Button label="Log in" variant="primary" />
<Button label="Register" variant="outline" />
<Button label="Forgot Password?" variant="ghost" size="sm" />
<Button label="Loading…" variant="primary" loading />
<Button label="Disabled" variant="primary" disabled />
```

Notable variants/props:
- `variant`: "primary" (red fill), "outline" (dark border), "ghost" (no border, subtle)
- `size`: "sm" (40px), "md" (52px default), "lg" (56px)
- `loading`: replaces label with animated spinner dots
- `disabled`: opacity 0.5, pointer-events none
