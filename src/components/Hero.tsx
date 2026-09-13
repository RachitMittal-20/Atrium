/**
 * src/components/Hero.tsx
 *
 * The hero — the single frame ATRIUM is judged on first. Layered back to
 * front: the graphite ground (the page background showing through), the
 * cinematic 3D scene (HeroScene) or its static fallback, the headline
 * type, and minimal chrome pinned to the corners.
 *
 * The WebGL layer is progressively enhanced, never required:
 *  - it defaults to rendering nothing extra (the graphite ground alone —
 *    already fully legible) until a client-only effect decides otherwise,
 *    so there's no SSR/hydration mismatch and no flash of the wrong mode.
 *  - below PIN_BREAKPOINT (900px) or under prefers-reduced-motion, that
 *    decision is a static pre-rendered still image — no WebGL is ever
 *    requested on a phone.
 *  - otherwise HeroScene mounts, with that same still passed as its
 *    `fallback` — r3f's own built-in fallback for when WebGL context
 *    creation itself fails. Either way, the headline sits on top and
 *    reads fine with nothing behind it at all.
 *  - past HeroScene's own scroll-driven arc (HERO_SCROLL_FRACTION, with a
 *    little headroom), the canvas unmounts entirely, freeing its WebGL
 *    context well before /project would ever need to open its own.
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

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { DURATION, EASE_WEIGHTED, PIN_BREAKPOINT } from "@/lib/motion";
import { useAppStore } from "@/store/appStore";
import { useScrollStore } from "@/store/scrollStore";
import { HeroScene, HERO_SCROLL_FRACTION } from "@/components/three/HeroScene";

const HERO_STILL_SRC = "/images/hero-model-still.jpg";

// A little past where HeroScene's own camera arc finishes settling, so the
// canvas doesn't vanish while still visibly mid-motion — and past where
// Hero itself has fully scrolled out of view (measured: Hero's own height
// is a somewhat larger fraction of total scroll than HERO_SCROLL_FRACTION
// alone accounts for) — but still well before the viewer has scrolled
// through the rest of the page.
const UNMOUNT_AT_PROGRESS = HERO_SCROLL_FRACTION * 1.5;

function HeroStill() {
  return (
    <Image
      src={HERO_STILL_SRC}
      alt=""
      aria-hidden="true"
      fill
      priority
      className="object-cover"
      sizes="100vw"
    />
  );
}

type CanvasMode = "pending" | "static" | "live";

function HeroWebGLLayer() {
  const [mode, setMode] = useState<CanvasMode>("pending");

  useLayoutEffect(() => {
    const decideMode = () => {
      const isNarrow = window.matchMedia(`(max-width: ${PIN_BREAKPOINT - 0.02}px)`).matches;
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      setMode(isNarrow || prefersReducedMotion ? "static" : "live");
    };
    decideMode();
  }, []);

  // Reference equality on a primitive boolean means this only re-renders
  // HeroWebGLLayer at the moment the threshold is actually crossed, not on
  // every scroll frame in between.
  const shouldMountCanvas = useScrollStore(
    (state) => state.progress < UNMOUNT_AT_PROGRESS,
  );

  if (mode === "pending") return null;
  if (mode === "static") return <HeroStill />;
  return shouldMountCanvas ? <HeroScene className="h-full w-full" fallback={<HeroStill />} /> : null;
}

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
      {/* Layer: the cinematic 3D scene (or its static/fallback stand-in) —
          see HeroWebGLLayer above for exactly when each renders. */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <HeroWebGLLayer />
      </div>

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
