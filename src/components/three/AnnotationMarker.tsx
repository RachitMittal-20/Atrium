/**
 * src/components/three/AnnotationMarker.tsx
 *
 * The persistent, on-model marker for one pinned comment: a real 3D ring
 * (not an Html sprite) sitting flush against the surface it was pinned
 * to, with a crisp Html numeral floating at its centre.
 *
 * Why a real ring rather than drawing the whole thing in Html: drei's
 * Html `transform` mode — the mode that bakes an object's 3D rotation
 * into the DOM content's CSS matrix, which is what "sits flat against a
 * surface" needs — computes its CSS `perspective()`/`matrix3d()` chain
 * assuming scene coordinates on the order of ordinary three.js units.
 * This model's native scale is in the thousands (see Scene.tsx's file
 * header), and at that magnitude the transform-mode math collapses: it
 * was verified empirically (every marker rendered at ~0.01px, invisible
 * at every zoom and angle) before this file was rewritten around a plain
 * three.js mesh instead. A ring mesh has no such ceiling — it's ordinary
 * geometry, oriented by the same quaternion, occluded by the model
 * automatically via the normal WebGL depth buffer rather than an extra
 * raycast. Only the numeral — the part that actually needs to stay crisp
 * text — goes through Html, in its default (billboard, screen-space)
 * mode, the same proven mode HoverLabel already uses successfully in
 * this scene.
 *
 * Position and orientation both live in outerGroupRef's local space (see
 * BuildingModel.tsx's file header for why that's a *different* group than
 * the one the model's own meshes live in), so a marker stays welded to
 * its exact pinned point through any amount of orbiting, right alongside
 * the model itself.
 *
 * Rendered SURFACE_OFFSET units off the literal stored position, along
 * the stored normal: sitting exactly on the surface it was pinned to put
 * the Html numeral's occlusion raycast in a near-permanent rounding tie
 * with that same surface, reading as "always occluded". The offset is
 * negligible against this model's scale and the stored Annotation.position
 * itself is never touched — only where the marker draws.
 *
 * Scale-with-distance (with a floor, so distant markers shrink but never
 * vanish, and a ceiling, so close ones don't balloon) is set imperatively
 * on both the ring's mesh scale and the numeral's CSS transform, every
 * rendered frame — under frameloop="demand" that's exactly the frames
 * where camera distance can have changed, never more.
 *
 * Hovering previews the comment body; clicking eases the camera to face
 * the pinned point along its stored normal (lib/motion's
 * annotationCameraTarget + easeCameraTo, shared with ReviewList.tsx's row
 * clicks and J/K navigation) and, when the annotation landed on an
 * element, selects that element so ElementPanel opens showing its full
 * thread.
 *
 * Hover state lives in projectStore (hoveredAnnotationId), not local
 * state — ReviewList.tsx writes it too, on row hover, so hovering a row
 * highlights this marker exactly the way hovering the marker highlights
 * its row. This component also registers its own <group> into the store
 * (registerAnnotationObject) on mount, so ReviewList can read this exact
 * world position/orientation for its own camera-easing, without needing
 * a second copy of the position math.
 *
 * Remote arrival animation: if this marker's annotation.id matches
 * projectStore's remotelyArrivedAnnotationId at the instant this
 * component mounts (snapshotted once via useState — see isRemoteArrival
 * below), it fades its ring in from transparent, pulses brass once past
 * its resting scale, then settles — see arrivalMultiplier's comment for
 * how that composes with the distance/hover scale above instead of
 * fighting it. Only ever true for annotations projectStore.ts's
 * mergeRemoteAnnotation appended (a genuinely new remote pin); pinning
 * your own comment, or a page load that already has this annotation, both
 * mount with isRemoteArrival false and skip the animation entirely. This
 * effect never touches the camera — that's ReviewList.tsx/handleClick's
 * job, deliberately not this one, so a remote comment arriving never
 * hijacks whatever the viewer is currently looking at.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { annotationCameraTarget, DURATION, EASE_WEIGHTED, easeCameraTo } from "@/lib/motion";
import { useProjectStore } from "@/store/projectStore";
import type { Annotation } from "@/types/project";

// The axis a marker's local rotation aligns to its stored normal — shared
// between the quaternion built at mount and the world-space normal read
// back out again on click, so the two stay each other's inverse. Also the
// ring geometry's own face normal, by construction (RingGeometry lies in
// the local XY plane, facing +Z).
const MARKER_UP = new THREE.Vector3(0, 0, 1);

// See the file header: negligible against this model's thousands-of-units
// scale, but enough to pull the marker's *drawn* position clear of the
// surface it was pinned to for occlusion purposes.
const SURFACE_OFFSET = 20;

const RING_INNER_RADIUS = 45;
const RING_OUTER_RADIUS = 60;
const MARKER_MIN_SCALE = 0.55;
const MARKER_MAX_SCALE = 1.3;
// Multiplies the distance-based scale above when hovered (from either
// side of the sync — this marker directly, or its row in ReviewList) —
// the same "highlight" a review-list row gets, read the opposite way.
const HOVER_SCALE_BOOST = 1.25;

const BRASS = "#D4A24C";
const RING_OPACITY = 0.9;

// The arrival pulse's peak, as a multiplier on top of the marker's normal
// resting scale — an overshoot past 1, not a replacement for it, which is
// what makes it read as "pulses once" rather than "pops to a fixed size".
const ARRIVAL_PULSE_SCALE = 1.6;
// The scale a newly-arrived marker starts at before its fade-in tween
// runs — small enough that the growth into place reads as an entrance.
const ARRIVAL_START_SCALE = 0.3;

interface AnnotationMarkerProps {
  annotation: Annotation;
  /** 1-based, stable for as long as annotations only ever grows by append. */
  number: number;
}

