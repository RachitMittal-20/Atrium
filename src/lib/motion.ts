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

// The flatter elevation used instead of ELEMENT_VIEW_ELEVATION whenever
// ELEMENT_NON_FLAT_FRAMING_RADIUS_CAP_RATIO below actually reduces an
// element's framingRadius — see that constant's own comment for which
// elements this is. 0.6's "elevated 3/4" pitch was chosen for a compact,
// furniture-scale object, photographed the way a catalogue shot would be;
// it's the wrong angle for a large surface being deliberately framed
// *close* rather than fit in full, because the same fixed ratio between
// this and the horizontal bearing means whatever distance the cap allows
// still multiplies into a vertical offset proportioned for a small
// object, not a wall-height one. Measured, not guessed: capping distance
// alone (keeping 0.6) left two of this round's four target elements
// still reading as an aerial shot from above the roofline, confirmed by
// screenshot — the elevation ratio, not just the distance magnitude, was
// still too steep for their own scale. 0.25 (≈14° above horizontal,
// against 0.6's ≈31°) was chosen empirically the same way and reverified
// by screenshot: flat enough to read as a normal, human-eye-level
// interior view rather than a lifted product shot, without going so flat
// it reads as looking straight at a wall with no depth at all.
const ELEMENT_VIEW_ELEVATION_LARGE = 0.25;

// The horizontal (XZ) bearing the *original*, pre-element-aware direction
// used — (1, 1) normalized, the XZ projection of (1, 0.6, 1). Furniture
// and anything else near the model's own horizontal centre (see
// elementViewBearing) still gets framed from exactly this bearing,
// unchanged — this constant is what keeps that framing identical to
// before rather than element-awareness silently redirecting every shot.
const ELEMENT_VIEW_FALLBACK_BEARING = new THREE.Vector2(1, 1).normalize();

// The ceiling on framingRadius for the *non-flat* branch of
// elementCameraTarget below — caps the element's own full bounding-sphere
// radius so an element whose footprint spans a large fraction of the
// building's own plan (a room-spanning interior wall run, a full floor
// slab) still reads as a normal, close interior shot rather than one
// pulled back far enough to show most of the room — and, since the view
// direction's elevation component multiplies straight through distance
// into a vertical offset, far enough to also clear ELEMENT_MAX_CEILING
// _RATIO's own clamp and look down at the building from above it. This
// is the same failure mode that constant already patches for tall *flat*
// elements; this one patches the equivalent bug for large *chunky* ones,
// which a height-only clamp can't fix since the problem is the
// *distance* driving that height, not the height itself.
//
// Derived from controls.maxDistance, measured rather than assumed: an
// early version of this constant guessed maxDistance from the *shell's
// own* sphere radius (≈4755) and picked a ratio meant to land the cap
// near the kitchen countertop's own radius (≈1170, one of the two
// elements this cap must leave untouched — see below). Logging the real
// runtime values showed that guess was wrong by a wide margin: the
// *whole model's* own extent.radius that actually drives
// controls.maxDistance is ≈7030 (larger than any single mesh, this
// model's own geometry apparently extends slightly past the envelope
// meshes alone), making maxDistance ≈28118 rather than the ≈19000
// assumed — a cap ratio derived from the wrong radius landed nearly 50%
// too loose, which is exactly why the first version of this fix produced
// no visible change on screen. 0.0425 of the *real, measured* maxDistance
// lands the cap at ≈1195 — just above the kitchen countertop's own
// measured radius (≈1170.4), the tighter of the two elements this cap
// must leave unaffected (the sofa's own radius, ≈1112, clears it with
// more room), and well under every element this round's audit found
// broken (kitchen range ≈1967; the two "Interior Wall" surfaces and the
// floor, all ≈3200–4100).
//
// Never applied to an exterior-tagged element (isExteriorElementName) —
// the building's own envelope legitimately *is* close to the whole
// model's own scale, and framing it at the same tight radius as a
// countertop would crop the one element this whole file's distance/
// ceiling constants were originally tuned around (see
// ELEMENT_MAX_CEILING_RATIO's own comment, measured against
// "building-shell-lower" specifically). elementCameraTarget skips this
// cap entirely for that case rather than trying to make one ratio serve
// both a genuinely building-scale element and a merely large one.
const ELEMENT_NON_FLAT_FRAMING_RADIUS_CAP_RATIO = 0.0425;

