/**
 * src/components/three/Scene.tsx
 *
 * The r3f Canvas for ATRIUM's 3D viewer — the apartment model, lit and
 * orbitable. Tuned for quality and performance together rather than
 * trading one for the other:
 *
 *  - dpr is a range ([1, 2]), not a fixed 2x — PerformanceMonitor pulls it
 *    down to a flat 1 when frame rate drops and lets it back up to the
 *    range once things recover.
 *  - frameloop="demand": nothing renders unless something actually
 *    changed. React-driven prop changes (hover, selection) and drei's
 *    OrbitControls already call invalidate() on their own when they touch
 *    r3f state — the one thing genuinely outside that system is page
 *    scroll (Lenis moves the DOM, not any r3f state), so InvalidateOnScroll
 *    below explicitly wires scrollStore to invalidate().
 *  - ACES filmic tone mapping, sRGB output, and an explicit ground-colour
 *    clear (alpha off) are set in onCreated rather than left to Canvas's
 *    defaults, so this stays correct even if those defaults ever change.
 *
 * The model's own units are never assumed — and they turn out not to be
 * metres: every node transform in the source file is identity, so
 * three.js takes its raw vertex data literally, and the apartment ends up
 * several thousand units across. Model() measures the real rendered
 * bounding sphere after Center has repositioned it and derives the
 * camera's near/far planes, ContactShadows' size, and OrbitControls'
 * min/max distance from that measurement — never a hardcoded guess.
 * (Bounds' own onFit callback can't be used for this: reading its source,
 * it only ever fires for orthographic cameras — for a perspective camera,
 * `fit()` silently delegates to `reset()`, which never calls it. Confirmed
 * by testing: with onFit as the only source of that data, OrbitControls
 * never mounted at all.)
 *
 * Camera mode: projectStore's cameraMode ("orbit" | "walkthrough", driven
 * by CameraModeToggle.tsx) decides which of two mutually-exclusive
 * controls drives the camera each frame — OrbitControls (unchanged from
 * before this existed) or WalkthroughControls (new; see its own file for
 * why it's a fully separate component rather than a mode branch bolted
 * onto OrbitControls). OrbitControls itself is never unmounted for this —
 * only `enabled` toggles — so its target/pan state survives a round trip
 * through walkthrough mode; see WalkthroughControls.tsx's header for why
 * that matters.
 *
 * frameloop stays "demand" in every camera mode, including walkthrough —
 * it briefly switched to "always" while that mode was active, on the
 * theory that WASD needs a new frame every tick anyway. Measured that
 * against the alternative (see docs/PERFORMANCE.md) and it wasn't true:
 * WalkthroughControls already calls invalidate() on every keydown, every
 * frame it actually moves the camera, and every pointermove while
 * dragging to look around — exactly the demand-mode self-re-invalidation
 * pattern every other continuous interaction in this app already uses
 * (easeCameraTo's GSAP tweens, InvalidateOnScroll below). "always" bought
 * nothing but ~1400 draw calls/second of idle rendering the instant you
 * switched to walkthrough and stood still — measured via a patched
 * WebGL drawElements/drawArrays count, not guessed.
 */
"use client";

import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import {
  Bounds,
  Center,
  ContactShadows,
  Environment,
  OrbitControls,
  PerformanceMonitor,
} from "@react-three/drei";
import { BuildingModel } from "@/components/three/BuildingModel";
import { WalkthroughControls } from "@/components/three/WalkthroughControls";
import { HDRI_STUDIO_PATH } from "@/lib/assets";
import { useScrollStore } from "@/store/scrollStore";
import { useProjectStore } from "@/store/projectStore";

// Matches --color-ground in src/app/globals.css — the canvas clear colour
// has to be a real JS value, not a CSS variable, so it's restated here.
const GROUND_COLOR = "#0A0B0C";

const KEY_LIGHT_POSITION: [number, number, number] = [4, 6, 4];
const RIM_LIGHT_POSITION: [number, number, number] = [-5, 3, -6];

interface SceneProps {
  className?: string;
}

// Lenis-driven page scroll never touches r3f state on its own, so under
// frameloop="demand" it would otherwise never trigger a re-render. This
// subscribes to the same scrollStore every other scroll-aware part of the
// app reads and invalidates whenever it changes.
function InvalidateOnScroll() {
  const invalidate = useThree((state) => state.invalidate);
  const progress = useScrollStore((state) => state.progress);
  useEffect(() => {
    invalidate();
  }, [progress, invalidate]);
  return null;
}

interface ModelExtent {
  size: THREE.Vector3;
  radius: number;
  /** The same measured Box3 `size`/`radius` above are derived from —
   *  handed down to WalkthroughControls.tsx to clamp horizontal movement
   *  to a padded version of it (see that file). Nothing else reads this;
   *  size/radius already covered every other existing use. */
  box: THREE.Box3;
}

