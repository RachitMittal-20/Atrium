/**
 * src/lib/blueprint/furniture.ts
 *
 * Fills rooms with furniture at real-world sizes. Every piece is built
 * procedurally from coloured boxes (blocky, not photoreal) at standard
 * measurements — queen bed 1.6 x 2.0 m, sofa 2.0 x 0.9 m, dining chair
 * 0.45 m, kitchen counter 0.6 m deep and 0.9 m high, and so on — so the
 * sizes are exact even though the shapes are simple. That was chosen over
 * bundling downloaded models: a few KB instead of tens of MB, no
 * licensing to track, and each piece stays one recolourable mesh.
 *
 * Pieces are authored in a local frame (centred on x/z, back at -z, front
 * facing +z), then turned to face the way the room needs and dropped at a
 * spot chosen by simple layout rules: against a wall that is really
 * solid (so nothing is pushed across a doorway), never overlapping
 * another piece, always inside the room.
 */

import type {
  FurnitureBox,
  FurnitureItem,
  MetreRect,
  PlanLayout,
  PlanRoom,
  RoomKind,
} from "@/types/blueprint";

// ------------------------------------------------------------ room kinds

/** Reads the room's purpose off its name ("Master bedroom" -> bedroom). */
export function roomKindFromName(name: string): RoomKind {
  const n = name.toLowerCase();
  if (/bath|toilet|\bwc\b|washroom|restroom|lavatory|shower/.test(n)) return "bathroom";
  if (/bed|master|primary|guest|nursery|kids?\b/.test(n)) return "bedroom";
  if (/kitchen|pantry|kitchenette/.test(n)) return "kitchen";
  if (/dining/.test(n)) return "dining";
  if (/living|lounge|drawing|family|sitting/.test(n)) return "living";
  if (/study|office|work|library/.test(n)) return "study";
  return "other";
}

const rectArea = (r: MetreRect) => (r.x1 - r.x0) * (r.z1 - r.z0);

/** Best-guess names for rooms read from an image (which has no labels):
 *  the biggest room is the living room, small ones bathrooms, mid-sized
 *  the kitchen, the rest bedrooms. Only a starting point — the dialog
 *  lets the person rename every room before the model is built. */
export function guessRoomNames(rooms: PlanRoom[]): string[] {
  const areas = rooms.map((r) => r.rects.reduce((sum, rect) => sum + rectArea(rect), 0));
  const names: string[] = new Array(rooms.length).fill("");
  // Long thin rooms are corridors: no furniture, and not counted as rooms
  // when deciding which is the living room.
  const isHall = rooms.map((room) => {
    const x0 = Math.min(...room.rects.map((r) => r.x0));
    const x1 = Math.max(...room.rects.map((r) => r.x1));
    const z0 = Math.min(...room.rects.map((r) => r.z0));
    const z1 = Math.max(...room.rects.map((r) => r.z1));
    return Math.max(x1 - x0, z1 - z0) / Math.max(0.1, Math.min(x1 - x0, z1 - z0)) >= 2.3;
  });
  const order = areas.map((_, i) => i).filter((i) => !isHall[i]).sort((a, b) => areas[b] - areas[a]);
  let bedrooms = 0;
  let baths = 0;
  let kitchenUsed = false;
  isHall.forEach((hall, i) => { if (hall) names[i] = "Hallway"; });
  order.forEach((idx, rank) => {
    const a = areas[idx];
    if (rank === 0) names[idx] = "Living room";
    else if (a < 6) names[idx] = `Bathroom${++baths > 1 ? ` ${baths}` : ""}`;
    else if (a < 12 && !kitchenUsed) {
      kitchenUsed = true;
      names[idx] = "Kitchen";
    } else names[idx] = `Bedroom ${++bedrooms}`;
  });
  return names;
}

// ------------------------------------------------------------ box helpers

const WOOD = "#8a6a4a";
const LIGHT_WOOD = "#b8a184";
const WHITE = "#f1eee8";
const FABRIC = "#6f7f8f";
const FABRIC_LIGHT = "#8195a6";
const DARK = "#2b2d30";

/** A box centred on x/z (width w, depth d), from y0 to y1, at offset. */
function box(w: number, d: number, y0: number, y1: number, color: string, ox = 0, oz = 0): FurnitureBox {
  return { x0: ox - w / 2, x1: ox + w / 2, y0, y1, z0: oz - d / 2, z1: oz + d / 2, color };
}

type Piece = FurnitureBox[];

function bed(w: number, d: number): Piece {
  const b: Piece = [];
  b.push(box(w, d, 0.1, 0.35, WOOD)); // frame
  b.push(box(w - 0.06, d - 0.06, 0.35, 0.55, "#e6e1d8", 0, 0.0)); // mattress
  b.push(box(w, 0.08, 0, 1.05, WOOD, 0, -d / 2 + 0.04)); // headboard
  const pw = (w - 0.2) / (w > 1.2 ? 2 : 1);
  if (w > 1.2) {
    b.push(box(pw - 0.05, 0.4, 0.55, 0.66, WHITE, -pw / 2 - 0.02, -d / 2 + 0.35));
    b.push(box(pw - 0.05, 0.4, 0.55, 0.66, WHITE, pw / 2 + 0.02, -d / 2 + 0.35));
  } else b.push(box(pw, 0.4, 0.55, 0.66, WHITE, 0, -d / 2 + 0.35));
  b.push(box(w - 0.1, d * 0.55, 0.55, 0.59, "#7d8fa3", 0, d * 0.2)); // blanket
  return b;
}

