/**
 * src/lib/blueprint/buildModel.ts
 *
 * The one place a PlanLayout becomes 3D. The scene is a cutaway (no
 * ceiling) so the interior is visible from above and from a walk-through.
 * Each room's floor is its own named mesh, and all walls are one mesh
 * named "Walls", so in the app they can be renamed, recoloured, commented
 * on and downloaded like any other part of an uploaded model. Categories
 * are stored under the same glTF extras key the app's own downloads use,
 * so they are recognised on import.
 */

import * as THREE from "three";
import type { MetreRect, PlanLayout } from "@/types/blueprint";
import { ATRIUM_CATEGORY_KEY } from "@/lib/exportCustomModel";

const FLOOR_THICKNESS = 0.05;
const WALL_COLOR = "#ece8e1";

/** One BufferGeometry holding a box per rectangle (24 vertices each, flat
 *  normals), spanning y0..y1. Merged by hand: thousands of separate
 *  meshes would make picking and export slow for no benefit. */
function boxesGeometry(rects: MetreRect[], y0: number, y1: number): THREE.BufferGeometry {
  const pos = new Float32Array(rects.length * 72);
  const nor = new Float32Array(rects.length * 72);
  const idx = new Uint32Array(rects.length * 36);
  let p = 0;
  let v = 0;
  let ii = 0;
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[]) => {
    for (const pt of [a, b, c, d]) {
      pos.set(pt, p);
      nor.set(n, p);
      p += 3;
    }
    idx.set([v, v + 1, v + 2, v, v + 2, v + 3], ii);
    ii += 6;
    v += 4;
  };
  for (const r of rects) {
    const { x0, z0, x1, z1 } = r;
    quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]); // top
    quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0]); // bottom
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]); // +z
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]); // -z
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]); // +x
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]); // -x
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

function makeMesh(name: string, geometry: THREE.BufferGeometry, color: string, category: string): THREE.Mesh {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 }),
  );
  mesh.name = name;
  mesh.userData[ATRIUM_CATEGORY_KEY] = category;
  return mesh;
}

export function buildPlanScene(layout: PlanLayout): THREE.Group {
  const group = new THREE.Group();
  group.name = "Blueprint";
  layout.rooms.forEach((room) => {
    group.add(
      makeMesh(room.name, boxesGeometry(room.rects, -FLOOR_THICKNESS, 0), room.color, "Finish"),
    );
  });
  group.add(makeMesh("Walls", boxesGeometry(layout.walls, 0, layout.wallHeight), WALL_COLOR, "Structural"));
  return group;
}
