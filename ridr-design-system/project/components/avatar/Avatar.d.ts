/**
 * Avatar — circular photo or initials fallback for parents/drivers.
 * @startingPoint section="Components" subtitle="Photo or initials, 3 sizes" viewport="700x120"
 */
export interface AvatarProps {
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
}
