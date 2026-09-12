/**
 * src/components/three/BuildingModel.tsx
 *
 * The apartment model used throughout ATRIUM's 3D scene. Loads
 * public/models/apartment.glb (Draco + WebP optimised — see
 * docs/ASSETS.md for source, license and the optimisation pipeline) via
 * drei's useGLTF and renders every mesh in it individually, rather than as
 * one opaque group, so a parent can attach hover/selection behaviour to a
 * specific piece of the apartment (the sofa, a window, the kitchen
 * counter) instead of the model as a whole.
 *
 * Started from `gltfjsx public/models/apartment.glb --types` and rewritten
 * by hand: the raw export names every mesh after its material
 * ("Material3_17", "auto_25", ...), which is meaningless to a reader. Every
 * binding below is renamed to what that piece actually is, identified by
 * inspecting each mesh's bounding box (size, position, flatness) and its
 * baseColor texture image. A few very small, purely decorative fixtures
 * are named generically (e.g. "Cabinet Knob") where the geometry is too
 * small to be visually distinctive from its texture alone — that's an
 * honest gap, not a guess dressed up as a fact. The generated type was
 * also missing two node keys the generated JSX actually used
 * (Material2_2, Material4) — added below.
 *
 * Props: onMeshPointerOver / onMeshPointerOut / onMeshClick are factories
 * — given a mesh's semantic name, each returns the actual R3F event
 * handler for that mesh. This lets a parent (the scene, an inspector
 * panel) wire hover and selection to individual meshes without this
 * component needing to know anything about what hovering or selecting
 * means.
 *
 * Preloading is handled by src/lib/assets.ts (imported for MODEL_PATH
 * below), not here — that starts the fetch the moment the app boots,
 * rather than waiting for this component to mount.
 */
"use client";

import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { GLTF } from "three-stdlib";
import type { ThreeElements, ThreeEvent } from "@react-three/fiber";
import { MODEL_PATH } from "@/lib/assets";

