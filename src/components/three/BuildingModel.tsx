/**
 * src/components/three/BuildingModel.tsx
 *
 * The apartment model used throughout ATRIUM's 3D scene, and the only
 * place its interactivity lives. Loads public/models/apartment.glb
 * (Draco + WebP optimised — see docs/ASSETS.md) via drei's useGLTF and
 * renders every meaningful piece as its own <mesh>, driven by a small
 * MESH_ENTRIES table rather than 43 hand-written near-identical JSX lines
 * — each entry names a real part of the apartment (kitchen counter, sofa,
 * a window) rather than the generated mesh IDs the raw export uses
 * ("Material3_17", "auto_25", ...). The two decorative edge-outline
 * meshes (a Sketchfab sketch-style line pass, not real architecture) are
 * rendered separately and are not interactive.
 *
 * Hover and selection both write to src/store/selectionStore — the shared
 * bridge across the Canvas boundary — rather than taking callback props
 * from a parent:
 *  - onPointerOver/onPointerOut set/clear hoveredElementId, swap the
 *    cursor, and tween that mesh's own emissive intensity toward brass
 *    with GSAP (never a material swap — same material, animated in place).
 *  - onClick sets selectedElementId; the empty-space click that clears it
 *    is wired on the Canvas itself (onPointerMissed, in Scene.tsx) since
 *    that only fires when literally nothing was hit.
 *  - every one of these stops propagation, so a click or hover on the
 *    frontmost mesh never also registers on whatever is behind it.
 *  - a drei Html label follows the hovered mesh in screen space, and an
 *    EffectComposer + postprocessing Outline draws a persistent brass
 *    outline around the selected one — two different mechanisms so the
 *    two states are never visually ambiguous.
 *
 * Each material is cloned per mesh (see meshMaterials below) rather than
 * used directly from the shared `materials` dictionary useGLTF returns:
 * two meshes here (the building's lower and full-height envelope) share
 * one source material, and animating that material's emissive directly
 * would make both meshes glow together on either one's hover.
 *
 * Preloading is handled by src/lib/assets.ts (imported for MODEL_PATH
 * below), not here — that starts the fetch the moment the app boots,
 * rather than waiting for this component to mount, and its cache means
 * every caller here (the interactive /project scene, the purely
 * atmospheric hero) shares one fetch and one parsed result.
 *
 * Pass `interactive={false}` (the hero's cinematic shot does) to skip all
 * of the above entirely — no cloned materials, no pointer handlers, no
 * Html label, no EffectComposer/Outline. It's not just "interaction does
 * nothing": r3f still raycasts every mesh that has a pointer handler
 * attached on every pointer move, so leaving those handlers off altogether
 * is what actually removes the cost, not merely the visible effect.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useGLTF, Html } from "@react-three/drei";
import { EffectComposer, Outline } from "@react-three/postprocessing";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import type { GLTF } from "three-stdlib";
import type { ThreeElements } from "@react-three/fiber";
import gsap from "gsap";
import { MODEL_PATH } from "@/lib/assets";
import { DURATION, EASE_WEIGHTED } from "@/lib/motion";
import { useSelectionStore } from "@/store/selectionStore";

type GLTFResult = GLTF & {
  nodes: {
    Material2: THREE.Mesh;
    Material2_1: THREE.Mesh;
    Material2_2: THREE.Mesh;
    Material2_3: THREE.Mesh;
    Material3: THREE.Mesh;
    Material3_1: THREE.Mesh;
    Material3_2: THREE.Mesh;
    Material3_3: THREE.Mesh;
    Material3_4: THREE.Mesh;
    Material3_5: THREE.Mesh;
    Material3_6: THREE.Mesh;
    Material3_7: THREE.Mesh;
    Material3_8: THREE.Mesh;
    Material3_9: THREE.Mesh;
    Material3_10: THREE.Mesh;
    Material3_11: THREE.Mesh;
    Material3_12: THREE.Mesh;
    Material3_13: THREE.Mesh;
    Material3_14: THREE.Mesh;
    Material3_15: THREE.Mesh;
    Material3_16: THREE.Mesh;
    Material3_17: THREE.Mesh;
    Material3_18: THREE.Mesh;
    Material3_19: THREE.Mesh;
    Material3_20: THREE.Mesh;
    Material3_21: THREE.Mesh;
    Material3_22: THREE.Mesh;
    Material3_23: THREE.Mesh;
    Material3_24: THREE.Mesh;
    Material3_25: THREE.Mesh;
    Material3_26: THREE.Mesh;
    Material3_27: THREE.Mesh;
    Material3_28: THREE.Mesh;
    Material3_29: THREE.Mesh;
    Material3_30: THREE.Mesh;
    Material3_31: THREE.Mesh;
    Material3_32: THREE.Mesh;
    Material3_33: THREE.Mesh;
    Material3_34: THREE.Mesh;
    Material3_35: THREE.Mesh;
    Material3_36: THREE.Mesh;
    Material3_37: THREE.Mesh;
    Material3_38: THREE.Mesh;
    Material3_39: THREE.Mesh;
    Material4: THREE.Mesh;
  };
  materials: {
    edge_color646464255: THREE.LineBasicMaterial;
    material_1: THREE.MeshStandardMaterial;
    auto: THREE.MeshStandardMaterial;
    auto_1: THREE.MeshStandardMaterial;
    auto_2: THREE.MeshStandardMaterial;
    auto_3: THREE.MeshStandardMaterial;
    auto_6: THREE.MeshStandardMaterial;
    auto_4: THREE.MeshStandardMaterial;
    auto_5: THREE.MeshStandardMaterial;
    auto_7: THREE.MeshStandardMaterial;
    auto_8: THREE.MeshStandardMaterial;
    auto_9: THREE.MeshStandardMaterial;
    auto_11: THREE.MeshStandardMaterial;
    auto_10: THREE.MeshStandardMaterial;
    auto_12: THREE.MeshStandardMaterial;
    auto_14: THREE.MeshStandardMaterial;
    auto_16: THREE.MeshStandardMaterial;
    auto_18: THREE.MeshStandardMaterial;
    auto_20: THREE.MeshStandardMaterial;
    auto_23: THREE.MeshStandardMaterial;
    auto_22: THREE.MeshStandardMaterial;
    auto_24: THREE.MeshStandardMaterial;
    auto_25: THREE.MeshStandardMaterial;
    auto_27: THREE.MeshStandardMaterial;
    auto_28: THREE.MeshStandardMaterial;
    auto_29: THREE.MeshStandardMaterial;
    auto_30: THREE.MeshStandardMaterial;
    auto_33: THREE.MeshStandardMaterial;
    auto_34: THREE.MeshStandardMaterial;
    auto_35: THREE.MeshStandardMaterial;
    auto_38: THREE.MeshStandardMaterial;
    auto_37: THREE.MeshStandardMaterial;
    auto_39: THREE.MeshStandardMaterial;
    auto_40: THREE.MeshStandardMaterial;
    auto_41: THREE.MeshStandardMaterial;
    auto_43: THREE.MeshStandardMaterial;
    auto_45: THREE.MeshStandardMaterial;
    auto_47: THREE.MeshStandardMaterial;
    auto_48: THREE.MeshStandardMaterial;
    auto_49: THREE.MeshStandardMaterial;
    auto_51: THREE.MeshStandardMaterial;
    auto_54: THREE.MeshStandardMaterial;
    auto_55: THREE.MeshStandardMaterial;
  };
};

type NodeKey = keyof GLTFResult["nodes"];
// Excludes the line-outline material — no MeshEntry ever uses it (the two
// decorative edge overlays are rendered directly, not through this table),
// and excluding it here is what lets meshMaterials below type as
// MeshStandardMaterial instead of a MeshStandardMaterial | LineBasicMaterial
// union that doesn't have .emissive.
type MaterialKey = Exclude<keyof GLTFResult["materials"], "edge_color646464255">;

interface MeshEntry {
  /** Stable, unique identifier — what selectionStore actually holds. */
  id: string;
  /** Human-readable name — shown in the hover label. */
  label: string;
  geometry: NodeKey;
  material: MaterialKey;
}