function nightstand(w: number, d: number): Piece {
  return [box(w, d, 0, 0.5, WOOD), box(w - 0.06, 0.02, 0.28, 0.42, "#6f543a", 0, d / 2)];
}

function wardrobe(w: number, d: number): Piece {
  const p: Piece = [box(w, d, 0, 2.1, LIGHT_WOOD)];
  p.push(box(0.02, 0.02, 0.9, 1.3, DARK, -0.06, d / 2)); // door handles
  p.push(box(0.02, 0.02, 0.9, 1.3, DARK, 0.06, d / 2));
  return p;
}

function sofa(w: number, d: number): Piece {
  const arm = 0.2;
  return [
    box(w, d, 0.0, 0.4, "#5d6c7a"), // base
    box(w - 2 * arm, d - 0.22, 0.4, 0.52, FABRIC_LIGHT, 0, 0.11), // seat cushions
    box(w, 0.22, 0.4, 0.88, FABRIC, 0, -d / 2 + 0.11), // backrest
    box(arm, d - 0.22, 0.4, 0.66, FABRIC, -w / 2 + arm / 2, 0.11), // arms
    box(arm, d - 0.22, 0.4, 0.66, FABRIC, w / 2 - arm / 2, 0.11),
  ];
}

function armchair(w: number, d: number): Piece {
  return sofa(w, d);
}

