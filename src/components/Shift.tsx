/**
 * src/components/Shift.tsx
 *
 * "THE SHIFT" — the second beat: what Atrium actually lets you do. On
 * desktop the viewport pins and a row of four cards translates sideways
 * in exact lockstep with vertical scroll (`ease: "none"` — any eased tween
 * on top of scrub would desync the row from the input, since the "weight"
 * already comes from Lenis smoothing plus the scrub lag itself).
 *
 * As in Friction, this reads its own progress from ScrollTrigger's scrub
 * rather than the global scrollStore: the horizontal distance is local to
 * this section's own pixel geometry (track width minus viewport width),
 * which scrollStore's single page-wide 0-1 number can't express without
 * redoing the exact math ScrollTrigger already owns.
 *
 * Below 900px, or under prefers-reduced-motion, there's no pin and no
 * horizontal drag: the cards stack as plain vertical content, each fading
 * up as it's scrolled to — continuously scrub-tied, never a one-shot
 * trigger that could leave a card stranded invisible.
 */
"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { Panel } from "@/components/ui/Panel";
import { Label } from "@/components/ui/Label";
import { EASE_WEIGHTED, PIN_BREAKPOINT } from "@/lib/motion";

const CARDS = [
  {
    label: "01 — Navigate",
    title: "Move through the model",
    body: "Orbit, pan, and drop into any room without leaving the browser.",
  },
  {
    label: "02 — Inspect",
    title: "Open any element",
    body: "Click a wall, a fixture, a finish — see its spec on the spot.",
  },
  {
    label: "03 — Annotate",
    title: "Pin a comment in space",
    body: "Leave a note at the exact point in 3D it refers to, not a page number.",
  },
  {
    label: "04 — Revise",
    title: "Watch the revision change",
    body: "Swap in the next version and see precisely what moved.",
  },
];

const PINNED_QUERY = `(min-width: ${PIN_BREAKPOINT}px) and (prefers-reduced-motion: no-preference)`;
const STACKED_QUERY = `(max-width: ${PIN_BREAKPOINT - 0.02}px) and (prefers-reduced-motion: no-preference)`;

export function Shift() {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const pin = pinRef.current;
    const track = trackRef.current;
    if (!section || !pin || !track) return;

    const mm = gsap.matchMedia();

    mm.add({ pinned: PINNED_QUERY, stacked: STACKED_QUERY }, (context) => {
      const pinned = context.conditions?.pinned ?? false;

      if (pinned) {
        const distance = track.scrollWidth - pin.clientWidth;

        gsap.to(track, {
          x: -distance,
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: () => `+=${distance}`,
            pin,
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });
      } else {
        const cards = cardRefs.current.filter((el): el is HTMLDivElement => el !== null);
        gsap.set(cards, { autoAlpha: 0, y: 24 });
        cards.forEach((card) => {
          gsap.to(card, {
            autoAlpha: 1,
            y: 0,
            ease: EASE_WEIGHTED,
            scrollTrigger: { trigger: card, start: "top 85%", end: "top 60%", scrub: true },
          });
        });
      }
    });

    return () => mm.revert();
  }, []);

  return (
    <section ref={sectionRef} className="relative w-full">
      <div
        ref={pinRef}
        className="relative flex w-full flex-col gap-10 px-6 py-24 sm:px-10 md:px-16 min-[900px]:h-screen min-[900px]:flex-row min-[900px]:items-center min-[900px]:overflow-hidden min-[900px]:px-0 min-[900px]:py-0"
      >
        <Label as="div" className="mb-2 min-[900px]:absolute min-[900px]:left-16 min-[900px]:top-12 min-[900px]:mb-0">
          The Shift
        </Label>

        <div
          ref={trackRef}
          className="flex flex-col gap-8 min-[900px]:flex-row min-[900px]:flex-nowrap min-[900px]:gap-10 min-[900px]:px-[8vw]"
        >
          {CARDS.map((card, i) => (
            <div
              key={card.title}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              className="min-[900px]:w-[min(72vw,560px)] min-[900px]:shrink-0"
            >
              <Panel header={<Label>{card.label}</Label>}>
                <h3 className="mb-2 font-display text-lg text-ink">{card.title}</h3>
                <p className="text-sm text-muted">{card.body}</p>
              </Panel>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
