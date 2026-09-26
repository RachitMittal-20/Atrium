/**
 * src/lib/usePanelScroll.ts
 *
 * Scopes Lenis to a single scrollable panel — ElementPanel.tsx's spec/
 * history/comment-thread column, ReviewList.tsx's and
 * UploadedReviewList.tsx's row lists — rather than the page. Deliberately
 * separate from SmoothScrollProvider.tsx (which owns window/page scroll):
 * these are DOM elements inside fixed, already-positioned dock panels that
 * never move the page itself, so there's no ScrollTrigger/scrollStore
 * concern here, just "make this one element's internal scroll glide."
 *
 * Still obeys the one house rule SmoothScrollProvider itself follows —
 * "never its own RAF loop" — by ticking off the same gsap.ticker clock
 * instead of Lenis's autoRaf.
 *
 * Returns a pair of CALLBACK refs, not plain useRef objects — this is
 * load-bearing, not a style choice. ElementPanel.tsx's own function
 * component is mounted once, persistently, in page.tsx; the actual
 * scrollable div only exists inside its `{element && (...)}` conditional,
 * which starts out false. A plain `useRef` + `useEffect(() => {...},
 * [wrapperRef, contentRef])` fires exactly once, at ElementPanel's own
 * mount, while `wrapperRef.current`/`contentRef.current` are still null —
 * ref objects are stable, so that dependency array never changes and the
 * effect never runs again once the div actually appears later. Confirmed
 * by testing, not assumed: an early version of this hook used that exact
 * plain-ref shape and Lenis silently never attached to ElementPanel at
 * all (measured 0/0 scrollHeight — a *different*, already-unmounted node
 * — while working correctly for ReviewList's AnnotationRows, which
 * remounts as a whole component every time it expands and so never hits
 * this timing gap). Callback refs sidestep it entirely: React calls them
 * exactly when the DOM node they're attached to actually mounts or
 * unmounts, independent of the parent component's own render/effect
 * timing, so this hook's internal effect (keyed on the resulting state)
 * fires at the right moment regardless of which caller's mount shape it's
 * used from.
 *
 * wrapper/content mirror Lenis's own non-window usage: `wrapper` is the
 * element with `overflow-y-auto` (what actually has a scrollbar),
 * `content` is its one direct child holding everything that can grow
 * taller than it. Every caller of this hook already has that shape after
 * splitting its old single `overflow-y-auto` element into an outer
 * (wrapper) and inner (content) pair — see each caller's own comment for
 * why.
 *
 * Not called for every scrollable-looking panel in the app —
 * UploadedElementPanel.tsx measured out at a fixed, bounded content height
 * (name/category/color/hide-show, no spec sheet or comment thread) and
 * never actually overflows, so it stays on plain native scroll rather than
 * getting this wired in for nothing. See that file's own header.
 *
 * eventsTarget is pinned to the wrapper itself, not left at Lenis's own
 * default (window) — otherwise a wheel event anywhere over the panel is
 * also heard by SmoothScrollProvider's page-level Lenis instance, since
 * both would listen on the same window by default.
 *
 * Lenis's own `respectReducedMotion` (default true) already disables
 * smoothing under prefers-reduced-motion, so this hook doesn't duplicate
 * SmoothScrollProvider's manual matchMedia check — that file predates this
 * Lenis option and skips construction entirely instead, but for a small
 * per-panel instance there's nothing to skip that this option doesn't
 * already cover.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import gsap from "gsap";
import Lenis from "lenis";

export function usePanelScroll() {
  const [wrapper, setWrapper] = useState<HTMLElement | null>(null);
  const [content, setContent] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!wrapper || !content) return;

    // A touch faster than SmoothScrollProvider's page-scroll feel (0.1) —
    // tuned by feel: a short list of rows or fields reads better settling
    // a bit quicker than a full page's cinematic glide, which would read
    // as sluggish for a panel this size.
    const lenis = new Lenis({
      wrapper,
      content,
      eventsTarget: wrapper,
      lerp: 0.15,
      smoothWheel: true,
      syncTouch: false,
      autoRaf: false,
    });

    const onTick = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(onTick);

    return () => {
      gsap.ticker.remove(onTick);
      lenis.destroy();
    };
  }, [wrapper, content]);

  // Stable function identities across re-renders (setState setters never
  // change), wrapped in useMemo purely so callers can destructure once at
  // the top of their component without a fresh object every render.
  return useMemo(() => ({ wrapperRef: setWrapper, contentRef: setContent }), []);
}
