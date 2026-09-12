/**
 * src/components/motion/Preloader.tsx
 *
 * The first thing a judge sees. A full-screen ground-coloured overlay that
 * tracks genuine asset loading — via three.js's DefaultLoadingManager,
 * which every loader in the app reports to — rather than a fake timer.
 * When (and only when) loading is truly done, it holds a beat, fades its
 * own content, then wipes upward off screen. Only after that wipe finishes
 * does it flip src/store/appStore's isPreloaderComplete flag and call the
 * optional onComplete prop, so the hero (or anything else) can sequence
 * its entrance off real completion instead of animating underneath it.
 *
 * Shown once per browser session (sessionStorage-gated) and skipped
 * entirely — instant reveal, no animation — when prefers-reduced-motion
 * is set. Lives once in the root layout, so client-side route changes
 * never remount or re-trigger it.
 */
"use client";

import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { DefaultLoadingManager } from "three";
import { Label } from "@/components/ui/Label";
import { DURATION, EASE_WEIGHTED } from "@/lib/motion";
import { useAppStore } from "@/store/appStore";

const SESSION_KEY = "atrium:preloader-shown";
// If nothing ever registers with the loading manager (no model/texture on
// this page yet), there's nothing to wait for — "genuinely ready" is true
// immediately. This grace window just gives loaders a moment to announce
// themselves before we conclude that.
const NO_ASSETS_GRACE_MS = 300;

interface PreloaderProps {
  onComplete?: () => void;
}

export function Preloader({ onComplete }: PreloaderProps) {
  const [mounted, setMounted] = useState(true);
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLParagraphElement>(null);
  const ruleFillRef = useRef<HTMLDivElement>(null);
  const setHasLoaded = useAppStore((state) => state.setHasLoaded);
  const setPreloaderComplete = useAppStore((state) => state.setPreloaderComplete);

  useLayoutEffect(() => {
    let cancelled = false;

    // Runs once, however the sequence ends: mark the app loaded, let any
    // waiting hero know it's safe to animate, unmount this overlay, and
    // persist that this session has now resolved its preload gate.
    //
    // The sessionStorage write lives here — at genuine completion — rather
    // than at the top of the effect. In dev, React's Strict Mode mounts
    // this effect twice (mount, cleanup, mount again) synchronously to
    // surface impure effects; a write at the top would land during the
    // first, thrown-away mount and make the real mount think a previous
    // session already showed it. Writing only from `finish()` is safe
    // because the throwaway mount's timers are cleared by its cleanup
    // before they can ever reach this point.
    const finish = () => {
      if (cancelled) return;
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // Storage unavailable (private browsing, quota) — worst case the
        // preloader plays again next load. Not worth failing over.
      }
      setHasLoaded(true);
      setPreloaderComplete(true);
      setMounted(false);
      onComplete?.();
    };

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      alreadyShown = false;
    }

    if (prefersReducedMotion || alreadyShown) {
      finish();
      return;
    }

    const counter = counterRef.current;
    const ruleFill = ruleFillRef.current;
    const content = contentRef.current;
    const overlay = overlayRef.current;
    if (!counter || !ruleFill || !content || !overlay) {
      finish();
      return;
    }

    // The number GSAP actually animates; the DOM is written from it on
    // every tick rather than driving re-renders through React state.
    const display = { value: 0 };
    let started = false;
    let exiting = false;

    const render = () => {
      counter.textContent = `${Math.round(display.value)}%`;
      gsap.set(ruleFill, { scaleX: display.value / 100 });
    };

    const animateTo = (target: number) => {
      gsap.to(display, {
        value: target,
        duration: DURATION.base,
        ease: EASE_WEIGHTED,
        onUpdate: render,
      });
    };

    // The one timeline that sequences the exit: hold at 100%, fade the
    // eyebrow/counter/rule, then wipe the whole overlay upward — and only
    // once ALL of that has finished does `finish()` run.
    const playExit = () => {
      if (exiting) return;
      exiting = true;

      gsap.killTweensOf(display);
      display.value = 100;
      render();

      gsap
        .timeline({ delay: DURATION.fast, onComplete: finish })
        .to(content, { autoAlpha: 0, duration: DURATION.base, ease: EASE_WEIGHTED })
        .to(
          overlay,
          { yPercent: -100, duration: DURATION.cinematic, ease: EASE_WEIGHTED },
          ">-0.1",
        );
    };

    const manager = DefaultLoadingManager;
    const prevOnStart = manager.onStart;
    const prevOnProgress = manager.onProgress;
    const prevOnLoad = manager.onLoad;
    const prevOnError = manager.onError;

    manager.onStart = (url, loaded, total) => {
      started = true;
      animateTo(total > 0 ? (loaded / total) * 100 : 0);
      prevOnStart?.(url, loaded, total);
    };

    manager.onProgress = (url, loaded, total) => {
      started = true;
      animateTo(total > 0 ? (loaded / total) * 100 : 100);
      prevOnProgress(url, loaded, total);
    };

    manager.onLoad = () => {
      playExit();
      prevOnLoad();
    };

    manager.onError = (url) => {
      // A missing texture shouldn't strand a judge on a loading screen.
      playExit();
      prevOnError(url);
    };

    const graceTimer = window.setTimeout(() => {
      if (!started) playExit();
    }, NO_ASSETS_GRACE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(graceTimer);
      manager.onStart = prevOnStart;
      manager.onProgress = prevOnProgress;
      manager.onLoad = prevOnLoad;
      manager.onError = prevOnError;
    };
    // Intentionally mount-only: this wires up global loader callbacks once
    // and must not re-run if onComplete's identity changes across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ground"
    >
      <div ref={contentRef} className="flex flex-col items-center gap-6 px-6 text-center">
        <Label>ATRIUM — Interactive Design Review</Label>
        <p
          ref={counterRef}
          className="font-display text-3xl tabular-nums text-ink"
        >
          0%
        </p>
        <div className="h-px w-60 bg-rule">
          <div ref={ruleFillRef} className="h-px w-full origin-left scale-x-0 bg-brass" />
        </div>
      </div>
    </div>
  );
}
