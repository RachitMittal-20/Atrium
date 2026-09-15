# ATRIUM

**Live demo: [atrium-ten-rho.vercel.app](https://atrium-ten-rho.vercel.app/)**

ATRIUM is an interactive design-review tool for architecture and interior
design studios, built for the ArchScale Guild Intern Technology Hackathon
against problem statement **AS-08 — "Make Design Presentation an
Interactive Experience."**

Design presentation today is usually a stack of static PDFs — floor plans,
elevations, a finishes schedule — walked through on a call, with feedback
arriving as "on the drawing on page 4, near the window" in an email chain.
ATRIUM replaces that with a navigable 3D model of the actual space: any
element (a sofa, a fixture, a wall finish) can be clicked for its live
specification and approval status, and reviewers pin comments to the exact
3D point they're talking about instead of describing a location in words.
Multiple reviewers can be in the model at once, watching each other's pins
and presence arrive live.

## Key features

- **Orbit and walkthrough 3D viewing** — orbit around the model like a
  turntable, or drop into a first-person WASD walkthrough to move through
  the space at eye height. Switching modes never resets the camera:
  leaving walkthrough resumes orbit from exactly the view it had before.
  See [docs/DECISIONS.md](docs/DECISIONS.md) for why OrbitControls is
  disabled rather than unmounted to make that possible.
- **Pinned, threaded annotations** — click any point on the model in Pin
  mode to drop a comment at that exact 3D coordinate (position + surface
  normal), then reply to build a thread. Comments render as markers in the
  scene and as a synced list in the review panel; hovering either side
  highlights the other.
- **Contextual element panel** — clicking any of the model's interactive
  meshes (furniture, fixtures, finishes, structural elements) opens its
  specification: category, status (Approved / For Review / Revised /
  Issue), responsible party, and a jsonb spec sheet whose fields vary
  sensibly by category.
- **Revision history** — a compare view on the element panel showing a
  seeded field-change history (old value → new value) for elements that
  have one, keyed by the model's own mesh name so it lines up whether the
  app is running against local demo data or a live Supabase project.
- **Live multi-reviewer sync** — pin a comment or reply in one browser tab
  and it appears in every other tab open on the same project within
  roughly a second, via Supabase Realtime. A presence strip shows who else
  is currently looking at the model, and a connection-status indicator
  never silently claims to be live once a connection has actually dropped
  — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)'s "Known issues we
  hit and fixed" for two real bugs found and fixed while building this.
- **Graceful demo-data fallback** — with no Supabase project configured
  (or if one is unreachable), the app runs entirely against local seed
  data instead of showing a blank or broken page, with a corner badge
  saying so.

## Tech stack

- **Next.js 16** (App Router, TypeScript strict)
- **Tailwind CSS v4** — CSS-first config via `@theme`, no `tailwind.config.js`
- **GSAP** + `@gsap/react` — owns all scroll- and 3D-camera-related motion
- **Lenis** — smooth scroll, driven from `gsap.ticker`
- **three.js** + **@react-three/fiber** + **@react-three/drei** — the 3D scene
- **Zustand** — shared state across the React/Canvas boundary (see
  `src/store/projectStore.ts`'s "viewport bridge" pattern in
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md))
- **Motion** — UI panel/modal transitions only, never scroll or 3D
- **Supabase** — Postgres, Row Level Security, Realtime (Postgres Changes + Presence)
- **pnpm** as the package manager

## Local setup

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The app runs
immediately against local demo data with no further setup — a Supabase
project is only needed for persistence and live multi-reviewer sync.

You can start editing the landing page by modifying `src/app/page.tsx`, or
the 3D tool itself at `src/app/project/page.tsx`.

## Environment variables

ATRIUM needs a Supabase project for live data, realtime sync (pinning a
comment, live multi-reviewer presence), and comment persistence. Without
these set, the app still runs — it falls back to local demo data (the
`isDemoData` flag; see `src/data/project.ts` and `DemoDataBadge.tsx`) —
just not against a real backend.

Copy `.env.local.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Both come from your Supabase project's **Settings → API** page. Before
using a fresh Supabase project, apply the migrations in
`supabase/migrations/` (via the Supabase SQL editor, or `supabase db
push` with the CLI linked to that project) — this creates the schema and
adds `annotations`/`annotation_replies` to the `supabase_realtime`
publication, which live comment sync depends on. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the schema and RLS
policies in full.

## Deploy on Vercel

1. Push this repo to GitHub (`git push`, if you haven't already — Vercel
   deploys from a connected Git repo).
2. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub
   repo. Framework preset auto-detects as Next.js; no build command
   changes needed.
3. Under **Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the same values as your
   `.env.local` — **never commit these to the repo**; they only go in
   Vercel's dashboard (or `vercel env add`, if deploying via the CLI).
4. Click **Deploy**. Vercel builds and assigns a `*.vercel.app` URL.
5. Once live, verify against the deployed URL directly (not localhost):
   - `/` loads with the 3D hero scene.
   - `/project` loads with live data — no "Demo data" badge, meaning it
     successfully reached Supabase.
   - Both ORBIT and WALKTHROUGH camera modes work.
   - Pinning a comment persists (reload the page and it's still there).
   - Opening the deployed URL in two separate browser windows and
     pinning a comment in one shows it appear live in the other within a
     couple of seconds, without a manual refresh.

Alternatively, via the Vercel CLI: `npm i -g vercel`, `vercel login`,
then `vercel --prod` from the repo root (add the same two env vars first
via `vercel env add`, or in the dashboard after the first deploy).

The live deploy at [atrium-ten-rho.vercel.app](https://atrium-ten-rho.vercel.app/)
was set up this way, git-connected to auto-deploy on every push to `main`.

## More documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — technical overview: app
  structure, the Zustand store/viewport-bridge pattern, r3f rendering
  (frameloop demand vs always, camera modes), the Supabase schema and RLS,
  and how Realtime sync actually works — including two real bugs hit and
  fixed along the way.
- [docs/DECISIONS.md](docs/DECISIONS.md) — an ADR-style log of the
  meaningful technical decisions made building this, and why.
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md) — a measurement-first
  performance pass across GLB loading, render cost, re-render behaviour,
  and bundle size, with real before/after numbers.
- [docs/AI-USAGE.md](docs/AI-USAGE.md) — an honest account of how Claude
  Code was used throughout this build, including where its first guess
  was wrong and had to be corrected by evidence.
- [docs/ASSETS.md](docs/ASSETS.md) — every third-party asset, its
  source, and its licence (see Credits below).

## Credits

The apartment model rendered throughout ATRIUM is **"Modern apartment
interior"** by Katydid
([sketchfab.com/Katydid](https://sketchfab.com/Katydid.)), sourced from
[Sketchfab](https://sketchfab.com/3d-models/modern-apartment-interior-400c9069181a4342a7142433dfa3466e)
and licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/):

> This work is based on "Modern apartment interior"
> (https://sketchfab.com/3d-models/modern-apartment-interior-400c9069181a4342a7142433dfa3466e)
> by Katydid (https://sketchfab.com/Katydid.) licensed under CC-BY-4.0
> (http://creativecommons.org/licenses/by/4.0/)

Scene lighting uses Poly Haven's "Brown Photostudio 02" HDRI, CC0. Full
details, licences, and the optimisation pipeline applied to each asset are
in [docs/ASSETS.md](docs/ASSETS.md).