function coffeeTable(w: number, d: number): Piece {
  const p: Piece = [box(w, d, 0.36, 0.42, WOOD)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(box(0.05, 0.05, 0, 0.36, "#6f543a", sx * (w / 2 - 0.05), sz * (d / 2 - 0.05)));
  return p;
}

function tvUnit(w: number, d: number): Piece {
  return [box(w, d, 0, 0.45, "#4a4038"), box(w * 0.72, 0.05, 0.55, 1.05, "#15171a", 0, 0.0), box(0.3, 0.04, 0.45, 0.55, DARK, 0, 0)];
}

function diningTable(w: number, d: number): Piece {
  const p: Piece = [box(w, d, 0.72, 0.77, WOOD)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(box(0.07, 0.07, 0, 0.72, "#6f543a", sx * (w / 2 - 0.08), sz * (d / 2 - 0.08)));
  return p;
}

function chair(): Piece {
  const s = 0.45;
  const p: Piece = [box(s, s, 0.42, 0.46, WOOD), box(s, 0.04, 0.46, 0.9, WOOD, 0, -s / 2 + 0.02)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(box(0.04, 0.04, 0, 0.42, "#6f543a", sx * (s / 2 - 0.03), sz * (s / 2 - 0.03)));
  return p;
}

function counter(w: number, d: number): Piece {
  const p: Piece = [box(w, d, 0, 0.85, "#dcd6cb"), box(w, d + 0.02, 0.85, 0.9, "#4d4f52", 0, 0.01)];
  // Hob near one end, sink near the other, so even a short run reads as a
  // real kitchen counter rather than a bare slab.
  const hobX = -w / 2 + Math.min(0.6, w * 0.28);
  for (const dx of [-0.13, 0.13]) for (const dz of [-0.13, 0.13]) p.push(box(0.16, 0.16, 0.9, 0.92, DARK, hobX + dx, dz));
  const sinkW = Math.min(0.5, w * 0.3);
  p.push(box(sinkW, 0.4, 0.88, 0.9, "#b8bcc0", w / 2 - sinkW / 2 - 0.1, 0));
  return p;
}

function fridge(w: number, d: number): Piece {
  return [box(w, d, 0, 1.8, "#cfd3d6"), box(0.02, 0.02, 1.0, 1.5, "#8b9099", w / 2 - 0.08, d / 2), box(w - 0.04, 0.01, 1.2, 1.21, "#a9aeb3", 0, d / 2)];
}

function toilet(): Piece {
  return [box(0.38, 0.2, 0, 0.78, WHITE, 0, -0.25), box(0.36, 0.45, 0, 0.4, WHITE, 0, 0.12), box(0.34, 0.4, 0.4, 0.43, "#e3dfd6", 0, 0.12)];
}

function vanity(w: number, d: number): Piece {
  return [box(w, d, 0, 0.8, "#c9c2b6"), box(w, d, 0.8, 0.85, WHITE), box(0.4, 0.3, 0.85, 0.87, "#bfc4c8", 0, 0.02), box(0.06, 0.08, 0.87, 1.0, "#a9aeb3", 0, -d / 2 + 0.1)];
}

function bathtub(w: number, d: number): Piece {
  const t = 0.06;
  return [
    box(w, d, 0, 0.1, WHITE), // base
    box(w, t, 0.1, 0.55, WHITE, 0, -d / 2 + t / 2),
    box(w, t, 0.1, 0.55, WHITE, 0, d / 2 - t / 2),
    box(t, d - 2 * t, 0.1, 0.55, WHITE, -w / 2 + t / 2),
    box(t, d - 2 * t, 0.1, 0.55, WHITE, w / 2 - t / 2),
  ];
}

function desk(w: number, d: number): Piece {
  const p: Piece = [box(w, d, 0.72, 0.76, LIGHT_WOOD)];
  p.push(box(0.04, d - 0.06, 0, 0.72, WOOD, -w / 2 + 0.04));
  p.push(box(0.04, d - 0.06, 0, 0.72, WOOD, w / 2 - 0.04));
  return p;
}

function bookshelf(w: number, d: number): Piece {
  return [box(w, d, 0, 1.9, WOOD), box(w - 0.06, 0.02, 0.1, 1.85, "#4a3a2a", 0, d / 2 - 0.01)];
}

function island(w: number, d: number): Piece {
  return [box(w, d, 0, 0.9, "#dcd6cb"), box(w + 0.04, d + 0.04, 0.9, 0.95, "#4d4f52")];
}

/** A plain counter slab with no hob or sink built in — used for a second,
 *  perpendicular run of counter (see furnishKitchen's L shape), which
 *  gets its own separate Double sink piece instead. */
function counterSlab(w: number, d: number): Piece {
  return [box(w, d, 0, 0.85, "#dcd6cb"), box(w, d + 0.02, 0.85, 0.9, "#4d4f52", 0, 0.01)];
}

/** A freestanding range, for a kitchen big enough that the hob built into
 *  its main counter (see counter() above) isn't the only cooking surface. */
function stove(w: number, d: number): Piece {
  const p: Piece = [box(w, d, 0, 0.9, "#3a3c40"), box(w - 0.06, d - 0.06, 0.9, 0.92, "#1b1c1e")];
  for (const dx of [-w / 4, w / 4]) for (const dz of [-d / 4, d / 4]) p.push(box(0.14, 0.14, 0.92, 0.94, DARK, dx, dz));
  p.push(box(w - 0.1, 0.02, 0.3, 0.5, "#55585c", 0, d / 2 - 0.02)); // oven door
  return p;
}

/** A wider double basin, set into whatever counter it's placed on — the
 *  "big wash basin" a kitchen this size would actually have, distinct
 *  from the small sink counter() already builds into a compact run. */
function doubleSink(w: number, d: number): Piece {
  const p: Piece = [box(w, d, 0.82, 0.9, "#dcd6cb")];
  const basinW = w / 2 - 0.08;
  for (const sx of [-1, 1]) p.push(box(basinW, d - 0.1, 0.76, 0.88, "#b8bcc0", sx * (basinW / 2 + 0.04)));
  p.push(box(0.03, 0.03, 0.88, 1.1, "#a9aeb3", 0, -d / 2 + 0.08)); // faucet
  return p;
}

/** A front-loading washing machine — common in a combined bathroom /
 *  utility room like a "Bathroom 1" that also does laundry. */
function washingMachine(w: number, d: number): Piece {
  return [
    box(w, d, 0, 0.85, "#e7e5e0"),
    box(Math.min(w, d) * 0.6, 0.02, 0.2, 0.75, "#b9c4cc", 0, d / 2 - 0.01), // door porthole, front-facing
    box(w - 0.06, 0.02, 0.78, 0.8, "#cfd2d4", 0, d / 2 - 0.02), // control panel
  ];
}

/** A potted plant: a pot plus two overlapping clumps of foliage so it
 *  doesn't read as a single flat-topped cube. */
function plant(): Piece {
  const potH = 0.35;
  return [
    box(0.32, 0.32, 0, potH, "#7a5c42"),
    box(0.5, 0.5, potH, potH + 0.55, "#4c6b3f"),
    box(0.28, 0.28, potH + 0.4, potH + 0.9, "#5c7d4c"),
  ];
}

/** A rug: a thin flat pad, meant to sit under a seating group rather than
 *  stand beside it — placed with RoomPlacer's placeOverlap, not placeAt. */
function rug(w: number, d: number): Piece {
  return [box(w, d, 0.001, 0.015, "#9c8468")];
}

/** A slim wall-mounted screen with no cabinet stand — a bedroom TV, where
 *  the living room's tvUnit's low stand would run into the bed. */
function wallTv(w: number): Piece {
  return [box(w, 0.05, 1.05, 1.55, "#15171a")];
}

// ------------------------------------------------------------- placement

type Side = "N" | "E" | "S" | "W";
type Rot = 0 | 90 | 180 | 270;

const SIDE_ROT: Record<Side, Rot> = { N: 0, W: 90, S: 180, E: 270 };
/** How much of a wall must be solid where a piece stands against it. */
const MIN_WALL_COVER = 0.8;

/** Rotates a box about the origin by a multiple of 90 degrees, then moves it. */
function orient(b: FurnitureBox, rot: Rot, cx: number, cz: number): FurnitureBox {
  const map = (x: number, z: number): [number, number] => {
    if (rot === 0) return [x, z];
    if (rot === 90) return [z, -x];
    if (rot === 180) return [-x, -z];
    return [-z, x];
  };
  const [ax, az] = map(b.x0, b.z0);
  const [bx, bz] = map(b.x1, b.z1);
  return {
    x0: Math.min(ax, bx) + cx,
    x1: Math.max(ax, bx) + cx,
    z0: Math.min(az, bz) + cz,
    z1: Math.max(az, bz) + cz,
    y0: b.y0,
    y1: b.y1,
    color: b.color,
  };
}

function overlaps(a: MetreRect, b: MetreRect): boolean {
  return a.x0 < b.x1 - 1e-6 && a.x1 > b.x0 + 1e-6 && a.z0 < b.z1 - 1e-6 && a.z1 > b.z0 + 1e-6;
}

class RoomPlacer {
  readonly items: FurnitureItem[] = [];
  private readonly used: MetreRect[] = [];

  readonly r: MetreRect;
  private readonly walls: MetreRect[];
  private readonly roomName: string;
  private readonly takenNames: Set<string>;

  constructor(r: MetreRect, walls: MetreRect[], roomName: string, takenNames: Set<string>) {
    this.r = r;
    this.walls = walls;
    this.roomName = roomName;
    this.takenNames = takenNames;
  }

  get w() { return this.r.x1 - this.r.x0; }
  get d() { return this.r.z1 - this.r.z0; }

  /** Length of one wall of the room. */
  wallLength(side: Side): number { return side === "N" || side === "S" ? this.w : this.d; }
  /** Room size measured away from that wall (how deep the room is from it). */
  depthFrom(side: Side): number { return side === "N" || side === "S" ? this.d : this.w; }

  /** Fraction (0-1) of the wall between two positions that is solid. */
  cover(side: Side, from: number, to: number): number {
    const { r } = this;
    const samples = 14;
    const off = 0.06; // just outside the room's edge, inside the wall
    let hit = 0;
    for (let i = 0; i < samples; i++) {
      const t = from + ((i + 0.5) / samples) * (to - from);
      const x = side === "N" || side === "S" ? t : side === "W" ? r.x0 - off : r.x1 + off;
      const z = side === "W" || side === "E" ? t : side === "N" ? r.z0 - off : r.z1 + off;
      if (this.walls.some((k) => x >= k.x0 && x <= k.x1 && z >= k.z0 && z <= k.z1)) hit++;
    }
    return hit / samples;
  }

  /** Sides ordered best-first: longest solid walls first. */
  sidesByCover(): Side[] {
    const sides: Side[] = ["N", "E", "S", "W"];
    const score = (s: Side) => {
      const start = s === "N" || s === "S" ? this.r.x0 : this.r.z0;
      return this.cover(s, start, start + this.wallLength(s)) * this.wallLength(s);
    };
    return sides.sort((a, b) => score(b) - score(a));
  }

  private uniqueName(base: string): string {
    const full = `${this.roomName} ${base}`;
    let name = full;
    let n = 2;
    while (this.takenNames.has(name)) name = `${full} ${n++}`;
    this.takenNames.add(name);
    return name;
  }

  private footprint(w: number, d: number, rot: Rot, cx: number, cz: number): MetreRect {
    const swap = rot === 90 || rot === 270;
    const hw = (swap ? d : w) / 2;
    const hd = (swap ? w : d) / 2;
    return { x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd };
  }

  private fits(fp: MetreRect): boolean {
    const { r } = this;
    if (fp.x0 < r.x0 - 1e-6 || fp.x1 > r.x1 + 1e-6 || fp.z0 < r.z0 - 1e-6 || fp.z1 > r.z1 + 1e-6) return false;
    return !this.used.some((u) => overlaps(u, fp));
  }

  /** Puts a piece down at an exact spot and facing, if it fits. */
  placeAt(
    label: string,
    category: FurnitureItem["category"],
    piece: Piece,
    w: number,
    d: number,
    rot: Rot,
    cx: number,
    cz: number,
    reserve = 0,
  ): boolean {
    const fp = this.footprint(w, d, rot, cx, cz);
    if (!this.fits(fp)) return false;
    this.used.push(reserve > 0 ? this.reserved(fp, rot, reserve) : fp);
    this.items.push({ name: this.uniqueName(label), category, boxes: piece.map((b) => orient(b, rot, cx, cz)) });
    return true;
  }

  /**
   * Puts a piece down at an exact spot, allowed to overlap other placed
   * furniture (still confined to the room rectangle) -- for a rug meant
   * to sit under a sofa and coffee table, or a sink set into a counter
   * it's placed on top of, where placeAt's overlap check would reject
   * the very placement that's wanted.
   */
  placeOverlap(
    label: string,
    category: FurnitureItem["category"],
    piece: Piece,
    w: number,
    d: number,
    rot: Rot,
    cx: number,
    cz: number,
  ): boolean {
    const fp = this.footprint(w, d, rot, cx, cz);
    const { r } = this;
    if (fp.x0 < r.x0 - 1e-6 || fp.x1 > r.x1 + 1e-6 || fp.z0 < r.z0 - 1e-6 || fp.z1 > r.z1 + 1e-6) return false;
    this.items.push({ name: this.uniqueName(label), category, boxes: piece.map((b) => orient(b, rot, cx, cz)) });
    return true;
  }

  /** A footprint grown forward by `reserve` metres (walking/sitting space). */
  private reserved(fp: MetreRect, rot: Rot, reserve: number): MetreRect {
    const out = { ...fp };
    if (rot === 0) out.z1 += reserve;
    else if (rot === 180) out.z0 -= reserve;
    else if (rot === 90) out.x1 += reserve;
    else out.x0 -= reserve;
    return out;
  }

  /**
   * Stands a piece against a wall. Tries the given sides in order, and
   * along each wall the given anchors ("start", "center", "end"), taking
   * the first spot that is inside the room, clear of other pieces, and
   * against genuinely solid wall. Returns the placed footprint or null.
   */
  againstWall(
    label: string,
    category: FurnitureItem["category"],
    piece: Piece,
    w: number,
    d: number,
    sides: Side[],
    anchors: ("start" | "center" | "end")[] = ["center"],
    reserve = 0,
  ): { side: Side; fp: MetreRect } | null {
    for (const side of sides) {
      const horizontal = side === "N" || side === "S";
      const a0 = horizontal ? this.r.x0 : this.r.z0;
      const len = this.wallLength(side);
      if (w > len + 1e-6 || d > this.depthFrom(side) + 1e-6) continue;
      for (const anchor of anchors) {
        const c = anchor === "start" ? a0 + w / 2 : anchor === "end" ? a0 + len - w / 2 : a0 + len / 2;
        if (this.cover(side, c - w / 2, c + w / 2) < MIN_WALL_COVER) continue;
        const rot = SIDE_ROT[side];
        const cx = horizontal ? c : side === "W" ? this.r.x0 + d / 2 : this.r.x1 - d / 2;
        const cz = horizontal ? (side === "N" ? this.r.z0 + d / 2 : this.r.z1 - d / 2) : c;
        if (this.placeAt(label, category, piece, w, d, rot, cx, cz, reserve)) {
          return { side, fp: this.footprint(w, d, rot, cx, cz) };
        }
      }
    }
    return null;
  }
}

const OPPOSITE: Record<Side, Side> = { N: "S", S: "N", E: "W", W: "E" };

// ------------------------------------------------------- per-room layouts

function furnishBedroom(p: RoomPlacer) {
  const area = p.w * p.d;
  const [bw, bl, kind] = area >= 12 ? [1.6, 2.0, "Bed"] : area >= 8 ? [1.4, 1.9, "Bed"] : [0.9, 1.9, "Single bed"];
  // Prefer the headboard on a short wall so the bed runs along the long way.
  const sides = p.sidesByCover().sort((a, b) => p.wallLength(a) - p.wallLength(b));
  const spot = p.againstWall(kind, "Furniture", bed(bw, bl), bw, bl, sides, ["center"], 0.6);
  if (!spot) return;
  // Bedside tables on both sides of the headboard where there's room.
  const horizontal = spot.side === "N" || spot.side === "S";
  const mid = horizontal ? (spot.fp.x0 + spot.fp.x1) / 2 : (spot.fp.z0 + spot.fp.z1) / 2;
  const half = (horizontal ? spot.fp.x1 - spot.fp.x0 : spot.fp.z1 - spot.fp.z0) / 2;
  for (const dir of [-1, 1]) {
    const c = mid + dir * (half + 0.25);
    const along = horizontal ? p.r.x0 : p.r.z0;
    const len = p.wallLength(spot.side);
    if (c - 0.225 < along || c + 0.225 > along + len) continue;
    if (p.cover(spot.side, c - 0.225, c + 0.225) < MIN_WALL_COVER) continue;
    const rot = SIDE_ROT[spot.side];
    const cx = horizontal ? c : spot.side === "W" ? p.r.x0 + 0.2 : p.r.x1 - 0.2;
    const cz = horizontal ? (spot.side === "N" ? p.r.z0 + 0.2 : p.r.z1 - 0.2) : c;
    p.placeAt("Nightstand", "Furniture", nightstand(0.45, 0.4), 0.45, 0.4, rot, cx, cz);
  }
  const others = p.sidesByCover().filter((s) => s !== spot.side);
  const preferred = [OPPOSITE[spot.side], ...others.filter((s) => s !== OPPOSITE[spot.side])];
  const wardrobeSpot = p.againstWall("Wardrobe", "Furniture", wardrobe(1.2, 0.6), 1.2, 0.6, preferred, ["start", "end", "center"], 0.7);
  // A wall-mounted TV, on a wall the bed and wardrobe haven't already
  // taken, once the room is roomy enough to spare one.
  if (area >= 10) {
    const used = [spot.side, wardrobeSpot?.side].filter((s): s is Side => !!s);
    const tvSides = p.sidesByCover().filter((s) => !used.includes(s));
    p.againstWall("TV", "Furniture", wallTv(1.0), 1.0, 0.05, tvSides.length ? tvSides : p.sidesByCover(), ["center"]);
  }
  // A small desk and chair in a corner, once the room is big enough that
  // it isn't crowding the bed.
  if (area >= 14) {
    const used = [spot.side, wardrobeSpot?.side].filter((s): s is Side => !!s);
    const deskSides = p.sidesByCover().filter((s) => !used.includes(s));
    const deskSpot = p.againstWall("Desk", "Furniture", desk(1.1, 0.6), 1.1, 0.6, deskSides.length ? deskSides : p.sidesByCover(), ["start", "end"], 0.6);
    if (deskSpot) {
      const h = deskSpot.side === "N" || deskSpot.side === "S";
      const mid = h ? (deskSpot.fp.x0 + deskSpot.fp.x1) / 2 : (deskSpot.fp.z0 + deskSpot.fp.z1) / 2;
      const off = 0.6 + 0.25;
      const cx = h ? mid : deskSpot.side === "W" ? p.r.x0 + off : p.r.x1 - off;
      const cz = h ? (deskSpot.side === "N" ? p.r.z0 + off : p.r.z1 - off) : mid;
      p.placeAt("Chair", "Furniture", chair(), 0.45, 0.45, SIDE_ROT[OPPOSITE[deskSpot.side]], cx, cz);
    }
  }
}

function furnishLiving(p: RoomPlacer) {
  if (Math.min(p.w, p.d) < 2.4) return;
  const sides = p.sidesByCover().sort((a, b) => p.wallLength(b) - p.wallLength(a));
  const long = Math.max(p.w, p.d);
  const [sw, sd] = long >= 3.2 ? [2.0, 0.9] : [1.6, 0.85];
  const spot = p.againstWall("Sofa", "Furniture", sofa(sw, sd), sw, sd, sides, ["center"], 0.35);
  if (!spot) return;
  const horizontal = spot.side === "N" || spot.side === "S";
  const room = p.depthFrom(spot.side);
  const rot = SIDE_ROT[spot.side];
  const mid = horizontal ? (spot.fp.x0 + spot.fp.x1) / 2 : (spot.fp.z0 + spot.fp.z1) / 2;
  // Coffee table centred in front of the sofa.
  if (room >= sd + 0.4 + 0.6 + 0.4) {
    const off = sd + 0.4 + 0.3;
    const cx = horizontal ? mid : spot.side === "W" ? p.r.x0 + off : p.r.x1 - off;
    const cz = horizontal ? (spot.side === "N" ? p.r.z0 + off : p.r.z1 - off) : mid;
    p.placeAt("Coffee table", "Furniture", coffeeTable(1.1, 0.6), 1.1, 0.6, rot, cx, cz);
  }
  // TV unit on the opposite wall, facing the sofa.
  const opp = OPPOSITE[spot.side];
  if (room >= 2.6) p.againstWall("TV unit", "Furniture", tvUnit(1.4, 0.4), 1.4, 0.4, [opp], ["center"]);
  // A pair of armchairs beside the coffee table when the room is generous.
  if (p.w * p.d >= 20) {
    const remaining = p.sidesByCover().filter((s) => s !== spot.side && s !== opp);
    p.againstWall("Armchair", "Furniture", armchair(0.85, 0.85), 0.85, 0.85, remaining, ["center"], 0.5);
  }
  // A side table tucked at one end of the sofa, if there's room for it.
  const along = horizontal ? p.r.x0 : p.r.z0;
  const wallLen = p.wallLength(spot.side);
  const end = mid + (sw / 2 + 0.25);
  if (end + 0.25 <= along + wallLen && p.cover(spot.side, end - 0.25, end + 0.25) >= MIN_WALL_COVER) {
    const cx = horizontal ? end : spot.side === "W" ? p.r.x0 + 0.25 : p.r.x1 - 0.25;
    const cz = horizontal ? (spot.side === "N" ? p.r.z0 + 0.25 : p.r.z1 - 0.25) : end;
    p.placeAt("Side table", "Furniture", nightstand(0.4, 0.4), 0.4, 0.4, rot, cx, cz);
  }
  // A rug centred under the seating group, sized to the room but capped
  // so it doesn't swallow a very large room -- placed with placeOverlap
  // since it's meant to sit under the sofa and coffee table, not beside them.
  const rw = Math.min(3.2, p.w * 0.6);
  const rd = Math.min(2.6, p.d * 0.6);
  if (rw > 1.0 && rd > 1.0) {
    const rcx = (p.r.x0 + p.r.x1) / 2;
    const rcz = (p.r.z0 + p.r.z1) / 2;
    p.placeOverlap("Rug", "Furniture", rug(rw, rd), rw, rd, 0, rcx, rcz);
  }
  // A couple of potted plants against whatever wall has room, purely
  // decorative so they're fine to skip when the room is tight.
  const plantSides = p.sidesByCover();
  p.againstWall("Plant", "Furniture", plant(), 0.5, 0.5, plantSides, ["start", "end"]);
  p.againstWall("Plant", "Furniture", plant(), 0.5, 0.5, plantSides, ["end", "start"]);
}

function furnishDining(p: RoomPlacer) {
  if (Math.min(p.w, p.d) < 2.2) return;
  const big = p.w * p.d >= 16;
  const [tw, td] = big ? [2.0, 0.95] : [1.5, 0.85];
  const alongX = p.w >= p.d;
  const cx = (p.r.x0 + p.r.x1) / 2;
  const cz = (p.r.z0 + p.r.z1) / 2;
  if (!p.placeAt("Dining table", "Furniture", diningTable(tw, td), tw, td, alongX ? 0 : 90, cx, cz)) return;
  const n = big ? 3 : 2;
  const gap = tw / (n + 0.5);
  for (let i = 0; i < n; i++) {
    const t = (i - (n - 1) / 2) * gap;
    for (const side of [-1, 1]) {
      // Chairs face the table: back away from it.
      const rot: Rot = alongX ? (side < 0 ? 0 : 180) : side < 0 ? 90 : 270;
      const x = alongX ? cx + t : cx + side * (td / 2 + 0.28);
      const z = alongX ? cz + side * (td / 2 + 0.28) : cz + t;
      p.placeAt("Chair", "Furniture", chair(), 0.45, 0.45, rot, x, z);
    }
  }
}

function furnishKitchen(p: RoomPlacer) {
  const sides = p.sidesByCover().sort((a, b) => p.wallLength(b) - p.wallLength(a));
  for (const side of sides) {
    const len = p.wallLength(side);
    if (len < 1.8 || p.depthFrom(side) < 1.8) continue;
    if (p.cover(side, (side === "N" || side === "S" ? p.r.x0 : p.r.z0), (side === "N" || side === "S" ? p.r.x0 : p.r.z0) + len) < MIN_WALL_COVER) continue;
    const f = p.againstWall("Fridge", "Fixture", fridge(0.7, 0.7), 0.7, 0.7, [side], ["start"]);
    if (!f) continue;
    const horizontal = side === "N" || side === "S";
    const rot = SIDE_ROT[side];
    const along = horizontal ? p.r.x0 : p.r.z0;
    // Cursor tracks how far along this wall run we've placed things so
    // far, starting right after the fridge.
    let cursor = horizontal ? f.fp.x1 : f.fp.z1;
    const wallEnd = along + len;
    const runMax = Math.min(3.4, wallEnd - cursor);
    if (runMax > 0.5) {
      const c = cursor + runMax / 2;
      const cx = horizontal ? c : side === "W" ? p.r.x0 + 0.3 : p.r.x1 - 0.3;
      const cz = horizontal ? (side === "N" ? p.r.z0 + 0.3 : p.r.z1 - 0.3) : c;
      p.placeAt("Counter", "Fixture", counter(runMax, 0.6), runMax, 0.6, rot, cx, cz, 0.9);
      cursor += runMax;
    }
    // A freestanding range, past the counter's own built-in hob, when
    // there's still enough wall left for one.
    if (wallEnd - cursor >= 0.7) {
      const sw = Math.min(0.75, wallEnd - cursor);
      const c = cursor + sw / 2;
      const cx = horizontal ? c : side === "W" ? p.r.x0 + 0.3 : p.r.x1 - 0.3;
      const cz = horizontal ? (side === "N" ? p.r.z0 + 0.3 : p.r.z1 - 0.3) : c;
      if (p.placeAt("Stove", "Fixture", stove(sw, 0.65), sw, 0.65, rot, cx, cz, 0.6)) cursor += sw;
    }
    if (p.depthFrom(side) >= 3.6 && p.wallLength(side) >= 2.4) {
      const off = 0.6 + 1.0 + 0.35;
      const ix = horizontal ? (p.r.x0 + p.r.x1) / 2 : side === "W" ? p.r.x0 + off : p.r.x1 - off;
      const iz = horizontal ? (side === "N" ? p.r.z0 + off : p.r.z1 - off) : (p.r.z0 + p.r.z1) / 2;
      p.placeAt("Island", "Fixture", island(1.6, 0.7), 1.6, 0.7, rot, ix, iz);
    }
    // A second, perpendicular run of counter -- an L-shaped kitchen --
    // with a bigger double sink set into it, on a wall this one hasn't
    // already claimed.
    const perpendicular: Side[] = horizontal ? ["W", "E"] : ["N", "S"];
    const leg = p.againstWall("Counter", "Fixture", counterSlab(1.4, 0.6), 1.4, 0.6, perpendicular, ["start", "end"], 0.6);
    if (leg) {
      const lcx = (leg.fp.x0 + leg.fp.x1) / 2;
      const lcz = (leg.fp.z0 + leg.fp.z1) / 2;
      p.placeOverlap("Double sink", "Fixture", doubleSink(0.9, 0.55), 0.9, 0.55, SIDE_ROT[leg.side], lcx, lcz);
    }
    return;
  }
}

function furnishBathroom(p: RoomPlacer) {
  const sides = p.sidesByCover();
  const bath = p.againstWall("Bathtub", "Fixture", bathtub(1.7, 0.75), 1.7, 0.75, sides.filter((s) => p.wallLength(s) >= 1.7 && p.depthFrom(s) >= 1.6), ["start", "end"], 0.4);
  const order = bath ? sides.filter((s) => s !== bath.side).concat(bath.side) : sides;
  p.againstWall("Toilet", "Fixture", toilet(), 0.4, 0.7, order, ["start", "end", "center"], 0.5);
  p.againstWall("Vanity", "Fixture", vanity(0.6, 0.45), 0.6, 0.45, order, ["end", "start", "center"], 0.5);
  // A washing machine, for a combined bathroom/utility room big enough
  // to spare a bit of wall for one.
  if (p.w * p.d >= 6) {
    p.againstWall("Washing machine", "Fixture", washingMachine(0.6, 0.6), 0.6, 0.6, order, ["start", "end", "center"]);
  }
}

function furnishStudy(p: RoomPlacer) {
  if (Math.min(p.w, p.d) < 2.0) return;
  const sides = p.sidesByCover();
  const spot = p.againstWall("Desk", "Furniture", desk(1.4, 0.7), 1.4, 0.7, sides, ["center"], 0.7);
  if (!spot) return;
  const horizontal = spot.side === "N" || spot.side === "S";
  const mid = horizontal ? (spot.fp.x0 + spot.fp.x1) / 2 : (spot.fp.z0 + spot.fp.z1) / 2;
  const off = 0.7 + 0.25;
  const cx = horizontal ? mid : spot.side === "W" ? p.r.x0 + off : p.r.x1 - off;
  const cz = horizontal ? (spot.side === "N" ? p.r.z0 + off : p.r.z1 - off) : mid;
  // The chair faces the desk, i.e. the opposite way to the desk itself.
  p.placeAt("Chair", "Furniture", chair(), 0.45, 0.45, SIDE_ROT[OPPOSITE[spot.side]], cx, cz);
  p.againstWall("Bookshelf", "Furniture", bookshelf(0.9, 0.3), 0.9, 0.3, p.sidesByCover().filter((s) => s !== spot.side), ["center", "start", "end"]);
}

// ---------------------------------------------------------------- public

/** Largest axis-aligned rectangle that fits entirely inside the union of
 *  `rects` (which may be an L shape, or the jagged diagonal boundary an
 *  OCR label split leaves behind, since there's no real wall there to
 *  follow — see roomLabels.ts). Rasterises the room to a coarse grid
 *  (10 cm cells, far finer than any doorway or piece of furniture cares
 *  about) and runs the classic "biggest rectangle of 1s in a binary
 *  matrix" scan: a per-row histogram of how tall each column's run of
 *  filled cells above it is, then the largest rectangle under that
 *  histogram via a monotonic stack (O(cols) per row). This exists so an
 *  irregularly-shaped room still gets a real, sizeable spot for
 *  furniture — the room's own bounding box is typically far bigger than
 *  its actual floor for a shape like this, and the single biggest
 *  already-merged rectangle from maskToRects's own wall-following pass
 *  can be a sliver a few centimetres wide. */
function largestInscribedRect(rects: MetreRect[], bbox: MetreRect): MetreRect | null {
  const CELL = 0.1;
  const cols = Math.max(1, Math.round((bbox.x1 - bbox.x0) / CELL));
  const rows = Math.max(1, Math.round((bbox.z1 - bbox.z0) / CELL));
  const cw = (bbox.x1 - bbox.x0) / cols;
  const ch = (bbox.z1 - bbox.z0) / rows;
  const filled = new Uint8Array(cols * rows);
  for (let ry = 0; ry < rows; ry++) {
    const cz = bbox.z0 + (ry + 0.5) * ch;
    for (let cx = 0; cx < cols; cx++) {
      const x = bbox.x0 + (cx + 0.5) * cw;
      if (rects.some((r) => x >= r.x0 && x <= r.x1 && cz >= r.z0 && cz <= r.z1)) filled[ry * cols + cx] = 1;
    }
  }

  const heights = new Int32Array(cols);
  let best = { area: 0, top: 0, left: 0, width: 0, height: 0 };
  for (let ry = 0; ry < rows; ry++) {
    for (let cx = 0; cx < cols; cx++) heights[cx] = filled[ry * cols + cx] ? heights[cx] + 1 : 0;
    const stack: number[] = [];
    for (let cx = 0; cx <= cols; cx++) {
      const h = cx < cols ? heights[cx] : 0;
      while (stack.length && heights[stack[stack.length - 1]] >= h) {
        const height = heights[stack.pop()!];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const width = cx - left;
        const area = height * width;
        if (area > best.area) best = { area, top: ry - height + 1, left, width, height };
      }
      stack.push(cx);
    }
  }
  if (best.area === 0) return null;
  return {
    x0: bbox.x0 + best.left * cw,
    x1: bbox.x0 + (best.left + best.width) * cw,
    z0: bbox.z0 + best.top * ch,
    z1: bbox.z0 + (best.top + best.height) * ch,
  };
}

/** The room's usable rectangle: its bounding box when the room is
 *  essentially rectangular, otherwise the largest rectangle that fits
 *  inside its actual floor shape. */
function usableRect(room: PlanRoom, inset: number): MetreRect | null {
  const x0 = Math.min(...room.rects.map((r) => r.x0));
  const x1 = Math.max(...room.rects.map((r) => r.x1));
  const z0 = Math.min(...room.rects.map((r) => r.z0));
  const z1 = Math.max(...room.rects.map((r) => r.z1));
  const total = room.rects.reduce((s, r) => s + rectArea(r), 0);
  const bbox: MetreRect = { x0, x1, z0, z1 };
  const base =
    total >= 0.85 * rectArea(bbox)
      ? bbox
      : largestInscribedRect(room.rects, bbox) ?? room.rects.reduce((a, b) => (rectArea(b) > rectArea(a) ? b : a));
  const r = { x0: base.x0 + inset, x1: base.x1 - inset, z0: base.z0 + inset, z1: base.z1 - inset };
  return r.x1 - r.x0 > 1.2 && r.z1 - r.z0 > 1.2 ? r : null;
}

/** Furniture for every room of a layout, chosen from the room names. */
export function furnishLayout(layout: PlanLayout): FurnitureItem[] {
  const inset = (layout.wallThickness ?? 0) / 2;
  const taken = new Set<string>();
  const out: FurnitureItem[] = [];
  for (const room of layout.rooms) {
    const kind = roomKindFromName(room.name);
    if (kind === "other") continue;
    const rect = usableRect(room, inset);
    if (!rect) continue;
    const placer = new RoomPlacer(rect, layout.walls, room.name, taken);
    if (kind === "bedroom") furnishBedroom(placer);
    else if (kind === "living") furnishLiving(placer);
    else if (kind === "dining") furnishDining(placer);
    else if (kind === "kitchen") furnishKitchen(placer);
    else if (kind === "bathroom") furnishBathroom(placer);
    else furnishStudy(placer);
    out.push(...placer.items);
  }
  return out;
}