// How much thinner a flat element's shorter horizontal (X or Z) dimension
// has to be than its longer horizontal dimension before flatElementAxis
// (below) treats it as a wall/door/panel rather than a chunky object.
// Found by measurement, not guessed, against every element in the curated
// model: real walls, doors, and panels measure well under this ratio (a
// door's own 87-unit thickness against a 1286-unit width, for instance),
// while every roughly-square-in-plan element (a kitchen countertop, the
// floor, the ceiling, a media console) measures well over it — the two
// groups aren't close on the real data, so 0.3 sits with comfortable
// headroom on both sides rather than against a knife-edge case.
const FLAT_ELEMENT_ASPECT_RATIO = 0.3;

/**
 * The horizontal (XZ) half of elementCameraTarget's view direction, for
 * elements flatElementAxis (below) does *not* flag as a wall/door/panel
 * — furniture, countertops, and anything else roughly chunky rather than
 * flat. Split into its own function because it's the one part of the
 * direction that needs to know anything about the element's *position*,
 * not just its size. The vertical half (ELEVATION_ratio above) never
 * changes: only the compass bearing does.
 *
 * This used to be the *only* view-direction logic elementCameraTarget
 * had, and on its own it's still wrong for exactly the case
 * flatElementAxis now intercepts first: comparing an element's *position*
 * to the model's centre is a reasonable proxy for "is this near the
 * perimeter," but it has no relationship to which way a flat element's
 * own face actually points — a wall or door can be oriented any which
 * way regardless of where it sits in the floor plan, so a
 * position-derived bearing can land in-plane with the surface instead of
 * perpendicular to it (an edge-on sliver, not a view of the face). That
 * failure mode simply didn't show up on the handful of elements this
 * function was first verified against, by chance of their orientation —
 * see flatElementAxis's own comment for the shape-based fix, and
 * elementCameraTarget's for why *this* function still owns every element
 * that fix doesn't claim.
 *
 * For the elements this function *does* still own, the position-based
 * approach is the right one: a freestanding sofa or countertop has no
 * single "correct" face the way a wall does, so there's nothing more
 * meaningful to aim at than "generally toward the middle of the room,"
 * which is exactly what comparing centre-to-centre gives you. Compares
 * the element's own horizontal centre to the *model's* own horizontal
 * centre (modelBounds — the same whole-model box the ceiling clamp above
 * already needs). The vector from the model's centre out to the element
 * points roughly "outward," toward whichever side of the building that
 * element sits on; negating it gives "inward" — the side the camera
 * should stand on so it's looking at the element from inside the
 * envelope, the same side a reviewer would actually be standing on to
 * look at that piece of furniture in the real apartment.
 *
 * Blended with ELEMENT_VIEW_FALLBACK_BEARING, not used outright, by how
 * far the element's centre actually sits from the model's own centre
 * (`proximity`, 0 at dead centre, 1 at or beyond the model's own
 * horizontal half-diagonal): an element right at the model's own centre
 * has a near-zero, directionless "outward" vector — there's no
 * meaningful "which side of the building" answer for it. Centred
 * furniture (proximity near 0) keeps the fixed fallback bearing almost
 * outright; a piece further out blends smoothly toward the computed
 * inward bearing.
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
 * Detects whether an element's own shape — not its position — marks it as
 * a wall, door, or flat panel, and if so, which world axis is its surface
 * normal. `size` is the element's own Box3 size (box.getSize()), already
 * computed once by elementCameraTarget and passed in rather than
 * recomputed here.
 *
 * The bug this fixes (found the same way every fix in this function has
 * been — by screenshotting real tour steps, not guessing): elementViewBearing
 * above picks a direction from the element's *position* relative to the
 * model's centre, which is a fine proxy for "which side of the building is
 * this on" but has no relationship to which way a flat surface's own face
 * actually points. A wall or door can be oriented any which way regardless
 * of where it sits in the floor plan, so a position-derived bearing can
 * easily land in-plane with the surface instead of perpendicular to
 * it — an edge-on sliver, not a view of the face. Four elements verified
 * on the first pass of this fix (a facade wall, both windows, a kitchen
 * countertop) happened to be oriented in a way the position-based bearing
 * got right; a second pass of real screenshots against different wall/door
 * elements ("Accent Wall Panel," "Interior Door, Study") caught the actual
 * failure.
 *
 * The fix: compare the two *horizontal* (X, Z) dimensions only — never Y —
 * and flag the element as flat if the shorter of the two is a small enough
 * fraction of the longer one. Only X and Z are ever candidates for the
 * thin axis, deliberately: a first version of this function also compared
 * the candidate thin dimension against the element's own height, on the
 * theory that a countertop or floor slab (dramatically thin in Y, its own
 * slab thickness) needed that second comparison to stay excluded. Logging
 * every curated element's real box size (not guessing) showed that
 * assumption was both unnecessary and actively wrong: a countertop's own
 * horizontal footprint (1912 x 1350 on the measured model) isn't remotely
 * thin in the X/Z sense at all — a fairly square plan, not a strip — so it
 * was already excluded by the X/Z ratio alone, and the same held for every
 * other roughly-square-in-plan element checked (the floor, the ceiling, a
 * media console). The height comparison's only *measured* effect was
 * excluding two genuinely flat, genuinely mis-framed elements ("Accent
 * Wall Panel," whose own height happens to be shorter than its length in
 * this model, and "Feature Wall (Block Tile)") purely because they're
 * shorter than a full-height wall — never intentional, and never load-
 * bearing for the countertop/floor/ceiling cases it was added to guard.
 * Removed for that reason, on measured evidence rather than either
 * function's original stated reasoning.
 *
 * This still doesn't reach every wall-like element: "Interior Wall
 * (Painted)" and "Interior Wall Section, Hallway" measure close to square
 * in plan (roughly 4670 x 4600 and 7350 x 3340 respectively on the curated
 * model) — a real multi-wing/corner wall run merged into one mesh, not a
 * single flat plane, so there is no one "thin axis" for either of them to
 * report truthfully. Those two remain on the position-based fallback
 * below; see this fix's own verification notes for why that's a modelling
 * limit of those two specific meshes rather than a gap in this function.
 */
