/**
 * src/components/three/TourControls.tsx
 *
 * The camera driver for tour mode — Scene.tsx mounts this in place of
 * (never alongside; the same OrbitControls `enabled={false}` pattern
 * WalkthroughControls/PanoramaControls already use) OrbitControls
 * whenever projectStore's cameraMode is "tour". Unlike those two, this
 * component never touches the camera directly — every move is one
 * lib/motion easeCameraTo tween onto the current tourIndex's element,
 * the exact same GSAP routine ElementPanel/AnnotationMarker/ReviewList
 * already use to frame something.
 *
 * Two responsibilities, kept together in one component because they're
 * two sides of the same feature (stepping through elements), the same
 * way WalkthroughControls owns both movement and its own key state:
 *  1. Reacts to tourIndex — projectStore's own position in whichever of
 *     `elements`/uploadedElements is currently active (see that store's
 *     own header) — by easing the camera onto that element via lib/motion's
 *     elementCameraTarget + easeCameraTo, *and* marking it as selected
 *     (desktop only — see this file's own further-down paragraph on why).
 *     Scene.tsx's Model() resets tourIndex to 0 itself on every entry
 *     into tour mode (see that file's pose-ownership effect), so this
 *     component doesn't need an "I was just mounted" special case — the
 *     very first render already sees a real tourIndex and eases onto
 *     element 0 like any other step.
 *  2. Reads the two Canvas-native input methods that advance/retreat
 *     tourIndex: mouse wheel and touch swipe (vertical). TourHud.tsx's
 *     Prev/Next buttons are the third input method, mounted separately
 *     in ordinary DOM outside the Canvas, calling the exact same
 *     projectStore actions (tourNext/tourPrev) directly — needing no r3f
 *     context of its own to do it. This component listens on
 *     gl.domElement, the same element SmoothZoom.tsx listens for
 *     wheel/pinch on and WalkthroughControls listens for pointer-drag
 *     on, so wheel/swipe only ever fire for gestures actually over the
 *     3D view.
 *
 * Step rate-limiting — one gesture (or one click) should advance exactly
 * one element, and a new step should never start before the *previous*
 * one has visually finished arriving — lives in projectStore's
 * tourNext/tourPrev themselves, not here (see that file's own comment on
 * why: it has to cover all three input methods identically, including
 * TourHud's buttons, which have no gesture of their own to debounce).
 * This file's wheel/swipe handlers call tourNext/tourPrev on every
 * qualifying input without their own throttling — the store's shared
 * gate is what actually turns "many wheel events in one scroll" or "a
 * few enthusiastic clicks" into one step at a time.
 *
 * No free-look: unlike WalkthroughControls/PanoramaControls, this file
 * never reads mouse-drag or Q/E input at all. Tour mode is a guided,
 * hands-off viewing experience by design (the brief this was built
 * against: "so a non-technical viewer can just scroll/swipe through
 * instead of manually clicking around") — OrbitControls stays disabled
 * the whole time, exactly as it does in the other two non-orbit modes,
 * and this component adds no substitute look-around of its own.
 *
 * Entering/leaving tour never resets the camera to some fixed view any
 * more than walkthrough/panorama do: this file saves and restores
 * nothing itself. Scene.tsx's Model() owns the orbit pose across *any*
 * non-orbit excursion (see that file's header) — tour participates in
 * exactly the same save-on-leaving-orbit/restore-on-returning logic
 * walkthrough and panorama already do, with no tour-specific code needed
 * there beyond the tourIndex reset mentioned above.
 *
 * Marking the framed element in the scene: every step also calls
 * projectStore's setSelected(element.meshName) — the exact same field a
 * manual click in review mode already writes, reusing BuildingModel.tsx's
 * existing persistent brass Outline rather than inventing a tour-only
 * highlight. hoveredElementId is deliberately left alone: driving *that*
 * instead would have gotten the floating HoverLabel "for free" too, but
 * real mouse movement over some other mesh during a tour writes to
 * hoveredElementId on every genuine pointerover/pointerout regardless of
 * cameraMode (BuildingModel.tsx's own handlers don't check it) — it
 * would stomp a tour-driven hover the instant the reviewer's mouse
 * drifted anywhere else. selectedElementId has no such real-mouse writer
 * to fight; only a deliberate click (BuildingModel.tsx's handleClick,
 * which *does* still work during tour — see that file's own header) or
 * this effect ever sets it, so "whichever happened most recently wins"
 * is unambiguous and exactly matches how selection already behaves
 * everywhere else in the app: a reviewer's own click shows immediately
 * and stays until the *next* tourNext/tourPrev reasserts the tour's own
 * current stop, never fought over in between.
 *
 * Desktop only (isMobile below, PIN_BREAKPOINT): selecting an element
 * also opens ElementPanel.tsx, a right-docked sidebar on desktop with no
 * conflict with this file's own TourHud.tsx bottom bar. Below
 * PIN_BREAKPOINT, though, ElementPanel becomes its own `fixed inset-x-0
 * bottom-0` sheet — the exact same position and z-index TourHud.tsx's
 * bar already occupies — so auto-selecting on every tour step would
 * stack two competing full-width bottom sheets on a phone. Skipping the
 * select (and explicitly clearing any selection already open, e.g. from
 * resizing across the breakpoint mid-tour) keeps TourHud — the actual
 * primary control surface for this mode — unobstructed there instead.
 */
"use client";

import { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useProjectStore } from "@/store/projectStore";
import { easeCameraTo, elementCameraTarget, PIN_BREAKPOINT } from "@/lib/motion";
import { useIsMobile } from "@/lib/responsive";

