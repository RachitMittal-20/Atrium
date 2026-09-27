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
import { BlueprintError, type ManualPlanSpec, type PlanLayout, type PlanPixels, type RoomMap, type WallMask } from "@/types/blueprint";
import { extractWalls } from "@/lib/blueprint/wallMask";
import { detectRooms } from "@/lib/blueprint/rooms";
import { layoutFromImage, layoutFromManual } from "@/lib/blueprint/layout";
import { buildPlanScene } from "@/lib/blueprint/buildModel";
import { ocrPlanLabels } from "@/lib/blueprint/ocr";
import { applyRoomLabels } from "@/lib/blueprint/roomLabels";

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

async function exportGlb(layout: PlanLayout, fileName: string, furniture: boolean): Promise<File> {
  const scene = buildPlanScene(layout, { furniture });
  const buffer = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: false });
  if (!(buffer instanceof ArrayBuffer)) throw new Error("GLTFExporter did not return binary data");
  return new File([buffer], fileName, { type: "model/gltf-binary" });
}

interface PixelAnalysis {
  walls: WallMask;
  roomMap: RoomMap;
  pxPerMetre: number;
}

/** Everything about the image path that is synchronous and pure: find the
 *  walls, work out the scale, find the rooms. Naming and the metre
 *  conversion are kept separate (see layoutFromPixels vs.
 *  analyzeBlueprintImage below) because OCR — the one part of naming that
 *  isn't pure or synchronous — needs this step's output as its input. */
function analyzePixels(pixels: PlanPixels, options: BlueprintOptions): PixelAnalysis {
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
  // With no stated length, guess from wall thickness but keep the result a
  // believable building (6-30 m on its longest side): a plan drawn with
  // unusually thick or thin lines would otherwise imply a 3 m or 90 m house.
  const estimated = longest / (walls.wallThickness / ASSUMED_WALL_M);
  const length = options.buildingLength ?? Math.min(30, Math.max(6, estimated));
  const pxPerMetre = longest / length;
  const roomMap = detectRooms(walls, pxPerMetre);
  return { walls, roomMap, pxPerMetre };
}

/** Pure part of the image path (also what the Node tests call) — rooms are
 *  named by size alone, the same guess used before OCR existed. */
export function layoutFromPixels(pixels: PlanPixels, options: BlueprintOptions): PlanLayout {
  const { walls, roomMap, pxPerMetre } = analyzePixels(pixels, options);
  return layoutFromImage(walls, roomMap, pxPerMetre, options.wallHeight);
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

/** OCR's own worst case — the first-ever run on a machine, downloading
 *  its ~15 MB worker/engine/language files from a CDN before recognising
 *  anything — normally finishes in well under this. Past it, something
 *  is genuinely wrong (a stalled fetch, a broken cache) rather than just
 *  slow, so analysis falls back to the size-based room-name guess instead
 *  of leaving the dialog's "Building…" button stuck with no way out. */
const OCR_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(onTimeout), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(onTimeout); },
    );
  });
}

/** Stage one of the image path: read the plan into an editable layout so
 *  the person can check and rename the rooms before any 3D is built.
 *  Rooms get the name printed on the plan when OCR can read one there —
 *  and a room OCR found two labels inside gets split into two rooms along
 *  the way, since that means the wall/room detector merged what are
 *  really separate rooms — falling back to the size-based guess for
 *  whatever OCR couldn't read (a blocked network, a hand-drawn plan with
 *  no printed text, a label OCR simply missed, or OCR simply taking too
 *  long — see OCR_TIMEOUT_MS above). */
export async function analyzeBlueprintImage(image: File, options: BlueprintOptions): Promise<PlanLayout> {
  const pixels = await readPixels(image);
  const { walls, roomMap, pxPerMetre } = analyzePixels(pixels, options);
  const regions = roomMap.rooms.map((room) => ({ x0: room.bbox[0], y0: room.bbox[1], x1: room.bbox[2], y1: room.bbox[3] }));
  const labels = await withTimeout(ocrPlanLabels(pixels, regions), OCR_TIMEOUT_MS, []);
  const { map, names } = applyRoomLabels(roomMap, labels);
  return layoutFromImage(walls, map, pxPerMetre, options.wallHeight, names);
}

/** Stage two: build and export the model from a (possibly renamed) layout. */
export async function layoutToModel(layout: PlanLayout, name: string, furniture: boolean): Promise<File> {
  const base = name.replace(/\.[^.]+$/, "") || "blueprint";
  return exportGlb(layout, `${base}-3d.glb`, furniture);
}

export async function manualPlanToModel(spec: ManualPlanSpec, furniture: boolean): Promise<File> {
  return exportGlb(layoutFromManual(spec), "manual-plan-3d.glb", furniture);
}

/** Exposed for the dialog's live 2D preview. */
export { layoutFromManual };
