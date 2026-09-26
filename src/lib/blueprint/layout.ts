/**
 * src/lib/blueprint/layout.ts
 *
 * Turns either input — the analysed image (wall mask + room map) or the
 * manual form — into a PlanLayout in metres. No geometry here; see
 * buildModel.ts for that.
 */

import {
  BlueprintError,
  type ManualPlanSpec,
  type ManualRoomSpec,
  type MetreRect,
  type PixelRect,
  type PlanLayout,
  type PlanRoom,
  type RoomMap,
  type WallMask,
} from "@/types/blueprint";

/** Warm, muted floor colours handed out to rooms in order. */
export const ROOM_COLORS = [
  "#d9c2a0", "#c9d3b5", "#b9cbd6", "#e0c1b3", "#d3c4de", "#e6d9a8",
  "#bfd8cf", "#dcb9a0", "#c6c6b0", "#d8b8c4",
];
export const roomColor = (index: number): string => ROOM_COLORS[index % ROOM_COLORS.length];

/**
 * Decomposes a set of pixels into rectangles by merging horizontal runs
 * that line up (within `tol` pixels) with the run directly above. `tol`
 * absorbs the 1-2 px ragged edges of a scanned or anti-aliased plan, so
 * a wall becomes a handful of boxes rather than hundreds.
 */
export function maskToRects(
  width: number,
  height: number,
  isSet: (index: number) => boolean,
  tol: number,
  bounds?: PixelRect,
): PixelRect[] {
  const bx0 = bounds?.x0 ?? 0;
  const by0 = bounds?.y0 ?? 0;
  const bx1 = bounds?.x1 ?? width;
  const by1 = bounds?.y1 ?? height;
  const done: PixelRect[] = [];
  let active: PixelRect[] = [];
  for (let y = by0; y < by1; y++) {
    const next: PixelRect[] = [];
    const claimed = new Set<PixelRect>();
    let x = bx0;
    while (x < bx1) {
      if (!isSet(y * width + x)) { x++; continue; }
      const start = x;
      while (x < bx1 && isSet(y * width + x)) x++;
      const match = active.find(
        (r) => !claimed.has(r) && r.y1 === y && Math.abs(r.x0 - start) <= tol && Math.abs(r.x1 - x) <= tol,
      );
      if (match) {
        claimed.add(match);
        match.x0 = Math.min(match.x0, start);
        match.x1 = Math.max(match.x1, x);
        match.y1 = y + 1;
        next.push(match);
      } else {
        next.push({ x0: start, y0: y, x1: x, y1: y + 1 });
      }
    }
    for (const r of active) if (!claimed.has(r)) done.push(r);
    active = next;
  }
  return done.concat(active);
}

/** Layout from an analysed image. `pxPerMetre` is the real-world scale. */
export function layoutFromImage(
  walls: WallMask,
  roomMap: RoomMap,
  pxPerMetre: number,
  wallHeight: number,
): PlanLayout {
  const { width, height, mask } = walls;

  // The building footprint = bounding box of all wall pixels. Floors are
  // clipped to it so they don't spill out through window gaps.
  let fx0 = width, fy0 = height, fx1 = 0, fy1 = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % width;
    const y = (i - x) / width;
    if (x < fx0) fx0 = x;
    if (x + 1 > fx1) fx1 = x + 1;
    if (y < fy0) fy0 = y;
    if (y + 1 > fy1) fy1 = y + 1;
  }
  if (fx1 <= fx0) throw new BlueprintError("No walls were found in this image.");

  const tol = Math.max(1, Math.round(walls.wallThickness * 0.15));
  const cx = (fx0 + fx1) / 2;
  const cy = (fy0 + fy1) / 2;
  const toMetres = (r: PixelRect): MetreRect => ({
    x0: (r.x0 - cx) / pxPerMetre,
    z0: (r.y0 - cy) / pxPerMetre,
    x1: (r.x1 - cx) / pxPerMetre,
    z1: (r.y1 - cy) / pxPerMetre,
  });

  const wallRects = maskToRects(width, height, (i) => mask[i] === 1, tol).map(toMetres);

  const rooms: PlanRoom[] = roomMap.rooms.map((room, idx) => {
    const [bx0, by0, bx1, by1] = room.bbox;
    const rects = maskToRects(
      width,
      height,
      (i) => roomMap.labels[i] === room.id,
      Math.max(2, tol * 2),
      { x0: Math.max(bx0, fx0), y0: Math.max(by0, fy0), x1: Math.min(bx1, fx1), y1: Math.min(by1, fy1) },
    ).map(toMetres);
    return { name: `Room ${room.id}`, color: roomColor(idx), rects };
  });

  return { wallHeight, walls: wallRects, rooms: rooms.filter((r) => r.rects.length > 0) };
}

// ---------------------------------------------------------------- manual

const DOOR_WIDTH = 0.9;
const EDGE_KEY = 100; // centimetre resolution for matching shared edges

interface Interval { a: number; b: number }

function union(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((p, q) => p.a - q.a);
  const out: Interval[] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && it.a <= last.b + 1e-6) last.b = Math.max(last.b, it.b);
    else out.push({ a: it.a, b: it.b });
  }
  return out;
}