// How far a touch has to travel vertically, in CSS pixels, before it
// counts as a deliberate swipe rather than a stray finger tremor or the
// start of some other gesture.
const SWIPE_MIN_DISTANCE_PX = 40;

interface TourControlsProps {
  /** The model's measured world-space bounding box — the same one
   *  Scene.tsx's Model() already computes and hands to
   *  WalkthroughControls.tsx as `bounds`, passed through here to
   *  lib/motion's elementCameraTarget so it can clamp a framed element's
   *  camera height against the *model's* own vertical extent, not just
   *  the element's own — see that function's own comment for the bug
   *  this fixes (a large structural element's camera position ending up
   *  well above the model's actual roofline). */
  bounds: THREE.Box3;
}

export function TourControls({ bounds }: TourControlsProps) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);

  const tourIndex = useProjectStore((state) => state.tourIndex);
  // See file header ("Desktop only") for why this gates the selection
  // side of the effect below, not the camera-easing side.
  const isMobile = useIsMobile(PIN_BREAKPOINT);

  // Eases the camera onto the current tourIndex's element every time it
  // changes — the one place this component actually moves the camera —
  // and marks that same element as selected (desktop only; see file
  // header). `elements`/getElementObject/getViewport are all read via
  // getState() rather than hooked, the same "stable function, fresh
  // data every call" pattern ReviewList.tsx's openAnnotation already
  // uses: this effect's own dependencies are tourIndex/isMobile, not the
  // store's current elements array, which would re-run it on every
  // unrelated store write (a remote annotation arriving, say) rather
  // than only on an actual step. `bounds` is a plain prop, not reactive
  // store state, so it's read directly rather than through getState().
  useEffect(() => {
    const state = useProjectStore.getState();
    const { controls } = state.getViewport();
    // Whichever list is actually active — see projectStore.ts's own
    // header on why a custom model steps through uploadedElements
    // instead of the curated `elements`. Both shapes carry a meshName
    // field, so no further branching is needed past this one line.
    const source = state.customModelUrl ? state.uploadedElements : state.elements;
    const element = source[tourIndex];
    // Both guards are defensive, not expected in normal operation:
    // controls can only be null for an instant before OrbitControls
    // itself has mounted (Scene.tsx already gates this component on
    // `extent`, which only exists after that), and every tourIndex this
    // store ever produces is clamped into the active source's own bounds
    // by tourNext/tourPrev/tourGoTo (via activeTourCount).
    if (!controls || !element) return;
    const mesh = state.getElementObject(element.meshName);
    if (!mesh) return;

    if (isMobile) {
      // A previous, desktop-selected element (or a reviewer's own click,
      // per the file header) would otherwise leave ElementPanel's mobile
      // sheet stacked on top of this mode's own TourHud bar.
      if (state.selectedElementId !== null) state.clearSelected();
    } else {
      state.setSelected(element.meshName);
    }

    const { target, position } = elementCameraTarget(mesh, controls, bounds);
    const timeline = easeCameraTo(controls, camera, invalidate, target, position);
    // Killed, not left to finish, if tourIndex changes again mid-tween
    // (a fast double-click on Next, say) — the same cleanup
    // AnnotationMarker.tsx's own easeCameraTo caller uses for the same
    // reason: an in-flight tween racing a newer one would otherwise
    // fight over the same camera.position/controls.target every frame.
    // Redundant-but-safe alongside easeCameraTo's own shared kill (see
    // that function's comment) — GSAP tolerates killing an already-dead
    // timeline as a no-op.
    return () => {
      timeline.kill();
    };
  }, [tourIndex, isMobile, camera, invalidate, bounds]);

  // Wheel and vertical touch-swipe — the two Canvas-native inputs (see
  // file header; TourHud.tsx's buttons are the third, outside the
  // Canvas entirely). Listens on gl.domElement, the same element
  // SmoothZoom.tsx and WalkthroughControls' own drag handling already
  // listen on, so this only ever fires for gestures actually over the
  // 3D view. Neither handler below debounces its own input — every
  // qualifying wheel/swipe calls tourNext/tourPrev directly, and
  // projectStore's own shared rate limit (see that file's comment) is
  // what turns a burst of wheel events or a flurry of swipes into one
  // step at a time.
  useEffect(() => {
    const element = gl.domElement;

    // preventDefault so a scroll gesture over the canvas steps the tour
    // instead of also trying to scroll the page underneath it — the
    // same reasoning SmoothZoom.tsx's own wheel handler already uses.
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const actions = useProjectStore.getState();
      if (event.deltaY > 0) actions.tourNext();
      else actions.tourPrev();
    };

    // A plain start/end Y comparison, not a running gesture tracker —
    // tour only cares about one number (did this touch travel far
    // enough, and which way), unlike SmoothZoom's pinch tracking, which
    // needs the live distance between two fingers throughout the
    // gesture.
    let touchStartY: number | null = null;
    const handleTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0]?.clientY ?? null;
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (touchStartY === null) return;
      const endY = event.changedTouches[0]?.clientY ?? touchStartY;
      const delta = touchStartY - endY;
      touchStartY = null;
      if (Math.abs(delta) < SWIPE_MIN_DISTANCE_PX) return;
      // Swipe up (the finger moves toward the top of the screen, delta
      // > 0) advances — the same convention a vertically-scrolling feed
      // already uses for "next."
      const actions = useProjectStore.getState();
      if (delta > 0) actions.tourNext();
      else actions.tourPrev();
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      element.removeEventListener("wheel", handleWheel);
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchend", handleTouchEnd);
    };
  }, [gl]);

  return null;
}
