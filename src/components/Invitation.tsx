/**
 * src/components/Invitation.tsx
 *
 * "THE INVITATION" — the close of the scroll narrative: a tall, quiet
 * section that hands off to the tool itself. The line reveals with the
 * same masked-line technique as the Hero headline (SplitText into lines,
 * sweep up from below the mask edge) for visual continuity — the one
 * difference is what starts it: the Hero's reveal is gated on the
 * preloader finishing, this one plays once when scrolled into view.
 *
 * No pinning or horizontal scroll here, so the 900px rule doesn't apply —
 * only prefers-reduced-motion matters, and when it's set this skips
 * SplitText and the timeline entirely: the line and button are plain,
 * static, and already visible.
 */
"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { Button } from "@/components/ui/Button";
import { DURATION, EASE_WEIGHTED } from "@/lib/motion";

export function Invitation() {
  const lineRef = useRef<HTMLHeadingElement>(null);
  const buttonWrapRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const line = lineRef.current;
    const buttonWrap = buttonWrapRef.current;
    if (!line || !buttonWrap) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) return; // leave both in their natural, visible state

    const split = SplitText.create(line, { type: "lines", mask: "lines" });
    gsap.set(split.lines, { yPercent: 100, willChange: "transform" });
    gsap.set(buttonWrap, { autoAlpha: 0, y: 16 });

    const tl = gsap.timeline({
      scrollTrigger: { trigger: line, start: "top 75%", toggleActions: "play none none none" },
      onComplete: () => {
        gsap.set(split.lines, { willChange: "auto" });
        split.revert();
      },
    });

    tl.to(split.lines, { yPercent: 0, duration: DURATION.cinematic, ease: EASE_WEIGHTED }).to(
      buttonWrap,
      { autoAlpha: 1, y: 0, duration: DURATION.base, ease: EASE_WEIGHTED },
      "-=1.2",
    );

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
      split.revert();
    };
  }, []);

  return (
    <section className="flex w-full flex-col items-center justify-center gap-14 px-6 py-40 text-center sm:px-10 sm:py-52 md:py-64">
      <h2
        ref={lineRef}
        className="font-display text-[clamp(38px,7vw,96px)] leading-[0.95] tracking-[0.02em] text-ink"
      >
        See it instead.
      </h2>
      <div ref={buttonWrapRef}>
        <Button href="/project" variant="primary">
          Enter Project
        </Button>
      </div>
    </section>
  );
}
