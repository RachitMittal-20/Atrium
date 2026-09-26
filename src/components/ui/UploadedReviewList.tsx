/**
 * src/components/ui/UploadedReviewList.tsx
 *
 * ReviewList.tsx's sibling for a custom (uploaded) model — the flat list
 * counterpart to UploadedAnnotationMarker.tsx's 3D rings, the same
 * relationship ReviewList itself has to AnnotationMarker.tsx. A separate
 * component rather than ReviewList branching internally, for the same
 * reason UploadedElementPanel exists alongside ElementPanel: a
 * CustomAnnotation (projectStore.ts) has no elementId, no replies, and no
 * database row behind it, so this only ever shows what a custom-model
 * session actually tracks.
 *
 * Two real shape differences from ReviewList that show up below, not
 * copy-pasted past:
 *  - CustomAnnotation.meshName already IS the key UploadedElementPanel
 *    looks elements up by — there's no elementId → element → meshName
 *    hop the way curated annotations need (see ReviewList's own
 *    openAnnotation). openCustomAnnotation below calls setSelected
 *    straight off annotation.meshName.
 *  - No category filter: an ElementCategory chain would have to go
 *    through uploadedElements by meshName, and a typical upload session
 *    has too few categorized elements and too few pins for a category
 *    filter to earn its keep yet. Cut deliberately, not a placeholder —
 *    add it if a real session turns out to need it. Status (All/Open/
 *    Resolved) is kept: toggleCustomAnnotationStatus already exists and a
 *    handful of pins in one session plausibly does need that split.
 *
 * Everything else here is a deliberate, load-bearing mirror rather than a
 * fresh design:
 *  - hoveredAnnotationId/recentlyAddedAnnotationId are the exact same
 *    store fields ReviewList's own rows use, not a parallel pair — they're
 *    plain string ids compared by equality, so one field already covers
 *    both a curated Annotation.id and a CustomAnnotation.id with no
 *    collision risk (crypto.randomUUID() both sides). pinCustomAnnotation
 *    (projectStore.ts) now stamps recentlyAddedAnnotationId the same way
 *    pinAnnotation always has, so a freshly placed custom pin gets the
 *    identical one-shot brass flash.
 *  - registerAnnotationObject/getAnnotationObject: the same registry
 *    UploadedAnnotationMarker.tsx already populates (keyed by plain
 *    annotation-id string, never tied to the curated Annotation type), so
 *    a row click here eases the camera through the identical
 *    lib/motion helpers ReviewList uses, no second registry to keep in
 *    sync.
 *  - The desktop rail-collapse / mobile bottom-sheet split: kept, because
 *    it's the panel *chrome*, not annotation-shape-specific, and
 *    UploadedElementPanel already occupies the mirror-image right dock at
 *    the same breakpoint — without this, both models would leave their
 *    review list looking different for no reason tied to what a custom
 *    model actually lacks.
 *
 * One real gap, documented rather than silently accepted: ReviewList's
 * mobile pairing avoids stacking two full-height sheets by rendering
 * AnnotationRows *inside* ElementPanel's own COMMENTS tab whenever its
 * sheet is open. UploadedElementPanel has no such tab (see its own
 * header — it's a single scrollable view, not a tabbed one), so on mobile
 * this list simply hides while an uploaded element is selected, the same
 * way the floating pill below is gated. In practice this rarely bites:
 * enterPinMode (projectStore.ts) already clears selectedElementId before
 * a pin is placed, so the common "place a pin, then browse the list"
 * flow never has an element panel open at the same time. Revisit only if
 * real use shows people re-selecting elements while wanting the list
 * open on mobile.
 *
 * "J"/"K" stepping is NOT duplicated here — ReviewList.tsx registers that
 * globally off state.annotations regardless of which model is mounted,
 * and giving a custom-model session a second, parallel keydown listener
 * over customAnnotations would fire both at once whenever any list is
 * visible. Left as a real, scoped-out gap: rows are still reachable by
 * click, just not by keyboard, for this round.
 *
 * The row list is wired to usePanelScroll.ts (Lenis, scoped to this one
 * element, ticked off the shared gsap.ticker clock) — measured, not
 * assumed: 3 real placed pins didn't overflow this panel's fixed height,
 * but the same list widget crosses into real overflow around 6-7, a
 * realistic count for one "try it out" sitting. UploadedElementPanel.tsx
 * measured the opposite way (never overflows — its content is fixed and
 * short by design) and stays on plain native scroll; see that file and
 * usePanelScroll.ts's own headers for both measurements.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { useProjectStore, type CustomAnnotation } from "@/store/projectStore";
import { DURATION, PIN_BREAKPOINT, annotationCameraTarget, easeCameraTo } from "@/lib/motion";
import { relativeTime } from "@/lib/format";
import { useIsMobile } from "@/lib/responsive";
import { usePanelScroll } from "@/lib/usePanelScroll";
import { Label } from "./Label";
import { Rule } from "./Rule";

const PANEL_WIDTH = 320;
const RAIL_WIDTH = 56;

// Mirrors ReviewList.tsx's own FLASH_DURATION exactly — restated rather
// than imported since ReviewList doesn't export it, the same "small,
// stable, purely visual constant" call this codebase already makes for
// its brass hex values.
const FLASH_DURATION = 1.2;

type StatusFilter = "all" | "open" | "resolved";

// The one place "ease the camera to this custom pin" happens — row
// clicks here, called identically to ReviewList's own openAnnotation but
// reading customAnnotations' registry entries and setting selection
// straight off meshName (no elementId hop to make, see file header).
function openCustomAnnotation(annotation: CustomAnnotation) {
  const state = useProjectStore.getState();
  const { controls, invalidate } = state.getViewport();
  const object = state.getAnnotationObject(annotation.id);
  if (controls && invalidate && object) {
    const camera = controls.object;
    const { target, position } = annotationCameraTarget(object, controls);
    easeCameraTo(controls, camera, invalidate, target, position);
  }
  if (annotation.meshName) state.setSelected(annotation.meshName);
}

interface CustomAnnotationRowProps {
  annotation: CustomAnnotation;
  number: number;
  elementName: string;
  isHovered: boolean;
  isFlashing: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}

function CustomAnnotationRow({
  annotation,
  number,
  elementName,
  isHovered,
  isFlashing,
  onHoverStart,
  onHoverEnd,
}: CustomAnnotationRowProps) {
  return (
    <li className="relative border-b border-rule">
      {isFlashing && (
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0.35 }}
          animate={{ opacity: 0 }}
          transition={{ duration: FLASH_DURATION }}
          className="pointer-events-none absolute inset-0 bg-brass"
        />
      )}
      <button
        type="button"
        onClick={() => openCustomAnnotation(annotation)}
        onPointerEnter={onHoverStart}
        onPointerLeave={onHoverEnd}
        className={`relative flex w-full flex-col gap-1.5 border-l-2 px-6 py-3 text-left transition-colors ${
          isHovered ? "border-brass bg-surface2" : "border-transparent hover:bg-surface2"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-brass font-mono text-3xs text-brass">
              {number}
            </span>
            <span className="font-mono text-2xs text-ink">{annotation.author}</span>
          </div>
          <span className="shrink-0 font-mono text-3xs text-faint">{relativeTime(annotation.createdAt)}</span>
        </div>
        <p className="line-clamp-2 text-2xs text-muted">{annotation.body}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-3xs uppercase tracking-[0.18em] text-faint">{elementName}</span>
          <span
            className={`shrink-0 font-mono text-3xs uppercase tracking-[0.18em] ${
              annotation.status === "Resolved" ? "text-verdigris" : "text-brass"
            }`}
          >
            {annotation.status}
          </span>
        </div>
      </button>
    </li>
  );
}

/**
 * The reusable guts, mirroring AnnotationRows exactly in structure (header
 * + open count, a status filter row, the scrollable list) minus the
 * category filter this file's header explains cutting. Exported for the
 * same reason AnnotationRows is: if a mobile tab ever needs it standalone,
 * it's already separable from the desktop/mobile chrome around it.
 */