// Centres the model, measures it, and only then renders the things that
// depend on that measurement (contact shadow size, orbit distance limits).
// See the file header for why this is measured directly rather than read
// from Bounds' onFit.
function Model() {
  const centerRef = useRef<THREE.Group>(null);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const [extent, setExtent] = useState<ModelExtent | null>(null);
  const cameraMode = useProjectStore((state) => state.cameraMode);

  // ElementPanel.tsx (outside the Canvas) eases the camera onto whatever
  // gets selected — it can only do that with a live handle on invalidate,
  // so hand it over via the same store BuildingModel already writes
  // selection into. The OrbitControls instance itself is registered where
  // it's actually created, further down.
  useEffect(() => {
    useProjectStore.getState().registerViewport({ invalidate });
  }, [invalidate]);

  // `camera` is a THREE.Camera instance reached via useThree — an
  // imperative three.js object, not React state — so mutating its
  // properties directly (near/far below) is the normal, correct r3f
  // pattern, not a React Compiler safety violation. The compiler-oriented
  // lint rule doesn't know that distinction, hence the blanket disable for
  // this effect rather than per line.
  /* eslint-disable react-hooks/immutability */
  useLayoutEffect(() => {
    const object = centerRef.current;
    if (!object) return;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());

    // Default near/far (0.1–1000) assume roughly metre-scale scenes; this
    // model is nowhere close, so the clipping planes are rescaled to its
    // actual measured size instead.
    camera.near = sphere.radius / 100;
    camera.far = sphere.radius * 100;
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.updateProjectionMatrix();
    }

    setExtent({ size, radius: sphere.radius, box: box.clone() });
    invalidate();
  }, [camera, invalidate]);
  /* eslint-enable react-hooks/immutability */

  return (
    <>
      <Bounds fit observe margin={1.2}>
        {/* `top`, not `bottom`: verified empirically (see HeroScene.tsx's
            file header) that drei's Center aligns the opposite of what the
            prop names suggest — `bottom` leaves the object hanging below
            y=0 (its top at zero); `top` is what actually sits it on the
            floor at y=0, where ContactShadows below expects it. */}
        <Center ref={centerRef} top>
          <BuildingModel />
        </Center>
      </Bounds>

      {extent && (
        <ContactShadows
          scale={Math.max(extent.size.x, extent.size.z) * 1.6}
          opacity={0.35}
          blur={2.5}
          far={Math.max(extent.size.y, 0.1)}
        />
      )}

      {extent && (
        <OrbitControls
          makeDefault
          enabled={cameraMode === "orbit"}
          enableDamping
          dampingFactor={0.08}
          enablePan={false}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2 - 0.05}
          minDistance={extent.radius * 0.6}
          maxDistance={extent.radius * 4}
          regress
          // Registered into projectStore the instant it exists — this is
          // the same controls object ElementPanel.tsx drives with GSAP to
          // frame a selected element, from all the way outside the Canvas.
          ref={(instance) => {
            useProjectStore.getState().registerViewport({ controls: instance });
          }}
        />
      )}

      {/* Never mounted alongside OrbitControls — see this component's own
          file header for why disabling (not unmounting) OrbitControls
          during walkthrough is the load-bearing choice that makes
          switching back to ORBIT resume from where it was, not reset. */}
      {extent && cameraMode === "walkthrough" && (
        <WalkthroughControls bounds={extent.box} radius={extent.radius} />
      )}
    </>
  );
}

export function Scene({ className }: SceneProps) {
  const [dpr, setDpr] = useState<[number, number] | number>([1, 2]);

  return (
    <Canvas
      className={className}
      dpr={dpr}
      frameloop="demand"
      gl={{ antialias: true, alpha: false }}
      onCreated={(state) => {
        state.gl.toneMapping = THREE.ACESFilmicToneMapping;
        state.gl.outputColorSpace = THREE.SRGBColorSpace;
        state.gl.setClearColor(new THREE.Color(GROUND_COLOR), 1);
      }}
      // Fires only when a click hits nothing — every mesh's own onClick
      // already stops propagation, so this is exactly "clicked the empty
      // background," the deselect gesture.
      onPointerMissed={() => useProjectStore.getState().clearSelected()}
    >
      <PerformanceMonitor
        onDecline={() => setDpr(1)}
        onIncline={() => setDpr([1, 2])}
      />
      <InvalidateOnScroll />

      {/* Lights the HDRI beneath, not the star of the shot: low intensity
          key + an even dimmer rim, mostly there to keep edges legible. */}
      <directionalLight position={KEY_LIGHT_POSITION} intensity={0.6} />
      <directionalLight position={RIM_LIGHT_POSITION} intensity={0.2} />

      {/* Lights the model via image-based lighting without rendering as a
          visible skybox behind it. */}
      <Environment files={HDRI_STUDIO_PATH} background={false} />

      <Suspense fallback={null}>
        <Model />
      </Suspense>
    </Canvas>
  );
}
