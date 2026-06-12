/**
 * Button — Primary action button for BasisRides.
 * Use for all form submissions and primary CTAs.
 *
 * @startingPoint section="Components" subtitle="Primary, outline, ghost button variants" viewport="700x160"
 */
export interface ButtonProps {
  /** Button label text */
  label: string;
  /** Visual style variant */
  variant?: 'primary' | 'outline' | 'ghost';
  /** Size */
  size?: 'sm' | 'md' | 'lg';
  /** Disabled state — reduces opacity to 0.5 */
  disabled?: boolean;
  /** Shows a spinner instead of the label */
  loading?: boolean;
  /** Click handler */
  onClick?: () => void;
}
