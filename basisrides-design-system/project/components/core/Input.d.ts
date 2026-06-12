/**
 * Input — Labeled text input with optional error state and right accessory.
 * Use for all form fields: email, password, name, neighborhood, car capacity.
 */
export interface InputProps {
  /** Field label shown above the input */
  label: string;
  /** Current value */
  value?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Input type */
  type?: 'text' | 'email' | 'password' | 'number' | 'tel';
  /** Error message shown below the input */
  error?: string | null;
  /** Disabled state */
  disabled?: boolean;
  /** Helper text shown below when no error */
  helper?: string;
  /** onChange handler */
  onChange?: (value: string) => void;
}
