/**
 * src/components/Friction.tsx
 *
 * "THE FRICTION" — the first beat of the scroll narrative, arguing the
 * problem before Atrium is ever shown. On desktop this section pins while
 * three statements swap in place, each replacing the last, driven purely
 * by scroll position: a scrubbed GSAP timeline crossfades between them,
 * so "how far through" always equals "how far scrolled," never a clock.
 *
 * ScrollTrigger's own local progress (via `scrub`) drives that crossfade —
 * not the global src/store/scrollStore value, which is deliberate: that
 * store holds one page-wide 0-1 number, and re-deriving this section's
 * local progress from it would mean redoing the exact start/end math
 * ScrollTrigger already does internally for free. scrollStore stays the
 * right tool for whole-page reads (the 3D scene, later); scrub is the
 * right tool here.
 *
 * Below 900px wide, or under prefers-reduced-motion, there's no pin and no
 * scrub: the three statements render as plain stacked text (mobile) or, at
 * exactly that width with motion allowed, get a gentle scroll-scrubbed
 * fade-up per line — always continuously tied to scroll position, never a
 * one-shot trigger that could leave text stranded invisible.
 */
"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { Label } from "@/components/ui/Label";
import { EASE_WEIGHTED, PIN_BREAKPOINT } from "@/lib/motion";

const STATEMENTS = [
  "A revision lands as a 40-page PDF.",
  "The comment says “the window on the left.” There are nine.",
  "Two weeks later, nobody remembers which one.",
];

const PINNED_QUERY = `(min-width: ${PIN_BREAKPOINT}px) and (prefers-reduced-motion: no-preference)`;
const STACKED_QUERY = `(max-width: ${PIN_BREAKPOINT - 0.02}px) and (prefers-reduced-motion: no-preference)`;

export function Friction() {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const statementRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const pin = pinRef.current;
    const statements = statementRefs.current.filter(
      (el): el is HTMLParagraphElement => el !== null,
    );
    if (!section || !pin || statements.length !== STATEMENTS.length) return;

    const mm = gsap.matchMedia();

    mm.add({ pinned: PINNED_QUERY, stacked: STACKED_QUERY }, (context) => {
      const pinned = context.conditions?.pinned ?? false;
      const [first, second, third] = statements;

      if (pinned) {
        gsap.set([second, third], { autoAlpha: 0 });
        gsap.set(first, { autoAlpha: 1 });

        // Seven equal units: hold, crossfade, hold, crossfade, hold — each
        // statement gets a full unit of undisturbed reading time either
        // side of its transition, spread across the whole pin runway.
        gsap
          .timeline({
            scrollTrigger: {
              trigger: section,
              start: "top top",
              end: "bottom bottom",
              pin,
              scrub: 0.6,
            },
          })
          .to({}, { duration: 1 })
          .to(first, { autoAlpha: 0, duration: 1, ease: EASE_WEIGHTED })
          .to(second, { autoAlpha: 1, duration: 1, ease: EASE_WEIGHTED }, "<")
          .to({}, { duration: 1 })
          .to(second, { autoAlpha: 0, duration: 1, ease: EASE_WEIGHTED })
          .to(third, { autoAlpha: 1, duration: 1, ease: EASE_WEIGHTED }, "<")
          .to({}, { duration: 1 });
      } else {
        gsap.set(statements, { autoAlpha: 0, y: 24 });
        statements.forEach((el) => {
          gsap.to(el, {
            autoAlpha: 1,
            y: 0,
            ease: EASE_WEIGHTED,
            scrollTrigger: { trigger: el, start: "top 85%", end: "top 55%", scrub: true },
          });
        });
      }
    });

    return () => mm.revert();
  }, []);

  return (
    <section ref={sectionRef} className="relative w-full min-[900px]:h-[320vh]">
      <div
        ref={pinRef}
        className="relative flex w-full flex-col items-center gap-16 px-6 py-28 text-center sm:px-10 min-[900px]:h-screen min-[900px]:justify-center min-[900px]:gap-0 min-[900px]:py-0"
      >
        <Label as="div" className="min-[900px]:absolute min-[900px]:top-16">
          The Friction
        </Label>

        <div className="relative flex w-full max-w-4xl flex-col gap-16 min-[900px]:min-h-[2.6em] min-[900px]:gap-0">
          {STATEMENTS.map((text, i) => (
            <p
              key={text}
              ref={(el) => {
                statementRefs.current[i] = el;
              }}
              className="font-display text-[clamp(28px,5vw,52px)] leading-tight text-ink min-[900px]:absolute min-[900px]:inset-0 min-[900px]:flex min-[900px]:items-center min-[900px]:justify-center"
            >
              {text}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
