/**
 * src/components/ui/ElementPanel.tsx
 *
 * The payoff for clicking something in the 3D model: a docked panel
 * showing the selected Element's full specification and comment thread,
 * read straight out of projectStore (selectedElementId, elements,
 * annotations — see src/store/projectStore.ts). Lives outside the Canvas
 * in ordinary DOM, mounted once in src/app/project/page.tsx alongside
 * <Scene />.
 *
 * Selecting an element never moves the camera on its own — opening this
 * panel is a plain "show me the spec sheet," not a "take me there," and
 * the previous camera-framing behaviour here actively fought that: it
 * eased onto the *selected mesh's own bounding sphere*, which is fine for
 * a small element but not for one that spans a large footprint (a floor
 * slab, a full-height wall, the building envelope) — for those, `radius *
 * 3` clamped against `maxDistance` produced almost exactly the same
 * distance as fitting the *entire model*, so clicking through elements
 * while zoomed into an interior room would visibly yank the camera back
 * out to a bird's-eye exterior shot on every click. Since there's no
 * dedicated "focus on this element" control in this panel (only "Pin a
 * comment"), the fix is to not move the camera here at all — clicking
 * through elements/comments now keeps whatever view the user already has.
 * lib/motion's easeCameraTo (GSAP) still exists and still runs for a more
 * *intentional* camera move: clicking an annotation pin or a ReviewList
 * comment row eases the camera onto that comment's exact pinned 3D point
 * (see ReviewList.tsx and AnnotationMarker.tsx) — a small, specific
 * target, not a whole mesh, and unaffected by this change. The Motion
 * library (this file only, distinct from GSAP above) still drives this
 * panel's own slide in/out and the mobile drag-to-dismiss gesture — plain
 * DOM transitions, nothing 3D.
 *
 * The "Pin a comment" button at the bottom hands off to spatial
 * annotation: it closes this panel and arms pin mode (projectStore's
 * enterPinMode), the same as pressing "C" — see ModeIndicator.tsx and
 * BuildingModel.tsx for the rest of that flow.
 *
 * History is a collapsed-by-default affordance (plain local useState,
 * reset for free on every element switch since this component fully
 * remounts per element — AnimatePresence keys it by element.id) listing
 * projectStore's getElementRevisions for the selected element, newest
 * first. Only rendered when that element actually has any — most don't;
 * see src/data/project.ts's ELEMENT_REVISIONS for why this is seeded,
 * read-only history rather than something this panel could ever write to.
 *
 * Responsive: a right-docked sidebar above 900px (PIN_BREAKPOINT, the same
 * line the rest of the app collapses pinned scroll at), a draggable bottom
 * sheet at 70% height below it. Below that line this panel also grows a
 * SPEC/COMMENTS tab row (projectStore's mobileTab) so ReviewList.tsx's
 * content can share this one sheet instead of stacking a second — see
 * ReviewList.tsx's file header for the full mobile layout rationale.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { useShallow } from "zustand/react/shallow";
import { useProjectStore } from "@/store/projectStore";
import { DURATION, PIN_BREAKPOINT } from "@/lib/motion";
import { relativeTime } from "@/lib/format";
import { useIsMobile } from "@/lib/responsive";
import { Label } from "./Label";
import { Rule } from "./Rule";
import { FieldRow } from "./FieldRow";
import { Button } from "./Button";
import { AnnotationRows } from "./ReviewList";
import type { ElementStatus } from "@/types/project";

// State must read from shape and colour together, never colour alone — the
// dot supplies the shape half, the mono status word next to it the rest.
const STATUS_DOT_COLOR: Record<ElementStatus, string> = {
  Approved: "bg-verdigris",
  "For Review": "bg-brass",
  Issue: "bg-clay",
  Revised: "bg-muted",
};

export function ElementPanel() {
  const selectedElementId = useProjectStore((state) => state.selectedElementId);
  const elements = useProjectStore((state) => state.elements);
  const clearSelected = useProjectStore((state) => state.clearSelected);

  const element = useMemo(
    () => elements.find((candidate) => candidate.meshName === selectedElementId) ?? null,
    [elements, selectedElementId],
  );
  // useShallow, not a plain selector + useMemo: subscribing to the whole
  // `annotations` array (as this used to) re-renders this panel on *every*
  // annotation change anywhere — including a remote realtime arrival for a
  // completely different, unselected element — since the array gets a new
  // reference on every store write regardless of which element it touched.
  // Filtering *inside* the selector and comparing the result shallowly
  // means this only actually re-renders when the annotations belonging to
  // the currently-open element change. Measured: 3 remote inserts for an
  // unrelated element caused 6 ElementPanel re-renders before this change,
  // 0 after — see docs/PERFORMANCE.md.
  const thread = useProjectStore(
    useShallow((state) => (element ? state.annotations.filter((annotation) => annotation.elementId === element.id) : [])),
  );
  const getElementRevisions = useProjectStore((state) => state.getElementRevisions);
  const revisions = useMemo(
    () => (element ? getElementRevisions(element.meshName) : []),
    [element, getElementRevisions],
  );
  const [historyOpen, setHistoryOpen] = useState(false);

  const isMobile = useIsMobile(PIN_BREAKPOINT);
  const mobileTab = useProjectStore((state) => state.mobileTab);
  const setMobileTab = useProjectStore((state) => state.setMobileTab);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  // Move focus into the panel on open, and give it back to whatever had
  // focus before — Escape (below) and the close control both route through
  // clearSelected(), so this one effect covers every way the panel closes.
  useEffect(() => {
    if (!element) return;
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      lastFocusedRef.current?.focus();
    };
  }, [element]);

  useEffect(() => {
    if (!element) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearSelected();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [element, clearSelected]);

  const handleDragEnd = (_event: PointerEvent, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 500) clearSelected();
  };

  return (
    <AnimatePresence>
      {element && (
        <motion.div
          key={element.id}
          role="dialog"
          aria-modal="true"
          aria-label={element.name}
          drag={isMobile ? "y" : false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.15}
          onDragEnd={isMobile ? handleDragEnd : undefined}
          initial={isMobile ? { y: "100%" } : { x: "100%" }}
          animate={isMobile ? { y: 0 } : { x: 0 }}
          exit={isMobile ? { y: "100%" } : { x: "100%" }}
          transition={{ duration: DURATION.base, ease: [0.16, 1, 0.3, 1] }}
          className={
            isMobile
              ? "fixed inset-x-0 bottom-0 z-20 flex h-[70vh] flex-col border-t border-rule bg-surface"
              : "fixed top-4 bottom-4 right-0 z-20 flex w-full max-w-95 flex-col border-l border-rule bg-surface"
          }
        >
          {isMobile && (
            <div className="flex justify-center py-3" aria-hidden="true">
              <div className="h-1 w-10 rounded-full bg-ruleHi" />
            </div>
          )}

          <div className="flex items-start justify-between gap-4 px-6 py-5">
            <Label>
              {element.category} · {element.id}
            </Label>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => clearSelected()}
              aria-label="Close panel"
              className="font-mono text-xs text-faint transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
            >
              ✕
            </button>
          </div>

          {/* Below PIN_BREAKPOINT this sheet is shared with ReviewList's
              content instead of stacking a second sheet on top of this
              one — see ReviewList.tsx's file header. Desktop never renders
              this row; mobileTab is meaningless there. */}
          {isMobile && (
            <div className="flex gap-1 px-6 pb-4" role="tablist">
              {(["spec", "comments"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={mobileTab === tab}
                  onClick={() => setMobileTab(tab)}
                  className={`flex-1 border px-3 py-1.5 font-mono text-3xs uppercase tracking-[0.18em] transition-colors ${
                    mobileTab === tab ? "border-brass text-brass" : "border-rule text-faint hover:text-ink"
                  }`}
                >
                  {tab === "spec" ? "Spec" : "Comments"}
                </button>
              ))}
            </div>
          )}

          {isMobile && mobileTab === "comments" ? (
            <AnnotationRows />
          ) : (
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              <h2 className="font-display text-lg text-ink">{element.name}</h2>

              <div className="mt-3 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT_COLOR[element.status]}`} aria-hidden="true" />
                <span className="font-mono text-2xs uppercase tracking-[0.18em] text-ink">{element.status}</span>
              </div>

              <Rule className="my-5" label="Specification" />
              <div>
                {Object.entries(element.specification).map(([key, value], index, all) => (
                  <FieldRow
                    key={key}
                    label={key}
                    value={value}
                    className={index < all.length - 1 ? "border-b border-rule" : ""}
                  />
                ))}
              </div>

              <Rule className="my-5" />
              <FieldRow label="Responsible party" value={element.responsibleParty} />
              <FieldRow label="Last updated" value={relativeTime(element.lastUpdated)} />

              {revisions.length > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setHistoryOpen((open) => !open)}
                    aria-expanded={historyOpen}
                    className="flex w-full items-center justify-between py-1 font-mono text-3xs uppercase tracking-[0.18em] text-faint transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
                  >
                    <span>History ({revisions.length})</span>
                    <span aria-hidden="true">{historyOpen ? "−" : "+"}</span>
                  </button>
                  {historyOpen && (
                    <ul className="mt-2 flex flex-col gap-3 border-l border-rule pl-3">
                      {revisions.map((revision) => (
                        <li key={revision.id} className="flex flex-col gap-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-mono text-3xs uppercase tracking-[0.18em] text-brass">
                              {revision.field}
                            </span>
                            <span className="font-mono text-3xs text-faint">{relativeTime(revision.changedAt)}</span>
                          </div>
                          <p className="text-2xs text-muted">
                            <span className="text-faint line-through">{revision.oldValue}</span>
                            <span className="mx-1 text-faint" aria-hidden="true">
                              →
                            </span>
                            <span className="text-ink">{revision.newValue}</span>
                          </p>
                          <span className="font-mono text-3xs text-faint">{revision.author}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <Rule className="my-5" label="Comments" />
              {thread.length === 0 ? (
                <p className="font-mono text-2xs text-faint">No comments on this element</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {thread.map((annotation) => (
                    <li key={annotation.id} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-2xs text-ink">{annotation.author}</span>
                        <span className="font-mono text-3xs text-faint">{relativeTime(annotation.createdAt)}</span>
                      </div>
                      <p className="text-2xs text-muted">{annotation.body}</p>
                      <span
                        className={`font-mono text-3xs uppercase tracking-[0.18em] ${
                          annotation.status === "Resolved" ? "text-verdigris" : "text-brass"
                        }`}
                      >
                        {annotation.status}
                      </span>
                      {annotation.replies.map((reply) => (
                        <div key={reply.id} className="mt-1 ml-4 flex flex-col gap-1 border-l border-rule pl-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-3xs text-ink">{reply.author}</span>
                            <span className="font-mono text-3xs text-faint">{relativeTime(reply.createdAt)}</span>
                          </div>
                          <p className="text-2xs text-muted">{reply.body}</p>
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="border-t border-rule px-6 py-5">
            <Button
              type="button"
              variant="primary"
              className="w-full"
              onClick={() => useProjectStore.getState().enterPinMode()}
            >
              Pin a comment
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
