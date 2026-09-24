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
 * Two model components, never both mounted at once: BuildingModel (the
 * curated apartment, unchanged — MESH_ENTRIES, curated selection/hover/
 * color-override/visibility, the works) when projectStore's
 * customModelUrl is null, or UploadedModel (a reviewer's own .glb/.gltf,
 * generically traversed — see that file's own header) when it's set.
 * Model() picks between them with a plain ternary around <Center>'s one
 * child. The door/floor-height calibration above only ever makes sense
 * for the curated model — an arbitrary uploaded file has no mesh named
 * "interior-door" or "floor" to look up (getElementObject for either
 * simply returns null), so a custom model takes a different, explicitly
 * rougher path instead: metersPerUnit is guessed from the model's own
 * measured bounding-box height, assuming it maps to a typical
 * ASSUMED_INTERIOR_HEIGHT_METERS-tall interior — a starting point the
 * reviewer then tunes by eye via CustomModelControl.tsx's eye-height
 * slider (threaded down as WalkthroughControls' own
 * eyeHeightMetersOverride prop), never meant to be authoritative the way
 * the door calibration is. floorY's existing fallback (the whole model's
 * own box.min.y, used whenever no "floor" mesh is found) already needed
 * no changes for this — it was already the generic case, not an
 * apartment-specific one; see ModelExtent's own comment.
 *
 * The calibration effect below explicitly depends on customModelUrl, not
 * just [camera, invalidate] — switching *to* a custom model always
 * re-measures for free (useGLTF suspending on a brand-new blob url
 * unmounts and remounts this whole component, per React's ordinary
 * Suspense behaviour, which re-runs every effect from scratch), but
 * switching *back* to the curated model doesn't suspend at all (its GLTF
 * is already cached — see src/lib/assets.ts's useGLTF.preload), so
 * nothing would otherwise trigger a fresh measurement in that direction
 * and `extent` would stay stuck at the custom model's dimensions. Listing
 * the dependency explicitly makes both directions equally deliberate
 * instead of one working by Suspense coincidence and the other silently
 * not.
 *
 * Camera mode: projectStore's cameraMode ("orbit" | "walkthrough" |
 * "panorama" | "tour", driven by CameraModeToggle.tsx) decides which of
 * four mutually-exclusive controls drives the camera each frame —
 * OrbitControls (unchanged from before this existed), WalkthroughControls
 * (see its own file for why it's a fully separate component rather than a
 * mode branch bolted onto OrbitControls), PanoramaControls (a
 * stripped-down sibling of WalkthroughControls: look-around only, the
 * camera never translates), or TourControls (an automatic guided
 * walkthrough — see its own file header for how it steps through
 * elements and why it needs no free-look of its own). OrbitControls
 * itself is never unmounted for any of the other three — only `enabled`
 * toggles, and it's `=== "orbit"` so every non-orbit mode disables it
 * (and SmoothZoom) without listing them — so its target/pan state
 * survives a round trip through any of them; see WalkthroughControls.tsx's
 * header for why that matters.
 *
 * The orbit camera pose itself is saved and restored here, in Model(),
 * not by any non-orbit controller: saved the moment cameraMode *leaves*
 * "orbit", restored the moment it *returns*, and never touched on a
 * switch between two non-orbit modes. Each non-orbit controller just
 * starts from the camera's live pose on mount (TourControls goes one
 * step further and immediately eases away from that live pose onto its
 * first element — see its own file — but it still starts *from*
 * wherever the camera actually was, same as the other two). Why not
 * per-controller save/restore (as it used to be, before panorama and
 * tour both existed): React runs a departing component's effect cleanup
 * *before* the arriving one's mount effect, so walkthrough's "restore
 * the orbit pose on unmount" always fired first, and panorama then
 * "started from where the camera was" — which was the orbit pose, never
 * walkthrough's eye position. And panorama restoring *its* start pose on
 * unmount would, in turn, have handed a walkthrough eye pose back to
 * orbit. Only something that outlives every controller, and knows which
 * mode is orbit, can get every transition right regardless of how many
 * non-orbit modes exist; see the orbit-pose layout effect in Model()
 * below — the same effect tour's own tourIndex reset piggybacks on,
 * for the identical reason (it needs to run before TourControls' own
 * mount effect eases the camera anywhere).
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
import { UploadedModel } from "@/components/three/UploadedModel";
import { SmoothZoom } from "@/components/three/SmoothZoom";
import { WalkthroughControls } from "@/components/three/WalkthroughControls";
import { PanoramaControls } from "@/components/three/PanoramaControls";
import { TourControls } from "@/components/three/TourControls";
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

