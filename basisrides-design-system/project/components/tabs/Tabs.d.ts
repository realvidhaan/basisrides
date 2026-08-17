/**
 * Tabs — underline tab navigation.
 * @startingPoint section="Components" subtitle="Underline indicator in brand teal" viewport="700x100"
 */
export interface TabsProps {
  tabs: { id: string; label: string }[];
  activeId?: string;
  onChange?: (id: string) => void;
}