export function AnnotationMarker({ annotation, number }: AnnotationMarkerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const numeralRef = useRef<HTMLDivElement>(null);

  const hovered = useProjectStore((state) => state.hoveredAnnotationId === annotation.id);
  const setHoveredAnnotation = useProjectStore((state) => state.setHoveredAnnotation);
  const clearHoveredAnnotation = useProjectStore((state) => state.clearHoveredAnnotation);

  // Snapshotted once, at mount, rather than read reactively: this marker
  // only ever mounts fresh the instant its annotation.id is appended to
  // the store (BuildingModel.tsx keys the list by annotation.id), so
  // "was I the one the store just flagged as remote" is exactly a mount-
  // time question. Reading remotelyArrivedAnnotationId reactively instead
  // would also fire this animation again for every *other* marker on the
  // next remote arrival, which is not what "arrival" means for them.
  const [isRemoteArrival] = useState(
    () => useProjectStore.getState().remotelyArrivedAnnotationId === annotation.id,
  );
  // A plain mutable object, held (not set) through useState's lazy
  // initializer — a ref's `.current` can't be read during render (this
  // value feeds arrivalMultiplier.value into useFrame's per-frame scale
  // below), but the object identity itself still only needs to be
  // created once. gsap tweens object properties, not refs/state, and
  // useFrame multiplies this into the per-frame distance/hover scale it
  // already computes — composing with that existing write (the same way
  // HOVER_SCALE_BOOST already does) rather than the two fighting over
  // ringRef's scale each frame. Never updated via its setter — mutated
  // directly by the gsap tween below instead, deliberately bypassing
  // React's render cycle for a per-frame value the same way ringRef's
  // own scale already does.
  const [arrivalMultiplier] = useState(() => ({ value: isRemoteArrival ? ARRIVAL_START_SCALE : 1 }));

  const normal = useMemo(() => new THREE.Vector3(...annotation.normal).normalize(), [annotation.normal]);
  const position = useMemo(
    () => new THREE.Vector3(...annotation.position).add(normal.clone().multiplyScalar(SURFACE_OFFSET)),
    [annotation.position, normal],
  );
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(MARKER_UP, normal), [normal]);

  // Registers this marker's own group into the viewport bridge so
  // ReviewList.tsx (outside the Canvas) can ease the camera onto exactly
  // this position/orientation for row clicks and J/K, without duplicating
  // any of the position math above.
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
    scale *= arrivalMultiplier.value;
    ringRef.current?.scale.setScalar(scale);
    if (numeralRef.current) numeralRef.current.style.transform = `scale(${scale})`;
  });

  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  const setSelected = useProjectStore((state) => state.setSelected);

  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  useEffect(() => () => {
    timelineRef.current?.kill();
  }, []);

  // The arrival animation itself: fade the ring in from transparent while
  // growing to resting scale, then one brass pulse past resting scale,
  // then settle back — see the constants above for each phase's target.
  // onUpdate calls invalidate() every tick because Scene.tsx runs
  // frameloop="demand" (see its header): nothing here would ever actually
  // redraw otherwise, the exact same reason easeCameraTo in lib/motion.ts
  // does the same thing for camera tweens.
  useEffect(() => {
    if (!isRemoteArrival) return;
    const material = materialRef.current;

    const timeline = gsap.timeline({
      onUpdate: invalidate,
      onComplete: () => {
        // Only clear if this is still the annotation on record — guards
        // against this stale completion racing behind a newer arrival
        // that's since overwritten the flag (mirrors handlePointerLeave's
        // same guard below for hover).
        if (useProjectStore.getState().remotelyArrivedAnnotationId === annotation.id) {
          useProjectStore.getState().clearRemotelyArrived();
        }
      },
    });

    timeline.to(arrivalMultiplier, { value: 1, duration: DURATION.fast, ease: EASE_WEIGHTED }, 0);
    if (material) {
      timeline.fromTo(
        material,
        { opacity: 0 },
        { opacity: RING_OPACITY, duration: DURATION.fast, ease: EASE_WEIGHTED },
        0,
      );
    }
    timeline.to(arrivalMultiplier, { value: ARRIVAL_PULSE_SCALE, duration: DURATION.instant, ease: EASE_WEIGHTED });
    timeline.to(arrivalMultiplier, { value: 1, duration: DURATION.slow, ease: EASE_WEIGHTED });

    return () => {
      timeline.kill();
    };
  }, [annotation.id, invalidate, isRemoteArrival, arrivalMultiplier]);

  const handlePointerEnter = () => setHoveredAnnotation(annotation.id);
  const handlePointerLeave = () => {
    // Only clear if this marker is still the one on record — guards
    // against a stale pointerleave racing behind a newer hover (the same
    // pattern BuildingModel's element hover already uses).
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

    if (annotation.elementId) {
      const element = useProjectStore.getState().elements.find((candidate) => candidate.id === annotation.elementId);
      if (element) setSelected(element.meshName);
    }
  };

  return (
    <group ref={groupRef} position={position} quaternion={quaternion}>
      {/* Real geometry, not Html — depth-tested against the rest of the
          model for free, so it's correctly hidden behind whatever's in
          front of it without any extra raycasting. */}
      <mesh ref={ringRef}>
        <ringGeometry args={[RING_INNER_RADIUS, RING_OUTER_RADIUS, 32]} />
        <meshBasicMaterial
          ref={materialRef}
          color={BRASS}
          side={THREE.DoubleSide}
          transparent
          opacity={isRemoteArrival ? 0 : RING_OPACITY}
        />
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
