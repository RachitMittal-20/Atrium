-- ATRIUM — initial schema
--
-- Five tables mirroring src/types/project.ts exactly, so the shape of the
-- database and the shape the app already trusts never drift apart:
--   projects           the one row this whole app hangs off of.
--   elements           the FF&E/finishes schedule — one row per
--                       interactive mesh in BuildingModel.MESH_ENTRIES.
--   annotations        spatial review comments, pinned to a 3D point.
--   annotation_replies threaded replies on an annotation.
--   revisions          the project's revision history.
--
-- gen_random_uuid() is core Postgres since v13 — no pgcrypto/uuid-ossp
-- extension needed for it.
--
-- Row level security is enabled on every table at the bottom of this file,
-- with explicit policies — RLS is part of this schema, not bolted on after.

-- -----------------------------------------------------------------------
-- projects
--
-- One row per project ATRIUM manages. This build only ever seeds one
-- (Meridian House), but nothing here assumes that — every other table
-- hangs off project_id, so a second project is just another row, not a
-- schema change. `code` is unique: it's the project's internal filing
-- code (e.g. for drawing titleblocks) and doubles as the natural key
-- seed.sql uses to find "this project" without hardcoding a UUID.
-- `phase` is constrained to the same four values src/types/project.ts's
-- ProjectPhase union allows, so bad data can't enter through any path
-- that isn't the app itself (or this migration).
-- -----------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  client text not null,
  phase text not null check (phase in ('Concept', 'Design Development', 'Client Review', 'Final Sign-off')),
  address text not null,
  revision text not null,
  created_at timestamptz not null default now()
);

comment on table public.projects is 'One row per ATRIUM project — the root every other table hangs off via project_id.';

-- -----------------------------------------------------------------------
-- elements
--
-- The FF&E/finishes schedule: one row per interactive mesh in the 3D
-- model (BuildingModel.MESH_ENTRIES), matched by mesh_name — that's what
-- lets a click in the scene resolve straight to a spec-sheet row.
-- `specification` is jsonb rather than a fixed set of columns because a
-- real spec sheet's fields genuinely vary by category (a sofa is
-- fabric+frame, a fixture is brand+model, a finish is material+coat) —
-- modelling that as a rigid column set would mean either a wide table
-- full of nulls or a name/value side table for no real benefit over
-- jsonb. `category` and `status` are constrained to the same unions
-- Element uses in src/types/project.ts. unique(project_id, mesh_name) is
-- the actual invariant the app depends on: within one project, a mesh id
-- must resolve to exactly one element.
-- -----------------------------------------------------------------------
create table public.elements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  mesh_name text not null,
  name text not null,
  category text not null check (category in ('Furniture', 'Fixture', 'Finish', 'Structural', 'Lighting')),
  specification jsonb not null default '{}'::jsonb,
  status text not null check (status in ('Approved', 'For Review', 'Revised', 'Issue')),
  responsible_party text not null,
  updated_at timestamptz not null default now(),
  unique (project_id, mesh_name)
);

comment on table public.elements is 'The FF&E/finishes schedule — one row per interactive mesh in the 3D model, matched by mesh_name.';

-- -----------------------------------------------------------------------
-- annotations
--
-- A spatial review comment, pinned to an exact point in the 3D model —
-- this is the feature the whole submission rests on. Position and normal
-- are stored as three double precision columns each rather than a single
-- point/vector type or a jsonb blob: they're read back as a plain
-- three-number tuple on every page load with no interpretation needed,
-- and Postgres's built-in geometric types are overkill for "three floats
-- that happen to be a position" with no spatial querying planned.
-- element_id is nullable and ON DELETE SET NULL, not CASCADE: a comment
-- pinned to open space (elementId: null in the app) is a real, ordinary
-- case, not an error state, and deleting the element a comment was
-- pinned to should orphan the comment, not silently destroy someone's
-- review feedback.
-- -----------------------------------------------------------------------
create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  element_id uuid references public.elements (id) on delete set null,
  position_x double precision not null,
  position_y double precision not null,
  position_z double precision not null,
  normal_x double precision not null,
  normal_y double precision not null,
  normal_z double precision not null,
  author text not null,
  body text not null,
  status text not null check (status in ('Open', 'Resolved')),
  created_at timestamptz not null default now()
);

