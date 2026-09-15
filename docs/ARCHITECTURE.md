# Architecture

A technical overview of how ATRIUM is put together: the App Router
structure, the Zustand store that bridges the React/Canvas boundary, how
the three.js scene renders, the Supabase schema and RLS posture, and how
live multi-reviewer sync actually delivers a pinned comment from one
browser tab to another. Ends with two real bugs hit and fixed while
building this, on the theory that a "known issues" section that only
lists things still broken isn't useful — the ones that got found and
fixed are the more honest signal of how solid the rest of this is.

## App Router structure

Two routes, both under `src/app/`:

- **`/` (`src/app/page.tsx`)** — the marketing/landing page: `Hero` (a
  cinematic 3D shot of the model, non-interactive), then `Friction`,
  `Shift`, `Invitation` — a scroll-driven narrative making the case for
  the product before the visitor reaches the tool itself.
- **`/project` (`src/app/project/page.tsx`)** — the tool: a full-viewport
  interactive 3D viewer. This is a **Server Component**, not a client
  one — `loadInitialData()` runs on the server, before the page ever
  reaches the browser, and falls back to `src/data/project.ts`'s local
  seed data (flagging `isDemoData: true`) if Supabase isn't configured,
  the project table is empty, or any part of the fetch throws. That
  catch-all is deliberate: this route must never ship a blank screen
  because a network call failed.

`ProjectHydrator` (a client component wrapping the page's children) takes
that server-fetched `HydrationData` and calls `projectStore.hydrate()`
with it from a `useEffect` on first client render — not during render
itself, because this store is one Node-process-wide singleton and
Next.js server-renders `"use client"` components by default; writing
hydration data during render would leak one request's data into
another's initial render under concurrent load. `RealtimeProvider` mounts
the same way, for the same reason, to open the live-sync channel.

`export const dynamic = "force-dynamic"` on `/project` matters for a
subtler reason than it looks: without it, Next prerenders the route once
at build time (no dynamic segment or request-time API forces the other
way on its own), which would bake in whatever annotations existed at
build time for every visitor afterward. This is a live review tool —
every request needs its own fetch.

## State: the Zustand store and the viewport-bridge pattern

`src/store/projectStore.ts` is the single store for everything
project-related: project/elements/annotations data, selection, pin mode,
camera mode, toasts, and live-sync state. A few things about its shape
are worth calling out because they're not obvious from a quick skim:

- **The "viewport bridge."** Three.js objects — the live `OrbitControls`
  instance, `invalidate()`, each interactive mesh's `Object3D`, each
  annotation marker's `Object3D` — are registered into the store as
  **plain closed-over objects**, not store state (`registerViewport`,
  `registerElementObject`, `registerAnnotationObject`). Components
  *inside* the Canvas (`Scene.tsx`, `BuildingModel.tsx`,
  `AnnotationMarker.tsx`) write into these on mount; components *outside*
  the Canvas (`ElementPanel.tsx`, `ReviewList.tsx`) read them to
  imperatively drive the camera (`easeCameraTo`, a GSAP tween) onto
  whatever the user just selected — from all the way outside the R3F
  render tree. Using plain objects instead of `set()`-tracked state here
  is deliberate: registering a mesh's ref on every mount would otherwise
  trigger a React re-render every time, for state nothing renders from.
- **`isDemoData`** says whether the store is currently holding local seed
  data or server-fetched live data. `DemoDataBadge.tsx` reads it for the
  corner label; `pinAnnotation()` reads it to decide whether a new pin is
  worth attempting to persist at all (demo data has no backend to persist
  to — attempting a write would just fail and roll back a marker the user
  has no way to actually save); `RealtimeProvider` reads it to decide
  whether there's a real backend worth subscribing to.
- **Optimistic writes, and how they dedupe against their own echo.**
  `pinAnnotation` appends the new annotation to local state — with a
  client-generated `id` — synchronously, before any network call, so a
  marker appears the instant you click Pin. When that same insert echoes
  back over the realtime channel a moment later, `mergeRemoteAnnotation`
  sees that id already present and quietly refreshes the row in place
  instead of appending a duplicate or firing the arrival toast a second
  time. Only a genuinely new id — someone else's pin — takes the
  "append and announce" branch. This is the one dedupe point for the
  whole realtime pipeline; there's no separate "was this my own write"
  flag anywhere else.
- **Revision history is keyed by `meshName`, not `id`.** See
  [docs/DECISIONS.md](DECISIONS.md) for why.

## Rendering: three.js / @react-three/fiber

`src/components/three/Scene.tsx` owns the Canvas. Two settings are worth
explaining because they weren't the obvious default choice:

**`frameloop="demand"`, always, in every camera mode.** Nothing renders
unless something actually invalidated the frame. React-driven prop
changes and drei's `OrbitControls` already call `invalidate()` on their
own; the one thing genuinely outside that system is page scroll (Lenis
moves the DOM directly, not any r3f state), so a small `InvalidateOnScroll`
component explicitly wires `scrollStore` to `invalidate()`. Walkthrough
mode briefly ran under `frameloop="always"` instead, on the theory that
WASD movement needs a new frame every tick — measured against the
alternative and found it wasn't true: `WalkthroughControls` already calls
`invalidate()` on every keydown, every frame it actually moves the
camera, and every look-around drag. `"always"` bought nothing but ~1,400
wasted draw calls/second the instant you opened walkthrough and stood
still. See [docs/PERFORMANCE.md](PERFORMANCE.md) finding #4 for the
measured numbers.

**Camera modes are two mutually-exclusive controllers, but only one is
ever unmounted.** `projectStore`'s `cameraMode` ("orbit" | "walkthrough")
decides which of `OrbitControls` or `WalkthroughControls` drives the
camera each frame. `OrbitControls` is **never unmounted** for this — only
its `enabled` prop toggles. `WalkthroughControls`, on mount, saves the
camera's exact position/quaternion and drops to eye height; on unmount
(switching back to orbit) it restores that exact saved
position/quaternion before `OrbitControls` re-enables. The reason
`OrbitControls` specifically is disabled rather than unmounted: an
unmounted-then-remounted instance would construct fresh, with its target
reset to the origin, losing whatever pan/orbit state it had built up —
disabling it (drei's `OrbitControls` only calls `.update()` when
`controls.enabled` is true) stops it from fighting `WalkthroughControls`'
writes to `camera.position`/`quaternion` each frame, while keeping the
same instance and its target alive underneath. This is what makes
switching back to ORBIT resume exactly where it was, not reset.

**The model's units aren't metric**, and nothing in the scene assumes
they are. Every node transform in the source GLB is identity, so
three.js takes the raw vertex data literally and the apartment ends up
several thousand units across (measured bounding-sphere radius ≈ 7,027).
`Model()` (inside `Scene.tsx`) measures the real rendered bounding
sphere after centering and derives everything scale-dependent from that
one measurement, never a hardcoded guess:

- `camera.near = radius / 100` (≈ 70.3), `camera.far = radius * 100`
  (≈ 702,718)
- `ContactShadows`' size, from the measured box extents
- `OrbitControls`' `minDistance = radius * 0.015` (≈ 105, 1.5× near —
  close enough to cross the building envelope and inspect interiors, with
  headroom against near-plane clipping) and `maxDistance = radius * 4`
