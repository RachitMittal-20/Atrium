/**
 * src/components/three/WalkthroughControls.tsx
 *
 * The camera driver for walkthrough mode — Scene.tsx mounts this in place
 * of (never alongside; see its own comment) OrbitControls whenever
 * projectStore's cameraMode is "walkthrough". Where OrbitControls orbits
 * a fixed target, this moves the camera itself on a horizontal plane at
 * roughly eye height: WASD translates forward/back/strafe (arrow keys
 * also strafe left/right, but no longer move forward/back — see below),
 * left-mouse-drag looks around, Up/Down arrows nudge eye height, Q/E spin
 * the view hands-free, and horizontal position is clamped to a padded
 * version of the model's own bounding box (never a true collision system
 * — see the file this replaces' own task brief: "collision or bounds
 * checking isn't required").
 *
 * Eye height, fixed (P26): this used to be `bounds.min.y + (bounds.max.y
 * - bounds.min.y) * 0.15` — a fixed 15% up the *whole model's* vertical
 * span, set once on entering walkthrough and never touched again.
 * Measured why that put the camera under furniture instead of at eye
 * level: `bounds.min.y` (≈ 0) isn't the floor — it's contaminated by
 * structure *below* the floor slab (the building-envelope meshes both
 * measure min.y ≈ 3.4, a few units under the real floor at 66.72), and
 * `bounds.max.y` (≈ 1897) is pulled up by the full-height envelope mesh,
 * well above any single room's actual ceiling (≈ 1557). 15% of that
 * inflated ~1897-unit span landed the camera only ~218 units above the
 * real floor — about 0.37m in this model's real-world scale (see below),
 * below the measured coffee-table height (≈ 0.68m) — precisely "seeing
 * up from under a table." Fixed two ways at once:
 *   1. Eye height is now stated in real metres (EYE_HEIGHT_METERS, the
 *      1.6-1.7m human range) and converted through `metersPerUnit` —
 *      Scene.tsx's Model() calibrates that off the "interior-door" mesh's
 *      measured height against a real 2.032m door, since this model's
 *      units were previously undocumented as unconvertible (see
 *      docs/DECISIONS.md).
 *   2. The floor itself is resolved by raycasting straight down against
 *      the "floor" mesh at the camera's *current* x/z every frame
 *      (resolveFloorY below), not trusted from a single global value —
 *      falls back to Scene.tsx's own floorY measurement (the "floor"
 *      mesh's box.min.y) only if the ray genuinely misses, e.g. while
 *      wandering into the padded margin beyond the floor's own footprint.
 *
 * Vertical range (P26): Up/Down arrows (previously forward/back, see
 * below) nudge an eyeOffsetRef up or down within ±EYE_OFFSET_RANGE_METERS
 * of the resolved eye height — standing on toes / crouching, not a free
 * fly — clamped every frame against the same padded-bounding-box
 * philosophy P18's original horizontal clamp used, adapted to the
 * vertical axis: never above `bounds.max.y` minus a ceiling margin, never
 * below the raycast-resolved floor plus a floor margin.
 *
 * Free-rotate (P26): holding Q or E spins yaw continuously
 * (ROTATE_SPEED_RADIANS_PER_SEC), sharing the same yawRef mouse-look
 * already writes — so releasing Q/E mid-turn and picking up a mouse-drag
 * (or vice versa) continues from exactly the angle either one left off
 * at, never a snap.
 *
 * Key bindings, confirmed against this file before anything was changed
 * (nothing here was assumed): WASD moved forward/back/strafe and arrow
 * keys duplicated all four directions identically. Up/Down arrows are
 * repurposed for vertical eye movement per the brief; Left/Right arrows
 * still strafe, untouched, since only Up/Down were asked for and D/A
 * already cover strafe redundantly with them.
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
import { useProjectStore } from "@/store/projectStore";

// The 1.6-1.7m human eye-height range's midpoint — see this file's header
// for how this becomes a model-unit value via metersPerUnit.
const EYE_HEIGHT_METERS = 1.65;

// How far a standing-on-toes/crouching nudge can move the eye off its
// resolved height, each way — modest on purpose, this is posture, not
// flight.
const EYE_OFFSET_RANGE_METERS = 0.35;
const EYE_OFFSET_SPEED_METERS_PER_SEC = 0.6;

// Safety margins for the vertical clamp (see file header's "Vertical
// range" section) — kept small; their job is only to stop the eye offset
// from ever pushing the camera through the ceiling or floor, not to hold
// it far away from either.
const CEILING_MARGIN_METERS = 0.25;
const FLOOR_MARGIN_METERS = 0.2;

// Walking speed, scaled by the model's own bounding radius rather than a
// fixed number — so crossing the apartment takes a similar number of
// seconds regardless of how large its native units turn out to be.
const MOVE_SPEED_RATIO = 0.35;

// Radians of look rotation per pixel of mouse drag — tuned by feel, not
// derived from anything.
const LOOK_SENSITIVITY = 0.0025;

// Q/E hands-free turn rate — 90°/s, a full 360° turn in 4s. Tuned by
// feel, fast enough to actually be useful for looking around, slow
// enough not to be disorienting.
const ROTATE_SPEED_RADIANS_PER_SEC = Math.PI / 2;

// Just short of straight up/down, so the camera can never flip past
// vertical (a gimbal-adjacent glitch with Euler angles, not a real
// three.js limitation — clamping pitch sidesteps it entirely).
const MAX_PITCH = Math.PI / 2 - 0.05;

// How far past the model's own footprint the camera can wander before
// being clamped back — "keep the camera from flying miles outside the
// model's bounding box," not a hard wall at its exact edge.
const BOUNDS_PADDING_RATIO = 0.5;

// Forward/back is WASD-only now — arrow keys used to duplicate this too,
// but Up/Down are repurposed for vertical eye movement (see file header).
const FORWARD_KEYS = new Set(["w"]);
const BACK_KEYS = new Set(["s"]);
// Strafe still accepts both — only Up/Down were asked to change.
const RIGHT_KEYS = new Set(["d", "arrowright"]);
const LEFT_KEYS = new Set(["a", "arrowleft"]);
const EYE_UP_KEYS = new Set(["arrowup"]);
const EYE_DOWN_KEYS = new Set(["arrowdown"]);
const ROTATE_LEFT_KEYS = new Set(["q"]);
const ROTATE_RIGHT_KEYS = new Set(["e"]);
const HELD_KEYS = new Set([
  ...FORWARD_KEYS,
  ...BACK_KEYS,
  ...RIGHT_KEYS,
  ...LEFT_KEYS,
  ...EYE_UP_KEYS,
  ...EYE_DOWN_KEYS,
  ...ROTATE_LEFT_KEYS,
  ...ROTATE_RIGHT_KEYS,
]);

// Module-scoped scratch objects for the per-frame floor raycast — reused
// across calls instead of allocated fresh each frame, the same pattern
// AnnotationMarker.tsx's own _worldPosition scratch uses. Safe as a
// module singleton since only one WalkthroughControls is ever mounted at
// a time (cameraMode is exactly one of "orbit" | "walkthrough").
const _rayOrigin = new THREE.Vector3();
const _rayDown = new THREE.Vector3(0, -1, 0);

interface WalkthroughControlsProps {
  /** The model's measured world-space bounding box — the same one
   *  Scene.tsx's Model() already computes for near/far planes and
   *  ContactShadows sizing, just also handed down here for clamping. */
  bounds: THREE.Box3;
  /** The model's bounding-sphere radius, reused to scale walking speed
   *  the same way Scene.tsx already scales OrbitControls' min/max
   *  distance from it. */
  radius: number;
  /** The "floor" mesh's own measured world-space Y — the fallback this
   *  file's per-position raycast uses when the ray misses (see header). */
  floorY: number;
  /** Real metres per model unit, calibrated in Scene.tsx off the
   *  "interior-door" mesh — see that file's header. Everything
   *  human-scale in this file (eye height, vertical range, margins) is
   *  stated in real metres and converted through this. */
  metersPerUnit: number;
}

