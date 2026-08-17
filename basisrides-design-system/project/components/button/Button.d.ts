/**
 * Button — primary action button for Ridr.
 * @startingPoint section="Components" subtitle="Primary, outline, ghost variants" viewport="700x160"
 */
export interface ButtonProps {
  /** Button label text */
  label: string;
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
}