type GLTFResult = GLTF & {
  nodes: {
    // Building envelope + the one freestanding object sharing its mesh.
    Material2: THREE.Mesh;
    Material2_1: THREE.Mesh;
    Material2_2: THREE.Mesh;
    Material2_3: THREE.Mesh;
    // The 40 individually-modelled interior pieces (furniture, fixtures,
    // architecture) — see the render below for what each one is.
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
    // The full-model decorative edge-line overlay (a Sketchfab sketch-style
    // outline pass, not real architecture).
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

type BuildingModelProps = ThreeElements["group"] & {
  /** Given a mesh's semantic name, returns its onPointerOver handler. */
  onMeshPointerOver?: (name: string) => (event: ThreeEvent<PointerEvent>) => void;
  /** Given a mesh's semantic name, returns its onPointerOut handler. */
  onMeshPointerOut?: (name: string) => (event: ThreeEvent<PointerEvent>) => void;
  /** Given a mesh's semantic name, returns its onClick (selection) handler. */
  onMeshClick?: (name: string) => (event: ThreeEvent<MouseEvent>) => void;
};

export function BuildingModel(props: BuildingModelProps) {
  const { onMeshPointerOver, onMeshPointerOut, onMeshClick, ...groupProps } = props;
  const { nodes, materials } = useGLTF(MODEL_PATH) as unknown as GLTFResult;

  // A small helper so every <mesh> below only has to name itself once —
  // the pointer/click wiring is identical for all of them.
  const meshEvents = (name: string) => ({
    name,
    onPointerOver: onMeshPointerOver?.(name),
    onPointerOut: onMeshPointerOut?.(name),
    onClick: onMeshClick?.(name),
  });

  return (
    <group {...groupProps} dispose={null}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {/* Decorative edge-line overlay traced over the whole model — a
            Sketchfab sketch-style outline pass, not real geometry. */}
        <lineSegments geometry={nodes.Material4.geometry} material={materials.edge_color646464255} {...meshEvents("Edge Outline Overlay")} />
        <lineSegments geometry={nodes.Material2_2.geometry} material={materials.edge_color646464255} {...meshEvents("Edge Outline Detail")} />

        {/* Building envelope: the apartment's outer shell, spanning the
            full footprint at partial and full height. */}
        <mesh geometry={nodes.Material2.geometry} material={materials.material_1} {...meshEvents("Building Shell — Lower Envelope")} />
        <mesh geometry={nodes.Material2_1.geometry} material={materials.material_1} {...meshEvents("Building Shell — Full-Height Envelope")} />

        {/* Freestanding object sharing the envelope's mesh group. */}
        <mesh geometry={nodes.Material2_3.geometry} material={materials.auto} {...meshEvents("Floor Lamp")} />

        {/* Architecture: walls, floor, ceiling, openings. */}
        <mesh geometry={nodes.Material3.geometry} material={materials.auto_1} {...meshEvents("Accent Wall Panel")} />
        <mesh geometry={nodes.Material3_5.geometry} material={materials.auto_5} {...meshEvents("Feature Wall (Block Tile)")} />
        <mesh geometry={nodes.Material3_13.geometry} material={materials.auto_16} {...meshEvents("Interior Wall (Painted)")} />
        <mesh geometry={nodes.Material3_16.geometry} material={materials.auto_23} {...meshEvents("Interior Wall Section")} />
        <mesh geometry={nodes.Material3_18.geometry} material={materials.auto_24} {...meshEvents("Facade Wall (Flat Panel)")} />
        <mesh geometry={nodes.Material3_33.geometry} material={materials.auto_45} {...meshEvents("Interior Wall (Secondary Surface)")} />
        <mesh geometry={nodes.Material3_26.geometry} material={materials.auto_35} {...meshEvents("Floor")} />
        <mesh geometry={nodes.Material3_35.geometry} material={materials.auto_48} {...meshEvents("Ceiling Section")} />
        <mesh geometry={nodes.Material3_38.geometry} material={materials.auto_54} {...meshEvents("Ceiling")} />
        <mesh geometry={nodes.Material3_24.geometry} material={materials.auto_33} {...meshEvents("Interior Door")} />
        <mesh geometry={nodes.Material3_6.geometry} material={materials.auto_7} {...meshEvents("Window Glass Pane")} />
        <mesh geometry={nodes.Material3_31.geometry} material={materials.auto_41} {...meshEvents("Window Glass Pane (Large)")} />
        <mesh geometry={nodes.Material3_32.geometry} material={materials.auto_43} {...meshEvents("Window Frame (Vertical)")} />
        <mesh geometry={nodes.Material3_9.geometry} material={materials.auto_11} {...meshEvents("Door Frame Trim")} />
        <mesh geometry={nodes.Material3_7.geometry} material={materials.auto_8} {...meshEvents("Baseboard / Skirting Board")} />
        <mesh geometry={nodes.Material3_11.geometry} material={materials.auto_12} {...meshEvents("Shelf Edge Trim")} />
        <mesh geometry={nodes.Material3_27.geometry} material={materials.auto_38} {...meshEvents("Vertical Trim / Column")} />

        {/* Kitchen. */}
        <mesh geometry={nodes.Material3_2.geometry} material={materials.auto_3} {...meshEvents("Kitchen Countertop (Black Granite)")} />
        <mesh geometry={nodes.Material3_3.geometry} material={materials.auto_6} {...meshEvents("Kitchen Appliances (Oven / Range)")} />

        {/* Furniture + soft furnishing. */}
        <mesh geometry={nodes.Material3_1.geometry} material={materials.auto_2} {...meshEvents("Media Console / Low Cabinet")} />
        <mesh geometry={nodes.Material3_8.geometry} material={materials.auto_9} {...meshEvents("Wooden Shelf with Décor")} />
        <mesh geometry={nodes.Material3_19.geometry} material={materials.auto_25} {...meshEvents("Bookshelf")} />
        <mesh geometry={nodes.Material3_29.geometry} material={materials.auto_39} {...meshEvents("Sofa")} />
        <mesh geometry={nodes.Material3_37.geometry} material={materials.auto_51} {...meshEvents("Coffee Table Top")} />
        <mesh geometry={nodes.Material3_39.geometry} material={materials.auto_55} {...meshEvents("Small Tray / Side Table")} />
        <mesh geometry={nodes.Material3_23.geometry} material={materials.auto_30} {...meshEvents("Shelf / Counter Ledge")} />
        <mesh geometry={nodes.Material3_25.geometry} material={materials.auto_34} {...meshEvents("Framed Mirror")} />
        <mesh geometry={nodes.Material3_22.geometry} material={materials.auto_29} {...meshEvents("Potted Plant")} />
        <mesh geometry={nodes.Material3_28.geometry} material={materials.auto_37} {...meshEvents("Area Rug")} />

        {/* Lighting + curtains. */}
        <mesh geometry={nodes.Material3_12.geometry} material={materials.auto_14} {...meshEvents("Curtain Panel")} />
        <mesh geometry={nodes.Material3_14.geometry} material={materials.auto_18} {...meshEvents("Curtain Tieback Cord")} />
        <mesh geometry={nodes.Material3_21.geometry} material={materials.auto_28} {...meshEvents("Curtain Panel (Sheer)")} />
        <mesh geometry={nodes.Material3_34.geometry} material={materials.auto_47} {...meshEvents("Lamp Shade")} />
        <mesh geometry={nodes.Material3_15.geometry} material={materials.auto_20} {...meshEvents("Table Lamp Base")} />

        {/* Small fixtures and hardware — geometry too small to visually
            distinguish beyond "a fitting", identified only by context. */}
        <mesh geometry={nodes.Material3_4.geometry} material={materials.auto_4} {...meshEvents("Cabinet Handle")} />
        <mesh geometry={nodes.Material3_10.geometry} material={materials.auto_10} {...meshEvents("Cabinet Knob")} />
        <mesh geometry={nodes.Material3_17.geometry} material={materials.auto_22} {...meshEvents("Door / Cabinet Handle")} />
        <mesh geometry={nodes.Material3_20.geometry} material={materials.auto_27} {...meshEvents("Small Wall Fixture")} />
        <mesh geometry={nodes.Material3_30.geometry} material={materials.auto_40} {...meshEvents("Cabinet Knob")} />
        <mesh geometry={nodes.Material3_36.geometry} material={materials.auto_49} {...meshEvents("Decorative Object")} />
      </group>
    </group>
  );
}
