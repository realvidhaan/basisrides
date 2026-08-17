/**
 * Input — labeled text field with focus and error states.
 * @startingPoint section="Components" subtitle="Label, focus ring, error message" viewport="700x180"
 */
export interface InputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: any) => void;
  type?: string;
  error?: string;
  disabled?: boolean;
}
