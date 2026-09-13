/**
 * src/components/three/HeroScene.tsx
 *
 * The cinematic, non-interactive shot of the apartment model that fills
 * the Hero's reserved WebGL layer (see Hero.tsx) — dark, sculptural,
 * lit dramatically, sitting on a faint pool of its own reflection. Unlike
 * Scene.tsx (the real /project viewer) there is no raycasting, no
 * OrbitControls, no selection: BuildingModel is rendered with
 * `interactive={false}`, and this file adds nothing that would make it
 * respond to the pointer.
 *
 * Everything that moves here is a pure function of one number:
 * src/store/scrollStore's page-wide scroll progress. CinematicRig reads it
 * once per rendered frame (via getState(), not a reactive hook — this runs
 * inside useFrame, not React's render) and derives the camera's orbit
 * angle and dolly distance, the model's own slow rotation, and the
 * reflective floor's strength, all from that same value — one source of
 * truth, several effects, never a separate ScrollTrigger per effect.
 *
 * Since the Hero occupies only a small slice of the page's total scroll
 * height (Friction alone is several viewport-heights tall), that raw 0-1
 * progress is remapped locally: HERO_SCROLL_FRACTION is roughly how much
 * of the whole page the Hero itself spans, so the camera's full orbit/
 * dolly arc completes right around where Hero stops being visible, rather
 * than barely beginning within the sliver of progress Hero actually
 * covers. Hero.tsx uses that same fraction to decide when to unmount this
 * canvas entirely.
 *
 * Reuses the already-preloaded model rather than fetching it again:
 * BuildingModel calls the same useGLTF(MODEL_PATH) as the /project scene,
 * and drei/three cache loaders by URL, so this is the same parsed GLTF
 * and the same GPU geometries/textures, not a second copy.
 */
"use client";

import { Suspense, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Center, Environment, MeshReflectorMaterial } from "@react-three/drei";
import { BuildingModel } from "@/components/three/BuildingModel";
import { HDRI_STUDIO_PATH } from "@/lib/assets";
import { useScrollStore } from "@/store/scrollStore";

// Matches --color-ground in src/app/globals.css — restated because the
// canvas clear colour needs a real JS value, not a CSS variable.
const GROUND_COLOR = "#0A0B0C";

// How much of the whole page's scroll the Hero itself roughly spans — see
// the file header. Exported so Hero.tsx can unmount this canvas at the
// same point the camera's arc naturally finishes.
export const HERO_SCROLL_FRACTION = 0.12;

// Camera motion, in the model's own measured-radius units — small,
// deliberately gentle numbers: this is meant to read as "the camera
// drifted a little," not a tour.
const ORBIT_RADIANS = Math.PI / 5; // ~36°, "slowly," not a spin
const DOLLY_NEAR_FACTOR = 0.72; // how much closer at progress 1 vs progress 0
const MODEL_ROTATION_RADIANS = Math.PI / 7;
const SMOOTHING = 0.06; // per-frame lerp factor toward the target — the cinematic "weight"

interface ModelExtent {
  radius: number;
  center: THREE.Vector3;
}