comment on table public.annotations is 'A review comment pinned to an exact 3D point — position/normal as six floats, no geometry type needed.';

-- Both queried on every load: project_id to fetch "every annotation on
-- this project" (ReviewList), element_id to fetch "every annotation on
-- this element" (ElementPanel's thread).
create index annotations_project_id_idx on public.annotations (project_id);
create index annotations_element_id_idx on public.annotations (element_id);

-- -----------------------------------------------------------------------
-- annotation_replies
--
-- A threaded reply on an annotation. Its own table rather than a jsonb
-- array on annotations (which is how the app's own Annotation.replies is
-- shaped in memory) because replies are inserted independently of the
-- annotation they belong to — a jsonb array would mean a read-modify-
-- write race the moment two reviewers reply to the same comment at once.
-- -----------------------------------------------------------------------
create table public.annotation_replies (
  id uuid primary key default gen_random_uuid(),
  annotation_id uuid not null references public.annotations (id) on delete cascade,
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);

comment on table public.annotation_replies is 'A threaded reply on an annotation — its own table so concurrent replies never race a jsonb array.';

create index annotation_replies_annotation_id_idx on public.annotation_replies (annotation_id);

-- -----------------------------------------------------------------------
-- revisions
--
-- The project's revision history — what changed between issued sets, and
-- which elements changed. changed_element_ids is text[], not a join
-- table or a uuid[] with a foreign key: it's a loose, denormalised list
-- (seed.sql populates it with elements.mesh_name values) rather than a
-- referential invariant the app needs enforced — a revision's summary is
-- a historical record, and should still read correctly even if an
-- element it once referenced is later deleted.
-- -----------------------------------------------------------------------
create table public.revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  label text not null,
  date date not null,
  summary text not null,
  changed_element_ids text[] not null default '{}'
);

comment on table public.revisions is 'The project''s revision history — changed_element_ids is a loose text[] of mesh_name values, not an enforced FK.';

create index revisions_project_id_idx on public.revisions (project_id);

