Centered overlay dialog. Renders nothing when `open` is false.

```jsx
<Modal open={showConfirm} title="Cancel this ride?" onClose={close} footer={<Button label="Confirm" />}>
  This will notify the other riders.
</Modal>
```
