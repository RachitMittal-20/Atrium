/**
 * src/components/ui/Panel.tsx
 *
 * A bordered surface container — the base shell for cards, sidebars, and
 * inspector boxes. Optionally takes a header slot, separated from the body
 * by a hairline Rule, so panels read like a labelled drawing frame rather
 * than a generic card.
 */
import type { ReactNode } from "react";
import { Rule } from "./Rule";

interface PanelProps {
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ header, children, className = "" }: PanelProps) {
  return (
    <div className={`border border-rule bg-surface ${className}`}>
      {header && (
        <>
          <div className="px-5 py-4">{header}</div>
          <Rule />
        </>
      )}
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}
