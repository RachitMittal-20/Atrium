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
 * Two different animation systems meet here on purpose:
 *  - Motion (this file only) drives the panel's own slide in/out and the
 *    mobile drag-to-dismiss gesture — plain DOM transitions, nothing 3D.
 *  - GSAP, via lib/motion's easeCameraTo (useCameraFraming below), drives
 *    the OrbitControls target and camera position eased onto the selected
 *    element, via the viewport bridge projectStore carries across the
 *    Canvas boundary. This is the one place in the app where a DOM
 *    component reaches into the 3D scene, and it does so only through
 *    that store, never by importing anything from components/three.
 *
 * The "Pin a comment" button at the bottom hands off to spatial
 * annotation: it closes this panel and arms pin mode (projectStore's
 * enterPinMode), the same as pressing "C" — see ModeIndicator.tsx and
 * BuildingModel.tsx for the rest of that flow.
 *
 * Responsive: a right-docked sidebar above 900px (PIN_BREAKPOINT, the same
 * line the rest of the app collapses pinned scroll at), a draggable bottom
 * sheet at 70% height below it.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { useProjectStore } from "@/store/projectStore";
import { DURATION, PIN_BREAKPOINT, easeCameraTo } from "@/lib/motion";
import { Label } from "./Label";
import { Rule } from "./Rule";
import { FieldRow } from "./FieldRow";
import { Button } from "./Button";
import type { Element, ElementStatus } from "@/types/project";

// State must read from shape and colour together, never colour alone — the
// dot supplies the shape half, the mono status word next to it the rest.
const STATUS_DOT_COLOR: Record<ElementStatus, string> = {
  Approved: "bg-verdigris",
  "For Review": "bg-brass",
  Issue: "bg-clay",
  Revised: "bg-muted",
};

// Coarse but legible — "3 days ago" reads better in a review thread than
// an exact timestamp, and nothing here needs second-level precision.
function relativeTime(iso: string): string {
  const deltaDays = Math.round((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (deltaDays <= 0) return "today";
  if (deltaDays === 1) return "1 day ago";
  if (deltaDays < 7) return `${deltaDays} days ago`;
  const deltaWeeks = Math.round(deltaDays / 7);
  if (deltaWeeks < 5) return deltaWeeks === 1 ? "1 week ago" : `${deltaWeeks} weeks ago`;
  const deltaMonths = Math.round(deltaDays / 30);
  return deltaMonths <= 1 ? "1 month ago" : `${deltaMonths} months ago`;
}

function useIsMobile(breakpointPx: number): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [breakpointPx]);
  return isMobile;
}

// Eases OrbitControls' target and the camera's position onto the selected
// element's live world bounding box, keeping the current viewing angle
// (the direction from target to camera) rather than cutting to a fixed
// shot. Reads the OrbitControls instance and the mesh's Object3D through
// projectStore's viewport bridge — populated by Scene.tsx and
// BuildingModel.tsx respectively — since this runs entirely outside the
// Canvas.
function useCameraFraming(element: Element | null) {
  useEffect(() => {
    if (!element) return;

    const { controls, invalidate } = useProjectStore.getState().getViewport();
    const object = useProjectStore.getState().getElementObject(element.meshName);
    if (!controls || !invalidate || !object) return;

    const camera = controls.object;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const direction = camera.position.clone().sub(controls.target).normalize();
    const distance = THREE.MathUtils.clamp(sphere.radius * 3, controls.minDistance, controls.maxDistance);
    const nextPosition = center.clone().add(direction.multiplyScalar(distance));

    const timeline = easeCameraTo(controls, camera, invalidate, center, nextPosition);
    return () => {
      timeline.kill();
    };
  }, [element]);
}

export function ElementPanel() {
  const selectedElementId = useProjectStore((state) => state.selectedElementId);
  const elements = useProjectStore((state) => state.elements);
  const annotations = useProjectStore((state) => state.annotations);
  const clearSelected = useProjectStore((state) => state.clearSelected);

  const element = useMemo(
    () => elements.find((candidate) => candidate.meshName === selectedElementId) ?? null,
    [elements, selectedElementId],
  );
  const thread = useMemo(
    () => (element ? annotations.filter((annotation) => annotation.elementId === element.id) : []),
    [annotations, element],
  );

  useCameraFraming(element);

  const isMobile = useIsMobile(PIN_BREAKPOINT);
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
