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
 *    onto each element in turn as tour mode steps through them). Every
 *    call kills whatever the *previous* call's tween was, if it's still
 *    running, via projectStore's viewport bridge — see this function's
 *    own comment for why more than one of these callers can genuinely
 *    fire close together now that clicking an element or an annotation
 *    both work *during* tour mode too.
 *  - annotationCameraTarget, which computes the {target, position} pair
 *    easeCameraTo needs from an annotation's live Object3D — shared by
 *    AnnotationMarker.tsx and ReviewList.tsx so "how do we frame a pinned
 *    point" has exactly one implementation, not two that could drift.
 *  - elementCameraTarget, the equivalent {target, position} pair for an
 *    arbitrary *mesh* rather than an annotation — TourControls.tsx's one
 *    caller. See that function's own comment for why it can't just reuse
 *    annotationCameraTarget (no stored normal to read) and for the
 *    reasoning behind its distance formula's and view-direction's
 *    constants.
 * Real, differently-motivated callers computing their own inputs but
 * sharing identical tween mechanics is exactly what earns these their own
 * functions rather than staying copy-pasted.
 */
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useProjectStore } from "@/store/projectStore";

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
 * Kills whatever camera-ease tween the *previous* call to this function
 * left running, via projectStore's viewport bridge (killActiveCameraTween)
 * — before this existed, two independent callers with real, separate
 * triggers (TourControls.tsx stepping to a new element on a timer-gated
 * input, AnnotationMarker.tsx/ReviewList.tsx framing a clicked comment)
 * could both be mid-flight at once, each writing to the same
 * camera.position/controls.target every tick and visibly fighting each
 * other until one finished. This makes "only the most recent camera
 * intent wins" true globally, for any two callers, without each one
 * needing to know the others exist — every call here is both a kill of
 * whatever came before and a fresh registration for whatever comes next.
 *
 * Returns the gsap timeline so a caller can *also* `.kill()` it on its own
 * cleanup (e.g. if the selection changes again before the tween finishes)
 * — harmless alongside the shared kill above; GSAP's `.kill()` is a no-op
 * on an already-dead timeline, so both mechanisms killing the same
 * timeline is never a problem, only ever redundant-but-safe.
 */
