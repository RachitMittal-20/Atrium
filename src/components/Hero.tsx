/**
 * src/components/Hero.tsx
 *
 * The hero — the single frame ATRIUM is judged on first. Layered back to
 * front: the graphite ground (the page background showing through), an
 * empty slot reserved for the WebGL scene a later prompt fills in, the
 * headline type, and minimal chrome pinned to the corners.
 *
 * Its entrance is one GSAP timeline gated on src/store/appStore's
 * isPreloaderComplete flag — set by Preloader's onComplete — so the hero
 * never animates while still hidden underneath the loading overlay. The
 * headline is split into lines with SplitText and revealed through a
 * masked upward sweep (never a plain opacity fade); the chrome fades up
 * after it, and the scroll cue fades in last as it starts its idle drift.
 *
 * Respects prefers-reduced-motion: skips SplitText and the timeline
 * entirely and just shows the finished layout, with no idle drift.
 */
"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { DURATION, EASE_WEIGHTED } from "@/lib/motion";
import { useAppStore } from "@/store/appStore";

export function Hero() {
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const wordmarkRef = useRef<HTMLSpanElement>(null);
  const enterButtonWrapRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);
  const labelLeftWrapRef = useRef<HTMLDivElement>(null);
  const labelRightWrapRef = useRef<HTMLDivElement>(null);
  const scrollCueRef = useRef<HTMLDivElement>(null);

  const splitRef = useRef<SplitText | null>(null);
  const hasPlayedRef = useRef(false);
  const reducedMotionRef = useRef(false);

  const isPreloaderComplete = useAppStore((state) => state.isPreloaderComplete);

  // Mount-time setup: split the headline into masked lines and hide every
  // element the entrance timeline animates, before the browser paints it.
  // The preloader covers the screen regardless, but this keeps the hero
  // correct even if the overlay were ever skipped or failed to mount.
  useLayoutEffect(() => {
    const headline = headlineRef.current;
    const cue = scrollCueRef.current;
    const chromeEls = [
      wordmarkRef.current,
      enterButtonWrapRef.current,
      subRef.current,
      labelLeftWrapRef.current,
      labelRightWrapRef.current,
    ].filter((el): el is HTMLElement => el !== null);
    if (!headline || !cue) return;

    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reducedMotionRef.current) return; // leave everything in its natural, visible state

    const split = SplitText.create(headline, { type: "lines", mask: "lines" });
    splitRef.current = split;

    gsap.set(split.lines, { yPercent: 100, willChange: "transform" });
    gsap.set(chromeEls, { autoAlpha: 0, y: 16 });
    gsap.set(cue, { autoAlpha: 0 });

    return () => {
      split.revert();
      splitRef.current = null;
    };
  }, []);

  // Plays once, exactly when the preloader's exit wipe finishes.
  useEffect(() => {
    if (!isPreloaderComplete || hasPlayedRef.current) return;
    hasPlayedRef.current = true;

    const cue = scrollCueRef.current;
    const split = splitRef.current;
    if (reducedMotionRef.current || !cue || !split) return; // already visible, nothing to play

    const chromeEls = [
      wordmarkRef.current,
      enterButtonWrapRef.current,
      subRef.current,
      labelLeftWrapRef.current,
      labelRightWrapRef.current,
    ].filter((el): el is HTMLElement => el !== null);

    // The scroll cue's continuous idle bob — starts the instant its fade-in
    // begins, and never runs at all under reduced motion.
    const startDrift = () => {
      gsap.to(cue, { y: 10, duration: 1.8, ease: "sine.inOut", repeat: -1, yoyo: true });
    };

    const tl = gsap.timeline({
      defaults: { ease: EASE_WEIGHTED },
      onComplete: () => {
        gsap.set(split.lines, { willChange: "auto" });
        split.revert();
        splitRef.current = null;
      },
    });

    tl.to(split.lines, { yPercent: 0, duration: DURATION.cinematic, stagger: 0.12 })
      .to(
        chromeEls,
        { autoAlpha: 1, y: 0, duration: DURATION.base, stagger: 0.06 },
        "-=0.9",
      )
      .to(cue, { autoAlpha: 1, duration: DURATION.base, onStart: startDrift }, "-=0.3");

    return () => {
      tl.kill();
    };
  }, [isPreloaderComplete]);

  return (
    <section className="relative w-full overflow-hidden bg-ground px-6 py-20 sm:px-10 sm:py-28 md:px-16 md:py-36">
      {/* Layer: WebGL scene slot. Deliberately empty — a later prompt mounts
          an r3f <Canvas> here, between the ground and the headline, so the
          3D model sits inside the composition without ever covering the
          text layer above it. */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex w-full max-w-[100rem] flex-col gap-16 md:gap-24">
        {/* Top chrome: wordmark, enter-project action */}
        <div className="flex items-center justify-between gap-4">
          <span
            ref={wordmarkRef}
            className="font-display text-sm tracking-wide text-ink"
          >
            ATRIUM
          </span>
          <div ref={enterButtonWrapRef}>
            <Button href="/project" variant="ghost">Enter Project</Button>
          </div>
        </div>

        {/* Headline + sub-copy */}
        <div className="flex flex-col gap-8">
          <h1
            ref={headlineRef}
            className="font-display text-[clamp(56px,9vw,150px)] leading-[0.92] tracking-[0.02em] text-ink"
          >
            DRAWINGS
            <br />
            DON’T TALK BACK.
          </h1>
          <p ref={subRef} className="max-w-md text-sm text-muted">
            ATRIUM turns a building model into the conversation: click any
            element for its spec, or drop a comment directly onto the design.
          </p>
        </div>

        {/* Bottom chrome: guild labels either side of the scroll cue —
            stacks to a single centred column at phone width. */}
        <div className="grid grid-cols-1 items-center gap-8 text-center sm:grid-cols-3 sm:text-left">
          <div ref={labelLeftWrapRef} className="justify-self-center sm:justify-self-start">
            <Label>Archscale Guild / AS-08</Label>
          </div>

          <div className="justify-self-center">
            <div
              ref={scrollCueRef}
              className="flex h-16 w-16 items-center justify-center rounded-full border border-brass"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                className="text-brass"
              >
                <path
                  d="M2 6L8 12L14 6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <div ref={labelRightWrapRef} className="justify-self-center sm:justify-self-end">
            <Label>01 — Arrival</Label>
          </div>
        </div>
      </div>
    </section>
  );
}
