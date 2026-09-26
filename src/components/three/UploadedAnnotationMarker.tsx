/**
 * src/components/three/UploadedAnnotationMarker.tsx
 *
 * AnnotationMarker.tsx's sibling for a custom model's own pinned
 * comments (CustomAnnotation, projectStore.ts) — the same real-ring-plus-
 * Html-numeral construction, for the identical reason AnnotationMarker's
 * own header gives (Html `transform` mode's CSS math collapses at this
 * model's thousands-of-units scale). Rendered by UploadedModel.tsx as a
 * sibling of its own <primitive>, both under the same <Center> wrapper —
 * unlike BuildingModel.tsx's own markers, there's no extra rotated group
 * to place this inside: UploadedModel carries no equivalent fixed
 * rotation (see its own header), so `annotation.position`/`.normal` are
 * used directly in whatever local space <Center> already establishes,
 * with no conversion step.
 *
 * No remote-arrival pulse animation, unlike AnnotationMarker — there is
 * no realtime layer for a custom model yet (see projectStore.ts's own
 * comment on customAnnotations), so nothing ever arrives from anywhere
 * but this browser tab's own pin flow; every marker here mounts in its
 * resting state from the start. Distance-based scaling and hover
 * highlighting are otherwise the same as the curated marker.
 *
 * Ring/offset sizing is *not* copied as fixed absolute numbers the way
 * this file's first version did — that was a real, measured bug, not a
 * hypothetical one: AnnotationMarker.tsx's SURFACE_OFFSET/RING_* values
 * are explicitly calibrated for the curated model's own thousands-of-
 * units scale (see that file's header), and a genuinely small upload (a
 * test file measuring only a couple of units across) placed the marker
 * SURFACE_OFFSET=20 units off its pinned point — ten times the entire
 * model's own size — putting it nowhere near the visible geometry.
 * Confirmed by actually placing a pin and finding it invisible, then
 * reading back the store's own recorded position/normal to see they were
 * both perfectly sane; the bug was the marker's own fixed-size geometry,
 * not the pin data. Fixed by deriving every one of these from
 * controls.minDistance instead — Scene.tsx already sets that to
 * `extent.radius * 0.015` (this model's own measured scale), so scaling
 * off it auto-adjusts to whatever an upload's real size turns out to be.
 * The *_RATIO constants below were reverse-derived from the original
 * fixed values against the curated model's own measured minDistance
 * (≈105), so a Meridian-House-scale upload reproduces the exact same
 * on-screen proportions the original tuning already got right.
 */
"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { annotationCameraTarget, easeCameraTo } from "@/lib/motion";
import { useProjectStore, type CustomAnnotation } from "@/store/projectStore";

// Mirrors AnnotationMarker.tsx's own MARKER_UP/MARKER_MIN_SCALE/
// MARKER_MAX_SCALE/HOVER_SCALE_BOOST/BRASS/RING_OPACITY exactly — those
// are genuinely scale-independent (a ratio, a color, a hover multiplier),
// restated rather than shared-imported for the same "small, stable,
// purely visual value" reason BuildingModel.tsx/UploadedModel.tsx already
// restate their own brass hex constants. SURFACE_OFFSET/RING_* below are
// NOT restated as absolutes — see file header for why those specifically
// have to scale with the model instead.
const MARKER_UP = new THREE.Vector3(0, 0, 1);
const SURFACE_OFFSET_RATIO = 0.19;
const RING_INNER_RADIUS_RATIO = 0.43;
const RING_OUTER_RADIUS_RATIO = 0.57;
const MARKER_MIN_SCALE = 0.55;
const MARKER_MAX_SCALE = 1.3;
const HOVER_SCALE_BOOST = 1.25;
const BRASS = "#D4A24C";
const RING_OPACITY = 0.9;

interface UploadedAnnotationMarkerProps {
  annotation: CustomAnnotation;
  /** 1-based, stable for as long as customAnnotations only ever grows by
   *  append — same convention AnnotationMarker's own `number` prop uses. */
  number: number;
}

