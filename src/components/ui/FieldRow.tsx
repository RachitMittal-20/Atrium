/**
 * src/components/ui/FieldRow.tsx
 *
 * A single label/value row, the atomic unit of ATRIUM's specification
 * panels — dimensions, material codes, coordinates. The label uses the
 * standard tracked mono Label; the value is always mono with tabular
 * numerals so stacked rows of numbers line up like a spec sheet.
 */
import type { ReactNode } from "react";
import { Label } from "./Label";

interface FieldRowProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export function FieldRow({ label, value, className = "" }: FieldRowProps) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2 ${className}`}>
      <Label>{label}</Label>
      <span className="font-mono text-2xs tabular-nums text-ink">{value}</span>
    </div>
  );
}
