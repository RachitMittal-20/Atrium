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
 * view: on mount, this starts from the camera's live pose (wherever the
 * previous mode left it) and only then drops to eye height. It doesn't
 * save or restore anything itself: Scene.tsx's Model() snapshots the
 * orbit pose the moment cameraMode leaves "orbit" and puts it back the
 * moment it returns, so orbit resumes from precisely where it was, while
 * a switch straight to PANORAMA keeps this mode's eye position (see
 * Scene.tsx's header for why that can't live in this file). This is
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
 *
 * LOOK_SENSITIVITY, ROTATE_SPEED_RADIANS_PER_SEC and MAX_PITCH are
 * exported: PanoramaControls.tsx (the fixed-point look-around mode)
 * imports these exact values rather than restating them, so drag-to-look
 * and Q/E feel identical in both modes and a retune here reaches both.
 *
 * Movement easing (P28): WASD used to set position directly from
 * `radius * MOVE_SPEED_RATIO * delta` every frame a key was held — full
 * speed the instant a key went down, and the per-frame loop returned
 * early the instant keys.size hit zero, so movement stopped dead on
 * keyup with no carry-over at all. That's the same abrupt, undamped
 * pattern this pass's own brief flagged in OrbitControls' rotation before
 * P27 fixed it (see Scene.tsx's dampingFactor comment) — just for
 * translation instead of rotation, and confirmed the same way: it wasn't
 * assumed from reading the code, it was checked, and this one really did
 * snap. moveVelocityRef now holds a world-space (x, z) units/sec value
 * that's exponentially smoothed toward a target velocity every frame
 * (`1 - exp(-delta / MOVE_ACCEL_TIME_CONSTANT)`, the same frame-rate-
 * independent lerp shape Lenis itself uses for scroll — see
 * SmoothScrollProvider.tsx) rather than jumping straight to it, so
 * releasing a key now coasts to a stop over MOVE_ACCEL_TIME_CONSTANT-ish
 * seconds instead of halting instantly. The per-frame loop no longer
 * returns early just because keys.size is zero — it keeps running (and
 * re-resolving position/floor) for as long as velocity is still above
 * VELOCITY_EPSILON, which is what lets deceleration actually finish
 * playing out after the key is already up. Q/E rotation and the Up/Down
 * eye-offset nudge are untouched — both already apply at a constant rate
 * while held and simply stop accumulating on release with no snap of
 * their own to begin with, unlike position, which used to teleport to a
 * fixed speed in one frame.
 */
"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { isTypingTarget } from "@/lib/keyboard";
import { useProjectStore } from "@/store/projectStore";

// The 1.6-1.7m human eye-height range's midpoint — see this file's header
// for how this becomes a model-unit value via metersPerUnit. The default
// only: a custom uploaded model (Scene.tsx's `extent.metersPerUnit` for
// that path is a rough box-height guess, not a real calibration — see
// that file's header) passes its own eyeHeightMetersOverride prop
// instead, driven by CustomModelControl.tsx's manual slider, so this
// constant is never even read for that case.
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

// How quickly actual velocity chases the held-key target velocity — see
// file header's "Movement easing" paragraph. Tuned by feel against a
// real WASD hold/release (not derived from anything): fast enough that
// starting to walk still reads as immediate, slow enough that releasing
// a key visibly coasts for a beat instead of stopping dead. Lower is
// snappier/closer to the old instant behaviour; higher is floatier.
const MOVE_ACCEL_TIME_CONSTANT = 0.15;

// Radians of look rotation per pixel of mouse drag — tuned by feel, not
// derived from anything.
//
// Checked (P27) whether this look-around has any lag/easing worth fixing,
// the same question that turned out to be a real bug in OrbitControls'
// own rotation (see Scene.tsx's dampingFactor comment): it doesn't.
// handlePointerMove below applies the full raw dx/dy to yawRef/pitchRef
// and writes camera.quaternion synchronously, every pointermove, with no
// intermediate delta buffer for anything to lag behind. Confirmed by
// measurement, not just by reading the source: a fast single-flick drag
// (mousedown, one big mousemove, mouseup) landed the camera's full yaw
// change at the exact instant of mouseup, with zero further drift over
// the following half-second of sampling — nothing to reduce or remove
// here.
export const LOOK_SENSITIVITY = 0.0025;

// Q/E hands-free turn rate — 90°/s, a full 360° turn in 4s. Tuned by
// feel, fast enough to actually be useful for looking around, slow
// enough not to be disorienting.
export const ROTATE_SPEED_RADIANS_PER_SEC = Math.PI / 2;

// Just short of straight up/down, so the camera can never flip past
// vertical (a gimbal-adjacent glitch with Euler angles, not a real
// three.js limitation — clamping pitch sidesteps it entirely).
export const MAX_PITCH = Math.PI / 2 - 0.05;

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
// a time (cameraMode is exactly one of "orbit" | "walkthrough" |
// "panorama", and only "walkthrough" mounts this).
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
  /** Overrides EYE_HEIGHT_METERS when present — CustomModelControl.tsx's
   *  manual slider, threaded down through Scene.tsx, only ever passed
   *  for a custom uploaded model (see that file's header for why an
   *  arbitrary model has no door mesh to calibrate scale off of, and
   *  this file's own EYE_HEIGHT_METERS comment). Undefined for the
   *  curated apartment model, which keeps using the fixed constant
   *  exactly as before this prop existed. */
  eyeHeightMetersOverride?: number;
}

