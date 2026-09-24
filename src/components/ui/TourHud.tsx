/**
 * src/components/ui/TourHud.tsx
 *
 * Tour mode's on-screen chrome — Prev/Next buttons and a progress
 * readout — mounted unconditionally in src/app/project/page.tsx
 * alongside every other always-mounted overlay (ModeIndicator,
 * CameraModeToggle, ...) and self-guarding internally, the same
 * convention ControlsHelp.tsx already uses: this renders nothing at all
 * unless projectStore's cameraMode is "tour". Lives outside the Canvas
 * in ordinary DOM — it never touches a three.js object directly, only
 * projectStore's tourIndex/tourNext/tourPrev, the same three actions
 * src/components/three/TourControls.tsx (inside the Canvas) drives from
 * wheel/swipe input. Clicking a button here and scrolling the 3D view
 * both do exactly the same thing, through exactly the same store
 * actions — this file is simply a third input method for the one piece
 * of state that matters, tourIndex.
 *
 * Reads whichever of `elements`/uploadedElements is currently active
 * (projectStore's customModelUrl set or not — see that store's own
 * header) rather than `elements` unconditionally: a custom uploaded
 * model has no category, so its readout drops that half of the
 * subtitle and shows just the position counter, and its label comes
 * from UploadedElement's own displayName field rather than a curated
 * Element's name.
 *
 * Prev/Next disable at the ends (tourIndex 0 / total - 1) rather than
 * wrapping — matches tourNext/tourPrev's own clamped, not wrapped,
 * behaviour in projectStore.ts (see that file's own comment on why: a
 * wrapping tour reads as "did that button just do nothing?" the moment
 * it silently loops past the last element).
 *
 * Docked as a full-width bar at the very bottom of the viewport
 * (inset-x-0 bottom-0), not a floating pill like Toast/the mobile
 * Comments sheet-toggle — this is the primary control surface for the
 * entire mode while it's active, not an occasional notification, so it
 * gets a permanent, unmissable strip rather than competing for the same
 * bottom-centre floating-pill real estate those transient elements
 * already use. z-20 (ElementPanel/ReviewList's own layer, not the z-30
 * toasts sit above) is deliberate: a toast firing mid-tour (a color-save
 * retry, say — an edge case, not a designed interaction between tour and
 * any of this app's other write paths) should still read as the more
 * urgent, foreground thing, not get buried under permanent tour chrome.
 */
"use client";

import { useProjectStore } from "@/store/projectStore";
import { Button } from "./Button";

export function TourHud() {
  const cameraMode = useProjectStore((state) => state.cameraMode);
  const customModelUrl = useProjectStore((state) => state.customModelUrl);
  const elements = useProjectStore((state) => state.elements);
  const uploadedElements = useProjectStore((state) => state.uploadedElements);
  const tourIndex = useProjectStore((state) => state.tourIndex);
  const tourNext = useProjectStore((state) => state.tourNext);
  const tourPrev = useProjectStore((state) => state.tourPrev);

  const usingCustomModel = customModelUrl !== null;
  const total = usingCustomModel ? uploadedElements.length : elements.length;

  // Nothing to show outside tour mode, and nothing to tour through if
  // the active source genuinely has zero entries — a defensive guard,
  // not an expected real-world state for the curated schedule, but a
  // real possibility for a custom model in the instant before
  // UploadedModel.tsx's own mount effect has traversed and populated
  // uploadedElements.
  if (cameraMode !== "tour" || total === 0) return null;

  // Guards against tourIndex briefly pointing past the end of a
  // just-shrunk active list — projectStore's tourNext/tourPrev/tourGoTo
  // all clamp against the *current* count on their own next call, but
  // nothing re-clamps tourIndex automatically the instant the list
  // itself changes size (switching custom models, say). Cheap enough to
  // guard against regardless.
  const label = usingCustomModel ? uploadedElements[tourIndex]?.displayName : elements[tourIndex]?.name;
  if (label === undefined) return null;
  // Category only exists on the curated shape — an uploaded mesh has no
  // equivalent, so the subtitle simply drops that half rather than
  // showing a placeholder for data that doesn't exist.
  const category = usingCustomModel ? null : elements[tourIndex]?.category;

  const atStart = tourIndex === 0;
  const atEnd = tourIndex === total - 1;

  return (
    <div
      role="group"
      aria-label="Tour navigation"
      className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-4 border-t border-rule bg-surface px-4 py-3 sm:px-8"
    >
      <Button
        type="button"
        variant="ghost"
        onClick={() => tourPrev()}
        disabled={atStart}
        aria-label="Previous element"
        className="shrink-0"
      >
        ‹ Prev
      </Button>

      <div className="flex min-w-0 flex-col items-center text-center">
        <span className="truncate font-mono text-2xs uppercase tracking-[0.18em] text-brass">{label}</span>
        <span className="font-mono text-3xs uppercase tracking-[0.18em] text-faint">
          {category ? `${category} · ` : ""}
          {tourIndex + 1} of {total}
        </span>
      </div>

      <Button
        type="button"
        variant="ghost"
        onClick={() => tourNext()}
        disabled={atEnd}
        aria-label="Next element"
        className="shrink-0"
      >
        Next ›
      </Button>
    </div>
  );
}
