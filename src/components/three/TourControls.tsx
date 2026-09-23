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
 *  1. Reacts to tourIndex — projectStore's own position in `elements` —
 *     by easing the camera onto that element via lib/motion's
 *     elementCameraTarget + easeCameraTo. Scene.tsx's Model() resets
 *     tourIndex to 0 itself on every entry into tour mode (see that
 *     file's pose-ownership effect), so this component doesn't need an
 *     "I was just mounted" special case — the very first render already
 *     sees a real tourIndex and eases onto element 0 like any other step.
 *  2. Reads the three input methods that advance/retreat tourIndex:
 *     mouse wheel, touch swipe (vertical), and — mounted separately, in
 *     ordinary DOM outside the Canvas — TourHud.tsx's Prev/Next buttons.
 *     This component owns only the two Canvas-native inputs (wheel,
 *     swipe), listening on gl.domElement the same way SmoothZoom.tsx
 *     listens for wheel/pinch and WalkthroughControls listens for
 *     pointer-drag — TourHud calls projectStore's tourNext/tourPrev
 *     directly, needing no r3f context of its own to do it.
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
 */
"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useProjectStore } from "@/store/projectStore";
import { easeCameraTo, elementCameraTarget } from "@/lib/motion";

// One wheel gesture (a burst of many small deltaY events firing in quick
// succession) or one swipe should step exactly once — not once per
// individual wheel event, which is what a raw handleWheel would do on
// a trackpad's continuous scroll. A simple last-step timestamp, checked
// at the *leading* edge of a gesture rather than debounced to the
// trailing edge, is what makes the first flick of a scroll feel
// immediate instead of laggy; everything else within the cooldown
// window is silently absorbed as "still the same gesture."
const STEP_COOLDOWN_MS = 500;

// How far a touch has to travel vertically, in CSS pixels, before it
// counts as a deliberate swipe rather than a stray finger tremor or the
// start of some other gesture.
const SWIPE_MIN_DISTANCE_PX = 40;

export function TourControls() {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);

  const tourIndex = useProjectStore((state) => state.tourIndex);

  // Eases the camera onto the current tourIndex's element every time it
  // changes — the one place this component actually moves the camera.
  // `elements`/getElementObject/getViewport are all read via getState()
  // rather than hooked, the same "stable function, fresh data every
  // call" pattern ReviewList.tsx's openAnnotation already uses: this
  // effect's own dependency is tourIndex, not the store's current
  // elements array, which would re-run it on every unrelated store
  // write (a remote annotation arriving, say) rather than only on an
  // actual step.
  useEffect(() => {
    const state = useProjectStore.getState();
    const { controls } = state.getViewport();
    const element = state.elements[tourIndex];
    // Both guards are defensive, not expected in normal operation:
    // controls can only be null for an instant before OrbitControls
    // itself has mounted (Scene.tsx already gates this component on
    // `extent`, which only exists after that), and every tourIndex this
    // store ever produces is clamped into `elements`' own bounds by
    // tourNext/tourPrev/tourGoTo.
    if (!controls || !element) return;
    const mesh = state.getElementObject(element.meshName);
    if (!mesh) return;

    const { target, position } = elementCameraTarget(mesh, controls);
    const timeline = easeCameraTo(controls, camera, invalidate, target, position);
    // Killed, not left to finish, if tourIndex changes again mid-tween
    // (a fast double-click on Next, say) — the same cleanup
    // AnnotationMarker.tsx's own easeCameraTo caller uses for the same
    // reason: an in-flight tween racing a newer one would otherwise
    // fight over the same camera.position/controls.target every frame.
    return () => {
      timeline.kill();
    };
  }, [tourIndex, camera, invalidate]);

  // Wheel and vertical touch-swipe — the two Canvas-native inputs (see
  // file header; TourHud.tsx's buttons are the third, outside the
  // Canvas entirely). Listens on gl.domElement, the same element
  // SmoothZoom.tsx and WalkthroughControls' own drag handling already
  // listen on, so this only ever fires for gestures actually over the
  // 3D view.
  useEffect(() => {
    const element = gl.domElement;
    let lastStepAt = 0;

    const step = (forward: boolean) => {
      const now = performance.now();
      if (now - lastStepAt < STEP_COOLDOWN_MS) return;
      lastStepAt = now;
      const actions = useProjectStore.getState();
      if (forward) actions.tourNext();
      else actions.tourPrev();
    };

    // preventDefault so a scroll gesture over the canvas steps the tour
    // instead of also trying to scroll the page underneath it — the
    // same reasoning SmoothZoom.tsx's own wheel handler already uses.
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      step(event.deltaY > 0);
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
      step(delta > 0);
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
