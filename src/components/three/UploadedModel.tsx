/**
 * src/components/three/UploadedModel.tsx
 *
 * The "try your own model" path — a reviewer-uploaded .glb/.gltf,
 * rendered generically. This is a second, parallel model component, not
 * a rewrite of BuildingModel.tsx: that file's curated MESH_ENTRIES table
 * (51 hand-mapped entries, each with a category, a spec sheet row, color-
 * override support, visibility toggling) only ever makes sense against
 * the one apartment.glb it was built for. An arbitrary uploaded file has
 * none of that up front — no known mesh names, no Element rows, no
 * Supabase project to persist anything against — so this component
 * traverses whatever it's handed generically and supports what a
 * reviewer can assign *in-session*, via UploadedElementPanel.tsx: click
 * to select, hover to highlight, rename + assign a category, recolor,
 * hide/show, and Tour mode stepping through meshes in the file's own
 * scene-graph order. Scene.tsx mounts this in place of BuildingModel
 * (never alongside — see that file's header) whenever projectStore's
 * customModelUrl is set.
 *
 * No ElementPanel — UploadedElementPanel.tsx is its own, simpler sibling
 * (mounted in src/app/project/page.tsx alongside this component, not
 * here) rather than ElementPanel.tsx itself branching internally:
 * ElementPanel's own `elements.find(candidate => candidate.meshName ===
 * selectedElementId)` already finds nothing for a custom-model selection
 * automatically (see projectStore.ts's own comment on reusing
 * hoveredElementId/selectedElementId for this), so that panel simply
 * never opens for this model — the brass Outline below is shared with
 * the curated model's own selection effect, UploadedElementPanel is not.
 *
 * Loaded via the exact same useGLTF hook BuildingModel.tsx uses, just
 * against a dynamic object-URL instead of the build-time MODEL_PATH
 * constant — drei's own cache keys on the URL string, so a second
 * upload (a genuinely different blob URL) is a real cache miss and
 * fetches/parses fresh, while re-selecting the *same* file in the same
 * session (same File object -> a new object URL each time, actually —
 * see CustomModelControl.tsx) always re-fetches too; nothing here tries
 * to detect "is this the same file as before."
 *
 * The loaded `scene` is deep-cloned (`scene.clone(true)`) before
 * anything here touches it — that's drei's own cached, shared instance,
 * and this component mutates materials in place (hover/selection
 * emissive, recolor, see below) the same way BuildingModel.tsx's per-mesh
 * clones do. Object3D.clone(true) deep-clones the *graph* (every
 * mesh/group wrapper) but, by three.js's own documented default, leaves
 * geometry and materials shared with the original — every mesh found
 * below still gets its own material cloned individually (geometry stays
 * shared, exactly as safe as BuildingModel's own geometry sharing, since
 * nothing here ever mutates a geometry).
 *
 * Traversal order is the file's own scene-graph order — there is no
 * curated grouping possible for an arbitrary upload the way
 * src/data/project.ts's ELEMENTS has, and this component doesn't
 * attempt to invent one. Each mesh's key (meshName below, what Tour mode,
 * Hide/Show, recolor, and the shared elementObjects registry all key off
 * of) is mesh.name when the exporter set one *and* it's unique across
 * this file, else mesh.uuid — a two-pass derivation (collect name
 * frequencies, then decide each key) because uniqueness can't be known
 * from a single mesh in isolation.
 *
 * One set of pointer handlers on the whole traversed scene, not one per
 * mesh the way BuildingModel.tsx's individually-named JSX entries have —
 * there's no curated per-entry JSX to attach a handler to for an unknown
 * shape. r3f's pointer events bubble from whichever mesh a raycast
 * actually hit up through its ancestors, so one handler on the outer
 * <primitive> still fires per click/hover with `event.object` telling it
 * exactly which mesh was hit — the standard pattern for a generic,
 * unknown-shape GLTF scene, and far less code than replicating
 * BuildingModel's per-entry approach for content that has no per-entry
 * metadata to justify it.
 *
 * Hover glow and recolor both only ever touch
 * MeshStandardMaterial/MeshPhysicalMaterial instances (the only ones with
 * an `.emissive`/`.color` channel in the way this code expects) — which
 * is what GLTFLoader actually produces for an ordinary glTF PBR metallic-
 * roughness material, so this covers the overwhelming majority of real
 * .glb/.gltf files; anything else (an unusual export path producing a
 * MeshBasicMaterial, say) simply never glows on hover or accepts a
 * recolor instead of crashing trying to set a property that doesn't
 * exist.
 *
 * Hide/show: hiding has to make a mesh both invisible *and* un-hittable
 * — three.js raycasting ignores `visible` entirely, so a hidden mesh
 * left with its default raycast would still swallow clicks meant for
 * whatever's behind it. MESH_RAYCAST/NO_RAYCAST below are the same pair
 * BuildingModel.tsx's own file already uses for the identical reason,
 * restated here rather than imported since three.js's own
 * Mesh.prototype.raycast is a stable, cheap-to-restate module value, not
 * something worth a cross-file coupling over.
 *
 * Recolor: baseColors captures each mesh's material color *as cloned*
 * (its real, original color) once per mesh, the same "cheap Color clone
 * kept alongside the clone that will actually get mutated" pattern
 * BuildingModel.tsx's own baseColors follows — elementColors overrides
 * are always relative to this, never to whatever the color happened to
 * be the last time the effect ran, so removing an override (Reset to
 * original) always lands back on the model's real starting color.
 *
 * Round trip with a previously downloaded model
 * (src/lib/exportCustomModel.ts): CustomModelControl.tsx's Download
 * button writes a reviewer's edits into a new .glb, and this file is the
 * half that reads such a file back. Recolors and renames need nothing
 * special here — a recolor is just the material's own color, and a rename
 * is just mesh.name, which the traversal below already turns into the
 * display name. Category and hidden state are the two edits glTF has no
 * native field for, so the exporter stores them in node `extras`, which
 * GLTFLoader surfaces as mesh.userData: the traversal reads the category
 * straight into each UploadedElement, and the registration effect re-
 * hides any mesh flagged hidden. That hide is idempotent (skips a mesh
 * already hidden) because React's dev-mode double-invoked effects would
 * otherwise toggle it right back to visible. This component also
 * registers its own root scene (CUSTOM_MODEL_ROOT_KEY) so the Download
 * button — outside the Canvas, with no ref to this component — can find
 * the scene to export.
 *
 * Pin mode now has a real branch, mirroring BuildingModel.tsx's own
 * handleClick: raycasts the click into a world point + surface normal
 * and hands them to projectStore as pendingCustomPin, which
 * UploadedAnnotationComposer.tsx (rendered below, a sibling of this
 * file's own <primitive>) turns into a real CustomAnnotation — see that
 * store field's own comment for why this is an entirely separate,
 * ephemeral parallel to pendingPin/`annotations` rather than reusing
 * them. No MESH_ROTATION-style conversion needed the way BuildingModel's
 * own handler has: that file's meshGroupRef applies a fixed rotation
 * every MESH_ENTRIES mesh sits under, which a captured normal has to be
 * converted into; clonedScene here carries no equivalent fixed rotation
 * (it's rendered as a bare <primitive>, not nested under any rotated
 * wrapper group), so event.face's world-space normal is already the
 * frame the composer/marker need.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { EffectComposer, Outline } from "@react-three/postprocessing";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import gsap from "gsap";
import { DURATION, EASE_WEIGHTED } from "@/lib/motion";
import { ATRIUM_CATEGORY_KEY, ATRIUM_HIDDEN_KEY, CUSTOM_MODEL_ROOT_KEY } from "@/lib/exportCustomModel";
import { useProjectStore, type UploadedElement } from "@/store/projectStore";
import { ELEMENT_CATEGORIES, type ElementCategory } from "@/types/project";
import { UploadedAnnotationMarker } from "./UploadedAnnotationMarker";
import { UploadedAnnotationComposer } from "./UploadedAnnotationComposer";

// Mirrors BuildingModel.tsx's own brass hex values exactly, restated here
// rather than shared-imported — both files already restate small,
// stable visual constants like this locally (see e.g. Scene.tsx's own
// GROUND_COLOR, restated from globals.css for the same "needs to be a
// real JS value in this file" reason) rather than adding a cross-file
// coupling for two hex strings.
const BRASS = "#D4A24C";
const BRASS_DIM = "#5A4322";

// Not BuildingModel's own carefully pixel-measured 0.08 (see that file's
// own comment on how that value was calibrated) — this model's materials
// and base colors are entirely unknown up front, so there's nothing to
// calibrate against. A stronger default reads clearly across a wider
// range of unknown material brightness/color than that measured value
// would, at the cost of not being tuned to any one file in particular.
const HOVER_EMISSIVE_INTENSITY = 0.35;

// See file header ("Hide/show") — the same pair BuildingModel.tsx's own
// file restates for the identical reason.
const MESH_RAYCAST = THREE.Mesh.prototype.raycast;
const NO_RAYCAST = () => {};

function forEachMaterial(material: THREE.Material | THREE.Material[], fn: (material: THREE.Material) => void) {
  if (Array.isArray(material)) {
    material.forEach(fn);
  } else {
    fn(material);
  }
}

// Reads the category a previous export stored in a node's extras (see
// file header, "Round trip"). Validated against ELEMENT_CATEGORIES rather
// than trusted: userData is whatever a file's author put there, so an
// unknown or malformed value must come back as "no category," not a
// string the rest of the app would treat as a real ElementCategory.
function parseCategory(value: unknown): ElementCategory | null {
  return ELEMENT_CATEGORIES.find((category) => category === value) ?? null;
}

function tweenEmissive(mesh: THREE.Mesh, intensity: number, invalidate: () => void) {
  forEachMaterial(mesh.material, (material) => {
    if (!(material instanceof THREE.MeshStandardMaterial) && !(material instanceof THREE.MeshPhysicalMaterial)) return;
    gsap.to(material, {
      emissiveIntensity: intensity,
      duration: DURATION.instant,
      ease: EASE_WEIGHTED,
      overwrite: true,
      onUpdate: invalidate,
    });
  });
}

interface UploadedModelProps {
  /** An object URL from CustomModelControl.tsx's file input — see that
   *  component and projectStore.ts's customModelUrl for where this comes
   *  from and how its lifecycle (revocation, replacement) is owned. */
  url: string;
}

