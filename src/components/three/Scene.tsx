/**
 * src/components/three/Scene.tsx
 *
 * The r3f Canvas for ATRIUM's 3D viewer — the apartment model, lit and
 * orbitable. Tuned for quality and performance together rather than
 * trading one for the other:
 *
 *  - dpr is [1, 2] on ordinary hardware, capped to a flat 1 the one time
 *    detectMaxDpr() below finds this browser is rendering via a software
 *    (CPU) WebGL fallback — SwiftShader, llvmpipe, Microsoft's "Basic
 *    Render Driver" — rather than a real GPU. That check runs exactly
 *    once, synchronously, before the Canvas ever mounts (a throwaway
 *    canvas + WEBGL_debug_renderer_info, the same renderer-identity check
 *    docs/PERFORMANCE.md's own methodology already used from the test
 *    side) — it is not the PerformanceMonitor-driven *dynamic* dpr
 *    adjustment removed below, which re-evaluated every frame under an
 *    fps metric that's meaningless under frameloop="demand" and caused a
 *    real, measured stall. A one-time renderer-identity check at startup
 *    has none of that mechanism's problems: it never fires mid-session,
 *    never reacts to "demand mode is correctly idle," and only ever
 *    lowers the ceiling for a browser that's provably not GPU-accelerated
 *    to begin with, where a flat 1x is a straightforward, permanent
 *    improvement rather than a guess about a struggling frame rate.
 *  - It used to be: drei's PerformanceMonitor sampled useFrame-tick
 *    density over a rolling 250ms window and pulled dpr down to a flat 1
 *    on "decline." That metric assumes continuous rendering
 *    (frameloop="always"), where a healthy app renders every tick
 *    regardless of whether anything changed — under frameloop="demand" a
 *    healthy app renders *nothing* while idle, which PerformanceMonitor's
 *    tick-counting read as a severe framerate drop and "corrected" by
 *    forcing dpr down, itself a React state change that resizes the
 *    WebGL drawing buffer — a real, reproduced stall (~537ms in one
 *    measured run) landing specifically during bursts of orbit-drag
 *    activity, exactly the "smooth on slow drags, stutters on fast
 *    flicks" symptom reported and investigated in that pass. See
 *    docs/PERFORMANCE.md for the measured before/after.
 *  - Zoom (mouse wheel / pinch) is driven by SmoothZoom.tsx, not
 *    OrbitControls' own built-in wheel handling (`enableZoom={false}`
 *    below). three-stdlib's OrbitControls damps rotation across many
 *    frames but applies zoom in a single, undamped jump per wheel notch —
 *    confirmed by reading its source and by measurement (a rapid-fire
 *    wheel-notch burst produced exactly one rendered frame per notch and
 *    total silence between them; orbit rotation's own damping tail, by
 *    contrast, was already measured producing 7-11 settle frames after
 *    the pointer stops). SmoothZoom.tsx re-implements the same input
 *    handling but eases the camera's distance toward each new target over
 *    several frames instead of snapping to it in one — see that file's
 *    own header for the full investigation and the exact numbers.
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
 * never mounted at all.) It also derives `floorY` (the "floor" mesh's own
 * measured Y, not the whole model's box.min.y — see ModelExtent's own
 * comment for why those differ) and `metersPerUnit` (calibrated off the
 * "interior-door" mesh against a real 2.032m door height), both handed
 * down to WalkthroughControls.tsx so its eye-height and vertical-range
 * constants can be stated in real metres instead of an arbitrary ratio.
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
} from "@react-three/drei";
import { BuildingModel } from "@/components/three/BuildingModel";
import { SmoothZoom } from "@/components/three/SmoothZoom";
import { WalkthroughControls } from "@/components/three/WalkthroughControls";
import { HDRI_STUDIO_PATH } from "@/lib/assets";
import { useScrollStore } from "@/store/scrollStore";
import { useProjectStore } from "@/store/projectStore";

// Matches --color-ground in src/app/globals.css — the canvas clear colour
// has to be a real JS value, not a CSS variable, so it's restated here.
const GROUND_COLOR = "#0A0B0C";

// Known software (CPU) WebGL renderer strings — never real GPU
// acceleration. This is the exact identity check docs/PERFORMANCE.md's
// own methodology already established from the test side
// (WEBGL_debug_renderer_info), reused here at runtime for real visitors
// rather than only in this project's own Playwright tooling.
const SOFTWARE_RENDERER_PATTERN = /swiftshader|llvmpipe|software|basic render/i;

// Runs once, synchronously, before Canvas ever mounts — a throwaway
// canvas purely to read renderer identity, discarded immediately after.
// Returns the Canvas `dpr` upper bound: 2 on ordinary (GPU-accelerated)
// hardware, 1 if this browser is provably rendering via a CPU fallback,
// where doubling every pixel is pure wasted raster work. See this file's
// own header for why this is a one-time capability check, not the
// PerformanceMonitor-style per-frame adjustment removed from this file.
function detectMaxDpr(): number {
  if (typeof document === "undefined") return 2;
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
    if (!gl) return 2;
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : "";
    return SOFTWARE_RENDERER_PATTERN.test(renderer) ? 1 : 2;
  } catch {
    return 2;
  }
}

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

// Standard interior door height (80in / 2032mm — the common US residential
// figure, and close enough to the UK/EU ~2.0-2.1m norm that this doesn't
// need per-locale branching) — the real-world reference WalkthroughControls'
// eye-height and vertical-range constants are calibrated against. See
// Model()'s useLayoutEffect below for how this becomes metersPerUnit.
const DOOR_HEIGHT_METERS = 2.032;

interface ModelExtent {
  size: THREE.Vector3;
  radius: number;
  /** The same measured Box3 `size`/`radius` above are derived from —
   *  handed down to WalkthroughControls.tsx to clamp horizontal movement
   *  to a padded version of it (see that file). Nothing else reads this;
   *  size/radius already covered every other existing use. */
  box: THREE.Box3;
  /** World-space Y of the walkable floor surface — measured directly off
   *  the "floor" mesh, not derived from the whole model's bounding box.
   *  That distinction matters: `box.min.y` is contaminated by structure
   *  below the floor slab (the building envelope meshes both measure
   *  min.y ≈ 3.4, a few units *below* the real floor at 66.72), so using
   *  it as "the floor" was the root cause of WalkthroughControls' eye
   *  height landing near ankle height instead of eye level — see that
   *  file's header for the full measured numbers. */
  floorY: number;
  /** Real-world metres per model unit, calibrated off the "interior-door"
   *  mesh's measured world-space height against DOOR_HEIGHT_METERS — the
   *  model's units were previously undocumented as unconvertible (see
   *  docs/DECISIONS.md's "model units are measured off the real bounding
   *  sphere" entry); a door is a reliable, near-universal real-world
   *  reference dimension every architectural model has exactly one clear
   *  instance of, which is why it's the anchor rather than, say, a ceiling
   *  height (ceilings vary by design; doors don't, much). */
  metersPerUnit: number;
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

    // Both read via the viewport bridge's element-object registry, the
    // same one ElementPanel.tsx used to read from before P25 removed that
    // call site — BuildingModel's mesh ref callbacks (registerElementObject)
    // commit before this layout effect runs (refs attach during commit,
    // ahead of any layout effect further up the tree), so both are
    // reliably populated here on every fresh mount, demo data or live.
    const doorObject = useProjectStore.getState().getElementObject("interior-door");
    const doorBox = doorObject ? new THREE.Box3().setFromObject(doorObject) : null;
    const doorHeight = doorBox && !doorBox.isEmpty() ? doorBox.max.y - doorBox.min.y : null;
    // Fallback ratio (this model's own actual measured door-height-to-
    // metersPerUnit relationship, ~1210.47 units for a 2.032m door) only
    // matters if the door mesh is ever missing/renamed — every other path
    // uses the real measurement above.
    const metersPerUnit = doorHeight ? DOOR_HEIGHT_METERS / doorHeight : DOOR_HEIGHT_METERS / (sphere.radius * 0.1723);

    const floorObject = useProjectStore.getState().getElementObject("floor");
    const floorBox = floorObject ? new THREE.Box3().setFromObject(floorObject) : null;
    // The floor mesh is a near-zero-thickness plane — min/max.y differ by
    // a fraction of a unit — so either bound is fine; min.y is used rather
    // than a center to stay unambiguous. Falls back to the whole model's
    // own box.min.y only if the floor mesh can't be found at all, which
    // is worse than the door fallback above (it's the exact value this
    // whole fix exists to stop trusting) but strictly better than a crash.
    const floorY = floorBox && !floorBox.isEmpty() ? floorBox.min.y : box.min.y;

    setExtent({ size, radius: sphere.radius, box: box.clone(), floorY, metersPerUnit });
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
          // Zoom input (wheel + pinch) is handled entirely by SmoothZoom
          // below instead — three-stdlib's own wheel/pinch dolly applies
          // in one undamped jump per event, unlike the rotation damping
          // above; see SmoothZoom.tsx's header for the measured evidence.
          enableZoom={false}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2 - 0.05}
          // 1.5x camera.near (both measured off the same bounding sphere,
          // so this ratio holds regardless of the model's actual scale),
          // not the far-out radius * 0.6 this used to be — that kept the
          // camera outside the building envelope no matter how far you
          // dollied in, which was the whole bug this value fixes. 1.5x
          // near (not exactly 1x) is deliberate headroom: minDistance only
          // bounds camera-to-*target* distance, not camera-to-geometry, so
          // a target sitting flush against a surface could still put real
          // geometry closer to the camera than minDistance alone suggests
          // — tested down to exactly 1x near (radius * 0.01) with no
          // visible near-plane clipping in either room tried, but kept a
          // margin above that rather than shipping the literal edge case.
          // Also confirmed no idle per-frame cost spike this close to
          // geometry (0 idle draw calls either way; if anything, draws
          // per settle-frame drop here vs. zoomed out, from more
          // aggressive frustum culling) — see SmoothZoom.tsx's header.
          minDistance={extent.radius * 0.015}
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

      {/* Damped zoom for orbit mode only — see this component's own file
          header for why OrbitControls' built-in wheel/pinch handling is
          disabled above in its favour. */}
      {extent && (
        <SmoothZoom
          enabled={cameraMode === "orbit"}
          minDistance={extent.radius * 0.015}
          maxDistance={extent.radius * 4}
        />
      )}

      {/* Never mounted alongside OrbitControls — see this component's own
          file header for why disabling (not unmounting) OrbitControls
          during walkthrough is the load-bearing choice that makes
          switching back to ORBIT resume from where it was, not reset. */}
      {extent && cameraMode === "walkthrough" && (
        <WalkthroughControls
          bounds={extent.box}
          radius={extent.radius}
          floorY={extent.floorY}
          metersPerUnit={extent.metersPerUnit}
        />
      )}
    </>
  );
}

export function Scene({ className }: SceneProps) {
  // Lazy initializer: runs once on first render of this component
  // instance, before the Canvas below ever mounts — never re-evaluated,
  // so it can't itself become a mid-session adjustment mechanism.
  const [maxDpr] = useState(detectMaxDpr);

  return (
    <Canvas
      className={className}
      dpr={[1, maxDpr]}
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
