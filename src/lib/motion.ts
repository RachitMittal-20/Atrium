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
 * Also the home for two shared camera-targeting primitives:
 *  - easeCameraTo, the one GSAP routine that moves OrbitControls' target
 *    and the camera together — used by ElementPanel.tsx (frame the
 *    selected element, keeping the current viewing angle), AnnotationMarker
 *    .tsx (face a pinned point along its stored normal) and ReviewList.tsx
 *    (row clicks and J/K navigation, both facing a pinned point the same
 *    way AnnotationMarker's own click does).
 *  - annotationCameraTarget, which computes the {target, position} pair
 *    easeCameraTo needs from an annotation's live Object3D — shared by
 *    AnnotationMarker.tsx and ReviewList.tsx so "how do we frame a pinned
 *    point" has exactly one implementation, not two that could drift.
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
