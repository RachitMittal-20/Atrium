/**
 * src/lib/queries.ts
 *
 * Every typed read/write ATRIUM makes against Supabase, in one place —
 * mapping the snake_case rows in src/types/database.ts (generated from
 * supabase/migrations/) onto the camelCase app types in
 * src/types/project.ts that every component already trusts. Nothing
 * outside this file imports src/lib/supabase.ts directly.
 *
 * Every function here throws on failure — including "Supabase isn't
 * configured" — rather than resolving with an empty array or null as a
 * silent stand-in. That's what lets a caller tell "there is genuinely
 * nothing here yet" (a real empty array, returned normally) apart from
 * "the read failed" (a thrown error), and decide what each means in its
 * own context: src/app/project/page.tsx catches a throw here to fall
 * back to the local seed data in src/data/project.ts; projectStore.ts
 * catches createAnnotation's throw to roll an optimistic pin back and
 * show a retry toast. Neither would be possible if failure and "empty"
 * looked the same.
 */
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type { Annotation, AnnotationReply, AnnotationStatus, Element, Project, Vec3 } from "@/types/project";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type ElementRow = Database["public"]["Tables"]["elements"]["Row"];
type AnnotationRow = Database["public"]["Tables"]["annotations"]["Row"];
type AnnotationReplyRow = Database["public"]["Tables"]["annotation_replies"]["Row"];

// Every exported function starts with this — one place that turns "not
// configured" into a thrown error instead of every call site null-
// checking `supabase` itself.
function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured — NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY are missing.");
  }
  return supabase;
}

// category/status/phase are `check`-constrained in Postgres but come
// back from the generated types as plain `string` — the constraint
// guarantees only these values can exist, so asserting the narrower app
// union here is safe, not a lie.
function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    client: row.client,
    phase: row.phase as Project["phase"],
    address: row.address,
    revision: row.revision,
  };
}

function mapElement(row: ElementRow): Element {
  return {
    id: row.id,
    meshName: row.mesh_name,
    name: row.name,
    category: row.category as Element["category"],
    specification: (row.specification as Record<string, string> | null) ?? {},
    status: row.status as Element["status"],
    responsibleParty: row.responsible_party,
    lastUpdated: row.updated_at,
  };
}

function mapReply(row: AnnotationReplyRow): AnnotationReply {
  return { id: row.id, author: row.author, body: row.body, createdAt: row.created_at };
}

function mapAnnotation(row: AnnotationRow, replies: AnnotationReply[]): Annotation {
  return {
    id: row.id,
    elementId: row.element_id,
    position: [row.position_x, row.position_y, row.position_z],
    normal: [row.normal_x, row.normal_y, row.normal_z],
    author: row.author,
    body: row.body,
    createdAt: row.created_at,
    status: row.status as AnnotationStatus,
    replies,
  };
}

/**
 * The single project row this deployment shows — ATRIUM has no project
 * switcher yet, so this is "the first project in the table", not a
 * lookup by id. Returns null when the table is empty (nothing seeded),
 * which src/app/project/page.tsx's server-side load treats the same as
 * a failed fetch: fall back to the local demo data rather than render
 * a project that doesn't exist.
 */
export async function getProject(): Promise<Project | null> {
  const client = requireSupabase();
  const { data, error } = await client.from("projects").select("*").limit(1).maybeSingle();
  if (error) throw new Error(`getProject: ${error.message}`);
  return data ? mapProject(data) : null;
}

/**
 * Every Element belonging to a project — the FF&E/finishes schedule.
 * Ordered by name for a stable, readable order; nothing in the app reads
 * positional meaning into this array the way it does for annotations'
 * numerals. Called by src/app/project/page.tsx's server-side initial
 * load. An empty result (a project with no elements seeded yet) is
 * returned as `[]`, not treated as an error — ElementPanel and
 * BuildingModel already handle "no matching element" for any given mesh.
 */
export async function getElements(projectId: string): Promise<Element[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("elements").select("*").eq("project_id", projectId).order("name");
  if (error) throw new Error(`getElements: ${error.message}`);
  return (data ?? []).map(mapElement);
}