// Building envelope + the one freestanding object sharing its mesh.
const ENVELOPE_ENTRIES: MeshEntry[] = [
  { id: "building-shell-lower", label: "Building Shell — Lower Envelope", geometry: "Material2", material: "material_1" },
  { id: "building-shell-full", label: "Building Shell — Full-Height Envelope", geometry: "Material2_1", material: "material_1" },
  { id: "floor-lamp", label: "Floor Lamp", geometry: "Material2_3", material: "auto" },
];

// Architecture: walls, floor, ceiling, openings.
const ARCHITECTURE_ENTRIES: MeshEntry[] = [
  { id: "accent-wall-panel", label: "Accent Wall Panel", geometry: "Material3", material: "auto_1" },
  { id: "feature-wall-block-tile", label: "Feature Wall (Block Tile)", geometry: "Material3_5", material: "auto_5" },
  { id: "interior-wall-painted", label: "Interior Wall (Painted)", geometry: "Material3_13", material: "auto_16" },
  { id: "interior-wall-section", label: "Interior Wall Section", geometry: "Material3_16", material: "auto_23" },
  { id: "facade-wall-flat-panel", label: "Facade Wall (Flat Panel)", geometry: "Material3_18", material: "auto_24" },
  { id: "interior-wall-secondary", label: "Interior Wall (Secondary Surface)", geometry: "Material3_33", material: "auto_45" },
  { id: "floor", label: "Floor", geometry: "Material3_26", material: "auto_35" },
  { id: "ceiling-section", label: "Ceiling Section", geometry: "Material3_35", material: "auto_48" },
  { id: "ceiling", label: "Ceiling", geometry: "Material3_38", material: "auto_54" },
  { id: "interior-door", label: "Interior Door", geometry: "Material3_24", material: "auto_33" },
  { id: "window-glass-pane", label: "Window Glass Pane", geometry: "Material3_6", material: "auto_7" },
  { id: "window-glass-pane-large", label: "Window Glass Pane (Large)", geometry: "Material3_31", material: "auto_41" },
  { id: "window-frame-vertical", label: "Window Frame (Vertical)", geometry: "Material3_32", material: "auto_43" },
  { id: "door-frame-trim", label: "Door Frame Trim", geometry: "Material3_9", material: "auto_11" },
  { id: "baseboard-skirting", label: "Baseboard / Skirting Board", geometry: "Material3_7", material: "auto_8" },
  { id: "shelf-edge-trim", label: "Shelf Edge Trim", geometry: "Material3_11", material: "auto_12" },
  { id: "vertical-trim-column", label: "Vertical Trim / Column", geometry: "Material3_27", material: "auto_38" },
];