export function CustomAnnotationRows() {
  const customAnnotations = useProjectStore((state) => state.customAnnotations);
  const uploadedElements = useProjectStore((state) => state.uploadedElements);
  const hoveredAnnotationId = useProjectStore((state) => state.hoveredAnnotationId);
  const setHoveredAnnotation = useProjectStore((state) => state.setHoveredAnnotation);
  const clearHoveredAnnotation = useProjectStore((state) => state.clearHoveredAnnotation);
  const recentlyAddedAnnotationId = useProjectStore((state) => state.recentlyAddedAnnotationId);

  useEffect(() => {
    if (!recentlyAddedAnnotationId) return;
    const timeout = window.setTimeout(() => {
      useProjectStore.getState().clearRecentlyAdded();
    }, FLASH_DURATION * 1000);
    return () => window.clearTimeout(timeout);
  }, [recentlyAddedAnnotationId]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Measured (see usePanelScroll.ts's own header): this list stays exactly
  // as tall as its fixed panel space through 3 pins, only crossing into
  // real overflow around 6-7 — a realistic single-sitting pin count for
  // trying a custom model, not an inflated one. Wired for the same reason
  // ReviewList.tsx is: the identical growing-list container its own
  // measured overflow (37 real, Supabase-backed annotations) already
  // justifies, just scoped to a shorter typical count here. Callback
  // refs, not plain useRef objects — see usePanelScroll.ts's own header.
  const { wrapperRef: scrollWrapperRef, contentRef: scrollContentRef } = usePanelScroll();

  const numberById = useMemo(() => {
    const map = new Map<string, number>();
    customAnnotations.forEach((annotation, index) => map.set(annotation.id, index + 1));
    return map;
  }, [customAnnotations]);

  const elementByMeshName = useMemo(
    () => new Map(uploadedElements.map((element) => [element.meshName, element])),
    [uploadedElements],
  );

  const openCount = useMemo(
    () => customAnnotations.filter((annotation) => annotation.status === "Open").length,
    [customAnnotations],
  );

  const filtered = useMemo(
    () =>
      customAnnotations.filter((annotation) => {
        if (statusFilter === "open" && annotation.status !== "Open") return false;
        if (statusFilter === "resolved" && annotation.status !== "Resolved") return false;
        return true;
      }),
    [customAnnotations, statusFilter],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-6 py-5">
        <Label as="div">Comments</Label>
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-2xs tabular-nums text-brass">{openCount}</span>
          <span className="font-mono text-3xs uppercase tracking-[0.18em] text-faint">open</span>
        </div>
      </div>

      <div className="flex gap-1 px-6 pb-4">
        {(["all", "open", "resolved"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={statusFilter === value}
            onClick={() => setStatusFilter(value)}
            className={`flex-1 border px-2 py-1.5 font-mono text-3xs uppercase tracking-[0.18em] transition-colors ${
              statusFilter === value ? "border-brass text-brass" : "border-rule text-faint hover:text-ink"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      <Rule />

      <div ref={scrollWrapperRef} className="flex-1 overflow-y-auto">
        <ul ref={scrollContentRef}>
          {filtered.length === 0 ? (
            <li className="px-6 py-5 font-mono text-2xs text-faint">No comments match this filter</li>
          ) : (
            filtered.map((annotation) => (
              <CustomAnnotationRow
                key={annotation.id}
                annotation={annotation}
                number={numberById.get(annotation.id) ?? 0}
                elementName={
                  (annotation.meshName ? elementByMeshName.get(annotation.meshName)?.displayName : undefined) ??
                  "Unplaced"
                }
                isHovered={hoveredAnnotationId === annotation.id}
                isFlashing={recentlyAddedAnnotationId === annotation.id}
                onHoverStart={() => setHoveredAnnotation(annotation.id)}
                onHoverEnd={() => {
                  if (useProjectStore.getState().hoveredAnnotationId === annotation.id) {
                    clearHoveredAnnotation();
                  }
                }}
              />
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function DesktopCustomReviewPanel() {
  const selectedElementId = useProjectStore((state) => state.selectedElementId);
  const openCount = useProjectStore(
    (state) => state.customAnnotations.filter((annotation) => annotation.status === "Open").length,
  );
  const [userCollapsed, setUserCollapsed] = useState(false);

  const collapsed = userCollapsed || selectedElementId !== null;

  return (
    <motion.div
      animate={{ width: collapsed ? RAIL_WIDTH : PANEL_WIDTH }}
      transition={{ duration: DURATION.base, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-24 bottom-4 left-0 z-20 flex flex-col overflow-hidden border-r border-rule bg-surface"
    >
      {collapsed ? (
        <button
          type="button"
          onClick={() => setUserCollapsed(false)}
          aria-label="Expand comments list"
          className="flex h-full w-full flex-col items-center justify-between py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
        >
          <span className="font-mono text-2xs tabular-nums text-brass">{openCount}</span>
          <span className="[writing-mode:vertical-rl] rotate-180 font-mono text-3xs uppercase tracking-[0.18em] text-faint">
            Comments
          </span>
          <span aria-hidden="true" className="font-mono text-faint">
            ›
          </span>
        </button>
      ) : (
        <>
          <div className="flex justify-end px-4 pt-4">
            <button
              type="button"
              onClick={() => setUserCollapsed(true)}
              aria-label="Collapse comments list"
              className="font-mono text-xs text-faint transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
            >
              ‹
            </button>
          </div>
          <CustomAnnotationRows />
        </>
      )}
    </motion.div>
  );
}

function MobileCustomReviewSheet() {
  const [open, setOpen] = useState(false);
  const openCount = useProjectStore(
    (state) => state.customAnnotations.filter((annotation) => annotation.status === "Open").length,
  );

  const handleDragEnd = (_event: PointerEvent, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 500) setOpen(false);
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2 border border-rule bg-surface px-4 py-2 font-mono text-3xs uppercase tracking-[0.18em] text-ink shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
        >
          Comments <span className="tabular-nums text-brass">{openCount}</span>
        </button>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Comments"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: DURATION.base, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 bottom-0 z-20 flex h-[70vh] flex-col border-t border-rule bg-surface"
          >
            <div className="flex justify-center py-3" aria-hidden="true">
              <div className="h-1 w-10 rounded-full bg-ruleHi" />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close comments"
              className="absolute right-6 top-5 font-mono text-xs text-faint transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
            >
              ✕
            </button>
            <CustomAnnotationRows />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function UploadedReviewList() {
  const isMobile = useIsMobile(PIN_BREAKPOINT);
  const isElementPanelOpen = useProjectStore((state) => state.selectedElementId !== null);
  const customModelUrl = useProjectStore((state) => state.customModelUrl);

  // Mirrors ReviewList's own customModelUrl gate in the opposite
  // direction: every customAnnotation is pinned against *this* uploaded
  // model, and UploadedAnnotationMarker.tsx only ever mounts inside
  // UploadedModel.tsx, which isn't mounted at all once the curated model
  // is back — see that pairing's own comment for the identical reasoning.
  if (!customModelUrl) return null;

  if (isMobile) {
    // See file header: UploadedElementPanel has no COMMENTS tab to fall
    // back into, so this hides outright rather than stacking two
    // full-height sheets — a documented v1 gap, not an oversight.
    if (isElementPanelOpen) return null;
    return <MobileCustomReviewSheet />;
  }

  return <DesktopCustomReviewPanel />;
}