// The midpoint of a typical 2.4-3m residential interior height — the
// starting-point assumption a custom uploaded model's metersPerUnit is
// guessed from (there's no door mesh to calibrate off of the way the
// curated model has). See this file's own header for the full reasoning
// and why this is explicitly a rough starting guess, not a calibration.
const ASSUMED_INTERIOR_HEIGHT_METERS = 2.7;

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
  // Which of the two model components renders below, and the one piece
  // of custom-model-only state the calibration effect needs directly —
  // see this file's own header for both.
  const customModelUrl = useProjectStore((state) => state.customModelUrl);
  const customEyeHeightMeters = useProjectStore((state) => state.customEyeHeightMeters);

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
    // Custom model: no "interior-door" mesh exists to calibrate off of,
    // so this skips the door lookup entirely and guesses metersPerUnit
    // from the model's own overall height instead — see this file's own
    // header and ASSUMED_INTERIOR_HEIGHT_METERS' comment for why, and
    // CustomModelControl.tsx for the manual slider that refines it.
    let metersPerUnit: number;
    if (customModelUrl) {
      metersPerUnit = ASSUMED_INTERIOR_HEIGHT_METERS / size.y;
    } else {
      const doorObject = useProjectStore.getState().getElementObject("interior-door");
      const doorBox = doorObject ? new THREE.Box3().setFromObject(doorObject) : null;
      const doorHeight = doorBox && !doorBox.isEmpty() ? doorBox.max.y - doorBox.min.y : null;
      // Fallback ratio (this model's own actual measured door-height-to-
      // metersPerUnit relationship, ~1210.47 units for a 2.032m door)
      // only matters if the door mesh is ever missing/renamed — every
      // other path uses the real measurement above.
      metersPerUnit = doorHeight ? DOOR_HEIGHT_METERS / doorHeight : DOOR_HEIGHT_METERS / (sphere.radius * 0.1723);
    }

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
    // customModelUrl is a real, deliberate dependency, not incidental —
    // see this file's own header for why both directions of switching
    // between the curated and a custom model need this effect to re-run.
  }, [camera, invalidate, customModelUrl]);

  // Orbit's own camera pose across a non-orbit excursion (see file
  // header). previousModeRef lets this tell "which way did cameraMode
  // just change" apart from "cameraMode didn't change" (first mount,
  // StrictMode's re-run, an unrelated re-render).
  //
  // A layout effect, not a plain effect, and that's what makes it work:
  // React runs every layout effect in a commit before any passive
  // (useEffect) mount effect in it. So on orbit → walkthrough, the
  // pose is saved here *before* WalkthroughControls' own mount effect
  // drops the camera to eye height, and on walkthrough/panorama → orbit
  // it's restored before OrbitControls' next update() reads the camera.
  // Same imperative-camera-mutation lint note as the effect above.
  const previousModeRef = useRef(cameraMode);
  const orbitPoseRef = useRef<{ position: THREE.Vector3; quaternion: THREE.Quaternion } | null>(null);
  useLayoutEffect(() => {
    const previous = previousModeRef.current;
    previousModeRef.current = cameraMode;
    if (previous === cameraMode) return;

    if (previous === "orbit") {
      // Leaving orbit, for either non-orbit mode: snapshot it.
      orbitPoseRef.current = { position: camera.position.clone(), quaternion: camera.quaternion.clone() };
    } else if (cameraMode === "orbit" && orbitPoseRef.current) {
      // Back to orbit from either non-orbit mode: put it back exactly.
      camera.position.copy(orbitPoseRef.current.position);
      camera.quaternion.copy(orbitPoseRef.current.quaternion);
      orbitPoseRef.current = null;
      invalidate();
    }
    // walkthrough/panorama/tour <-> each other: deliberately nothing
    // pose-related here. The arriving controller picks up the camera's
    // live pose as it is, and the saved orbit pose stays put for
    // whenever orbit comes back.
    //
    // Tour is the one addition beyond pose ownership: entering it from
    // *any* other mode resets tourIndex to 0, so every fresh "Tour"
    // click restarts the walk from the beginning rather than resuming
    // wherever a previous tour left off (see projectStore.ts's own
    // comment on why that's the deliberate choice for a demo feature).
    // This has to live in this same layout effect, not a plain effect
    // inside TourControls itself, for the same before-any-mount-effect
    // ordering reason the pose logic above does: TourControls' own
    // mount effect reads tourIndex on its very first run to ease the
    // camera onto an element, and that read has to see 0, not whatever
    // tourIndex was left at from a previous tour.
    if (cameraMode === "tour" && previous !== "tour") {
      useProjectStore.getState().tourGoTo(0);
    }
  }, [cameraMode, camera, invalidate]);
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
          {/* See this file's header — never both at once. */}
          {customModelUrl ? <UploadedModel url={customModelUrl} /> : <BuildingModel />}
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
          // 0.5, not the original 0.08 (P27). three-stdlib's OrbitControls
          // applies rotation as a leaky bucket: every pointermove adds a
          // full raw delta to an internal sphericalDelta backlog, and
          // *each* update() call — including the ones fired synchronously
          // during an active drag, not just after release — only drains
          // dampingFactor's fraction of whatever's currently queued. At
          // 0.08 that's 8%/call, so a fast drag outpaces its own drain and
          // the camera visibly trails the cursor, "catching up" for
          // seconds afterward — this is what "orbit rotation feels
          // laggy" actually was, confirmed by measurement (see below), not
          // guessed from reading the source alone. rotateSpeed (still the
          // default 1) was tested independently and ruled out: it only
          // scales how much each pointermove adds to the backlog, so
          // raising it while dampingFactor stayed low made the measured
          // lag *worse* (a bigger backlog draining at the same 8%/call
          // rate), not better — the opposite of what "increase
          // rotateSpeed" would predict if the lag were actually a
          // per-pixel-sensitivity problem rather than a drain-rate one.
          // Measured with a single fast 300px flick (mousedown, one big
          // mousemove, mouseup — the same "real drag, not a synthetic
          // instant jump" approximation docs/PERFORMANCE.md's own
          // PerformanceMonitor investigation used): at the original 0.08,
          // only 18% of the drag's total rotation had landed by the
          // instant of mouseup, with the remaining 82% trickling in over
          // the next several seconds. At 0.5, 75% lands by release, and
          // the whole gesture settles in roughly a quarter of the time —
          // a visibly tighter, more direct-tracking feel while still
          // leaving a real (just much shorter) damping tail, not an
          // instant undamped snap. Re-profiled the original
          // PerformanceMonitor stutter repro (sustained fast-drag
          // bursts) and the wheel-zoom smoothness burst (SmoothZoom.tsx,
          // an entirely separate mechanism from this prop) after this
          // change — both unaffected: 0 stalls over 400ms, same frame
          // cadence as before.
          dampingFactor={0.5}
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
          // Only ever passed for a custom model — see WalkthroughControls'
          // own comment on this prop and Scene.tsx's header for why.
          eyeHeightMetersOverride={customModelUrl ? customEyeHeightMeters : undefined}
        />
      )}

      {/* Same disable-don't-unmount arrangement as walkthrough above:
          OrbitControls stays mounted with enabled={false} underneath, and
          this saves/restores the camera pose itself. Takes no props — it
          never moves the camera, so it needs none of the extent-derived
          bounds/floor/scale values walkthrough clamps against. Still
          gated on `extent` so it can't mount before OrbitControls has,
          and so its saved pose is the real framed view, not the default
          camera. */}
      {extent && cameraMode === "panorama" && <PanoramaControls />}

      {/* Same disable-don't-unmount arrangement as walkthrough/panorama
          above. Unlike either of them, TourControls actively moves the
          camera (easing onto each element in turn) rather than just
          reading input — see its own file header — but it's still just
          as reliant on OrbitControls being disabled-not-unmounted and
          on Model()'s pose-ownership effect (above) having already run
          this same commit, before this component's own mount effect
          reads tourIndex. bounds is passed through to lib/motion's
          elementCameraTarget — see that function's own comment for why
          it needs the model's real vertical extent, not just the
          per-element one, to frame a large structural element sanely. */}
      {extent && cameraMode === "tour" && <TourControls bounds={extent.box} />}
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