// Kitchen.
const KITCHEN_ENTRIES: MeshEntry[] = [
  { id: "kitchen-countertop", label: "Kitchen Countertop (Black Granite)", geometry: "Material3_2", material: "auto_3" },
  { id: "kitchen-appliances", label: "Kitchen Appliances (Oven / Range)", geometry: "Material3_3", material: "auto_6" },
];

// Furniture + soft furnishing.
const FURNITURE_ENTRIES: MeshEntry[] = [
  { id: "media-console", label: "Media Console / Low Cabinet", geometry: "Material3_1", material: "auto_2" },
  { id: "wooden-shelf-decor", label: "Wooden Shelf with Décor", geometry: "Material3_8", material: "auto_9" },
  { id: "bookshelf", label: "Bookshelf", geometry: "Material3_19", material: "auto_25" },
  { id: "sofa", label: "Sofa", geometry: "Material3_29", material: "auto_39" },
  { id: "coffee-table-top", label: "Coffee Table Top", geometry: "Material3_37", material: "auto_51" },
  { id: "small-tray-table", label: "Small Tray / Side Table", geometry: "Material3_39", material: "auto_55" },
  { id: "shelf-counter-ledge", label: "Shelf / Counter Ledge", geometry: "Material3_23", material: "auto_30" },
  { id: "framed-mirror", label: "Framed Mirror", geometry: "Material3_25", material: "auto_34" },
  { id: "potted-plant", label: "Potted Plant", geometry: "Material3_22", material: "auto_29" },
  { id: "area-rug", label: "Area Rug", geometry: "Material3_28", material: "auto_37" },
];

// Lighting + curtains.
const LIGHTING_ENTRIES: MeshEntry[] = [
  { id: "curtain-panel", label: "Curtain Panel", geometry: "Material3_12", material: "auto_14" },
  { id: "curtain-tieback-cord", label: "Curtain Tieback Cord", geometry: "Material3_14", material: "auto_18" },
  { id: "curtain-panel-sheer", label: "Curtain Panel (Sheer)", geometry: "Material3_21", material: "auto_28" },
  { id: "lamp-shade", label: "Lamp Shade", geometry: "Material3_34", material: "auto_47" },
  { id: "table-lamp-base", label: "Table Lamp Base", geometry: "Material3_15", material: "auto_20" },
];