function subtract(intervals: Interval[], cuts: Interval[]): Interval[] {
  let result = intervals;
  for (const c of cuts) {
    const next: Interval[] = [];
    for (const it of result) {
      if (c.b <= it.a || c.a >= it.b) { next.push(it); continue; }
      if (c.a > it.a) next.push({ a: it.a, b: c.a });
      if (c.b < it.b) next.push({ a: c.b, b: it.b });
    }
    result = next;
  }
  return result;
}

/** Where each manual room ends up, in metres (first room at the origin). */
export function placeManualRooms(rooms: ManualRoomSpec[]): MetreRect[] {
  const placed: MetreRect[] = [];
  rooms.forEach((room, i) => {
    let x = 0;
    let z = 0;
    const prev = placed[i - 1];
    if (i > 0 && room.placement === "right" && prev) { x = prev.x1; z = prev.z0; }
    else if (i > 0 && room.placement === "below" && prev) { x = prev.x0; z = prev.z1; }
    else if (i > 0) { x = room.x; z = room.z; }
    placed.push({ x0: x, z0: z, x1: x + room.width, z1: z + room.depth });
  });
  return placed;
}

/** Layout from the manual form: rooms are rectangles, walls run along
 *  every room's edges (shared edges become one wall), doorways are cut. */
export function layoutFromManual(spec: ManualPlanSpec): PlanLayout {
  if (spec.rooms.length === 0) throw new BlueprintError("Add at least one room.");
  for (const r of spec.rooms) {
    if (!(r.width >= 1 && r.depth >= 1)) {
      throw new BlueprintError(`"${r.name || "A room"}" needs a width and depth of at least 1 m.`);
    }
  }
  const t = spec.wallThickness;
  const placed = placeManualRooms(spec.rooms);
  const key = (v: number) => Math.round(v * EDGE_KEY);

  // Horizontal lines are keyed by z, vertical by x; each holds intervals.
  const horiz = new Map<number, Interval[]>();
  const vert = new Map<number, Interval[]>();
  const horizCuts = new Map<number, Interval[]>();
  const vertCuts = new Map<number, Interval[]>();
  const add = (m: Map<number, Interval[]>, line: number, a: number, b: number) => {
    const k = key(line);
    const list = m.get(k) ?? [];
    list.push({ a, b });
    m.set(k, list);
  };

  placed.forEach((r, i) => {
    // Extended by half a wall thickness so corners and T-joins close up.
    add(horiz, r.z0, r.x0 - t / 2, r.x1 + t / 2);
    add(horiz, r.z1, r.x0 - t / 2, r.x1 + t / 2);
    add(vert, r.x0, r.z0 - t / 2, r.z1 + t / 2);
    add(vert, r.x1, r.z0 - t / 2, r.z1 + t / 2);

    const door = spec.rooms[i].door;
    if (door === "none") return;
    const horizontalSide = door === "north" || door === "south";
    const len = horizontalSide ? r.x1 - r.x0 : r.z1 - r.z0;
    if (len < DOOR_WIDTH + 0.4) return;
    const mid = horizontalSide ? (r.x0 + r.x1) / 2 : (r.z0 + r.z1) / 2;
    const cut = { a: mid - DOOR_WIDTH / 2, b: mid + DOOR_WIDTH / 2 };
    if (door === "north") add(horizCuts, r.z0, cut.a, cut.b);
    else if (door === "south") add(horizCuts, r.z1, cut.a, cut.b);
    else if (door === "west") add(vertCuts, r.x0, cut.a, cut.b);
    else add(vertCuts, r.x1, cut.a, cut.b);
  });

  const walls: MetreRect[] = [];
  for (const [k, list] of horiz) {
    const z = k / EDGE_KEY;
    for (const it of subtract(union(list), horizCuts.get(k) ?? [])) {
      walls.push({ x0: it.a, z0: z - t / 2, x1: it.b, z1: z + t / 2 });
    }
  }
  for (const [k, list] of vert) {
    const x = k / EDGE_KEY;
    for (const it of subtract(union(list), vertCuts.get(k) ?? [])) {
      walls.push({ x0: x - t / 2, z0: it.a, x1: x + t / 2, z1: it.b });
    }
  }

  // Centre the whole plan on the origin.
  const minX = Math.min(...placed.map((r) => r.x0));
  const maxX = Math.max(...placed.map((r) => r.x1));
  const minZ = Math.min(...placed.map((r) => r.z0));
  const maxZ = Math.max(...placed.map((r) => r.z1));
  const ox = (minX + maxX) / 2;
  const oz = (minZ + maxZ) / 2;
  const shift = (r: MetreRect): MetreRect => ({ x0: r.x0 - ox, z0: r.z0 - oz, x1: r.x1 - ox, z1: r.z1 - oz });

  const rooms: PlanRoom[] = placed.map((r, i) => ({
    name: spec.rooms[i].name.trim() || `Room ${i + 1}`,
    color: roomColor(i),
    rects: [shift(r)],
  }));
  return { wallHeight: spec.wallHeight, walls: walls.map(shift), rooms };
}
