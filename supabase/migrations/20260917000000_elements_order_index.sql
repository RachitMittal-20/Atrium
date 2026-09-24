-- ATRIUM — curated element order (elements.order_index)
--
-- src/data/project.ts's ELEMENTS array lists every element in a
-- deliberately curated order — grouped by architectural section
-- (envelope, architecture, kitchen, furniture, lighting, fixtures), via
-- that file's own `// --- Section ---` comments — but that order only
-- ever existed in that one local constant. getElements() in
-- src/lib/queries.ts has always ordered by `name` instead (Postgres
-- gives no ordering guarantee without an explicit ORDER BY, and `name`
-- was a reasonable, stable choice at the time), so a live Supabase
-- project has only ever shown elements alphabetically. That mismatch
-- became visible with tour mode: src/components/three/TourControls.tsx
-- steps through the *current* `elements` array in whatever order it's
-- already in, so a live project's tour walked alphabetically instead of
-- the curated architectural order the local demo data's tour already
-- had "for free." This migration gives every project's elements table a
-- real, persisted order of its own, so live and demo data agree.
--
-- order_index is NOT NULL with a DEFAULT, not a nullable column ordered
-- "nulls last" — a deliberate choice beyond just backfilling the 43
-- elements this migration knows about. A nullable column would need
-- every future reader (getElements() here, and anything else that ever
-- queries this table sorted) to keep handling the null case forever, and
-- would quietly break the moment the design studio's own import/tooling
-- process (elements has no anonymous INSERT policy — see the initial
-- schema migration's RLS section — so only that process ever inserts a
-- row here) adds a new element without knowing this column exists. A
-- NOT NULL column with DEFAULT 43 sidesteps both: any row this
-- migration's backfill below doesn't recognise — including any element
-- inserted after this migration runs, by a process that's never heard
-- of order_index — simply keeps the default and sorts immediately after
-- the last curated one (index 42), never needing a null check anywhere
-- that reads this column. 43 is one past the last real index this
-- backfill uses (0-42, one per element in ELEMENTS at the time this
-- migration was written) — not an arbitrary round number, so "falls to
-- the end" means "sorts right after the curated list," not off in some
-- unrelated gap.
--
-- Postgres backfills every existing row's new column from a constant
-- DEFAULT in a single fast metadata change (no full table rewrite) since
-- PG11 — this table's few dozen rows make that moot either way, but it's
-- also just the correct, current way to add a NOT NULL column with
-- existing rows at all.
alter table public.elements
  add column order_index integer not null default 43;

comment on column public.elements.order_index is 'Curated FF&E schedule / tour-mode order, backfilled to mirror src/data/project.ts''s ELEMENTS array order — see this migration''s own header for why the default (43) means "sorts after the curated list," not null.';

-- The actual backfill: one row per element in ELEMENTS, joined on
-- mesh_name (never id — see below) to the (index in that array) it
-- appears at. Generated programmatically from the real, current ELEMENTS
-- array — not hand-typed — by extracting each `el("mesh-name", ...)`
-- call's first argument in source order (a short one-off script, not
-- committed: `re.findall(r'el\(\s*\n?\s*"([^"]+)"', ...)` against the
-- ELEMENTS block in src/data/project.ts) and zipping that list with its
-- own index. That's what keeps this list from ever drifting out of sync
-- with the array it's supposed to mirror — retyping 43 rows by hand is
-- exactly the kind of place a transcription slip would go unnoticed.
--
-- mesh_name, not id: a local Element.id is a fixed "el-*" string
-- (src/data/project.ts's own `el()` helper builds it as `el-${meshName}`)
-- with no guaranteed correspondence to a live table's own uuid primary
-- keys — this codebase already relies on mesh_name, not id, as the one
-- identifier guaranteed to line up between the local seed and a live,
-- independently-seeded project, for exactly this reason (see
-- src/types/project.ts's ElementRevisionEntry.meshName comment, which
-- explains the identical join problem for field-change history).
--
-- Any live row whose mesh_name isn't one of the 43 below (a table
-- seeded from something other than this exact ELEMENTS array, or one
-- with extra rows this array doesn't have) simply keeps the DEFAULT 43
-- from the ADD COLUMN above — see this migration's own header for why
-- that's a sane fallback, not a bug to guard against here.
update public.elements as e
set order_index = v.idx
from (
  values
    ('building-shell-lower', 0),
    ('building-shell-full', 1),
    ('floor-lamp', 2),
    ('accent-wall-panel', 3),
    ('feature-wall-block-tile', 4),
    ('interior-wall-painted', 5),
    ('interior-wall-section', 6),
    ('facade-wall-flat-panel', 7),
    ('interior-wall-secondary', 8),
    ('floor', 9),
    ('ceiling-section', 10),
    ('ceiling', 11),
    ('interior-door', 12),
    ('window-glass-pane', 13),
    ('window-glass-pane-large', 14),
    ('window-frame-vertical', 15),
    ('door-frame-trim', 16),
    ('baseboard-skirting', 17),
    ('shelf-edge-trim', 18),
    ('vertical-trim-column', 19),
    ('kitchen-countertop', 20),
    ('kitchen-appliances', 21),
    ('media-console', 22),
    ('wooden-shelf-decor', 23),
    ('bookshelf', 24),
    ('sofa', 25),
    ('coffee-table-top', 26),
    ('small-tray-table', 27),
    ('shelf-counter-ledge', 28),
    ('framed-mirror', 29),
    ('potted-plant', 30),
    ('area-rug', 31),
    ('curtain-panel', 32),
    ('curtain-tieback-cord', 33),
    ('curtain-panel-sheer', 34),
    ('lamp-shade', 35),
    ('table-lamp-base', 36),
    ('cabinet-handle', 37),
    ('cabinet-knob-1', 38),
    ('door-cabinet-handle', 39),
    ('small-wall-fixture', 40),
    ('cabinet-knob-2', 41),
    ('decorative-object', 42)
) as v (mesh_name, idx)
where e.mesh_name = v.mesh_name;