export function UploadedAnnotationMarker({ annotation, number }: UploadedAnnotationMarkerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const numeralRef = useRef<HTMLDivElement>(null);

  const hovered = useProjectStore((state) => state.hoveredAnnotationId === annotation.id);
  const setHoveredAnnotation = useProjectStore((state) => state.setHoveredAnnotation);
  const clearHoveredAnnotation = useProjectStore((state) => state.clearHoveredAnnotation);

  // One reactive read, reused both for sizing here and for the click
  // handler further down (annotationCameraTarget needs it too) — pulled
  // up front rather than declared twice. controls.minDistance is fixed
  // for the whole session once Scene.tsx sets it, so this never actually
  // re-renders the component after its first real value arrives; falls
  // back to 1 for the one render before controls has mounted at all,
  // which just means that instant's marker uses scale-1 sizing rather
  // than crashing.
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  const scaleUnit = controls?.minDistance ?? 1;
  const surfaceOffset = scaleUnit * SURFACE_OFFSET_RATIO;
  const ringInnerRadius = scaleUnit * RING_INNER_RADIUS_RATIO;
  const ringOuterRadius = scaleUnit * RING_OUTER_RADIUS_RATIO;

  const normal = useMemo(() => new THREE.Vector3(...annotation.normal).normalize(), [annotation.normal]);
  const position = useMemo(
    () => new THREE.Vector3(...annotation.position).add(normal.clone().multiplyScalar(surfaceOffset)),
    [annotation.position, normal, surfaceOffset],
  );
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(MARKER_UP, normal), [normal]);

  // registerAnnotationObject/getAnnotationObject are keyed by a plain
  // annotation id string, not tied to the curated Annotation type — the
  // exact same registry AnnotationMarker.tsx populates, reused as-is so
  // UploadedReviewList.tsx's own row clicks can ease the camera through
  // the identical lib/motion helpers without a second registry to keep
  // in sync.
  useEffect(() => {
    const group = groupRef.current;
    useProjectStore.getState().registerAnnotationObject(annotation.id, group);
    return () => useProjectStore.getState().registerAnnotationObject(annotation.id, null);
  }, [annotation.id]);

  useFrame(({ camera, controls }) => {
    const group = groupRef.current;
    if (!group) return;
    const worldPosition = group.getWorldPosition(_worldPosition);
    const distance = camera.position.distanceTo(worldPosition);
    const orbit = controls as OrbitControlsImpl | null;
    const reference = orbit ? (orbit.minDistance + orbit.maxDistance) / 2 : distance;
    let scale = THREE.MathUtils.clamp(reference / distance, MARKER_MIN_SCALE, MARKER_MAX_SCALE);
    if (hovered) scale *= HOVER_SCALE_BOOST;
    ringRef.current?.scale.setScalar(scale);
    if (numeralRef.current) numeralRef.current.style.transform = `scale(${scale})`;
  });

  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const setSelected = useProjectStore((state) => state.setSelected);

  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  useEffect(
    () => () => {
      timelineRef.current?.kill();
    },
    [],
  );

  const handlePointerEnter = () => setHoveredAnnotation(annotation.id);
  const handlePointerLeave = () => {
    if (useProjectStore.getState().hoveredAnnotationId === annotation.id) {
      clearHoveredAnnotation();
    }
  };

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    const group = groupRef.current;
    if (!group || !controls) return;

    const { target, position: nextCameraPosition } = annotationCameraTarget(group, controls);
    timelineRef.current?.kill();
    timelineRef.current = easeCameraTo(controls, camera, invalidate, target, nextCameraPosition);

    if (annotation.meshName) setSelected(annotation.meshName);
  };

  return (
    <group ref={groupRef} position={position} quaternion={quaternion}>
      <mesh ref={ringRef}>
        <ringGeometry args={[ringInnerRadius, ringOuterRadius, 32]} />
        <meshBasicMaterial color={BRASS} side={THREE.DoubleSide} transparent opacity={RING_OPACITY} />
      </mesh>

      <Html center occlude pointerEvents="none">
        <div
          ref={numeralRef}
          className="pointer-events-auto flex flex-col items-center"
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
        >
          <button
            type="button"
            onClick={handleClick}
            aria-label={`Comment ${number}: ${annotation.body}`}
            className="flex h-7 w-7 items-center justify-center rounded-full font-mono text-3xs text-brass transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
          >
            {number}
          </button>
          {hovered && (
            <div className="mt-2 w-48 border border-rule bg-surface p-2 shadow-lg">
              <p className="font-mono text-3xs uppercase tracking-[0.18em] text-faint">{annotation.author}</p>
              <p className="mt-1 line-clamp-3 text-2xs text-ink">{annotation.body}</p>
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

const _worldPosition = new THREE.Vector3();
