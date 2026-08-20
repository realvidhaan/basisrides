/**
 * Modal — centered overlay dialog.
 * @startingPoint section="Components" subtitle="Overlay dialog with title and footer actions" viewport="700x260"
 */
export interface ModalProps {
  open: boolean;
  title?: string;
  children?: any;
  onClose?: () => void;
  footer?: any;
}
