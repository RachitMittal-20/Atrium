/**
 * src/lib/blueprintToModel.ts
 *
 * The orchestrator the UI calls. Both entry points return a .glb File
 * that goes straight into the same path a "Try your own model" upload
 * takes (upload -> setCustomModel -> /project), which is why colours,
 * comments, renaming, download and sharing all work on a generated model
 * with no extra code.
 */

import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { BlueprintError, type ManualPlanSpec, type PlanLayout, type PlanPixels } from "@/types/blueprint";
import { extractWalls } from "@/lib/blueprint/wallMask";
import { detectRooms } from "@/lib/blueprint/rooms";
import { layoutFromImage, layoutFromManual } from "@/lib/blueprint/layout";
import { buildPlanScene } from "@/lib/blueprint/buildModel";

/** Longest image side we analyse; bigger plans are downscaled first. */
const MAX_SIDE = 1400;
/** With no stated size, the dominant (exterior) wall is assumed to be this
 *  thick in real life — typical for masonry/cavity walls — and everything
 *  else is scaled from that. A rough estimate; stating the real length is
 *  always more exact. */
const ASSUMED_WALL_M = 0.23;

export interface BlueprintOptions {
  /** Real-world length of the building's longest side in the image, metres.
   *  Omit to let Atrium estimate the scale itself (see ASSUMED_WALL_M). */
  buildingLength?: number;
  wallHeight: number;
}

async function exportGlb(layout: PlanLayout, fileName: string): Promise<File> {
  const scene = buildPlanScene(layout);
  const buffer = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: false });
  if (!(buffer instanceof ArrayBuffer)) throw new Error("GLTFExporter did not return binary data");
  return new File([buffer], fileName, { type: "model/gltf-binary" });
}

/** Pure part of the image path (also what the Node tests call). */
export function layoutFromPixels(pixels: PlanPixels, options: BlueprintOptions): PlanLayout {
  const walls = extractWalls(pixels);
  // Scale: the wall bounding box's longest side equals the stated length.
  let x0 = walls.width, y0 = walls.height, x1 = 0, y1 = 0;
  for (let i = 0; i < walls.mask.length; i++) {
    if (!walls.mask[i]) continue;
    const x = i % walls.width;
    const y = (i - x) / walls.width;
    if (x < x0) x0 = x;
    if (x + 1 > x1) x1 = x + 1;
    if (y < y0) y0 = y;
    if (y + 1 > y1) y1 = y + 1;
  }
  const longest = Math.max(x1 - x0, y1 - y0);
  const pxPerMetre = options.buildingLength
    ? longest / options.buildingLength
    : walls.wallThickness / ASSUMED_WALL_M;
  const rooms = detectRooms(walls, pxPerMetre);
  return layoutFromImage(walls, rooms, pxPerMetre, options.wallHeight);
}

async function readPixels(file: File): Promise<PlanPixels> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new BlueprintError("That file couldn't be read as an image. Use a PNG or JPG of the floor plan.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.fillStyle = "#ffffff"; // flatten transparency onto paper
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { width, height, rgba: ctx.getImageData(0, 0, width, height).data };
}

export async function blueprintImageToModel(image: File, options: BlueprintOptions): Promise<File> {
  const pixels = await readPixels(image);
  const layout = layoutFromPixels(pixels, options);
  const base = image.name.replace(/\.[^.]+$/, "") || "blueprint";
  return exportGlb(layout, `${base}-3d.glb`);
}

export async function manualPlanToModel(spec: ManualPlanSpec, name = "manual-plan"): Promise<File> {
  return exportGlb(layoutFromManual(spec), `${name}-3d.glb`);
}

/** Exposed for the dialog's live 2D preview. */
export { layoutFromManual };
