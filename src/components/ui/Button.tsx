/**
 * src/components/ui/Button.tsx
 *
 * The two button variants ATRIUM ever needs: primary (solid brass, for the
 * one action per view that matters) and ghost (hairline border, for
 * everything else). Square corners throughout — the system stays sharp
 * everywhere except where a control must visibly read as clickable, and a
 * filled brass surface or bordered box already does that on its own.
 */
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
}

const base =
  "inline-flex items-center justify-center px-6 py-3 font-mono text-3xs uppercase tracking-[0.18em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-ground disabled:opacity-40 disabled:pointer-events-none";

const variants = {
  primary: "bg-brass text-ground hover:bg-brass/90",
  ghost: "border border-rule text-ink hover:border-ruleHi hover:text-ink",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
