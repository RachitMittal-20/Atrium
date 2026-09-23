/**
 * src/components/ui/ReviewList.tsx
 *
 * The flat, scannable counterpart to the spatial markers in the 3D scene
 * — every Annotation on the project as a row: numeral, author, relative
 * time, a two-line excerpt, the element it landed on (or "Unplaced"), and
 * its open/resolved state. Lives outside the Canvas, mounted once in
 * src/app/project/page.tsx alongside ElementPanel and Scene.
 *
 * Two-way synchronisation with AnnotationMarker.tsx (the 3D ring), all
 * through projectStore rather than any direct reference between the two:
 *  - hoveredAnnotationId is written by either side's hover and read by
 *    both, so hovering a row highlights its marker and hovering a marker
 *    highlights its row.
 *  - Clicking a row (or stepping with "J"/"K", below) calls the same
 *    openAnnotation() this file uses everywhere: it eases the camera onto
 *    the annotation's pinned point along its stored normal — via
 *    lib/motion's annotationCameraTarget + easeCameraTo, reading the
 *    marker's own live Object3D through projectStore's
 *    getAnnotationObject — and, when the annotation landed on an element,
 *    selects that element so ElementPanel opens showing the full thread.
 *  - addAnnotation (projectStore) stamps recentlyAddedAnnotationId, which
 *    AnnotationRows below turns into a one-shot brass flash on the new
 *    row, so a freshly pinned comment doesn't just silently appear.
 *
 * "J"/"K" step through annotations in array order — the same order
 * AnnotationMarker's own numerals use, since both derive it from
 * projectStore's annotations array — easing the camera to each in turn.
 * Registered once here regardless of mobile/desktop layout, since the
 * camera move is identical either way.
 *
 * Layout is genuinely three different things, not one component with
 * CSS breakpoints bolted on:
 *  - Desktop (>= PIN_BREAKPOINT): a left-docked panel, ~320px, that
 *    collapses to a narrow rail. It collapses automatically whenever
 *    ElementPanel is open — deterministic regardless of viewport width,
 *    which is what keeps the model clearly visible with both panels
 *    "open" even at 1440px (see DesktopReviewPanel below for why this was
 *    chosen over a width-based rule).
 *  - Mobile, no element selected: its own bottom sheet, toggled by a
 *    small floating pill (MobileReviewSheet below).
 *  - Mobile, an element selected: ElementPanel is already showing its own
 *    bottom sheet, so this component renders nothing at all — its content
 *    (AnnotationRows, exported) is instead rendered *by* ElementPanel.tsx
 *    itself, behind a SPEC/COMMENTS tab bound to projectStore's
 *    mobileTab. That's "a tab alongside the element sheet": one sheet,
 *    two tabs, never two sheets stacked on a small screen.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { useProjectStore } from "@/store/projectStore";
import { DURATION, PIN_BREAKPOINT, annotationCameraTarget, easeCameraTo } from "@/lib/motion";
import { relativeTime } from "@/lib/format";
import { isTypingTarget } from "@/lib/keyboard";
import { useIsMobile } from "@/lib/responsive";
import { Label } from "./Label";
import { Rule } from "./Rule";
import { ELEMENT_CATEGORIES, type Annotation, type ElementCategory } from "@/types/project";

const PANEL_WIDTH = 320;
const RAIL_WIDTH = 56;

// How long a freshly pinned row stays brass before fading to transparent
// — long enough to register as "something just happened here", short
// enough to not linger and read as a persistent status.
const FLASH_DURATION = 1.2;

type StatusFilter = "all" | "open" | "resolved";
type CategoryFilter = ElementCategory | "all";

// The one place "ease the camera to this annotation, open its thread"
// happens — row clicks, J/K, called identically from every context this
// file renders in. Reads everything through getState() rather than
// closing over hook values, so it stays a stable reference no matter
// where it's called from (a keydown listener registered once, a row's
// onClick built fresh every render — both call the same function).
function openAnnotation(annotation: Annotation) {
  const state = useProjectStore.getState();
  const { controls, invalidate } = state.getViewport();
  const object = state.getAnnotationObject(annotation.id);
  if (controls && invalidate && object) {
    const camera = controls.object;
    const { target, position } = annotationCameraTarget(object, controls);
    easeCameraTo(controls, camera, invalidate, target, position);
  }
  if (annotation.elementId) {
    const element = state.elements.find((candidate) => candidate.id === annotation.elementId);
    if (element) state.setSelected(element.meshName);
  }
}

interface AnnotationRowProps {
  annotation: Annotation;
  number: number;
  elementName: string;
  isHovered: boolean;
  isFlashing: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}

function AnnotationRow({
  annotation,
  number,
  elementName,
  isHovered,
  isFlashing,
  onHoverStart,
  onHoverEnd,
}: AnnotationRowProps) {
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
        onClick={() => openAnnotation(annotation)}
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
 * The reusable guts of the review list — header with the open count,
 * the All/Open/Resolved + category filter bar, and the scrollable row
 * list. No opinion on where it's docked or sized: ReviewList's desktop
 * panel, its mobile sheet, and ElementPanel's mobile COMMENTS tab all
 * render this same component inside their own chrome, so the actual list
 * behaviour (filtering, hover sync, the new-row flash) only exists once.
 */