export function UploadedModel({ url }: UploadedModelProps) {
  const { scene } = useGLTF(url);
  const invalidate = useThree((state) => state.invalidate);

  const hoveredElementId = useProjectStore((state) => state.hoveredElementId);
  const selectedElementId = useProjectStore((state) => state.selectedElementId);
  const setHovered = useProjectStore((state) => state.setHovered);
  const clearHovered = useProjectStore((state) => state.clearHovered);
  const setSelected = useProjectStore((state) => state.setSelected);
  const setUploadedElements = useProjectStore((state) => state.setUploadedElements);
  // A new Set/Map reference on every change (see projectStore.ts's own
  // comment on both), so this re-renders exactly when a hide/recolor
  // actually happens — the same selector shape BuildingModel.tsx uses
  // for its own identical reads.
  const hiddenElementIds = useProjectStore((state) => state.hiddenElementIds);
  const elementColors = useProjectStore((state) => state.elementColors);
  const customAnnotations = useProjectStore((state) => state.customAnnotations);
  const pendingCustomPin = useProjectStore((state) => state.pendingCustomPin);

  // See file header for why this clone exists and why materials (not
  // geometry) get individually cloned again inside it below.
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  // One pass over the cloned graph: finds every THREE.Mesh, clones its
  // material(s) so hover/selection/recolor can freely mutate them without
  // touching the cached original, captures each one's real starting color
  // (baseColors, for recolor's own "Reset to original"), and derives each
  // mesh's key — see file header for the name-if-unique-else-uuid rule
  // this follows.
  const { meshes, elements, baseColors } = useMemo(() => {
    const found: THREE.Mesh[] = [];
    clonedScene.traverse((object) => {
      if (object instanceof THREE.Mesh) found.push(object);
    });

    const nameCounts = new Map<string, number>();
    for (const mesh of found) {
      if (!mesh.name) continue;
      nameCounts.set(mesh.name, (nameCounts.get(mesh.name) ?? 0) + 1);
    }

    const colors: Record<string, THREE.Color> = {};

    const derivedElements: UploadedElement[] = found.map((mesh, index) => {
      const meshName = mesh.name && nameCounts.get(mesh.name) === 1 ? mesh.name : mesh.uuid;
      const displayName = mesh.name || `Mesh ${index + 1}`;
      // Stashed on the mesh itself (three.js's own idiomatic spot for
      // custom per-object metadata) rather than kept in a separate
      // Map<Object3D, string> — the pointer handlers below read this
      // straight off `event.object`, with no parallel lookup structure
      // to keep in sync.
      mesh.userData.meshName = meshName;

      // Cloned per mesh, the same reason BuildingModel.tsx's own
      // meshMaterials clone does: two meshes could share one source
      // material (a "metal" or "fabric" material reused across several
      // parts of the file is common), and mutating a shared material's
      // emissive/color on hover/recolor would light or repaint every
      // mesh using it together, not just the one under the pointer.
      const material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
      forEachMaterial(material, (m) => {
        if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial) {
          m.emissive = new THREE.Color(BRASS);
          m.emissiveIntensity = 0;
        }
      });
      mesh.material = material;

      // One representative color per mesh (the first color-capable
      // material, if any) — mirrors BuildingModel.tsx's own baseColors
      // exactly, including only ever tracking one channel even for a
      // multi-material mesh, since setElementColor's own write (below)
      // only ever sets one color too.
      const firstColorMaterial = Array.isArray(material)
        ? material.find((m) => m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial)
        : material;
      if (
        firstColorMaterial instanceof THREE.MeshStandardMaterial ||
        firstColorMaterial instanceof THREE.MeshPhysicalMaterial
      ) {
        colors[meshName] = firstColorMaterial.color.clone();
      }

      // A category is only ever present here if this file is a previous
      // Download from this app (see file header, "Round trip") — an
      // ordinary upload has none, and parseCategory returns null for it.
      return { meshName, displayName, category: parseCategory(mesh.userData[ATRIUM_CATEGORY_KEY]) };
    });

    return { meshes: found, elements: derivedElements, baseColors: colors };
  }, [clonedScene]);

  // Registers every mesh into the exact same shared registry
  // BuildingModel.tsx's own mesh ref callbacks populate
  // (registerElementObject — always just Record<string, Object3D|null>
  // keyed by a plain string, never curated-model-specific) and publishes
  // the derived element list for TourControls.tsx/TourHud.tsx to read.
  // A store write, so this belongs in an effect, never the useMemo above
  // — see ProjectHydrator.tsx's header for the long version of why this
  // codebase never writes to the store during render. Only runs once per
  // traversal (a fresh model load), so it never stomps a reviewer's own
  // rename/category edit — see renameUploadedElement's own comment in
  // projectStore.ts for why that's a targeted update, not a call back
  // into setUploadedElements from the panel itself.
  //
  // Also registers the root scene under CUSTOM_MODEL_ROOT_KEY (what
  // CustomModelControl.tsx's Download button exports from), and re-hides
  // any mesh a previous export flagged hidden — see file header, "Round
  // trip", for why that check-before-toggle is required, not optional.
  useEffect(() => {
    const state = useProjectStore.getState();
    state.registerElementObject(CUSTOM_MODEL_ROOT_KEY, clonedScene);
    for (const mesh of meshes) {
      state.registerElementObject(mesh.userData.meshName as string, mesh);
    }
    setUploadedElements(elements);
    for (const mesh of meshes) {
      const meshName = mesh.userData.meshName as string;
      if (mesh.userData[ATRIUM_HIDDEN_KEY] === true && !useProjectStore.getState().hiddenElementIds.has(meshName)) {
        useProjectStore.getState().toggleElementVisibility(meshName);
      }
    }
    invalidate();
    return () => {
      state.registerElementObject(CUSTOM_MODEL_ROOT_KEY, null);
      for (const mesh of meshes) {
        state.registerElementObject(mesh.userData.meshName as string, null);
      }
    };
  }, [clonedScene, meshes, elements, setUploadedElements, invalidate]);

  useEffect(() => {
    return () => {
      for (const mesh of meshes) {
        forEachMaterial(mesh.material, (material) => gsap.killTweensOf(material));
      }
    };
  }, [meshes]);

  // Hide/show — see file header. Only ever pulls a mesh's own
  // visible/raycast pair toward what hiddenElementIds currently says;
  // never touches emissive/color, which the two effects below already
  // own independently. `meshes` holds real three.js Object3D instances,
  // not React-owned state — mutating `.visible`/`.raycast` on them
  // directly is the normal, correct r3f pattern for driving an
  // imperative scene graph from reactive state, the same reasoning
  // Scene.tsx's own blanket disable comment gives for mutating `camera`
  // the identical way; the compiler-oriented lint rule doesn't
  // distinguish a three.js object living inside a memoized array from
  // React-owned data the way it does a plain prop.
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    for (const mesh of meshes) {
      const meshName = mesh.userData.meshName as string;
      const hidden = hiddenElementIds.has(meshName);
      mesh.visible = !hidden;
      mesh.raycast = hidden ? NO_RAYCAST : MESH_RAYCAST;
    }
    invalidate();
  }, [meshes, hiddenElementIds, invalidate]);
  /* eslint-enable react-hooks/immutability */

  // Recolor — see file header. Same "override present -> set; else ->
  // restore baseColors" shape as BuildingModel.tsx's own identical
  // effect, just addressed by meshName (this component's own key)
  // instead of MESH_ENTRIES' id.
  useEffect(() => {
    for (const mesh of meshes) {
      const meshName = mesh.userData.meshName as string;
      const base = baseColors[meshName];
      if (!base) continue;
      const override = elementColors.get(meshName);
      forEachMaterial(mesh.material, (material) => {
        if (!(material instanceof THREE.MeshStandardMaterial) && !(material instanceof THREE.MeshPhysicalMaterial)) return;
        if (override) {
          material.color.set(override);
        } else {
          material.color.copy(base);
        }
      });
    }
    invalidate();
  }, [meshes, baseColors, elementColors, invalidate]);

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (useProjectStore.getState().mode === "pin") return;
    if (!(event.object instanceof THREE.Mesh)) return;
    const mesh = event.object;
    const meshName = mesh.userData.meshName as string | undefined;
    if (!meshName) return;
    document.body.style.cursor = "pointer";
    setHovered(meshName);
    tweenEmissive(mesh, HOVER_EMISSIVE_INTENSITY, invalidate);
  };

  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (useProjectStore.getState().mode !== "pin") {
      document.body.style.cursor = "auto";
    }
    if (!(event.object instanceof THREE.Mesh)) return;
    const mesh = event.object;
    const meshName = mesh.userData.meshName as string | undefined;
    if (!meshName) return;
    // Only clear if this mesh is still the one on record — guards
    // against a stale pointerout racing behind a newer mesh's
    // pointerover, the same pattern BuildingModel.tsx's own handler uses.
    if (useProjectStore.getState().hoveredElementId === meshName) {
      clearHovered();
    }
    tweenEmissive(mesh, 0, invalidate);
  };

  // See file header for the pin-mode branch and why it needs no
  // MESH_ROTATION-style conversion the way BuildingModel.tsx's own
  // handler does.
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (useProjectStore.getState().cameraMode === "tour") return;
    const meshName = event.object.userData.meshName as string | undefined;
    if (!meshName) return;

    const state = useProjectStore.getState();
    if (state.mode === "pin") {
      const normal = event.face
        ? event.face.normal.clone().transformDirection(event.object.matrixWorld).normalize()
        : new THREE.Vector3(0, 1, 0);
      state.setPendingCustomPin({
        position: [event.point.x, event.point.y, event.point.z],
        normal: [normal.x, normal.y, normal.z],
        meshName,
      });
      return;
    }

    setSelected(meshName);
  };

  // Same resolved-via-registry pattern BuildingModel.tsx uses for its own
  // outlined selection — a ref read during render isn't guaranteed
  // fresh, so the looked-up object lives in real state instead, resolved
  // in an effect that only ever runs after the registration effect above
  // has already populated the registry. BuildingModel.tsx's own identical
  // effect reads a local useRef and isn't flagged by
  // react-hooks/set-state-in-effect; this one goes through the store's
  // getElementObject accessor instead of a local ref (the shared
  // registry, not a per-component one, is the whole point — see the
  // registration effect above), which the lint rule's heuristic doesn't
  // recognise as the same "resolve an external, non-reactive handle"
  // case, even though it is one.
  const [selectedObject, setSelectedObject] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedObject(selectedElementId ? useProjectStore.getState().getElementObject(selectedElementId) : null);
  }, [selectedElementId, meshes]);

  useEffect(() => {
    invalidate();
  }, [hoveredElementId, selectedElementId, hiddenElementIds, invalidate]);

  // A hidden selection keeps UploadedElementPanel.tsx open (so its Hide
  // button can flip to Show) but loses its outline — same reasoning as
  // BuildingModel.tsx's own outlineObject: nothing on screen left to draw
  // it around, and xRay would otherwise risk tracing a ghost of it.
  const outlineObject =
    selectedObject && selectedElementId && !hiddenElementIds.has(selectedElementId) ? selectedObject : null;

  return (
    <>
      <primitive object={clonedScene} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut} onClick={handleClick} />

      {outlineObject && (
        <EffectComposer autoClear={false}>
          <Outline
            selection={[outlineObject]}
            visibleEdgeColor={BRASS}
            hiddenEdgeColor={BRASS_DIM}
            edgeStrength={2.5}
            blur={false}
            xRay
          />
        </EffectComposer>
      )}

      {customAnnotations.map((annotation, index) => (
        <UploadedAnnotationMarker key={annotation.id} annotation={annotation} number={index + 1} />
      ))}
      {pendingCustomPin && <UploadedAnnotationComposer pendingPin={pendingCustomPin} />}
    </>
  );
}
