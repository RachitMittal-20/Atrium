/**
 * src/components/three/UploadedModel.tsx
 *
 * The "try your own model" path — a reviewer-uploaded .glb/.gltf,
 * rendered generically. This is a second, parallel model component, not
 * a rewrite of BuildingModel.tsx: that file's curated MESH_ENTRIES table
 * (51 hand-mapped entries, each with a category, a spec sheet row, color-
 * override support, visibility toggling) only ever makes sense against
 * the one apartment.glb it was built for. An arbitrary uploaded file has
 * none of that — no known mesh names, no Element rows, no Supabase
 * project to persist anything against — so this component instead
 * traverses whatever it's handed generically and supports only what
 * makes sense without any of that curated data: click to select, hover
 * to highlight, and Tour mode stepping through meshes in the file's own
 * scene-graph order. Scene.tsx mounts this in place of BuildingModel
 * (never alongside — see that file's header) whenever projectStore's
 * customModelUrl is set.
 *
 * No ElementPanel, no spec sheet, no name-only readout beyond the hover
 * label a click leaves selected (see below) — a deliberate "your call"
 * choice from the brief this was built against, picking the option that
 * reads least like a broken version of the curated panel rather than an
 * intentionally simpler one: ElementPanel.tsx's own selector
 * (`elements.find(candidate => candidate.meshName === selectedElementId)`)
 * already finds nothing for a custom-model selection automatically (see
 * projectStore.ts's own comment on reusing hoveredElementId/
 * selectedElementId for this), so that panel simply never opens — a
 * click here only ever shows the same brass Outline the curated model
 * uses for its own selection, with no panel sliding in behind it.
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
 * emissive) the same way BuildingModel.tsx's per-mesh clones do.
 * Object3D.clone(true) deep-clones the *graph* (every mesh/group
 * wrapper) but, by three.js's own documented default, leaves geometry
 * and materials shared with the original — every mesh found below still
 * gets its own material cloned individually (geometry stays shared,
 * exactly as safe as BuildingModel's own geometry sharing, since nothing
 * here ever mutates a geometry).
 *
 * Traversal order is the file's own scene-graph order — there is no
 * curated grouping possible for an arbitrary upload the way
 * src/data/project.ts's ELEMENTS has, and this component doesn't
 * attempt to invent one. Each mesh's key (meshName below, what Tour mode
 * and the shared elementObjects registry both key off of) is mesh.name
 * when the exporter set one *and* it's unique across this file, else
 * mesh.uuid — a two-pass derivation (collect name frequencies, then
 * decide each key) because uniqueness can't be known from a single mesh
 * in isolation.
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
 * Hover glow only ever touches MeshStandardMaterial/MeshPhysicalMaterial
 * instances (the only ones with an `.emissive` channel) — which is what
 * GLTFLoader actually produces for an ordinary glTF PBR metallic-
 * roughness material, so this covers the overwhelming majority of real
 * .glb/.gltf files; anything else (an unusual export path producing a
 * MeshBasicMaterial, say) simply never glows on hover instead of
 * crashing trying to set a property that doesn't exist.
 *
 * No pin-mode branch at all, unlike BuildingModel.tsx's own click
 * handler — pinning a comment persists an Annotation row tied to a real
 * Element in a real project (src/lib/queries.ts's createAnnotation),
 * which has no meaning for an ephemeral, unpersisted custom model. A
 * click here always just selects, regardless of projectStore's `mode` —
 * if the reviewer happens to still be in pin mode from viewing the
 * curated model, clicking a custom-model mesh selects it instead of
 * silently doing nothing, which reads as "this still works," not
 * "pinning quietly failed."
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { EffectComposer, Outline } from "@react-three/postprocessing";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import gsap from "gsap";
import { DURATION, EASE_WEIGHTED } from "@/lib/motion";
import { useProjectStore, type UploadedElement } from "@/store/projectStore";

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

function forEachMaterial(material: THREE.Material | THREE.Material[], fn: (material: THREE.Material) => void) {
  if (Array.isArray(material)) {
    material.forEach(fn);
  } else {
    fn(material);
  }
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

  // See file header for why this clone exists and why materials (not
  // geometry) get individually cloned again inside it below.
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  // One pass over the cloned graph: finds every THREE.Mesh, clones its
  // material(s) so hover/selection can freely mutate them without
  // touching the cached original, and derives each mesh's key — see file
  // header for the name-if-unique-else-uuid rule this follows.
  const { meshes, elements } = useMemo(() => {
    const found: THREE.Mesh[] = [];
    clonedScene.traverse((object) => {
      if (object instanceof THREE.Mesh) found.push(object);
    });

    const nameCounts = new Map<string, number>();
    for (const mesh of found) {
      if (!mesh.name) continue;
      nameCounts.set(mesh.name, (nameCounts.get(mesh.name) ?? 0) + 1);
    }

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
      // emissive on hover would light every mesh using it up together,
      // not just the one under the pointer.
      const material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
      forEachMaterial(material, (m) => {
        if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial) {
          m.emissive = new THREE.Color(BRASS);
          m.emissiveIntensity = 0;
        }
      });
      mesh.material = material;

      return { meshName, displayName };
    });

    return { meshes: found, elements: derivedElements };
  }, [clonedScene]);

  // Registers every mesh into the exact same shared registry
  // BuildingModel.tsx's own mesh ref callbacks populate
  // (registerElementObject — always just Record<string, Object3D|null>
  // keyed by a plain string, never curated-model-specific) and publishes
  // the derived element list for TourControls.tsx/TourHud.tsx to read.
  // A store write, so this belongs in an effect, never the useMemo above
  // — see ProjectHydrator.tsx's header for the long version of why this
  // codebase never writes to the store during render.
  useEffect(() => {
    const state = useProjectStore.getState();
    for (const mesh of meshes) {
      state.registerElementObject(mesh.userData.meshName as string, mesh);
    }
    setUploadedElements(elements);
    invalidate();
    return () => {
      for (const mesh of meshes) {
        state.registerElementObject(mesh.userData.meshName as string, null);
      }
    };
  }, [meshes, elements, setUploadedElements, invalidate]);

  useEffect(() => {
    return () => {
      for (const mesh of meshes) {
        forEachMaterial(mesh.material, (material) => gsap.killTweensOf(material));
      }
    };
  }, [meshes]);

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

  // See file header for why this never branches on pin mode the way
  // BuildingModel.tsx's own click handler does.
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (useProjectStore.getState().cameraMode === "tour") return;
    const meshName = event.object.userData.meshName as string | undefined;
    if (!meshName) return;
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
  }, [hoveredElementId, selectedElementId, invalidate]);

  return (
    <>
      <primitive object={clonedScene} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut} onClick={handleClick} />

      {selectedObject && (
        <EffectComposer autoClear={false}>
          <Outline
            selection={[selectedObject]}
            visibleEdgeColor={BRASS}
            hiddenEdgeColor={BRASS_DIM}
            edgeStrength={2.5}
            blur={false}
            xRay
          />
        </EffectComposer>
      )}
    </>
  );
}
