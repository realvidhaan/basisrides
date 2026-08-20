Labeled text input. Focus border switches to teal; error switches to red and shows a message below.

```jsx
<Input label="Email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
```
