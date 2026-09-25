/**
 * src/components/ui/Button.tsx
 *
 * The two button variants ATRIUM ever needs: primary (solid brass, for the
 * one action per view that matters) and ghost (hairline border, for
 * everything else). Square corners throughout — the system stays sharp
 * everywhere except where a control must visibly read as clickable, and a
 * filled brass surface or bordered box already does that on its own.
 *
 * Pass `href` to render as a Next.js Link instead of a <button> — same
 * classes either way, so there's one canonical place button styling lives
 * rather than a hand-styled anchor duplicating it wherever a button needs
 * to navigate.
 *
 * buttonClassName is the same class string, exported standalone for the
 * one case an actual <Button> can't cover: Invitation.tsx's "Try your own
 * model" control needs this exact look on a <label> wrapping a hidden
 * file input (a real file picker has to be a <label>/<input type="file">
 * pair, not a button or a link) — reusing the string keeps that control a
 * visible peer of "Enter Project" rather than a second, hand-tuned
 * near-copy of this file's own classes.
 */
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import Link from "next/link";

interface ButtonOwnProps {
  variant?: "primary" | "ghost";
}

type ButtonAsButton = ButtonOwnProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

type ButtonAsLink = ButtonOwnProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

type ButtonProps = ButtonAsButton | ButtonAsLink;

const base =
  "inline-flex items-center justify-center px-6 py-3 font-mono text-3xs uppercase tracking-[0.18em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-ground disabled:opacity-40 disabled:pointer-events-none";

const variants = {
  primary: "bg-brass text-ground hover:bg-brass/90",
  ghost: "border border-rule text-ink hover:border-ruleHi hover:text-ink",
};

export function buttonClassName(variant: keyof typeof variants = "primary", className = ""): string {
  return `${base} ${variants[variant]} ${className}`;
}

export function Button({ variant = "primary", className = "", href, ...props }: ButtonProps) {
  const classes = buttonClassName(variant, className);

  if (href !== undefined) {
    return (
      <Link href={href} className={classes} {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)} />
    );
  }

  return <button className={classes} {...(props as ButtonHTMLAttributes<HTMLButtonElement>)} />;
}
