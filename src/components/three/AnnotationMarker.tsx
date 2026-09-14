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
 * the pinned point along its stored normal (lib/motion's easeCameraTo,
 * the same routine ElementPanel.tsx uses to frame a selected element)
 * and, when the annotation landed on an element, selects that element so
 * ElementPanel opens showing its full thread.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type gsap from "gsap";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { easeCameraTo } from "@/lib/motion";
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

const BRASS = "#D4A24C";

interface AnnotationMarkerProps {
  annotation: Annotation;
  /** 1-based, stable for as long as annotations only ever grows by append. */
  number: number;
}

export function AnnotationMarker({ annotation, number }: AnnotationMarkerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const numeralRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const normal = useMemo(() => new THREE.Vector3(...annotation.normal).normalize(), [annotation.normal]);
  const position = useMemo(
    () => new THREE.Vector3(...annotation.position).add(normal.clone().multiplyScalar(SURFACE_OFFSET)),
    [annotation.position, normal],
  );
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(MARKER_UP, normal), [normal]);

  useFrame(({ camera, controls }) => {
    const group = groupRef.current;
    if (!group) return;
    const worldPosition = group.getWorldPosition(_worldPosition);
    const distance = camera.position.distanceTo(worldPosition);
    const orbit = controls as OrbitControlsImpl | null;
    const reference = orbit ? (orbit.minDistance + orbit.maxDistance) / 2 : distance;
    const scale = THREE.MathUtils.clamp(reference / distance, MARKER_MIN_SCALE, MARKER_MAX_SCALE);
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

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    const group = groupRef.current;
    if (!group || !controls) return;

    const worldTarget = group.getWorldPosition(new THREE.Vector3());
    const worldNormal = MARKER_UP.clone()
      .applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();

    const desiredDistance = THREE.MathUtils.clamp(
      controls.minDistance * 1.5,
      controls.minDistance,
      controls.maxDistance,
    );
    const nextCameraPosition = worldTarget.clone().add(worldNormal.multiplyScalar(desiredDistance));

    timelineRef.current?.kill();
    timelineRef.current = easeCameraTo(controls, camera, invalidate, worldTarget, nextCameraPosition);

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
        <meshBasicMaterial color={BRASS} side={THREE.DoubleSide} transparent opacity={0.9} />
      </mesh>

      <Html center occlude pointerEvents="none">
        <div
          ref={numeralRef}
          className="pointer-events-auto flex flex-col items-center"
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
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
