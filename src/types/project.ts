/**
 * src/types/project.ts
 *
 * The shape of everything ATRIUM's demo project is built from: the
 * Project itself, the Elements that make up its FF&E/finishes schedule
 * (one per interactive mesh in BuildingModel — see Element.meshName),
 * client/designer Annotations pinned in 3D space, and the Revision
 * history that explains how the design got to where it is. Shared
 * everywhere this data is read (src/data/project.ts, projectStore, any
 * future UI) — never redeclared locally.
 *
 * One runtime value lives here alongside the types: ELEMENT_CATEGORIES,
 * the list the ElementCategory union is derived from. It belongs next to
 * that type rather than in any one component because two components need
 * the actual list at runtime (ReviewList.tsx's category filter and
 * VisibilityToolbar.tsx's show/hide chips), and deriving the type from it
 * is what keeps the list and the union from ever drifting apart.
 */

/** A 3D point or direction — reused for both Annotation.position and .normal. */
export type Vec3 = [x: number, y: number, z: number];

export type ProjectPhase =
  | "Concept"
  | "Design Development"
  | "Client Review"
  | "Final Sign-off";

export interface Project {
  id: string;
  name: string;
  /** Internal project code, e.g. for filing and drawing titleblocks. */
  code: string;
  client: string;
  phase: ProjectPhase;
  address: string;
  /** The current revision label — matches the most recent Revision.label. */
  revision: string;
}

/** Every element category, in display order — the single runtime source
 *  ElementCategory below is derived from (see file header). */
export const ELEMENT_CATEGORIES = ["Furniture", "Fixture", "Finish", "Structural", "Lighting"] as const;

export type ElementCategory = (typeof ELEMENT_CATEGORIES)[number];

export type ElementStatus = "Approved" | "For Review" | "Revised" | "Issue";

export interface Element {
  id: string;
  /** Must match a mesh id in BuildingModel's MESH_ENTRIES exactly — this is
   *  what lets a click in the 3D scene resolve to a real Element. */
  meshName: string;
  name: string;
  category: ElementCategory;
  /** Free-form spec sheet lines — whatever a real schedule entry would
   *  actually list for this kind of item (fabric + frame for furniture,
   *  brand + model for fixtures, material + finish coat for finishes). */
  specification: Record<string, string>;
  status: ElementStatus;
  /** The trade, supplier, or person accountable for this line item. */
  responsibleParty: string;
  /** ISO date string. */
  lastUpdated: string;
}

export type AnnotationStatus = "Open" | "Resolved";

export interface AnnotationReply {
  id: string;
  author: string;
  body: string;
  /** ISO date string. */
  createdAt: string;
}

export interface Annotation {
  id: string;
  /** Null when a comment is pinned to open space rather than a specific
   *  element (a layout or clearance note, not a spec callout). */
  elementId: string | null;
  position: Vec3;
  /** Which way the marker faces, so it reads right-side-up in the scene. */
  normal: Vec3;
  author: string;
  body: string;
  /** ISO date string. */
  createdAt: string;
  status: AnnotationStatus;
  replies: AnnotationReply[];
}

export interface Revision {
  id: string;
  label: string;
  /** ISO date string. */
  date: string;
  summary: string;
  changedElementIds: string[];
}

/**
 * One field-level change to a single Element — what changed, old vs new
 * value, when, and who made it. Distinct from Revision above: Revision is
 * a project-wide issued set (R01/R02/R03, a handful a year); this is the
 * finer-grained "why does this one line item look different now" trail
 * ElementPanel.tsx's History affordance reads, filtered to one element at
 * a time via projectStore's getElementRevisions. See src/data/project.ts's
 * ELEMENT_REVISIONS for why this is seeded static data rather than
 * derived from a live change-detection pipeline.
 */
export interface ElementRevisionEntry {
  id: string;
  /** Matches Element.meshName, not .id — meshName is the one identifier
   *  guaranteed to line up between this seeded demo data and a real,
   *  independently-seeded Supabase project: it's the 3D model's own mesh
   *  name, baked into the GLB and reused verbatim as elements.mesh_name
   *  (see src/lib/queries.ts's mapElement). Element.id isn't reliable for
   *  this join — locally it's a fixed "el-*" string, but a live database
   *  assigns its own uuid, which this static seed can't predict. */
  meshName: string;
  /** The changed field's display name — either "Status" or a key from
   *  Element.specification, exactly as it reads in the spec sheet. */
  field: string;
  oldValue: string;
  newValue: string;
  /** ISO date string. */
  changedAt: string;
  author: string;
}
