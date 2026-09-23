/**
 * src/lib/motion.ts
 *
 * Shared motion constants for every animation in ATRIUM — durations and a
 * single weighted easing curve. No component hardcodes a duration or ease
 * string of its own; everything imports from here so timing stays coherent
 * across scroll reveals, panel transitions, and the 3D scene.
 *
 * Registers CustomEase once at module load so EASE_WEIGHTED is usable
 * anywhere gsap.to/from/timeline accepts an ease.
 *
 * Also the home for three shared camera-targeting primitives:
 *  - easeCameraTo, the one GSAP routine that moves OrbitControls' target
 *    and the camera together — used by ElementPanel.tsx (frame the
 *    selected element, keeping the current viewing angle), AnnotationMarker
 *    .tsx (face a pinned point along its stored normal), ReviewList.tsx
 *    (row clicks and J/K navigation, both facing a pinned point the same
 *    way AnnotationMarker's own click does), and TourControls.tsx (easing
 *    onto each element in turn as tour mode steps through them).
 *  - annotationCameraTarget, which computes the {target, position} pair
 *    easeCameraTo needs from an annotation's live Object3D — shared by
 *    AnnotationMarker.tsx and ReviewList.tsx so "how do we frame a pinned
 *    point" has exactly one implementation, not two that could drift.
 *  - elementCameraTarget, the equivalent {target, position} pair for an
 *    arbitrary *mesh* rather than an annotation — TourControls.tsx's one
 *    caller. See that function's own comment for why it can't just reuse
 *    annotationCameraTarget (no stored normal to read) and for the
 *    reasoning behind its distance formula's constants.
 * Real, differently-motivated callers computing their own inputs but
 * sharing identical tween mechanics is exactly what earns these their own
 * functions rather than staying copy-pasted.
 */
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

gsap.registerPlugin(CustomEase);

// A heavy, weighted ease-out — quick departure, long unhurried settle. This
// is the "expensive" feel from the design brief, not a bounce or an overshoot.
export const EASE_WEIGHTED = CustomEase.create("atriumWeighted", "0.16, 1, 0.3, 1");

export const DURATION = {
  // Micro-interactions (hover feedback) — deliberately below the cinematic
  // scale below, since these need to read as instant, not as an entrance.
  instant: 0.25,
  fast: 0.4,
  base: 0.8,
  slow: 1.4,
  cinematic: 2.2,
  // The camera-framing ease driven by easeCameraTo below — long enough to
  // read as a deliberate reframe, short enough not to make the reviewer
  // wait to see what they just clicked.
  frame: 1.2,
} as const;

// Below this width, pinned and horizontally-scrubbed sections collapse to
// plain stacked content — pinned scroll is miserable on a phone. Shared so
// the scroll-narrative sections agree on exactly where that line is.
export const PIN_BREAKPOINT = 900;

/**
 * Eases OrbitControls' target and the camera's position onto new world-space
 * points together, over DURATION.frame with EASE_WEIGHTED. Both target and
 * position are tweened on detached clones (not the live Vector3s controls
 * and the camera already own) and copied across every tick — gsap can't
 * tween those objects directly without fighting OrbitControls' own
 * damping-driven writes to them. Calls `controls.update()` and `invalidate`
 * each tick so the demand frameloop keeps drawing through the tween.
 *
 * Returns the gsap timeline so a caller can `.kill()` it on cleanup (e.g. if
 * the selection changes again before the tween finishes).
 */
export function easeCameraTo(
  controls: OrbitControlsImpl,
  camera: THREE.Camera,
  invalidate: () => void,
  target: THREE.Vector3,
  position: THREE.Vector3,
): gsap.core.Timeline {
  const targetTween = controls.target.clone();
  const positionTween = camera.position.clone();

  const timeline = gsap.timeline({
    onUpdate: () => {
      controls.target.copy(targetTween);
      camera.position.copy(positionTween);
      controls.update();
      invalidate();
    },
  });
  timeline.to(targetTween, { x: target.x, y: target.y, z: target.z, duration: DURATION.frame, ease: EASE_WEIGHTED }, 0);
  timeline.to(positionTween, { x: position.x, y: position.y, z: position.z, duration: DURATION.frame, ease: EASE_WEIGHTED }, 0);
  return timeline;
}

/**
 * The {target, position} pair easeCameraTo needs to face an annotation's
 * pinned point along its stored normal. `object` is the annotation's live
 * Object3D (projectStore's registerAnnotationObject/getAnnotationObject)
 * — by construction (AnnotationMarker.tsx's own quaternion), its local
 * +Z axis is the stored normal, so reading that axis back out in world
 * space here is exactly the inverse of how the marker was oriented.
 */
export function annotationCameraTarget(
  object: THREE.Object3D,
  controls: OrbitControlsImpl,
): { target: THREE.Vector3; position: THREE.Vector3 } {
  const target = object.getWorldPosition(new THREE.Vector3());
  const normal = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()))
    .normalize();
  const distance = THREE.MathUtils.clamp(controls.minDistance * 1.5, controls.minDistance, controls.maxDistance);
  const position = target.clone().add(normal.multiplyScalar(distance));
  return { target, position };
}