/**
 * Every Annotation pinned to a project, each with its replies attached,
 * ordered by createdAt ascending — the order AnnotationMarker.tsx and
 * ReviewList.tsx both number their rings/rows from, so it has to be
 * chronological (pin order), not arbitrary. Two queries, not a join:
 * a plain second query keyed by `in (...)` on the reply table is simpler
 * to reason about than a PostgREST embedded-resource select, and there's
 * no N+1 risk either way — it's exactly two round trips regardless of
 * how many annotations exist. Called by src/app/project/page.tsx's
 * server-side initial load. A project with no annotations yet (or no
 * replies on any of them) returns `[]`/empty reply arrays, not an error.
 */
export async function getAnnotations(projectId: string): Promise<Annotation[]> {
  const client = requireSupabase();
  const { data: annotationRows, error: annotationsError } = await client
    .from("annotations")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (annotationsError) throw new Error(`getAnnotations: ${annotationsError.message}`);
  if (!annotationRows || annotationRows.length === 0) return [];

  const annotationIds = annotationRows.map((row) => row.id);
  const { data: replyRows, error: repliesError } = await client
    .from("annotation_replies")
    .select("*")
    .in("annotation_id", annotationIds)
    .order("created_at", { ascending: true });
  if (repliesError) throw new Error(`getAnnotations (replies): ${repliesError.message}`);

  const repliesByAnnotation = new Map<string, AnnotationReply[]>();
  for (const row of replyRows ?? []) {
    const existing = repliesByAnnotation.get(row.annotation_id);
    if (existing) {
      existing.push(mapReply(row));
    } else {
      repliesByAnnotation.set(row.annotation_id, [mapReply(row)]);
    }
  }

  return annotationRows.map((row) => mapAnnotation(row, repliesByAnnotation.get(row.id) ?? []));
}

export interface NewAnnotationInput {
  /** Client-generated (crypto.randomUUID()), sent explicitly rather than
   *  left to the database's own default — see projectStore.ts's
   *  pinAnnotation, which renders a marker with this same id before this
   *  function is ever called. The optimistic row and the persisted row
   *  need to be the same row, or the marker would have to remount under
   *  a swapped-in id the instant the write succeeds. */
  id: string;
  projectId: string;
  elementId: string | null;
  position: Vec3;
  normal: Vec3;
  author: string;
  body: string;
}

/**
 * Pins a new annotation. Called by projectStore.ts's pinAnnotation, after
 * the same annotation has already been applied to local state
 * optimistically — this is the "persist" half, not the half that makes
 * the marker appear on screen.
 */
export async function createAnnotation(input: NewAnnotationInput): Promise<Annotation> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("annotations")
    .insert({
      id: input.id,
      project_id: input.projectId,
      element_id: input.elementId,
      position_x: input.position[0],
      position_y: input.position[1],
      position_z: input.position[2],
      normal_x: input.normal[0],
      normal_y: input.normal[1],
      normal_z: input.normal[2],
      author: input.author,
      body: input.body,
      status: "Open",
    })
    .select("*")
    .single();
  if (error) throw new Error(`createAnnotation: ${error.message}`);
  return mapAnnotation(data, []);
}

/**
 * Marks an annotation Resolved (or reopens it) — the one mutation the
 * database's column-level grant allows anon to make on an existing
 * annotation (see supabase/migrations/'s "update (status)" grant, which
 * exists specifically so this call can never touch body/author/position).
 * Not called from any component yet — no "mark resolved" control exists
 * in the UI today; this is the function it would call once one does.
 */
export async function updateAnnotationStatus(id: string, status: AnnotationStatus): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("annotations").update({ status }).eq("id", id);
  if (error) throw new Error(`updateAnnotationStatus: ${error.message}`);
}

/**
 * Adds a reply to an annotation's thread. Not called from any component
 * yet — AnnotationComposer.tsx composes new top-level annotations only;
 * this is the function a reply composer would call once one exists.
 */
export async function createReply(annotationId: string, author: string, body: string): Promise<AnnotationReply> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("annotation_replies")
    .insert({ annotation_id: annotationId, author, body })
    .select("*")
    .single();
  if (error) throw new Error(`createReply: ${error.message}`);
  return mapReply(data);
}