// Applies every scroll-derived effect to the already-mounted, already-
// measured model — it renders nothing of the model itself (that's
// Measured's job, below), only the reflective floor plus the per-frame
// camera/rotation/reflection math, all driven by the one shared
// scrollStore value.
function CinematicRig({
  extent,
  modelGroupRef,
}: {
  extent: ModelExtent;
  modelGroupRef: React.RefObject<THREE.Group | null>;
}) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const reflectorRef = useRef<React.ComponentRef<typeof MeshReflectorMaterial>>(null);
  const smoothedProgress = useRef(0);

  const baseDistance = extent.radius * 2.6;
  const lookAt = extent.center;

  // Default near/far (0.01–1000) assume a roughly metre-scale scene; this
  // model's own units are nowhere close (see Scene.tsx's file header for
  // the full story), so the clipping planes are rescaled to its actual
  // measured size the moment that size is known. `camera` is a THREE
  // instance reached via useThree — an imperative three.js object, not
  // React state — so mutating it directly is the normal, correct r3f
  // pattern (identical case in Scene.tsx), hence the blanket disable.
  /* eslint-disable react-hooks/immutability */
  useLayoutEffect(() => {
    camera.near = extent.radius / 100;
    camera.far = extent.radius * 100;
    if (camera instanceof THREE.PerspectiveCamera) camera.updateProjectionMatrix();
    invalidate();
  }, [camera, extent.radius, invalidate]);
  /* eslint-enable react-hooks/immutability */

  useFrame(() => {
    const rawProgress = useScrollStore.getState().progress;
    const heroProgress = THREE.MathUtils.clamp(rawProgress / HERO_SCROLL_FRACTION, 0, 1);

    const previous = smoothedProgress.current;
    const next = THREE.MathUtils.lerp(previous, heroProgress, SMOOTHING);
    smoothedProgress.current = next;

    const angle = next * ORBIT_RADIANS;
    const distance = THREE.MathUtils.lerp(baseDistance, baseDistance * DOLLY_NEAR_FACTOR, next);
    camera.position.set(
      lookAt.x + Math.sin(angle) * distance,
      lookAt.y + extent.radius * 0.35,
      lookAt.z + Math.cos(angle) * distance,
    );
    camera.lookAt(lookAt);

    if (modelGroupRef.current) {
      modelGroupRef.current.rotation.y = next * MODEL_ROTATION_RADIANS;
    }
    if (reflectorRef.current) {
      // The floor's reflection strength fades as the viewer scrolls away
      // from the hero, rather than just vanishing when the canvas unmounts.
      reflectorRef.current.mixStrength = THREE.MathUtils.lerp(0.55, 0, next);
    }

    // Demand-mode frames stop the instant this settles — invalidate again
    // only while still visibly interpolating toward the target.
    if (Math.abs(next - previous) > 0.0002) invalidate();
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[lookAt.x, 0, lookAt.z]}>
      <planeGeometry args={[extent.radius * 6, extent.radius * 6]} />
      <MeshReflectorMaterial
        ref={reflectorRef}
        resolution={512}
        mirror={0}
        mixBlur={8}
        blur={[400, 200]}
        mixStrength={0.55}
        depthScale={1}
        minDepthThreshold={0.85}
        color="#050505"
        metalness={0.4}
        roughness={1}
      />
    </mesh>
  );
}

// Renders the model (unconditionally — the group below is what
// CinematicRig later rotates) and measures its real bounding sphere once
// mounted, so the camera/floor/clipping planes above are all sized from
// that instead of a guess. The rig only mounts once that measurement
// exists; the model itself never waits on it.
//
// `<Center top>`, not `bottom`: verified empirically (logging the measured
// centre with each) that drei's Center aligns the *opposite* of what the
// prop names suggest — `bottom` leaves the object hanging below y=0 (its
// top at zero), `top` is what actually sits it on the floor at y=0. Easy
// to miss without something that makes floor position obvious; this file
// has one (the reflective floor), which is how this got caught at all.
function Measured() {
  const groupRef = useRef<THREE.Group>(null);
  const [extent, setExtent] = useState<ModelExtent | null>(null);

  useLayoutEffect(() => {
    const object = groupRef.current;
    if (!object) return;
    // Belt-and-braces: forces matrixWorld to recompute from Center's
    // just-applied position before measuring, in case anything upstream
    // ever changes such that it wouldn't already be current.
    object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    setExtent({ radius: sphere.radius, center: sphere.center });
  }, []);

  return (
    <>
      <group ref={groupRef}>
        <Center top>
          <BuildingModel interactive={false} />
        </Center>
      </group>
      {extent && <CinematicRig extent={extent} modelGroupRef={groupRef} />}
    </>
  );
}

interface HeroSceneProps {
  className?: string;
  fallback?: React.ReactNode;
}

export function HeroScene({ className, fallback }: HeroSceneProps) {
  return (
    <Canvas
      className={className}
      dpr={[1, 2]}
      frameloop="demand"
      gl={{ antialias: true, alpha: false }}
      camera={{ fov: 35 }}
      fallback={fallback}
      onCreated={(state) => {
        state.gl.toneMapping = THREE.ACESFilmicToneMapping;
        state.gl.outputColorSpace = THREE.SRGBColorSpace;
        state.gl.setClearColor(new THREE.Color(GROUND_COLOR), 1);
      }}
    >
      {/* One strong, raking key light and nothing else local — "dark and
          sculptural" means deep shadows, not evenly lit. */}
      <directionalLight position={[3, 5, 2]} intensity={1.1} />
      <Environment files={HDRI_STUDIO_PATH} background={false} environmentIntensity={0.4} />

      <Suspense fallback={null}>
        <Measured />
      </Suspense>
    </Canvas>
  );
}
