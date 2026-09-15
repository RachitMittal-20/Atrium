/**
 * src/components/three/WalkthroughControls.tsx
 *
 * The camera driver for walkthrough mode — Scene.tsx mounts this in place
 * of (never alongside; see its own comment) OrbitControls whenever
 * projectStore's cameraMode is "walkthrough". Where OrbitControls orbits
 * a fixed target, this moves the camera itself on a horizontal plane at
 * roughly eye height: WASD/arrow keys translate forward/back/strafe,
 * left-mouse-drag looks around, and horizontal position is clamped to a
 * padded version of the model's own bounding box (never a true collision
 * system — see the file this replaces' own task brief: "collision or
 * bounds checking isn't required").
 *
 * Deliberately additive and self-contained: this file doesn't import
 * from, or get imported by, anything annotation- or realtime-related.
 * Annotation markers keep working here because they always have — their
 * Html click handlers don't go through OrbitControls or this component at
 * all (see AnnotationMarker.tsx), so nothing about them needed touching.
 *
 * Entering/leaving walkthrough never resets the camera to some fixed
 * view: on mount, this saves the camera's exact position+quaternion
 * (wherever OrbitControls last left them) and only then drops to eye
 * height; on unmount (switching back to ORBIT), it restores that exact
 * saved position+quaternion before OrbitControls re-enables — so orbit
 * mode resumes from precisely where it was, not a hard reset. This is
 * also why Scene.tsx renders OrbitControls with `enabled={false}` rather
 * than unmounting it during walkthrough: an unmounted-then-remounted
 * OrbitControls would construct a *new* instance with target reset to the
 * origin, losing whatever pan/target state the old one had built up.
 * Disabling it instead (drei's own OrbitControls only calls .update()
 * when `controls.enabled` is true — confirmed by reading its source, not
 * assumed) fully stops it from fighting this component's own writes to
 * camera.position/quaternion each frame, while keeping the same instance
 * and its target alive underneath.
 *
 * Mouse-look re-derives its yaw/pitch from the camera's *live* quaternion
 * at the start of every drag, rather than trusting a separately-tracked
 * running total. That matters because something else can legitimately
 * move the camera while walkthrough is active — most notably,
 * AnnotationMarker.tsx's own click handler still calls lib/motion's
 * easeCameraTo to frame the clicked annotation, exactly as it does in
 * orbit mode (untouched, per the task brief). Re-seeding on every drag
 * start means the next look-around always continues smoothly from
 * wherever the camera actually is, instead of snapping back to a stale
 * angle.
 */
"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { isTypingTarget } from "@/lib/keyboard";

// Roughly human scale within the model — there's no metres-per-unit
// figure to derive this from precisely (see Scene.tsx's header: the
// model's own units aren't metric), so this is a deliberate heuristic,
// not a measurement: eye height sits a modest fraction of the way up
// from the floor (bounds.min.y, wherever Center's `top` alignment put
// it) toward the model's own measured ceiling.
const EYE_HEIGHT_RATIO = 0.15;

// Walking speed, scaled by the model's own bounding radius rather than a
// fixed number — so crossing the apartment takes a similar number of
// seconds regardless of how large its native units turn out to be.
const MOVE_SPEED_RATIO = 0.35;

// Radians of look rotation per pixel of mouse drag — tuned by feel, not
// derived from anything.
const LOOK_SENSITIVITY = 0.0025;

// Just short of straight up/down, so the camera can never flip past
// vertical (a gimbal-adjacent glitch with Euler angles, not a real
// three.js limitation — clamping pitch sidesteps it entirely).
const MAX_PITCH = Math.PI / 2 - 0.05;

// How far past the model's own footprint the camera can wander before
// being clamped back — "keep the camera from flying miles outside the
// model's bounding box," not a hard wall at its exact edge.
const BOUNDS_PADDING_RATIO = 0.5;

const FORWARD_KEYS = new Set(["w", "arrowup"]);
const BACK_KEYS = new Set(["s", "arrowdown"]);
const RIGHT_KEYS = new Set(["d", "arrowright"]);
const LEFT_KEYS = new Set(["a", "arrowleft"]);
const MOVE_KEYS = new Set([...FORWARD_KEYS, ...BACK_KEYS, ...RIGHT_KEYS, ...LEFT_KEYS]);

interface WalkthroughControlsProps {
  /** The model's measured world-space bounding box — the same one
   *  Scene.tsx's Model() already computes for near/far planes and
   *  ContactShadows sizing, just also handed down here for clamping. */
  bounds: THREE.Box3;
  /** The model's bounding-sphere radius, reused to scale walking speed
   *  the same way Scene.tsx already scales OrbitControls' min/max
   *  distance from it. */
  radius: number;
}