- `WalkthroughControls`' eye height and bounds-padding, from the same
  measured box

## Supabase: schema and RLS

Five tables (`supabase/migrations/20260914091203_initial_schema.sql`),
mirroring `src/types/project.ts` exactly so the database's shape and the
shape the app already trusts never drift apart:

| Table | Purpose |
|---|---|
| `projects` | One row per project ATRIUM manages. |
| `elements` | The FF&E/finishes schedule — one row per interactive mesh, matched by `mesh_name`, `unique(project_id, mesh_name)`. |
| `annotations` | A review comment pinned to an exact 3D point — position/normal stored as six `double precision` columns, not a geometry type (no spatial querying is planned; a plain tuple read-back needs no interpretation). |
| `annotation_replies` | A threaded reply — its own table, not a jsonb array on `annotations`, so two reviewers replying to the same comment at once never race a read-modify-write. |
| `revisions` | Revision history; `changed_element_ids text[]` is a loose, denormalised list of mesh names, not an enforced FK — a historical record should still read correctly even if an element it once referenced is later deleted. |

**RLS is enabled on every table with explicit policies**, not a blanket
allow-all — a design-review tool for a client and a studio, not a public
wiki, even without a login flow yet:

- Every table is publicly `SELECT`-able (anon key) — the whole point of
  ATRIUM is a shared, browsable review.
- Anonymous `INSERT` is allowed only on `annotations` and
  `annotation_replies` — pin a comment, reply to one. Nothing else is
  anonymously insertable.
- Anonymous `UPDATE` is allowed only on `annotations`, and only for the
  `status` column specifically (`grant update (status) on
  public.annotations to anon`) — a row-level RLS policy alone can't
  restrict *which columns* an update touches, so "reviewers can mark
  Resolved but can't rewrite a comment's body/author/position" is
  enforced by this column-level grant, not by trusting the UI never to
  send that request.
- No table gets a `DELETE` policy — nothing in the app deletes anything
  today, so no policy invites it.