function flatElementAxis(size: THREE.Vector3): "x" | "z" | null {
  const thinIsX = size.x <= size.z;
  const thinDimension = thinIsX ? size.x : size.z;
  const otherHorizontalDimension = thinIsX ? size.z : size.x;

  if (thinDimension >= FLAT_ELEMENT_ASPECT_RATIO * otherHorizontalDimension) return null;
  return thinIsX ? "x" : "z";
}

// Matches an Element's own `name` (src/data/project.ts) against the two
// words this catalogue actually uses for the building's own outer
// envelope: "Existing Building Envelope — Lower/Full Height" and "Facade
// Wall, Bedroom" — checked against the real 43-element schedule, these
// are the *only* three matches, and there are no false positives (no
// interior wall, panel, or fixture happens to use either word). Case-
// insensitive since nothing enforces a casing convention on this data.
const EXTERIOR_ELEMENT_NAME_PATTERN = /facade|envelope/i;

/**
 * Whether an element should be framed from *outside* the building rather
 * than from inside it — see elementCameraTarget's own comment for where
 * this is used and why it replaced a position-based guess.
 *
 * Keyed off the element's own `name`/category data, not its shape or
 * where its box happens to sit: whether a surface is genuinely part of
 * the building's exterior is something ATRIUM's own schedule already
 * knows (a designer wrote "Facade Wall" or "Building Envelope," not
 * "Interior Wall," for a reason), so there's no need to infer it
 * geometrically at all. This is a deliberately narrow allowlist, not a
 * shape heuristic: everything that isn't explicitly the envelope or a
 * facade — including every other flat wall, door, and panel, no matter
 * how close to the building's own perimeter its box sits — is framed
 * from the interior side, full stop.
 */
