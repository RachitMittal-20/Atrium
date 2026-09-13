/**
 * src/lib/motion.ts
 *
 * Shared motion constants for every animation in ATRIUM — durations and a
 * single weighted easing curve. No component hardcodes a duration or ease
 * string of its own; everything imports from here so timing stays coherent
 * across scroll reveals, panel transitions, and (later) the 3D scene.
 *
 * Registers CustomEase once at module load so EASE_WEIGHTED is usable
 * anywhere gsap.to/from/timeline accepts an ease.
 */
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(CustomEase);

// A heavy, weighted ease-out — quick departure, long unhurried settle. This
// is the "expensive" feel from the design brief, not a bounce or an overshoot.
export const EASE_WEIGHTED = CustomEase.create("atriumWeighted", "0.16, 1, 0.3, 1");

export const DURATION = {
  // Micro-interactions (hover feedback) — deliberately below the cinematic
  // scale below, since these need to read as instant, not as an entrance.
  instant: 0.25,
  fast: 0.4,
  base: 0.8,
  slow: 1.4,
  cinematic: 2.2,
} as const;

// Below this width, pinned and horizontally-scrubbed sections collapse to
// plain stacked content — pinned scroll is miserable on a phone. Shared so
// the scroll-narrative sections agree on exactly where that line is.
export const PIN_BREAKPOINT = 900;