// --- Element framing (tour mode) ------------------------------------------

// The multiplier turning an element's own bounding-sphere radius into a
// viewing distance. Derived, not guessed: r3f's default camera fov is 75°
// (Scene.tsx never overrides it for the main viewer), so fitting a sphere
// of a given radius snugly in frame takes roughly radius / sin(37.5°) ≈
// radius * 1.64. This adds ~35% headroom on top of that snug fit (1.64 *
// 1.35 ≈ 2.2) so a framed element sits inside the shot with a little air
// around it, not cropped edge-to-edge.
const ELEMENT_DISTANCE_MULTIPLIER = 2.2;

// The floor: never frame an element closer than this many multiples of
// OrbitControls' own minDistance (Scene.tsx sets that to the whole
// model's radius * 0.015). Exists for elements whose own bounding sphere
// is tiny (a cabinet knob, a light fixture) — radius * the multiplier
// above alone would put the camera almost on top of them; this keeps
// tour's closest shot a small but real distance away instead.
const ELEMENT_MIN_DISTANCE_FLOOR_RATIO = 3;

// The cap: never frame an element farther than this fraction of
// OrbitControls' own maxDistance (radius * 4). This is the constant most
// worth re-deriving if it ever looks wrong on screen, so the arithmetic
// behind it is spelled out rather than just asserted: drei's <Bounds fit
// margin={1.2}> (Scene.tsx) is what "frame the entire model" actually
// computes, and for the same 75° fov that lands around radius * 1.2 /
// sin(37.5°) ≈ radius * 1.97 — so a naive half of maxDistance (radius *
// 2) would sit *above* a whole-model fit, not below it, reproducing
// exactly the "clicking a wall looks the same as fitting everything" bug
// ElementPanel.tsx's own header documents removing once already (its
// prior radius * 3 attempt, clamped against maxDistance, converged on
// almost the same distance as the whole-model fit for large elements).
// 0.3 instead puts the cap at radius * 1.2 — comfortably (about 60%)
// under that ~1.97x whole-model figure, so even the single largest
// element in the model (a full-height wall, whose own bounding sphere
// can approach but never reach the whole model's) still reads as
// "zoomed into this one thing."
const ELEMENT_MAX_DISTANCE_CAP_RATIO = 0.3;

// A fixed, elevated 3/4 angle to shoot every framed element from.
// annotationCameraTarget above reads a *stored* normal off its target
// object to know which way to face — mesh elements have no such thing
// (there's no "correct side" to view a sofa from the way there's a
// correct side to face a wall a comment is pinned to), so this is simply
// a generally flattering angle for an arbitrary object, the kind an
// architectural photograph would use by default.
const ELEMENT_VIEW_DIRECTION = new THREE.Vector3(1, 0.6, 1).normalize();

/**
 * The {target, position} pair easeCameraTo needs to frame an arbitrary
 * mesh — TourControls.tsx's one caller, stepping through elements in
 * tour mode. Not a drop-in replacement for annotationCameraTarget above
 * (see ELEMENT_VIEW_DIRECTION's own comment for why) and not built from
 * the whole-model bounding sphere driving OrbitControls' own min/max
 * distance (Scene.tsx's `extent.radius`) — this file has no access to
 * that number at all, only to `controls`, which is exactly why the
 * distance formula below is expressed entirely in terms of
 * controls.minDistance/maxDistance rather than needing it passed in.
 *
 * Uses the mesh's own Box3 (setFromObject), not a bounding sphere, to
 * measure the element itself: a box captures a long, thin element (a
 * wall, a countertop) far better than a sphere would, which either
 * overestimates a thin wall's apparent size along its short axis or
 * underestimates a long one. getBoundingSphere() is still used to turn
 * that box into the one radius number the distance formula needs — a
 * sphere is the right shape once you're computing "how far back to
 * stand," even though it was the wrong shape for measuring the
 * element's extent in the first place.
 *
 * distance = clamp(radius * ELEMENT_DISTANCE_MULTIPLIER, floor, cap) —
 * one continuous formula, not two hardcoded size tiers: a doorknob and a
 * kitchen island already get very different absolute distances from the
 * multiplier alone, since it scales linearly with each element's own
 * radius. The floor and cap only exist to keep both ends of that
 * continuum sane — see their own comments above for exactly why each
 * value was picked.
 */
export function elementCameraTarget(
  mesh: THREE.Object3D,
  controls: OrbitControlsImpl,
): { target: THREE.Vector3; position: THREE.Vector3 } {
  const box = new THREE.Box3().setFromObject(mesh);
  const target = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());

  const distance = THREE.MathUtils.clamp(
    sphere.radius * ELEMENT_DISTANCE_MULTIPLIER,
    controls.minDistance * ELEMENT_MIN_DISTANCE_FLOOR_RATIO,
    controls.maxDistance * ELEMENT_MAX_DISTANCE_CAP_RATIO,
  );
  const position = target.clone().add(ELEMENT_VIEW_DIRECTION.clone().multiplyScalar(distance));
  return { target, position };
}
