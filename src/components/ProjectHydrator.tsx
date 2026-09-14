/**
 * src/components/ProjectHydrator.tsx
 *
 * The handoff between the server-side fetch in src/app/project/page.tsx
 * and projectStore.ts: seeds the store with server-fetched data in a
 * useEffect, which only ever runs in the browser, never during server
 * rendering.
 *
 * That "never during SSR" is load-bearing, not incidental. projectStore
 * is a module-level Zustand singleton, and Next.js server-renders "use
 * client" components by default — a Node process handling several
 * concurrent requests for this route would all be reading and writing
 * that *one* store instance. Calling hydrate() from render (a useState
 * lazy initializer, tried first) mutated the store during that
 * server-side render, and one request's data visibly leaked into
 * another's output under concurrent load — confirmed by hitting
 * /project with overlapping requests before this was a useEffect, not
 * assumed. Deferring to useEffect means the server-rendered HTML never
 * reflects live per-request data through this store at all — every
 * request's SSR pass sees the same fixed pre-hydration default (the
 * local seed data in src/data/project.ts), which is safe to share
 * because it's a constant, not per-request state. The real data lands a
 * moment later, once this effect runs in that visitor's own browser,
 * which no other visitor's request can ever touch.
 *
 * The trade-off is a brief instant where anything already reading the
 * store (DemoDataBadge, ReviewList's collapsed rail) can show the local
 * seed's numbers before this effect corrects them — cosmetic, gone
 * within a frame or two, and nothing like the correctness problem the
 * earlier approach had.
 *
 * Nothing else in the app calls projectStore's hydrate() — this is its
 * one caller, on purpose.
 */
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useProjectStore, type HydrationData } from "@/store/projectStore";

interface ProjectHydratorProps {
  initial: HydrationData;
  children: ReactNode;
}

export function ProjectHydrator({ initial, children }: ProjectHydratorProps) {
  // Guards against re-hydrating (and re-flashing the demo defaults for a
  // frame) if this component ever re-renders for an unrelated reason —
  // `initial` is only meant to seed the store once, on mount.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    useProjectStore.getState().hydrate(initial);
  }, [initial]);

  return <>{children}</>;
}