export function AnnotationRows() {
  const annotations = useProjectStore((state) => state.annotations);
  const elements = useProjectStore((state) => state.elements);
  const hoveredAnnotationId = useProjectStore((state) => state.hoveredAnnotationId);
  const setHoveredAnnotation = useProjectStore((state) => state.setHoveredAnnotation);
  const clearHoveredAnnotation = useProjectStore((state) => state.clearHoveredAnnotation);
  const recentlyAddedAnnotationId = useProjectStore((state) => state.recentlyAddedAnnotationId);

  // Whichever AnnotationRows instance is actually mounted owns clearing
  // the flash after it's played — harmless if more than one instance ever
  // raced to clear it (clearing an already-null value is a no-op).
  useEffect(() => {
    if (!recentlyAddedAnnotationId) return;
    const timeout = window.setTimeout(() => {
      useProjectStore.getState().clearRecentlyAdded();
    }, FLASH_DURATION * 1000);
    return () => window.clearTimeout(timeout);
  }, [recentlyAddedAnnotationId]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  // Numerals reflect each annotation's position in the *unfiltered* array
  // — the same order AnnotationMarker.tsx numbers its rings from — so a
  // row's numeral always matches its marker regardless of what's filtered.
  const numberById = useMemo(() => {
    const map = new Map<string, number>();
    annotations.forEach((annotation, index) => map.set(annotation.id, index + 1));
    return map;
  }, [annotations]);

  const elementById = useMemo(() => {
    const map = new Map(elements.map((element) => [element.id, element]));
    return map;
  }, [elements]);

  // Global, not filtered — switching the status/category filter shouldn't
  // make the project's open-comment count appear to change.
  const openCount = useMemo(() => annotations.filter((annotation) => annotation.status === "Open").length, [
    annotations,
  ]);

  const filtered = useMemo(
    () =>
      annotations.filter((annotation) => {
        if (statusFilter === "open" && annotation.status !== "Open") return false;
        if (statusFilter === "resolved" && annotation.status !== "Resolved") return false;
        if (categoryFilter !== "all") {
          const element = annotation.elementId ? elementById.get(annotation.elementId) : undefined;
          if (!element || element.category !== categoryFilter) return false;
        }
        return true;
      }),
    [annotations, elementById, statusFilter, categoryFilter],
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

      <div className="flex flex-col gap-2 px-6 pb-4">
        <div className="flex gap-1">
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
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}
          aria-label="Filter by element category"
          className="border border-rule bg-surface2 px-2 py-1.5 font-mono text-3xs uppercase tracking-[0.18em] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
        >
          <option value="all">All categories</option>
          {/* ELEMENT_CATEGORIES is the one runtime list ElementCategory itself
              is derived from (types/project.ts) — shared with
              VisibilityToolbar.tsx's chips, never hand-kept in sync. */}
          {ELEMENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <Rule />

      <ul className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="px-6 py-5 font-mono text-2xs text-faint">No comments match this filter</li>
        ) : (
          filtered.map((annotation) => (
            <AnnotationRow
              key={annotation.id}
              annotation={annotation}
              number={numberById.get(annotation.id) ?? 0}
              elementName={
                (annotation.elementId ? elementById.get(annotation.elementId)?.name : undefined) ?? "Unplaced"
              }
              isHovered={hoveredAnnotationId === annotation.id}
              isFlashing={recentlyAddedAnnotationId === annotation.id}
              onHoverStart={() => setHoveredAnnotation(annotation.id)}
              onHoverEnd={() => {
                // Guards against a stale pointerleave racing behind a
                // newer hover — the same pattern used for element and
                // marker hover elsewhere in the app.
                if (useProjectStore.getState().hoveredAnnotationId === annotation.id) {
                  clearHoveredAnnotation();
                }
              }}
            />
          ))
        )}
      </ul>
    </div>
  );
}