- Every table gets an explicit `revoke all ... from anon, authenticated`
  before its policies are granted, because a hosted Supabase project
  provisions broad default privileges on every table in `public` the
  moment it's created — skipping the revoke would mean RLS's
  default-deny is silently doing the work instead of the policies
  actually saying so.

A second migration
(`supabase/migrations/20260915000000_realtime_publication.sql`) adds
`annotations` and `annotation_replies` to Postgres's `supabase_realtime`
publication — without this, Realtime's Postgres Changes subscriptions
sit open and simply never receive anything. This was the root cause of
one of the two bugs below.

## Realtime sync

`src/lib/realtime.ts`'s `subscribeToProject()` opens one Supabase
Realtime channel per project (topic `project:<id>`), combining:

- **Postgres Changes** — `INSERT` on `annotations` (filtered to this
  project) and `annotation_replies` (unfiltered — that table has no
  `project_id` column to filter on server-side, so every reply insert for
  every project reaches every subscribed client; the store's
  `mergeRemoteReply` silently no-ops when the `annotation_id` isn't one
  it currently has loaded, which stands in for the server-side filter the
  table doesn't support).
- **Presence** — each tab tracks a randomly-generated `Reviewer` identity
  (a call-sign name, one of three accent colours) under the channel;
  every tab's `onPresenceSync` handler receives the full current set on
  each sync event.

`RealtimeProvider.tsx` is the one caller, from a `useEffect`. Connection
status (`"connecting" | "connected" | "reconnecting"`) is surfaced
directly in the UI (`PresenceIndicator.tsx`) rather than a static "Live"
label that could lie — reconnection uses exponential backoff starting at
1s, capped at 15s, resetting back to 1s the moment a connection actually
succeeds.

## Known issues we hit and fixed

Real engineering on this build wasn't "it worked first try" — two
genuine bugs were found and fixed in the realtime layer specifically,
during a debugging pass after live multi-reviewer sync initially
appeared to work but a second review found it wasn't actually
delivering.

### 1. Missing Realtime publication membership

**Symptom**: pinning a comment in one browser window never appeared in a
second window watching the same project — no error, the channel reported
"connected," it just silently never received anything.

**Root cause**: Supabase Realtime's Postgres Changes feature only
streams changes for tables explicitly added to Postgres's
`supabase_realtime` publication. The initial schema migration created
`annotations` and `annotation_replies` with RLS policies making them
correctly readable, but never added them to that publication — a
separate, easy-to-miss step from RLS itself. The subscription was
listening on a channel that Postgres was never configured to broadcast
those two tables' changes into.

**Fix**: `supabase/migrations/20260915000000_realtime_publication.sql`,
`alter publication supabase_realtime add table public.annotations` (and
the replies table). Delivery still passes through each table's existing
RLS `SELECT` policy — this only starts broadcasting changes that were
already visible to every client, it grants no new read access.

### 2. Reconnect-storm recursion

**Symptom**: found while testing the fix above — under certain
conditions (reliably reproduced by React's dev-mode StrictMode
double-invoking the subscribing effect: mount → cleanup → mount), the
browser tab would peg the CPU and eventually crash with a stack overflow.

**Root cause**: `client.removeChannel()` is asynchronous — it awaits the
channel's own unsubscribe handshake before deregistering it, and that
handshake re-invokes the channel's `.subscribe()` status callback with
`CLOSED` as part of *normal* teardown, not as a new failure. The original
reconnect logic treated every `CLOSED` status as a dropped connection and
called `scheduleReconnect()` unconditionally — including for this
expected teardown `CLOSED`. That tore down the *new* channel `scheduleReconnect`
had just opened, which fired its own `CLOSED`, which scheduled another
reconnect, recursing synchronously with no base case until the stack
overflowed.

**Fix**: the outer closure's current-channel pointer (`channel`) is set
to the just-created channel *before* `.on()`/`.subscribe()` are wired up,
and explicitly nulled out (in `teardownChannel`) *before*
`removeChannel()` is ever called — synchronously, ahead of any reentrant
callback firing. The status callback then checks `if (channel !==
nextChannel) return` as its very first line: a stale re-fire from a
channel already being torn down always fails that check now and no-ops,
because `channel` no longer points at it by the time the reentrant call
happens. A genuinely new failure (a real `CHANNEL_ERROR`/`TIMED_OUT`, or
a `CLOSED` from a channel that's still the active one) still schedules a
reconnect exactly as before. See `src/lib/realtime.ts`'s own inline
comments on `teardownChannel` and the `.subscribe()` callback for the
full blow-by-blow.

Both fixes are covered in more implementation detail in
[docs/AI-USAGE.md](AI-USAGE.md), including the debugging process that
found them.
