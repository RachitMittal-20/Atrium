/**
 * src/components/three/SmoothZoom.tsx
 *
 * Replaces OrbitControls' own built-in wheel/pinch dolly with a damped
 * one, mounted alongside OrbitControls in Scene.tsx (which renders it with
 * `enableZoom={false}` — see that file) whenever cameraMode is "orbit".
 *
 * Why this exists: three-stdlib's OrbitControls damps *rotation*
 * (sphericalDelta decays by `1 - dampingFactor` every update() call, so a
 * single drag keeps producing eased frames for ~20-30 frames after the
 * pointer stops) but applies *zoom* with no damping at all — confirmed by
 * reading three-stdlib/controls/OrbitControls.js directly: `handleMouseWheel`
 * calls `dollyIn`/`dollyOut`, which sets a `scale` multiplier that the very
 * next `update()` call (invoked synchronously, in the same event handler)
 * applies in full to `spherical.radius` and then resets to `1`. There is no
 * multi-frame interpolation step for zoom the way there is for rotation.
 * Measured directly (Playwright, patched drawElements/drawArrays with
 * timestamps, a rapid 24-notch wheel-zoom burst): each wheel notch produced
 * exactly one rendered frame, then total silence until the next notch —
 * zero settle/tail frames, a ~216ms average gap between notches with
 * nothing rendered in between. Orbit rotation, by contrast, was already
 * measured (see docs/PERFORMANCE.md's finding #11 investigation) producing
 * 7-11 tail frames after the pointer stops. That asymmetry — one
 * interaction eases, the other snaps — is what reads as "zoom feels less
 * smooth than rotate."
 *
 * This component re-implements the wheel/pinch *input* handling (same
 * per-notch scale factor three-stdlib itself uses by default,
 * Math.pow(0.95, 1)) but instead of applying it to the camera immediately,
 * accumulates it into a target distance and eases the camera's actual
 * distance toward that target every rendered frame via an exponential decay
 * — the same shape of curve OrbitControls' own rotation damping produces,
 * just applied to the radius instead of theta/phi. OrbitControls itself
 * stays mounted and enabled throughout (only its own zoom input is
 * disabled) — it still owns rotation, `target`, and re-derives
 * `spherical.radius` from whatever position this component leaves the
 * camera at each frame, the same way it already tolerates external camera
 * writes from lib/motion's easeCameraTo tweens.
 */
"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useProjectStore } from "@/store/projectStore";

// Matches three-stdlib OrbitControls' own default zoomSpeed (1) and its
// exact per-notch formula, so a single notch here feels the same size as
// the built-in behaviour did — only *how* it's applied changes, not the
// step itself.
const WHEEL_ZOOM_STEP = Math.pow(0.95, 1);

// How quickly the camera's actual distance closes the gap to the
// wheel/pinch-driven target distance, per second — an exponential ease
// (1 - e^(-RATE * delta)), the frame-rate-independent equivalent of
// OrbitControls' own per-frame dampingFactor consumption for rotation.
// Tuned by feel against the already-tuned rotate dampingFactor (0.08 per
// frame at ~60fps is roughly a time constant of ~12/s) so the two
// interactions settle in a visually similar amount of time.
const ZOOM_DAMPING_RATE = 12;

// Below this fraction of the current radius, the remaining gap is
// sub-pixel at any sane viewport size — stop re-invalidating rather than
// chase a value that will never visibly change.
const SETTLE_THRESHOLD_RATIO = 0.0005;

interface SmoothZoomProps {
  enabled: boolean;
  minDistance: number;
  maxDistance: number;
}

export function SmoothZoom({ enabled, minDistance, maxDistance }: SmoothZoomProps) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  // The distance-from-target this frame loop eases the camera's *actual*
  // distance toward. Null means "no pending zoom input" — the frame loop
  // below is a no-op until the first wheel/pinch event sets this.
  const targetRadiusRef = useRef<number | null>(null);

  // Re-armed to null whenever this stops being the active camera mode, so
  // re-entering orbit later always starts from wherever the camera
  // actually is (e.g. after a walkthrough round-trip, or an
  // easeCameraTo-driven selection), never a stale target left over from
  // before the mode switch.
  useEffect(() => {
    if (!enabled) targetRadiusRef.current = null;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const element = gl.domElement;
    const activePointers = new Map<number, { x: number; y: number }>();
    let pinchDistance: number | null = null;

    const getTarget = () => useProjectStore.getState().getViewport().controls?.target ?? null;

    const applyScale = (scale: number) => {
      const target = getTarget();
      if (!target) return;
      const baseline = targetRadiusRef.current ?? camera.position.distanceTo(target);
      targetRadiusRef.current = THREE.MathUtils.clamp(baseline * scale, minDistance, maxDistance);
      invalidate();
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      applyScale(event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP);
    };

    // Two-finger pinch — tracked the same way WalkthroughControls tracks a
    // look-around drag: a plain pointer-position map, not a gesture API
    // (better browser support, and this app already leans on raw Pointer
    // Events elsewhere). Only the *distance between* the two active
    // pointers matters; which finger is which never does.
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activePointers.size === 2) {
        const [a, b] = [...activePointers.values()];
        pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!activePointers.has(event.pointerId)) return;
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activePointers.size === 2 && pinchDistance !== null) {
        const [a, b] = [...activePointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        // Fingers spreading apart (distance growing) should zoom in
        // (shrink radius), matching the built-in TOUCH.DOLLY_PAN convention
        // three-stdlib used before enableZoom={false} turned it off.
        applyScale(pinchDistance / distance);
        pinchDistance = distance;
      }
    };
    const handlePointerEnd = (event: PointerEvent) => {
      activePointers.delete(event.pointerId);
      if (activePointers.size < 2) pinchDistance = null;
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    element.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      element.removeEventListener("wheel", handleWheel);
      element.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      activePointers.clear();
      pinchDistance = null;
    };
  }, [enabled, gl, camera, invalidate, minDistance, maxDistance]);

  // `camera` is a THREE.Camera instance reached via useThree — an
  // imperative three.js object, not React state — so mutating its position
  // directly here is the normal r3f pattern already used identically by
  // Scene.tsx's Model() and WalkthroughControls.tsx.
  useFrame((_state, delta) => {
    if (!enabled) return;
    const target = targetRadiusRef.current;
    if (target === null) return;
    const controlsTarget = useProjectStore.getState().getViewport().controls?.target;
    if (!controlsTarget) return;

    const offset = camera.position.clone().sub(controlsTarget);
    const currentRadius = offset.length();
    const diff = target - currentRadius;
    if (Math.abs(diff) < currentRadius * SETTLE_THRESHOLD_RATIO) return;

    const ease = 1 - Math.exp(-ZOOM_DAMPING_RATE * delta);
    const nextRadius = currentRadius + diff * ease;
    offset.setLength(nextRadius);
    camera.position.copy(controlsTarget).add(offset);
    invalidate();
  });

  return null;
}