export function WalkthroughControls({
  bounds,
  radius,
  floorY,
  metersPerUnit,
  eyeHeightMetersOverride,
}: WalkthroughControlsProps) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);

  const keysRef = useRef<Set<string>>(new Set());
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const eyeOffsetRef = useRef(0);
  // World-space (x, z) units/sec — see file header's "Movement easing"
  // paragraph. A plain mutable object rather than two refs: both
  // components are always read/written together every frame, and this
  // mirrors AnnotationMarker.tsx's own arrivalMultiplier pattern for a
  // per-frame value that isn't React state.
  const moveVelocityRef = useRef({ x: 0, z: 0 });
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

  const eyeHeightUnits = (eyeHeightMetersOverride ?? EYE_HEIGHT_METERS) / metersPerUnit;
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

  // Entering walkthrough: seed yaw/pitch from the camera's live
  // orientation so the first WASD press moves the direction the camera is
  // actually already facing, then drop to eye height without otherwise
  // moving it. (Saving/restoring the orbit pose is Scene.tsx's job — see
  // file header.)
  //
  // `camera` is a THREE.Camera instance reached via useThree — an
  // imperative three.js object, not React state — so mutating it via
  // .set()/.copy() here is the normal, correct r3f pattern (Scene.tsx's
  // own Model() does the same for near/far).
  useEffect(() => {
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    yawRef.current = euler.y;
    pitchRef.current = euler.x;
    eyeOffsetRef.current = 0;
    moveVelocityRef.current.x = 0;
    moveVelocityRef.current.z = 0;

    floorObjectRef.current = useProjectStore.getState().getElementObject("floor");

    const startX = THREE.MathUtils.clamp(camera.position.x, minX, maxX);
    const startZ = THREE.MathUtils.clamp(camera.position.z, minZ, maxZ);
    const startFloorY = resolveFloorY(startX, startZ);
    camera.position.set(startX, clampEyeY(startFloorY + eyeHeightUnits, startFloorY), startZ);
    invalidate();
    // Deliberately run this once per mount/unmount only — re-running
    // mid-session because eyeHeightUnits/minX/etc. happened to recompute
    // (they're plain numbers derived from props each render, not stable
    // references) would re-snap the camera to eye height on every
    // unrelated re-render, not just on entering walkthrough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-applies eye height the instant eyeHeightMetersOverride changes —
  // CustomModelControl.tsx's slider, dragged while the reviewer stands
  // still tuning it by eye. Without this, the new height would only ever
  // show up once the per-frame loop below next ran, which only happens
  // while a movement/rotate key is actually held (`if (keys.size === 0)
  // return;`) — so standing still and dragging the slider would visibly
  // do nothing until the next WASD press, reading as broken rather than
  // as "works while moving." This effect covers exactly that gap: it
  // fires on eyeHeightUnits changing, independent of whether any key is
  // held, and reuses the camera's *current* x/z (wherever it already is)
  // rather than resetting position — this is a height correction, not a
  // re-entry.
  //
  // eyeHeightUnits is a plain number recomputed fresh every render, so
  // React's dependency comparison (Object.is on the value, not a
  // reference) already only re-fires this when it actually changes —
  // skipDidMountRef exists purely to not redundantly re-apply on the
  // very first render, since the mount effect above already set the
  // correct initial position. resolveFloorY/clampEyeY are deliberately
  // left out of the dependency array (same reasoning the mount effect's
  // own disable comment gives): they're plain functions recreated every
  // render from the same up-to-date props/refs, not stable references,
  // and this effect only needs to react to eyeHeightUnits itself
  // changing, not to unrelated re-renders recreating those closures.
  const skipDidMountRef = useRef(true);
  useEffect(() => {
    if (skipDidMountRef.current) {
      skipDidMountRef.current = false;
      return;
    }
    const floorAtPosition = resolveFloorY(camera.position.x, camera.position.z);
    const nextY = clampEyeY(floorAtPosition + eyeHeightUnits + eyeOffsetRef.current, floorAtPosition);
    // .set(), not a bare `camera.position.y = nextY` assignment — matches
    // the mount effect above's own pattern, which the immutability lint
    // rule (see the per-frame loop's own disable block further down, for
    // the one place a bare assignment is unavoidable) treats differently
    // from a direct property write.
    camera.position.set(camera.position.x, nextY, camera.position.z);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eyeHeightUnits, camera, invalidate]);

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
  // radius*MOVE_SPEED_RATIO is a speed (units/sec) now, not pre-multiplied
  // by delta the way the old single-shot moveDistance was — velocity
  // itself is what gets smoothed per frame below, and only converted to
  // an actual displacement (velocity * delta) once it has been.
  const moveSpeed = radius * MOVE_SPEED_RATIO;
  // Below this, snap velocity to exactly zero rather than let it decay
  // asymptotically forever — small enough to be visually identical to
  // "actually stopped," and what lets the per-frame loop below stop
  // re-invalidating once a key-release has genuinely coasted to a halt.
  const velocityEpsilon = moveSpeed * 0.002;

  useFrame((_state, delta) => {
    const keys = keysRef.current;
    const velocity = moveVelocityRef.current;

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

    // Still coasting from a just-released key even though no key is held
    // this frame — see file header's "Movement easing" paragraph for why
    // this can no longer just return on keys.size === 0 the way it used
    // to: that early return is exactly what used to make release feel
    // instant.
    const stillCoasting = Math.abs(velocity.x) > velocityEpsilon || Math.abs(velocity.z) > velocityEpsilon;
    if (rotate === 0 && vertical === 0 && forward === 0 && strafe === 0 && !stillCoasting) return;

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

    // The *target* velocity this frame's held keys imply — full moveSpeed
    // in the intended direction, zero if nothing's held (which is exactly
    // what lets a released key's velocity decay toward zero below instead
    // of holding steady).
    let targetVelocityX = forwardX * forward + rightX * strafe;
    let targetVelocityZ = forwardZ * forward + rightZ * strafe;
    // Normalises diagonal input (both a forward and a strafe key held)
    // back down to the same speed as a single key alone, same as before.
    const targetLength = Math.hypot(targetVelocityX, targetVelocityZ);
    if (targetLength > 1) {
      targetVelocityX /= targetLength;
      targetVelocityZ /= targetLength;
    }
    targetVelocityX *= moveSpeed;
    targetVelocityZ *= moveSpeed;

    // Exponentially smooths actual velocity toward that target — see file
    // header for why this specific shape (frame-rate-independent, the
    // same one Lenis itself uses for scroll).
    const accelT = 1 - Math.exp(-delta / MOVE_ACCEL_TIME_CONSTANT);
    velocity.x += (targetVelocityX - velocity.x) * accelT;
    velocity.z += (targetVelocityZ - velocity.z) * accelT;
    if (Math.abs(velocity.x) < velocityEpsilon) velocity.x = 0;
    if (Math.abs(velocity.z) < velocityEpsilon) velocity.z = 0;

    const nextX = THREE.MathUtils.clamp(camera.position.x + velocity.x * delta, minX, maxX);
    const nextZ = THREE.MathUtils.clamp(camera.position.z + velocity.z * delta, minZ, maxZ);
    camera.position.x = nextX;
    camera.position.z = nextZ;

    // Y is always re-resolved from the *current* x/z regardless of which
    // input(s) fired this frame — a rotate-only frame technically doesn't
    // need this (x/z didn't move), but re-running the raycast is cheap
    // and keeping one code path for every input is simpler than special-
    // casing it away.
    const floorAtPosition = resolveFloorY(nextX, nextZ);
    camera.position.y = clampEyeY(floorAtPosition + eyeHeightUnits + eyeOffsetRef.current, floorAtPosition);

    invalidate();
  });
  /* eslint-enable react-hooks/immutability */

  return null;
}