export function easeCameraTo(
  controls: OrbitControlsImpl,
  camera: THREE.Camera,
  invalidate: () => void,
  target: THREE.Vector3,
  position: THREE.Vector3,
): gsap.core.Timeline {
  useProjectStore.getState().getViewport().killActiveCameraTween?.();

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

  useProjectStore.getState().registerViewport({ killActiveCameraTween: () => timeline.kill() });

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

// How far above the *whole model's* own highest point the camera is
// still allowed to rise, as a fraction of the model's own total height —
// see elementCameraTarget's own comment for the bug this specifically
// fixes, confirmed by measurement (a Playwright trace of every tour step
// against the real model), not guessed: for a large structural/envelope
// element, sphere.radius alone can be a sizeable fraction of the *whole
// model's* own radius, which pushes `distance` up near
// ELEMENT_MAX_DISTANCE_CAP_RATIO's cap — and because the view direction's
// y-component was, until this was measured and fixed, a *fixed* ratio,
// that large distance multiplied straight through into an equally large
// vertical offset, regardless of how tall the element or the model
// actually is. Measured on the curated model: framing
// "building-shell-lower" (own top at y≈1557, in a model whose own overall
// top is y≈1897) put the camera at y≈4075 — more than double the *entire
// model's* own tallest point, a bird's-eye shot looking straight down at
// the roof instead of a normal elevated 3/4 exterior view. 0.15 keeps the
// camera's ceiling at 15% of the model's own height above its actual top
// — generous enough that a genuinely tall element (the full-height
// envelope) still reads as "elevated," nowhere near enough to end up
// floating above the roof.
const ELEMENT_MAX_CEILING_RATIO = 0.15;

// The view direction's elevation (Y) component, held fixed regardless of
// which horizontal bearing elementViewBearing below picks — see that
// function's own comment for why the *horizontal* half of the direction
// is element-aware but the *vertical* half deliberately isn't. This is
// the exact Y value the direction used before it became element-aware
// (the old ELEMENT_VIEW_DIRECTION = (1, 0.6, 1)), so every element keeps
// the same "elevated 3/4" pitch it always had — only its compass bearing
// changes.
const ELEMENT_VIEW_ELEVATION = 0.6;

// The horizontal (XZ) bearing the *original*, pre-element-aware direction
// used — (1, 1) normalized, the XZ projection of (1, 0.6, 1). Furniture
// and anything else near the model's own horizontal centre (see
// elementViewBearing) still gets framed from exactly this bearing,
// unchanged — this constant is what keeps that framing identical to
// before rather than element-awareness silently redirecting every shot.
const ELEMENT_VIEW_FALLBACK_BEARING = new THREE.Vector2(1, 1).normalize();

/**
 * The horizontal (XZ) half of elementCameraTarget's view direction —
 * split into its own function because it's the one part of the direction
 * that needs to know anything about the element's *position*, not just
 * its size. The vertical half (ELEVATION_ratio above) never changes: only
 * the compass bearing does.
 *
 * The bug this fixes (found the same way as the ceiling clamp above — by
 * screenshotting real tour steps, not guessing): a single fixed bearing
 * for every element frequently put the camera on the *outside* of a
 * perimeter wall, window, or door, looking back in at its exterior face,
 * because the bearing never accounted for which side of the building the
 * element was actually on.
 *
 * The fix: compare the element's own horizontal centre to the *model's*
 * own horizontal centre (modelBounds — the same whole-model box the
 * ceiling clamp above already needs). The vector from the model's centre
 * out to the element points roughly "outward," toward whichever side of
 * the building that element sits on; negating it gives "inward" — the
 * side the camera should stand on so it's looking at the element from
 * inside the envelope, the same side a reviewer would actually be
 * standing on to look at that wall or window in the real apartment.
 *
 * Blended with ELEMENT_VIEW_FALLBACK_BEARING, not used outright, by how
 * far the element's centre actually sits from the model's own centre
 * (`proximity`, 0 at dead centre, 1 at or beyond the model's own
 * horizontal half-diagonal): an element right at the model's own centre
 * has a near-zero, directionless "outward" vector — there's no
 * meaningful "which side of the building" answer for it, the same reason
 * "inside vs outside" isn't meaningful for the building shell itself
 * (whose own horizontal centre, being the outer envelope, naturally
 * coincides with the model's — this formula already produces
 * `proximity ≈ 0` for it without any separate special case, falling back
 * to the same fixed bearing that already framed it correctly, verified
 * by screenshot). Perimeter elements (proximity near 1) get the computed
 * inward bearing almost outright; everything between blends smoothly.
 */
function elementViewBearing(target: THREE.Vector3, modelBounds: THREE.Box3): THREE.Vector2 {
  const modelCenterX = (modelBounds.min.x + modelBounds.max.x) / 2;
  const modelCenterZ = (modelBounds.min.z + modelBounds.max.z) / 2;
  const outwardX = target.x - modelCenterX;
  const outwardZ = target.z - modelCenterZ;
  const outwardLength = Math.hypot(outwardX, outwardZ);

  const modelHalfWidth = (modelBounds.max.x - modelBounds.min.x) / 2;
  const modelHalfDepth = (modelBounds.max.z - modelBounds.min.z) / 2;
  const modelHorizontalRadius = Math.hypot(modelHalfWidth, modelHalfDepth);

  // Degenerate cases (an element dead-centre, or a degenerate/zero-size
  // model bounds) fall straight back to the fixed bearing — there's no
  // "inward" to compute from a zero-length "outward."
  if (outwardLength < 1e-6 || modelHorizontalRadius < 1e-6) {
    return ELEMENT_VIEW_FALLBACK_BEARING.clone();
  }

  const inwardX = -outwardX / outwardLength;
  const inwardZ = -outwardZ / outwardLength;
  const proximity = THREE.MathUtils.clamp(outwardLength / modelHorizontalRadius, 0, 1);

  const blendedX = THREE.MathUtils.lerp(ELEMENT_VIEW_FALLBACK_BEARING.x, inwardX, proximity);
  const blendedZ = THREE.MathUtils.lerp(ELEMENT_VIEW_FALLBACK_BEARING.y, inwardZ, proximity);
  const blendedLength = Math.hypot(blendedX, blendedZ);

  // The blend can only cancel out near-completely if "inward" happens to
  // point almost exactly opposite the fallback bearing *and* proximity
  // lands close to the one ratio where the two half-cancel — rare, but
  // not impossible. "Inward" is the more meaningful signal whenever this
  // happens (it's already carrying most of the blend weight by the time
  // cancellation is even possible), so it wins outright rather than this
  // function normalizing a near-zero vector.
  if (blendedLength < 1e-6) {
    return new THREE.Vector2(inwardX, inwardZ);
  }
  return new THREE.Vector2(blendedX / blendedLength, blendedZ / blendedLength);
}

/**
 * The {target, position} pair easeCameraTo needs to frame an arbitrary
 * mesh — TourControls.tsx's one caller, stepping through elements in
 * tour mode. Not a drop-in replacement for annotationCameraTarget above
 * (there's no stored normal to read the way an annotation has — see
 * elementViewBearing's own comment for how the direction is derived
 * instead) and not built from the whole-model bounding *sphere* driving
 * OrbitControls' own min/max distance (Scene.tsx's `extent.radius`) —
 * the distance formula below is expressed entirely in terms of
 * controls.minDistance/maxDistance rather than needing that radius
 * passed in separately. `modelBounds`, by contrast, *is* needed directly
 * — both the ceiling clamp and elementViewBearing's own compass-bearing
 * calculation need the model's real vertical/horizontal extent, not a
 * ratio that can drift arbitrarily far from it. TourControls.tsx threads
 * it through from Scene.tsx's own `extent.box`, the same value
 * WalkthroughControls.tsx already receives as its `bounds` prop for an
 * analogous reason (clamping a camera position against the model's real
 * extent).
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
 * value was picked. The view direction itself is
 * (elementViewBearing.x, ELEMENT_VIEW_ELEVATION, elementViewBearing.y) —
 * an element-aware compass bearing at a fixed elevation angle — and
 * position.y is clamped a second time against modelBounds afterward; see
 * ELEMENT_MAX_CEILING_RATIO's own comment for why a fixed elevation
 * component alone isn't sufficient for large/tall elements specifically.
 */
export function elementCameraTarget(
  mesh: THREE.Object3D,
  controls: OrbitControlsImpl,
  modelBounds: THREE.Box3,
): { target: THREE.Vector3; position: THREE.Vector3 } {
  const box = new THREE.Box3().setFromObject(mesh);
  const target = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());

  const distance = THREE.MathUtils.clamp(
    sphere.radius * ELEMENT_DISTANCE_MULTIPLIER,
    controls.minDistance * ELEMENT_MIN_DISTANCE_FLOOR_RATIO,
    controls.maxDistance * ELEMENT_MAX_DISTANCE_CAP_RATIO,
  );

  const bearing = elementViewBearing(target, modelBounds);
  const direction = new THREE.Vector3(bearing.x, ELEMENT_VIEW_ELEVATION, bearing.y).normalize();
  const position = target.clone().add(direction.multiplyScalar(distance));

  // Ceiling clamp — see ELEMENT_MAX_CEILING_RATIO's own comment. Only
  // ever pulls position.y *down*; never raises it, so a small element
  // (whose own unclamped position.y already sits comfortably below the
  // model's own top) is completely unaffected.
  const modelHeight = modelBounds.max.y - modelBounds.min.y;
  const ceilingY = modelBounds.max.y + modelHeight * ELEMENT_MAX_CEILING_RATIO;
  position.y = Math.min(position.y, ceilingY);

  return { target, position };
}
