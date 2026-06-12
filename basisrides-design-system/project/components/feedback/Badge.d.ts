/**
 * Badge — Status chip for ride states, grades, and labels.
 * Use inline with lists, cards, or profile rows.
 */
export interface BadgeProps {
  /** Display label */
  label: string;
  /** Color variant */
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  /** Size */
  size?: 'sm' | 'md';
}