export function WalkthroughControls({ bounds, radius }: WalkthroughControlsProps) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);

  const savedPosition = useRef<THREE.Vector3 | null>(null);
  const savedQuaternion = useRef<THREE.Quaternion | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  const width = bounds.max.x - bounds.min.x;
  const depth = bounds.max.z - bounds.min.z;
  const minX = bounds.min.x - width * BOUNDS_PADDING_RATIO;
  const maxX = bounds.max.x + width * BOUNDS_PADDING_RATIO;
  const minZ = bounds.min.z - depth * BOUNDS_PADDING_RATIO;
  const maxZ = bounds.max.z + depth * BOUNDS_PADDING_RATIO;
  const eyeHeight = bounds.min.y + (bounds.max.y - bounds.min.y) * EYE_HEIGHT_RATIO;

  // Entering walkthrough: remember exactly where orbit mode left the
  // camera (restored verbatim on unmount below), seed yaw/pitch from that
  // same orientation so the first WASD press moves the direction the
  // camera is actually already facing, then drop to eye height without
  // otherwise moving it.
  //
  // `camera` is a THREE.Camera instance reached via useThree — an
  // imperative three.js object, not React state — so mutating its
  // properties directly here is the normal, correct r3f pattern (Scene.tsx's
  // own Model() does the same for near/far, with the same disable). The
  // compiler-oriented lint rule doesn't know that distinction.
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    savedPosition.current = camera.position.clone();
    savedQuaternion.current = camera.quaternion.clone();

    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    yawRef.current = euler.y;
    pitchRef.current = euler.x;

    camera.position.y = eyeHeight;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, minX, maxX);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, minZ, maxZ);
    invalidate();

    return () => {
      if (savedPosition.current) camera.position.copy(savedPosition.current);
      if (savedQuaternion.current) camera.quaternion.copy(savedQuaternion.current);
      invalidate();
    };
    // Deliberately run this once per mount/unmount only — re-running
    // mid-session because eyeHeight/minX/etc. happened to recompute
    // (they're plain numbers derived from props each render, not stable
    // references) would re-snap the camera to eye height on every
    // unrelated re-render, not just on entering walkthrough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/immutability */

  // WASD/arrow keys — a plain held-key set, not per-keydown deltas, so
  // multiple keys (forward + strafe) combine naturally in the per-frame
  // movement below. Guarded by isTypingTarget the same way ModeIndicator's
  // "C" shortcut is, so typing "w" or "d" into the composer's textarea
  // never doubles as a walkthrough move.
  useEffect(() => {
    // Captured once: keysRef.current is a Set created a single time in the
    // useRef initializer above and never reassigned, so this is the same
    // object the whole component lifetime — copying it out here is just to
    // satisfy the ref-in-cleanup lint (which can't know that), not because
    // it could actually differ by the time cleanup runs.
    const keys = keysRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (!MOVE_KEYS.has(key)) return;
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
  }, [invalidate]);

  // Left-mouse-drag look. Listens on the canvas element for the initial
  // press (so a drag has to actually start over the 3D view, not
  // somewhere in the surrounding chrome) but on window for move/up, the
  // standard drag pattern — a drag that leaves the canvas mid-gesture
  // shouldn't just stop responding.
  useEffect(() => {
    const element = gl.domElement;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      draggingRef.current = true;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      // Re-seed from the camera's live orientation — see file header.
      const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
      yawRef.current = euler.y;
      pitchRef.current = euler.x;
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!draggingRef.current || !lastPointerRef.current) return;
      const dx = event.clientX - lastPointerRef.current.x;
      const dy = event.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      yawRef.current -= dx * LOOK_SENSITIVITY;
      pitchRef.current = THREE.MathUtils.clamp(pitchRef.current - dy * LOOK_SENSITIVITY, -MAX_PITCH, MAX_PITCH);
      camera.quaternion.setFromEuler(new THREE.Euler(pitchRef.current, yawRef.current, 0, "YXZ"));
      invalidate();
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
  }, [camera, gl, invalidate]);

  // See the mount effect above for why camera mutation is disabled here.
  /* eslint-disable react-hooks/immutability */
  useFrame((_state, delta) => {
    const keys = keysRef.current;
    if (keys.size === 0) return;

    let forward = 0;
    let strafe = 0;
    for (const key of keys) {
      if (FORWARD_KEYS.has(key)) forward += 1;
      if (BACK_KEYS.has(key)) forward -= 1;
      if (RIGHT_KEYS.has(key)) strafe += 1;
      if (LEFT_KEYS.has(key)) strafe -= 1;
    }
    if (forward === 0 && strafe === 0) return;

    // Forward/strafe directions come from yaw only, never pitch — looking
    // up or down should never tilt where WASD walks, just where you're
    // looking (the standard FPS-camera convention).
    const yaw = yawRef.current;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    const distance = radius * MOVE_SPEED_RATIO * delta;
    let moveX = (forwardX * forward + rightX * strafe) * distance;
    let moveZ = (forwardZ * forward + rightZ * strafe) * distance;
    // Normalises diagonal movement (both a forward and a strafe key held)
    // back down to the same speed as a single key alone.
    const length = Math.hypot(moveX, moveZ);
    if (length > distance && length > 0) {
      const scale = distance / length;
      moveX *= scale;
      moveZ *= scale;
    }

    camera.position.x = THREE.MathUtils.clamp(camera.position.x + moveX, minX, maxX);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z + moveZ, minZ, maxZ);
    invalidate();
  });
  /* eslint-enable react-hooks/immutability */

  return null;
}
