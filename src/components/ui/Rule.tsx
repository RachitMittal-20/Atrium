/**
 * src/components/ui/Rule.tsx
 *
 * A hairline divider styled after a drafting line. Optionally carries a
 * Label sitting on top of it, the way a technical drawing labels a section
 * cut. Used to separate specimen groups, panel sections, and lists.
 */
import { Label } from "./Label";

interface RuleProps {
  label?: string;
  className?: string;
}

export function Rule({ label, className = "" }: RuleProps) {
  if (!label) {
    return <hr className={`border-t border-rule ${className}`} />;
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Label>{label}</Label>
      <div className="h-px flex-1 bg-rule" />
    </div>
  );
}