function isExteriorElementName(name: string): boolean {
  return EXTERIOR_ELEMENT_NAME_PATTERN.test(name);
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
 * extent). `interiorCeilingY` is Scene.tsx's own `extent.ceilingY` — see
 * that field's own comment for why it's measured off the "ceiling" mesh
 * itself rather than derived from `modelBounds`, which only bounds the
 * whole model *including* the roof void above the room.
 *
 * Uses the mesh's own Box3 (setFromObject), not a bounding sphere, to
 * measure the element itself: a box captures a long, thin element (a
 * wall, a countertop) far better than a sphere would, which either
 * overestimates a thin wall's apparent size along its short axis or
 * underestimates a long one. That box's size (getSize()) is what
 * flatElementAxis reads to tell a wall/door/panel from anything else;
 * getBoundingSphere() is only still needed for the *non*-flat branch
 * below, where a sphere is the right shape once you're computing "how
 * far back to stand" for a roughly chunky object.
 *
 * Direction and distance are each picked by one of two branches,
 * depending on flatElementAxis's verdict — see that function's own
 * comment for the bug this split fixes (a position-derived bearing can
 * land in-plane with a flat surface instead of facing it):
 *
 * - Flat (wall/door/panel): the view direction's horizontal component is
 *   the element's own thin axis itself — this is what actually faces the
 *   surface, rather than guessing from where the element sits in the
 *   floor plan. Signed toward the *interior* side by default (the same
 *   inward-vs-outward comparison against the model's own centre this
 *   used before), unless isExteriorElementName(elementName) says this
 *   element genuinely is part of the building's exterior (the envelope
 *   itself, or a facade), in which case it's signed the other way —
 *   see that function's own comment for why this is a category lookup,
 *   not a geometric guess. This is also what fixed the one measured
 *   exception noted below in a previous pass: "Facade Wall, Bedroom"
 *   used to frame from the interior, close enough to catch the window's
 *   own blinds in shot, purely because nothing told it that *this*
 *   wall — unlike every other wall in the schedule — is meant to be
 *   looked at from outside. Distance is drawn from `min(height, length)`
 *   of the element's *visible* face (its two non-thin dimensions), not
 *   the full bounding-sphere radius: fitting the sphere's full diagonal —
 *   which for a long, short wall run is dominated by that run's length —
 *   is exactly what produced the original "whole wall shrunk in an empty
 *   frame" bug, pulling the camera back far enough to fit the entire run
 *   end to end. Framing against the *smaller* of the two visible
 *   dimensions deliberately lets the larger one (usually the run's
 *   length) crop out of frame instead, the same way a real close-up
 *   photograph of a wall wouldn't try to fit its entire length in one
 *   shot. A geometric-mean variant (sqrt(height * length), growing more
 *   generously with the longer dimension) was tried and rejected by
 *   screenshot: it pulled the camera back far enough on short, wide
 *   elements to put unrelated furniture in another part of the room back
 *   into frame, a worse result than the tight-but-clean min() shot it
 *   was meant to loosen.
 * - Everything else (furniture, countertops, and — this is the case that
 *   didn't get fixed alongside flatElementAxis — large chunky surfaces
 *   like an interior wall run or a floor slab that fail that function's
 *   thinness test for the honest reason that they genuinely aren't thin
 *   panes, just large merged volumes): elementViewBearing's position-
 *   based compass bearing, unchanged. frameFromExterior *is* read here,
 *   unlike everywhere else in this branch's comments claim — not to flip
 *   inward/outward (the two envelope elements are the only exterior-
 *   tagged meshes that ever land here, a facade is always flat, and an
 *   element that near-enough *is* the whole model already collapses
 *   elementViewBearing's own proximity blend down to its fixed fallback
 *   bearing regardless of inward/outward, verified by screenshot in an
 *   earlier pass — so there's no observable inward/outward case left to
 *   flip), but to exempt the envelope from the distance cap below.
 *
 *   Distance still comes from the element's own bounding-sphere radius,
 *   but — for a *non*-exterior element only — that radius is now capped,
 *   and the view direction's elevation flattened, when the cap actually
 *   bites. See ELEMENT_NON_FLAT_FRAMING_RADIUS_CAP_RATIO's and
 *   ELEMENT_VIEW_ELEVATION_LARGE's own comments for the bug each half
 *   fixes and why measurement showed one alone wasn't enough: an element
 *   whose footprint spans much of the building's own plan produces a
 *   sphere radius large enough to pull the camera back far enough to see
 *   most of the room on its own, and capping *only* that radius still
 *   left two of this round's four target elements reading as an aerial
 *   shot — the fixed elevation ratio, tuned for a compact furniture-
 *   scale object, was multiplying even the capped distance into a
 *   vertical offset disproportionate to a wall-height element. Neither
 *   adjustment ever fires for an element already comfortably under the
 *   cap (a sofa, a countertop) or for the envelope itself, confirmed by
 *   measurement.
 *
 * Either branch's distance comes from one continuous formula —
 * clamp(radius * ELEMENT_DISTANCE_MULTIPLIER, floor, cap) — so a
 * doorknob and a kitchen island still get very different absolute
 * distances from the multiplier alone, and the floor/cap still keep both
 * ends of that continuum sane (see their own comments above for exactly
 * why each value was picked).
 * position.y is clamped against modelBounds afterward regardless of which
 * branch ran — see ELEMENT_MAX_CEILING_RATIO's own comment for why a
 * fixed elevation component alone isn't sufficient for large/tall
 * elements specifically — and, for a non-exterior element framed below
 * the ceiling, clamped a second time against interiorCeilingY, tighter
 * than the first clamp; see that parameter's own comment for the bug this
 * fixes (a camera position that clears the whole-model clamp but still
 * lands in the roof void, above the room's own real ceiling).
 */
export function elementCameraTarget(
  mesh: THREE.Object3D,
  controls: OrbitControlsImpl,
  modelBounds: THREE.Box3,
  elementName: string,
  interiorCeilingY: number,
): { target: THREE.Vector3; position: THREE.Vector3 } {
  const box = new THREE.Box3().setFromObject(mesh);
  const target = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  const flatAxis = flatElementAxis(size);
  const frameFromExterior = isExteriorElementName(elementName);

  let direction: THREE.Vector3;
  let framingRadius: number;

  if (flatAxis) {
    // Sign the thin axis toward the model's own centre along that one
    // axis — the single-axis equivalent of elementViewBearing's
    // outward/inward comparison — so the camera lands on the interior
    // side of the surface by default, not beyond it. Flipped when
    // frameFromExterior says otherwise — see isExteriorElementName's own
    // comment for why that's a name/category lookup, not a second
    // geometric guess layered on top of this one.
    const modelCenterOnAxis =
      flatAxis === "x" ? (modelBounds.min.x + modelBounds.max.x) / 2 : (modelBounds.min.z + modelBounds.max.z) / 2;
    const targetOnAxis = flatAxis === "x" ? target.x : target.z;
    const inwardSign = targetOnAxis > modelCenterOnAxis ? -1 : 1;
    const sign = frameFromExterior ? -inwardSign : inwardSign;

    direction =
      flatAxis === "x"
        ? new THREE.Vector3(sign, ELEMENT_VIEW_ELEVATION, 0)
        : new THREE.Vector3(0, ELEMENT_VIEW_ELEVATION, sign);

    const wideHorizontalDimension = flatAxis === "x" ? size.z : size.x;
    framingRadius = Math.min(size.y, wideHorizontalDimension) / 2;
  } else {
    const bearing = elementViewBearing(target, modelBounds);
    const rawRadius = box.getBoundingSphere(new THREE.Sphere()).radius;
    // Capped — see ELEMENT_NON_FLAT_FRAMING_RADIUS_CAP_RATIO's own
    // comment for why a large chunky element's raw sphere radius alone
    // isn't safe to use uncapped here, and for why an exterior-tagged
    // element (the envelope itself) skips this entirely.
    const cap = controls.maxDistance * ELEMENT_NON_FLAT_FRAMING_RADIUS_CAP_RATIO;
    const isCapped = !frameFromExterior && rawRadius > cap;
    framingRadius = frameFromExterior ? rawRadius : Math.min(rawRadius, cap);
    // A large element that actually got capped also switches to the
    // flatter elevation — see ELEMENT_VIEW_ELEVATION_LARGE's own comment
    // for why capping distance alone wasn't enough on its own to keep
    // these elements reading as a normal interior shot.
    const elevation = isCapped ? ELEMENT_VIEW_ELEVATION_LARGE : ELEMENT_VIEW_ELEVATION;
    direction = new THREE.Vector3(bearing.x, elevation, bearing.y);
  }
  direction.normalize();

  const distance = THREE.MathUtils.clamp(
    framingRadius * ELEMENT_DISTANCE_MULTIPLIER,
    controls.minDistance * ELEMENT_MIN_DISTANCE_FLOOR_RATIO,
    controls.maxDistance * ELEMENT_MAX_DISTANCE_CAP_RATIO,
  );

  const position = target.clone().add(direction.multiplyScalar(distance));

  // Ceiling clamp — see ELEMENT_MAX_CEILING_RATIO's own comment. Only
  // ever pulls position.y *down*; never raises it, so a small element
  // (whose own unclamped position.y already sits comfortably below the
  // model's own top) is completely unaffected.
  const modelHeight = modelBounds.max.y - modelBounds.min.y;
  const ceilingY = modelBounds.max.y + modelHeight * ELEMENT_MAX_CEILING_RATIO;
  position.y = Math.min(position.y, ceilingY);

  // A second, tighter clamp against the room's real interior ceiling —
  // see interiorCeilingY's own comment in Scene.tsx (ModelExtent.ceilingY)
  // for the bug this fixes: the clamp above bounds the camera against the
  // *whole model's* roofline, which sits well above the room's actual
  // ceiling (the gap is the roof void), so an interior element could still
  // compute a camera position inside that void, looking down *through*
  // the ceiling at whatever it was meant to frame — measured on "3-Seat
  // Sofa, Living Area", whose camera landed at y≈1591 while every
  // interior wall/ceiling mesh in this model tops out at y≈1557, well
  // over the actual ceiling underside (≈1419). Skipped for an exterior-
  // tagged element (frameFromExterior) — the envelope is legitimately
  // framed from outside and above, where there is no ceiling to stay
  // under — and for an element whose own target already sits at or above
  // the ceiling (a ceiling or ceiling-bulkhead finish, mounted *in* the
  // slab this field measures): for those, "stay below the ceiling" isn't
  // a coherent constraint to begin with, and the whole-model clamp above
  // is what already framed them correctly.
  if (!frameFromExterior && target.y < interiorCeilingY) {
    position.y = Math.min(position.y, interiorCeilingY - controls.minDistance);
  }

  return { target, position };
}
