/**
 * src/components/ui/Label.tsx
 *
 * The tracked uppercase mono label used throughout ATRIUM for field names,
 * section headings, and annotations — anywhere text should read like a
 * specification callout rather than prose. Always IBM Plex Mono, always
 * uppercase, always tracked. Consumed by FieldRow and Panel headers, and
 * usable standalone.
 */
import type { ReactNode } from "react";

interface LabelProps {
  children: ReactNode;
  className?: string;
  as?: "span" | "div" | "label";
}

export function Label({ children, className = "", as: Tag = "span" }: LabelProps) {
  return (
    <Tag
      className={`font-mono text-3xs uppercase tracking-[0.18em] text-faint ${className}`}
    >
      {children}
    </Tag>
  );
}
