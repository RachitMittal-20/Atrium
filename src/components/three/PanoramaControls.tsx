/**
 * src/components/three/PanoramaControls.tsx
 *
 * The camera driver for panorama mode: a fixed-point 360° look-around for
 * anyone who finds orbiting or walking the model too fiddly. Scene.tsx
 * mounts this only while projectStore's cameraMode is "panorama", with
 * OrbitControls kept mounted but `enabled={false}` underneath, exactly as
 * it already does for walkthrough.
 *
 * The camera's *position never changes* here — only its orientation.
 * You look around from wherever the camera already was when the mode was
 * entered: left-mouse-drag to look, hold Q/E to turn hands-free. That's
 * the whole feature.
 *
 * Reused from WalkthroughControls.tsx (same approach, same tuned values):
 *  - Drag-to-look re-derives yaw/pitch from the camera's *live* quaternion
 *    at the start of every drag, never from a separately-kept running
 *    total. Something else can still move the camera while this mode is
 *    active (clicking an annotation marker or a ReviewList row runs
 *    lib/motion's easeCameraTo exactly as in every other mode), and a
 *    stale total would snap the view back to where it was before that on
 *    the next drag. See WalkthroughControls' header for the full story.
 *  - The raw, undamped mouse-look: LOOK_SENSITIVITY applied straight to
 *    the pointer delta, the quaternion written synchronously in the same
 *    pointermove. No easing, so no lag to chase.
 *  - MAX_PITCH clamping, so the view can't flip past straight up/down.
 *  - Q/E hands-free rotation at ROTATE_SPEED_RADIANS_PER_SEC, sharing the
 *    same yaw/pitch refs as the drag, so switching between the two
 *    mid-turn never snaps.
 * All three constants are imported from WalkthroughControls.tsx rather
 * than restated, so the two modes can't drift apart in feel.
 *
 * Deliberately left out, because every one of them moves the camera:
 *  - WASD / Left/Right strafe: no translation of any kind.
 *  - Up/Down eye-height nudging, and the eye-height drop on mount: the
 *    camera stays at whatever height it arrived at.
 *  - The floor raycast, bounds clamping, metersPerUnit: all exist only to
 *    constrain *where* the camera can go, and here it goes nowhere. That's
 *    also why this component takes no props, unlike WalkthroughControls.
 *
 * One small addition WalkthroughControls doesn't have: the moment Q or E
 * starts a turn, yaw/pitch are re-seeded from the live quaternion too, not
 * only at drag start. So a Q/E turn right after an annotation reframe
 * continues from the reframed view instead of snapping back. Cheap, and
 * the same reasoning as the drag re-seed above.
 *
 * Entering/leaving never resets anything, and this file saves and
 * restores nothing itself: it starts from the camera's live pose at the
 * moment the mode switches, whichever mode was active before, so going
 * straight from walkthrough keeps walkthrough's eye position. Returning
 * to orbit afterwards gets orbit's own pose back because Scene.tsx's
 * Model() snapshotted it when cameraMode first left "orbit" (see
 * Scene.tsx's header for why that can't live in each controller).
 *
 * Like WalkthroughControls, this is self-contained: nothing annotation-
 * or realtime-related imports it, and it imports nothing of theirs.
 */
"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { isTypingTarget } from "@/lib/keyboard";
import {
  LOOK_SENSITIVITY,
  MAX_PITCH,
  ROTATE_SPEED_RADIANS_PER_SEC,
} from "@/components/three/WalkthroughControls";

// The only held keys this mode listens to — Q/E, the same bindings
// WalkthroughControls uses for its own free-rotate.
const ROTATE_LEFT_KEYS = new Set(["q"]);
const ROTATE_RIGHT_KEYS = new Set(["e"]);

export function PanoramaControls() {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);

  const keysRef = useRef<Set<string>>(new Set());
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  // Reads yaw/pitch back out of the camera's current orientation. Called
  // at mount, drag start, and Q/E turn start, never mid-gesture (see the
  // file header). "YXZ" order is yaw first, then pitch, the order
  // mouse-look is written back in below, so the round trip is lossless
  // (roll stays 0, since every writer here and lookAt both keep it 0).
  const seedFromCamera = () => {
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    yawRef.current = euler.y;
    pitchRef.current = THREE.MathUtils.clamp(euler.x, -MAX_PITCH, MAX_PITCH);
  };

  // The one place orientation is written, shared by drag and Q/E.
  const applyOrientation = () => {
    camera.quaternion.setFromEuler(new THREE.Euler(pitchRef.current, yawRef.current, 0, "YXZ"));
    invalidate();
  };

  // Entering panorama: seed yaw/pitch from the camera's live pose, and
  // nothing else — no drop to eye height, no clamping, no save/restore
  // (Scene.tsx owns the orbit pose; see file header). The camera stays
  // exactly where it is.
  useEffect(() => {
    seedFromCamera();
    // Once per mount only, the same as WalkthroughControls' mount effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Q/E as a held-key set, read every frame by the useFrame below, the
  // same pattern WalkthroughControls uses. Guarded by isTypingTarget, so
  // typing "q"/"e" into the comment composer never spins the view.
  useEffect(() => {
    // Same never-reassigned Set as WalkthroughControls' keysRef, copied
    // out only for the ref-in-cleanup lint.
    const keys = keysRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (!ROTATE_LEFT_KEYS.has(key) && !ROTATE_RIGHT_KEYS.has(key)) return;
      // Starting a turn from rest: re-seed from the live camera first (see
      // file header's "one small addition"). Key auto-repeat while already
      // turning lands in the non-empty branch and doesn't re-seed.
      if (keys.size === 0) seedFromCamera();
      keys.add(key);
      invalidate();
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.key.toLowerCase());
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      keys.clear();
    };
    // seedFromCamera closes only over camera and refs, so camera is its
    // real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, invalidate]);

  // Left-mouse-drag look, the same shape as WalkthroughControls': the press
  // has to start on the canvas, but move/up are tracked on window so a
  // drag that leaves the canvas mid-gesture keeps working.
  useEffect(() => {
    const element = gl.domElement;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      draggingRef.current = true;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      seedFromCamera();
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!draggingRef.current || !lastPointerRef.current) return;
      const dx = event.clientX - lastPointerRef.current.x;
      const dy = event.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      yawRef.current -= dx * LOOK_SENSITIVITY;
      pitchRef.current = THREE.MathUtils.clamp(pitchRef.current - dy * LOOK_SENSITIVITY, -MAX_PITCH, MAX_PITCH);
      applyOrientation();
    };
    const handlePointerUp = () => {
      draggingRef.current = false;
      lastPointerRef.current = null;
    };

    element.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      element.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
    // seedFromCamera/applyOrientation close only over camera, invalidate
    // and refs, all already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl, invalidate]);

  // Q/E turning, once per frame while held. applyOrientation's
  // invalidate() is what keeps the "demand" frameloop ticking for as long
  // as a key stays down (see Scene.tsx's frameloop note). Pitch is left
  // as-is: Q/E only turn left/right.
  useFrame((_state, delta) => {
    const keys = keysRef.current;
    if (keys.size === 0) return;

    let rotate = 0;
    for (const key of keys) {
      if (ROTATE_LEFT_KEYS.has(key)) rotate += 1;
      if (ROTATE_RIGHT_KEYS.has(key)) rotate -= 1;
    }
    if (rotate === 0) return;

    yawRef.current += rotate * ROTATE_SPEED_RADIANS_PER_SEC * delta;
    applyOrientation();
  });

  return null;
}