// Small fixtures and hardware — geometry too small to visually distinguish
// beyond "a fitting", identified only by context. The two cabinet knobs
// are genuinely two separate physical knobs, hence the numbered ids.
const FIXTURE_ENTRIES: MeshEntry[] = [
  { id: "cabinet-handle", label: "Cabinet Handle", geometry: "Material3_4", material: "auto_4" },
  { id: "cabinet-knob-1", label: "Cabinet Knob", geometry: "Material3_10", material: "auto_10" },
  { id: "door-cabinet-handle", label: "Door / Cabinet Handle", geometry: "Material3_17", material: "auto_22" },
  { id: "small-wall-fixture", label: "Small Wall Fixture", geometry: "Material3_20", material: "auto_27" },
  { id: "cabinet-knob-2", label: "Cabinet Knob", geometry: "Material3_30", material: "auto_40" },
  { id: "decorative-object", label: "Decorative Object", geometry: "Material3_36", material: "auto_49" },
];

const MESH_ENTRIES: MeshEntry[] = [
  ...ENVELOPE_ENTRIES,
  ...ARCHITECTURE_ENTRIES,
  ...KITCHEN_ENTRIES,
  ...FURNITURE_ENTRIES,
  ...LIGHTING_ENTRIES,
  ...FIXTURE_ENTRIES,
];

const BRASS = "#D4A24C";
const BRASS_DIM = "#5A4322"; // hiddenEdgeColor for the selection outline — a dimmed brass, not the effect's default dark red
// Calibrated by measuring actual rendered pixels, not by eye: emissive is
// additive, so on this model's many near-black surfaces (the shell, the
// countertop) anything above ~0.1 stops reading as "a lift" and starts
// reading as "this object is now solid gold" — measured (43,42,41) →
// (82,66,48) at 0.08, a clear ~2x brightness/warmth shift without full
// colour replacement. On lighter surfaces the same value reads as a
// gentler shift, which is correct — additive light naturally has less
// relative effect against an already-bright base.
const HOVER_EMISSIVE_INTENSITY = 0.08;

type BuildingModelProps = ThreeElements["group"] & {
  /**
   * Set false for a purely decorative shot (the hero): skips cloned
   * materials, pointer handlers, the hover label, and the selection
   * outline entirely, rather than just leaving them visually inert.
   * Defaults true — the interactive /project scene's normal behaviour.
   */
  interactive?: boolean;
};