-- -----------------------------------------------------------------------
-- Row level security
--
-- Enabled on every table, with explicit policies rather than one
-- blanket "allow all" rule — this is a review tool for a client and a
-- design studio, not a public wiki, and the posture should say that even
-- in a prototype with no real auth yet:
--
--   - Anyone (the anon key — there's no login flow yet; see the app for
--     when that changes) can SELECT from every table. The whole point of
--     ATRIUM is a shared, browsable review; nothing here is private.
--   - Anonymous INSERT is allowed only on annotations and
--     annotation_replies — the two actions a reviewer without any
--     special privilege is supposed to be able to take: pin a comment,
--     reply to one. Nobody can insert a project, an element, or a
--     revision through the anon key — those come from the design
--     studio's own tooling/import process, not from a reviewer clicking
--     around the model.
--   - Anonymous UPDATE is allowed only on annotations, and only for the
--     one mutation the app actually performs after the fact — marking a
--     comment Resolved. That's tightened with a column-level GRANT
--     below, not left as a row-level free-for-all: RLS policies are
--     row-level (they decide *which* rows an update can touch), so a
--     "reviewers can update annotations" policy on its own would also
--     let a crafted request silently rewrite a comment's body, author,
--     or pinned position — not just its status.
--   - Nothing gets an anonymous UPDATE policy on elements, projects, or
--     revisions — "reviewers can comment but cannot alter the
--     specification" is enforced by those tables having no anonymous
--     write policy of any kind, not by trusting the app's UI to never
--     send that request.
--   - No DELETE policy exists anywhere. Nothing in the app deletes a
--     comment, a reply, or anything else today, so there is no policy
--     inviting it — this list gets a new policy only when a real feature
--     needs one, not in advance of one.
--
-- Every table below gets an explicit REVOKE before its policies, and
-- every policy is paired with an explicit GRANT — both confirmed
-- necessary by actually applying this migration and probing it, not
-- assumed. Two things are true at once here, checked against a real
-- project via information_schema.role_table_grants, not guessed:
--   1. A hosted Supabase project provisions anon/authenticated with
--      broad default privileges (select/insert/update/delete/...) on
--      every table in `public` the moment it exists — before this
--      migration's policies exist at all. Skip the REVOKE and "elements
--      has no insert policy" is *not* actually why writes fail; it's
--      RLS's default-deny doing that work silently, on top of a grant
--      that was never supposed to be there. That's a materially weaker
--      claim than "the privilege to insert was revoked", and it isn't
--      what this migration says it does.
--   2. RLS policies are row-level — they decide *which rows* a request
--      can touch, never *which columns*. A plain database created fresh
--      (a local `supabase start`, no platform provisioning) has *no*
--      default grants at all, so on annotations specifically, the
--      column-scoped UPDATE grant below is what makes "reviewers can
--      change status, not body/author/position" true in both places —
--      the REVOKE clears whatever broad grant may or may not already
--      exist first, so the column grant is the only path back in either
--      way.
-- Revoking from `authenticated` too, alongside `anon`: there's no login
-- flow yet, so nothing should currently reach a table as `authenticated`
-- — but that role got the same broad default grants anon did, and this
-- migration shouldn't leave a privilege sitting unused and unexamined
-- just because nothing happens to exercise it today. Real auth arriving
-- later means new, deliberate grants and policies for that role, not
-- discovering these were already wide open.
-- -----------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.elements enable row level security;
alter table public.annotations enable row level security;
alter table public.annotation_replies enable row level security;
alter table public.revisions enable row level security;

revoke all on public.projects from anon, authenticated;
revoke all on public.elements from anon, authenticated;
revoke all on public.annotations from anon, authenticated;
revoke all on public.annotation_replies from anon, authenticated;
revoke all on public.revisions from anon, authenticated;

-- projects: read-only to anonymous visitors. Project setup is out of
-- scope for the anon key entirely — no insert/update/delete grant or
-- policy exists on this table.
grant select on public.projects to anon;

create policy "projects are publicly readable"
  on public.projects for select
  to anon
  using (true);

-- elements: read-only to anonymous visitors, same reasoning as
-- projects — the FF&E schedule is authored by the design studio, not by
-- reviewers. This is the policy (and the REVOKE above it) that makes
-- "cannot alter the specification" true.
grant select on public.elements to anon;

create policy "elements are publicly readable"
  on public.elements for select
  to anon
  using (true);

-- annotations: readable by everyone, and the one table reviewers are
-- actually meant to write to. Pinning a comment is an anonymous insert
-- (there's no login flow yet, so every reviewer *is* anon); the update
-- policy below covers "mark Resolved" and is granted for the status
-- column only — never the whole row.
grant select, insert on public.annotations to anon;
grant update (status) on public.annotations to anon;

create policy "annotations are publicly readable"
  on public.annotations for select
  to anon
  using (true);

create policy "anyone can pin an annotation"
  on public.annotations for insert
  to anon
  with check (true);

create policy "anyone can update an annotation's status"
  on public.annotations for update
  to anon
  using (true)
  with check (true);

-- annotation_replies: same shape as annotations — read by everyone, and
-- anonymous insert is exactly "reply to a comment thread". No update
-- grant or policy: the app never edits a reply after it's posted, so
-- none is given.
grant select, insert on public.annotation_replies to anon;

create policy "annotation replies are publicly readable"
  on public.annotation_replies for select
  to anon
  using (true);

create policy "anyone can reply to an annotation"
  on public.annotation_replies for insert
  to anon
  with check (true);

-- revisions: read-only, same reasoning as projects/elements — revision
-- history is authored by the design studio's own process, not reviewers.
grant select on public.revisions to anon;

create policy "revisions are publicly readable"
  on public.revisions for select
  to anon
  using (true);
