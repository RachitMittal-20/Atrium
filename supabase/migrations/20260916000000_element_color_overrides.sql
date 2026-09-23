-- ATRIUM — element color overrides
--
-- Lets a reviewer recolor an element in the 3D scene (a sofa, a wall
-- finish) and have that change persist and sync live to other viewers,
-- the same way pinning a comment already does. This can't be a write
-- into elements.specification: the initial schema migration's RLS
-- section is explicit that "nothing gets an anonymous UPDATE policy on
-- elements" — reviewers can comment but never alter the spec sheet
-- itself. A color change needs its own table with its own, narrower anon
-- grant, the same reasoning that gave annotations a scoped INSERT/UPDATE
-- policy instead of a blanket one on some existing table.
--
-- One row per element that has been recolored — no row means "use the
-- model's original material color" (BuildingModel.tsx's cloned-material
-- default, untouched). color is not-null specifically so that "no
-- override" can only ever be expressed as "no row," never as a row with
-- a null/empty color sitting alongside it — one unambiguous way to mean
-- "original," matching src/store/projectStore.ts's own elementColors Map
-- (a key's absence, not a null value, is what "original" means there
-- too). project_id is carried alongside element_id — not the only
-- foreign key needed to find "this element" — purely so reads and the
-- Realtime subscription below can filter `project_id=eq.<id>` the same
-- direct-column way annotations already does, without an extra join; it
-- is always redundant with element_id's own project, never independently
-- settable (nothing here enforces that beyond app discipline, the same
-- trust annotations already places in the app for its own project_id/
-- element_id pairing).
-- -----------------------------------------------------------------------
create table public.element_color_overrides (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  element_id uuid not null references public.elements (id) on delete cascade,
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  updated_at timestamptz not null default now(),
  unique (element_id)
);

comment on table public.element_color_overrides is 'A reviewer-applied color override for one element — no row means the model''s original material color.';

-- REPLICA IDENTITY FULL, not the Postgres default (primary key only):
-- src/lib/realtime.ts listens for this table's DELETE events too (a
-- "reset to original" removing the row — see the RLS section below for
-- why DELETE is granted at all), and a DELETE payload's `old` record
-- only carries the columns REPLICA IDENTITY exposes. With the default
-- identity that would be `id` alone — enough to satisfy Postgres's own
-- replication bookkeeping, but not enough for this app: a remote client
-- needs `element_id` out of that same payload to know *which mesh* to
-- clear, and `id` (an override row's own uuid) isn't a value any client
-- already has cached to look that up by. FULL includes every column,
-- which for a five-column table like this one is a trivial cost.
alter table public.element_color_overrides replica identity full;

-- Queried on every load (getColorOverrides, mirroring getAnnotations) and
-- filtered on by src/lib/realtime.ts's Postgres Changes subscription —
-- the same project_id pattern annotations already uses.
create index element_color_overrides_project_id_idx on public.element_color_overrides (project_id);

-- -----------------------------------------------------------------------
-- Row level security
--
-- Same public-read, narrow-write posture as annotations: anyone (the
-- anon key — still no login flow) can read every override, and can write
-- only the one thing this feature needs written.
--
-- Recoloring an element is an upsert from the app's point of view — the
-- first color set on an element is an insert, a later recolor is an
-- update of that same row, keyed on the unique(element_id) constraint
-- above (src/lib/queries.ts's setColorOverride does exactly this via
-- Postgres's own `insert ... on conflict do update`, which needs both
-- privileges to succeed). So, unlike annotations' insert-once/update-
-- status-only split, this table grants both INSERT and a column-scoped
-- UPDATE — color and updated_at only, never project_id or element_id, so
-- an update can't silently repoint an existing override at a different
-- element or project.
--
-- DELETE is also granted here, which the initial schema migration
-- deliberately gave to nothing at all — that migration's own comment
-- explains why: "this list gets a new policy only when a real feature
-- needs one, not in advance of one." This is that feature: "no row means
-- original color" is the whole design (see the table comment above), so
-- "reset to original" has no other way to express itself than removing
-- the row — there's no null/sentinel color value that could mean the
-- same thing instead (color is not-null and check-constrained to a real
-- hex value above). Same anonymous, row-unscoped shape as every other
-- policy on this table — there's still no login, so there's no "your own
-- override" to scope a delete to, the same posture annotations' own
-- status-update policy already takes.
-- -----------------------------------------------------------------------
alter table public.element_color_overrides enable row level security;

revoke all on public.element_color_overrides from anon, authenticated;

grant select, insert, delete on public.element_color_overrides to anon;
grant update (color, updated_at) on public.element_color_overrides to anon;

create policy "element color overrides are publicly readable"
  on public.element_color_overrides for select
  to anon
  using (true);

create policy "anyone can set an element's color override"
  on public.element_color_overrides for insert
  to anon
  with check (true);

create policy "anyone can update an element's color override"
  on public.element_color_overrides for update
  to anon
  using (true)
  with check (true);

create policy "anyone can remove an element's color override"
  on public.element_color_overrides for delete
  to anon
  using (true);

-- -----------------------------------------------------------------------
-- Realtime publication membership
--
-- Added in this same migration, not a follow-up — this project already
-- hit exactly the bug that split step invites: a table created with
-- correct RLS but never added to Postgres's supabase_realtime
-- publication, so Postgres Changes silently never fired for it at all
-- (see docs/ARCHITECTURE.md's "Known issues we hit and fixed" #1, fixed
-- for annotations/annotation_replies in
-- 20260915000000_realtime_publication.sql only after that bug had
-- already shipped once). Delivery still passes through the SELECT policy
-- above, so this only starts broadcasting changes that were already
-- visible to every client — it grants no new read access.
-- -----------------------------------------------------------------------
alter publication supabase_realtime add table public.element_color_overrides;