function DesktopReviewPanel() {
  const selectedElementId = useProjectStore((state) => state.selectedElementId);
  const openCount = useProjectStore(
    (state) => state.annotations.filter((annotation) => annotation.status === "Open").length,
  );
  const [userCollapsed, setUserCollapsed] = useState(false);

  // Two docked panels plus the model itself all have to read clearly even
  // at 1440px. Rather than a width-based media query trying to detect
  // exactly when it gets "tight", the simpler and fully deterministic
  // rule: this panel always collapses to its rail while ElementPanel is
  // open, regardless of viewport size. At any width that comfortably fits
  // both panels open this is a little conservative; at 1440px it's
  // exactly the rule that keeps the model clearly visible.
  const collapsed = userCollapsed || selectedElementId !== null;

  return (
    <motion.div
      animate={{ width: collapsed ? RAIL_WIDTH : PANEL_WIDTH }}
      transition={{ duration: DURATION.base, ease: [0.16, 1, 0.3, 1] }}
      // top-24, not top-4 like ElementPanel's mirror-image right dock:
      // this side of the screen already has the ATRIUM wordmark sitting
      // at left-6 top-6 (page.tsx), which a top-4 panel would sit right
      // under regardless of collapsed/expanded width.
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
          <AnnotationRows />
        </>
      )}
    </motion.div>
  );
}

function MobileReviewSheet() {
  const [open, setOpen] = useState(false);
  const openCount = useProjectStore(
    (state) => state.annotations.filter((annotation) => annotation.status === "Open").length,
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
            <AnnotationRows />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function ReviewList() {
  const isMobile = useIsMobile(PIN_BREAKPOINT);
  const isElementPanelOpen = useProjectStore((state) => state.selectedElementId !== null);

  // "J"/"K" step through annotations in array order, easing the camera to
  // each — a plain ref, not state: nothing here needs to re-render when
  // the current index changes, only the camera does.
  const activeIndexRef = useRef(0);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key !== "j" && key !== "k") return;
      const list = useProjectStore.getState().annotations;
      if (list.length === 0) return;
      const delta = key === "j" ? 1 : -1;
      activeIndexRef.current = (activeIndexRef.current + delta + list.length) % list.length;
      openAnnotation(list[activeIndexRef.current]);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (isMobile) {
    // Once ElementPanel's own sheet is open, comments are reachable as a
    // tab inside it (AnnotationRows, rendered by ElementPanel.tsx itself)
    // instead of a second sheet stacked on top — see the file header.
    if (isElementPanelOpen) return null;
    return <MobileReviewSheet />;
  }

  return <DesktopReviewPanel />;
}