export function BuildingModel({ interactive = true, ...props }: BuildingModelProps) {
  const { nodes, materials } = useGLTF(MODEL_PATH) as unknown as GLTFResult;
  const invalidate = useThree((state) => state.invalidate);

  const hoveredElementId = useSelectionStore((state) => state.hoveredElementId);
  const selectedElementId = useSelectionStore((state) => state.selectedElementId);
  const setHovered = useSelectionStore((state) => state.setHovered);
  const clearHovered = useSelectionStore((state) => state.clearHovered);
  const setSelected = useSelectionStore((state) => state.setSelected);

  // Every mesh gets its own material instance — material_1 is shared by
  // two meshes in the source file, and tweening a shared material's
  // emissive would light both of them up together on either one's hover.
  // Not interactive: nothing ever animates emissive, so each entry maps
  // straight to its source material — no clones to create or dispose.
  const meshMaterials = useMemo(() => {
    const result: Record<string, THREE.MeshStandardMaterial> = {};
    for (const entry of MESH_ENTRIES) {
      if (!interactive) {
        result[entry.id] = materials[entry.material];
        continue;
      }
      const clone = materials[entry.material].clone();
      clone.emissive = new THREE.Color(BRASS);
      clone.emissiveIntensity = 0;
      result[entry.id] = clone;
    }
    return result;
  }, [materials, interactive]);

  const objectRefs = useRef<Record<string, THREE.Mesh | null>>({});

  // Every hover/selection change needs a fresh render under
  // frameloop="demand" — this alone covers the state change itself; the
  // hover tween's own onUpdate (below) covers the ~15 frames the tween
  // animates across, which this single call would not.
  useEffect(() => {
    invalidate();
  }, [hoveredElementId, selectedElementId, invalidate]);

  useEffect(() => {
    return () => {
      for (const material of Object.values(meshMaterials)) {
        gsap.killTweensOf(material);
      }
    };
  }, [meshMaterials]);

  const handlePointerOver = (id: string) => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = "pointer";
    setHovered(id);
    gsap.to(meshMaterials[id], {
      emissiveIntensity: HOVER_EMISSIVE_INTENSITY,
      duration: DURATION.instant,
      ease: EASE_WEIGHTED,
      overwrite: true,
      onUpdate: invalidate,
    });
  };

  const handlePointerOut = (id: string) => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = "auto";
    // Only clear if this mesh is still the one on record — guards against
    // a stale pointerout racing behind a newer mesh's pointerover.
    if (useSelectionStore.getState().hoveredElementId === id) {
      clearHovered();
    }
    gsap.to(meshMaterials[id], {
      emissiveIntensity: 0,
      duration: DURATION.instant,
      ease: EASE_WEIGHTED,
      overwrite: true,
      onUpdate: invalidate,
    });
  };

  const handleClick = (id: string) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    setSelected(id);
  };

  // Reading a ref's .current during render is unsafe in general (it isn't
  // guaranteed fresh outside an effect), so the looked-up object lives in
  // real state instead, resolved from the ref map inside an effect —
  // which only ever runs after the meshes below have already committed
  // and populated objectRefs.
  const [selectedObject, setSelectedObject] = useState<THREE.Mesh | null>(null);
  useEffect(() => {
    setSelectedObject(selectedElementId ? (objectRefs.current[selectedElementId] ?? null) : null);
  }, [selectedElementId]);

  return (
    <group {...props} dispose={null}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {/* Decorative edge-line overlay traced over the whole model — a
            Sketchfab sketch-style outline pass, not real geometry, and not
            interactive. */}
        <lineSegments geometry={nodes.Material4.geometry} material={materials.edge_color646464255} />
        <lineSegments geometry={nodes.Material2_2.geometry} material={materials.edge_color646464255} />

        {MESH_ENTRIES.map((entry) => (
          <mesh
            key={entry.id}
            ref={
              interactive
                ? (el) => {
                    objectRefs.current[entry.id] = el;
                  }
                : undefined
            }
            name={entry.label}
            geometry={nodes[entry.geometry].geometry}
            material={meshMaterials[entry.id]}
            onPointerOver={interactive ? handlePointerOver(entry.id) : undefined}
            onPointerOut={interactive ? handlePointerOut(entry.id) : undefined}
            onClick={interactive ? handleClick(entry.id) : undefined}
          >
            {interactive && entry.id === hoveredElementId && (
              <HoverLabel geometry={nodes[entry.geometry].geometry} label={entry.label} />
            )}
          </mesh>
        ))}
      </group>

      {interactive && selectedObject && (
        <EffectComposer autoClear={false}>
          <Outline
            selection={[selectedObject]}
            visibleEdgeColor={BRASS}
            // xRay keeps the outline visible even when the selected mesh
            // is partly behind something else — but its hiddenEdgeColor
            // defaults to a dark red, which reads as an error state, not
            // a dimmed version of the same brass. Setting it explicitly
            // keeps "persistent brass outline" true regardless of
            // occlusion, just quieter for the hidden portion.
            hiddenEdgeColor={BRASS_DIM}
            edgeStrength={2.5}
            blur={false}
            xRay
          />
        </EffectComposer>
      )}
    </group>
  );
}

interface HoverLabelProps {
  geometry: THREE.BufferGeometry;
  label: string;
}

// Positioned at the hovered mesh's own local bounding-box centre (nested
// inside that <mesh>, so it inherits every ancestor transform for free)
// rather than the mesh's transform origin — the source file's geometry
// isn't centred on its own node, so the origin alone would put the label
// nowhere near the visible shape.
function HoverLabel({ geometry, label }: HoverLabelProps) {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const center = geometry.boundingBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();

  return (
    <Html position={center} occlude pointerEvents="none">
      {/* No drei `center` — the block is anchored by its own bottom edge
          (translate -100%) so the leader line's foot lands exactly on the
          projected point, with the label floating above it. */}
      <div className="flex -translate-x-1/2 -translate-y-full flex-col items-center">
        <span className="whitespace-nowrap bg-ground/80 px-2 py-1 font-mono text-3xs uppercase tracking-[0.18em] text-ink">
          {label}
        </span>
        <div className="h-6 w-px bg-brass" />
      </div>
    </Html>
  );
}