export function WalkthroughControls({ bounds, radius, floorY, metersPerUnit }: WalkthroughControlsProps) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);

  const savedPosition = useRef<THREE.Vector3 | null>(null);
  const savedQuaternion = useRef<THREE.Quaternion | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const eyeOffsetRef = useRef(0);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const floorObjectRef = useRef<THREE.Object3D | null>(null);

  const width = bounds.max.x - bounds.min.x;
  const depth = bounds.max.z - bounds.min.z;
  const minX = bounds.min.x - width * BOUNDS_PADDING_RATIO;
  const maxX = bounds.max.x + width * BOUNDS_PADDING_RATIO;
  const minZ = bounds.min.z - depth * BOUNDS_PADDING_RATIO;
  const maxZ = bounds.max.z + depth * BOUNDS_PADDING_RATIO;

  const eyeHeightUnits = EYE_HEIGHT_METERS / metersPerUnit;
  const eyeOffsetRangeUnits = EYE_OFFSET_RANGE_METERS / metersPerUnit;
  const eyeOffsetSpeedUnits = EYE_OFFSET_SPEED_METERS_PER_SEC / metersPerUnit;
  const ceilingMarginUnits = CEILING_MARGIN_METERS / metersPerUnit;
  const floorMarginUnits = FLOOR_MARGIN_METERS / metersPerUnit;

  // Straight-down raycast against the floor mesh at (x, z), so the eye
  // height is resolved from the *actual floor surface under the person*
  // each frame rather than one fixed value for the whole model — see file
  // header. Falls back to the floorY prop (Scene.tsx's own flat
  // measurement of the same mesh) only when the ray misses entirely,
  // which only happens out in the padded margin beyond the floor's own
  // footprint.
  const resolveFloorY = (x: number, z: number): number => {
    const floorObject = floorObjectRef.current;
    if (floorObject) {
      _rayOrigin.set(x, bounds.max.y + 1, z);
      raycasterRef.current.set(_rayOrigin, _rayDown);
      const hits = raycasterRef.current.intersectObject(floorObject, true);
      if (hits.length > 0) return hits[0].point.y;
    }
    return floorY;
  };

  // Vertical safety clamp — the same padded-bounding-box philosophy the
  // horizontal minX/maxX/minZ/maxZ clamps above already use, adapted to
  // the vertical axis: never let the eye offset push the camera through
  // the ceiling (bounds.max.y, minus a margin) or below the floor it was
  // just resolved against (plus a margin).
  const clampEyeY = (desiredY: number, floorAtPosition: number): number =>
    THREE.MathUtils.clamp(desiredY, floorAtPosition + floorMarginUnits, bounds.max.y - ceilingMarginUnits);

  // Entering walkthrough: remember exactly where orbit mode left the
  // camera (restored verbatim on unmount below), seed yaw/pitch from that
  // same orientation so the first WASD press moves the direction the
  // camera is actually already facing, then drop to eye height without
  // otherwise moving it.
  //
  // `camera` is a THREE.Camera instance reached via useThree — an
  // imperative three.js object, not React state — so mutating it via
  // .set()/.copy() here is the normal, correct r3f pattern (Scene.tsx's
  // own Model() does the same for near/far).
  useEffect(() => {
    savedPosition.current = camera.position.clone();
    savedQuaternion.current = camera.quaternion.clone();

    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    yawRef.current = euler.y;
    pitchRef.current = euler.x;
    eyeOffsetRef.current = 0;

    floorObjectRef.current = useProjectStore.getState().getElementObject("floor");

    const startX = THREE.MathUtils.clamp(camera.position.x, minX, maxX);
    const startZ = THREE.MathUtils.clamp(camera.position.z, minZ, maxZ);
    const startFloorY = resolveFloorY(startX, startZ);
    camera.position.set(startX, clampEyeY(startFloorY + eyeHeightUnits, startFloorY), startZ);
    invalidate();

    return () => {
      if (savedPosition.current) camera.position.copy(savedPosition.current);
      if (savedQuaternion.current) camera.quaternion.copy(savedQuaternion.current);
      invalidate();
    };
    // Deliberately run this once per mount/unmount only — re-running
    // mid-session because eyeHeightUnits/minX/etc. happened to recompute
    // (they're plain numbers derived from props each render, not stable
    // references) would re-snap the camera to eye height on every
    // unrelated re-render, not just on entering walkthrough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WASD/arrow/Q/E keys — a plain held-key set, not per-keydown deltas,
  // so multiple keys (forward + strafe, or move + rotate) combine
  // naturally in the per-frame update below. Guarded by isTypingTarget
  // the same way ModeIndicator's "C" shortcut is, so typing any of these
  // letters into the composer's textarea never doubles as a walkthrough
  // input.
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
      if (!HELD_KEYS.has(key)) return;
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

  // Direct camera.position/quaternion mutation here is the normal r3f
  // pattern (see the mount effect above) — the disable below is for the
  // bare property assignments this loop uses (camera.position.x = ...),
  // which the compiler-oriented lint rule can't tell apart from mutating
  // React-managed state.
  /* eslint-disable react-hooks/immutability */
  useFrame((_state, delta) => {
    const keys = keysRef.current;
    if (keys.size === 0) return;

    let rotate = 0;
    let vertical = 0;
    let forward = 0;
    let strafe = 0;
    for (const key of keys) {
      if (ROTATE_LEFT_KEYS.has(key)) rotate += 1;
      if (ROTATE_RIGHT_KEYS.has(key)) rotate -= 1;
      if (EYE_UP_KEYS.has(key)) vertical += 1;
      if (EYE_DOWN_KEYS.has(key)) vertical -= 1;
      if (FORWARD_KEYS.has(key)) forward += 1;
      if (BACK_KEYS.has(key)) forward -= 1;
      if (RIGHT_KEYS.has(key)) strafe += 1;
      if (LEFT_KEYS.has(key)) strafe -= 1;
    }
    if (rotate === 0 && vertical === 0 && forward === 0 && strafe === 0) return;

    // Q/E free-rotate — shares yawRef with mouse-look (handlePointerMove
    // above), so switching between the two mid-turn never snaps.
    if (rotate !== 0) {
      yawRef.current += rotate * ROTATE_SPEED_RADIANS_PER_SEC * delta;
      camera.quaternion.setFromEuler(new THREE.Euler(pitchRef.current, yawRef.current, 0, "YXZ"));
    }

    // Up/Down arrows — a posture nudge (tiptoe/crouch), clamped in the
    // per-position Y resolution below, not here (floorAtPosition isn't
    // known yet at this point in the frame).
    if (vertical !== 0) {
      eyeOffsetRef.current = THREE.MathUtils.clamp(
        eyeOffsetRef.current + vertical * eyeOffsetSpeedUnits * delta,
        -eyeOffsetRangeUnits,
        eyeOffsetRangeUnits,
      );
    }

    // Forward/strafe directions come from yaw only, never pitch — looking
    // up or down should never tilt where WASD walks, just where you're
    // looking (the standard FPS-camera convention).
    const yaw = yawRef.current;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    const moveDistance = radius * MOVE_SPEED_RATIO * delta;
    let moveX = (forwardX * forward + rightX * strafe) * moveDistance;
    let moveZ = (forwardZ * forward + rightZ * strafe) * moveDistance;
    // Normalises diagonal movement (both a forward and a strafe key held)
    // back down to the same speed as a single key alone.
    const length = Math.hypot(moveX, moveZ);
    if (length > moveDistance && length > 0) {
      const scale = moveDistance / length;
      moveX *= scale;
      moveZ *= scale;
    }

    const nextX = THREE.MathUtils.clamp(camera.position.x + moveX, minX, maxX);
    const nextZ = THREE.MathUtils.clamp(camera.position.z + moveZ, minZ, maxZ);
    camera.position.x = nextX;
    camera.position.z = nextZ;

    // Y is always re-resolved from the *current* x/z on any input this
    // frame handled — a rotate-only or vertical-only frame still needs
    // this (a rotate-only frame technically doesn't, since x/z didn't
    // move, but re-running the raycast is cheap and keeping one code path
    // for all four inputs is simpler than special-casing it away).
    const floorAtPosition = resolveFloorY(nextX, nextZ);
    camera.position.y = clampEyeY(floorAtPosition + eyeHeightUnits + eyeOffsetRef.current, floorAtPosition);

    invalidate();
  });
  /* eslint-enable react-hooks/immutability */

  return null;
}
