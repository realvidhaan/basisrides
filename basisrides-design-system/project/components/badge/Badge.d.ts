/**
 * Badge — small status pill.
 * @startingPoint section="Components" subtitle="Success, warning, error, neutral" viewport="700x90"
 */
export interface BadgeProps {
  label: string;
  variant?: 'success' | 'warning' | 'error' | 'neutral';
}
