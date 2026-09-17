<div align="center">

# ATRIUM

**Make design presentation an interactive experience.**

Built for the ArchScale Guild Intern Technology Hackathon — problem statement **AS-08**.

[![Live Demo](https://img.shields.io/badge/Live_Demo-atrium--ten--rho.vercel.app-d4a24c?style=for-the-badge)](https://atrium-ten-rho.vercel.app/)

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Three.js](https://img.shields.io/badge/Three.js-r186-000000?logo=three.js&logoColor=white)](https://threejs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres_%2B_Realtime-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Zustand](https://img.shields.io/badge/State-Zustand-443E38)](https://zustand.docs.pmnd.rs/)

**[atrium-ten-rho.vercel.app](https://atrium-ten-rho.vercel.app/)** · [Quick start](#getting-started) · [Features](#features) · [Architecture](#architecture)

</div>

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Demo](#demo)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Deploying](#deploying)
- [Architecture](#architecture)
- [Known limitations](#known-limitations)
- [Documentation](#documentation)
- [AI usage](#ai-usage)
- [Credits](#credits)

## Overview

Design presentation today is usually a stack of static PDFs — floor plans, elevations, a finishes schedule — walked through on a call, with feedback arriving as "on the drawing on page 4, near the window" in an email chain.

ATRIUM replaces that with a navigable 3D model of the actual space:

- Any element — a sofa, a fixture, a wall finish — can be clicked for its live specification and approval status.
- Reviewers pin comments to the exact 3D point they're talking about, instead of describing a location in words.
- Multiple reviewers can be in the model at once, watching each other's pins and presence arrive live.

## Features

- **Orbit and walkthrough 3D viewing** — orbit around the model like a turntable, or drop into a first-person WASD walkthrough to move through the space at eye height. Switching modes never resets the camera: leaving walkthrough resumes orbit from exactly the view it had before. See [docs/DECISIONS.md](docs/DECISIONS.md) for why OrbitControls is disabled rather than unmounted to make that possible.
- **Pinned, threaded annotations** — click any point on the model in Pin mode to drop a comment at that exact 3D coordinate (position + surface normal), then reply to build a thread. Comments render as markers in the scene and as a synced list in the review panel; hovering either side highlights the other.
- **Contextual element panel** — clicking any interactive mesh (furniture, fixtures, finishes, structural elements) opens its specification: category, status (Approved / For Review / Revised / Issue), responsible party, and a spec sheet whose fields vary sensibly by category.
- **Revision history** — a compare view on the element panel showing a seeded field-change history (old value → new value) for elements that have one, keyed by the model's own mesh name so it lines up whether the app is running against local demo data or a live Supabase project.
- **Live multi-reviewer sync** — pin a comment or reply in one browser tab and it appears in every other tab open on the same project within roughly a second, via Supabase Realtime. A presence strip shows who else is currently looking at the model, and a connection-status indicator never silently claims to be live once a connection has actually dropped. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#known-issues-we-hit-and-fixed) for two real bugs found and fixed while building this.
- **Graceful demo-data fallback** — with no Supabase project configured (or if one is unreachable), the app runs entirely against local seed data instead of showing a blank or broken page, with a corner badge saying so.

## Demo

**[Try it live →](https://atrium-ten-rho.vercel.app/)**

> [Demo video/GIF here] — a short walkthrough of orbit/walkthrough camera modes, pinning a comment, and live multi-reviewer sync is planned but not yet recorded.

To see it working end to end yourself:

1. Open the [live demo](https://atrium-ten-rho.vercel.app/) and click into the project.
2. Try both **ORBIT** and **WALKTHROUGH** camera modes (top right).
3. Click any piece of furniture or a finish to see its spec sheet.
4. Pin a comment, then open the same URL in a second window/tab and watch it arrive live.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | [Next.js 16](https://nextjs.org/) (App Router, TypeScript strict) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) — CSS-first config via `@theme`, no `tailwind.config.js` |
| 3D scene | [three.js](https://threejs.org/) + [@react-three/fiber](https://r3f.docs.pmnd.rs/) + [@react-three/drei](https://github.com/pmndrs/drei) |
| Motion | [GSAP](https://gsap.com/) + `@gsap/react` for scroll/3D-camera; [Motion](https://motion.dev/) for UI panels/modals only |
| Smooth scroll | [Lenis](https://lenis.darkroom.engineering/), driven from `gsap.ticker` |
| State | [Zustand](https://zustand.docs.pmnd.rs/) — see the "viewport bridge" pattern in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Backend | [Supabase](https://supabase.com/) — Postgres, Row Level Security, Realtime (Postgres Changes + Presence) |
| Package manager | [pnpm](https://pnpm.io/) |

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The app runs immediately against local demo data with no further setup — a Supabase project is only needed for persistence and live multi-reviewer sync.

You can start editing the landing page at `src/app/page.tsx`, or the 3D tool itself at `src/app/project/page.tsx`.

### Environment variables

ATRIUM needs a Supabase project for live data, realtime sync, and comment persistence. Without these set, the app still runs — it falls back to local demo data (the `isDemoData` flag; see `src/data/project.ts` and `DemoDataBadge.tsx`) — just not against a real backend.

Copy `.env.local.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Both come from your Supabase project's **Settings → API** page.

Before using a fresh Supabase project, apply the migrations in `supabase/migrations/` (via the Supabase SQL editor, or `supabase db push` with the CLI linked to that project) — this creates the schema and adds `annotations`/`annotation_replies` to the `supabase_realtime` publication, which live comment sync depends on. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#supabase-schema-and-rls) for the schema and RLS policies in full.

## Deploying

1. Push this repo to GitHub — Vercel deploys from a connected Git repo.
2. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repo. Framework preset auto-detects as Next.js; no build command changes needed.
3. Under **Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the same values as `.env.local` — **never commit these to the repo**; they only go in Vercel's dashboard (or `vercel env add`, if deploying via the CLI).
4. Click **Deploy**. Vercel builds and assigns a `*.vercel.app` URL.
5. Once live, verify against the deployed URL directly (not localhost):
   - `/` loads with the 3D hero scene.
   - `/project` loads with live data — no "Demo data" badge, meaning it successfully reached Supabase.
   - Both ORBIT and WALKTHROUGH camera modes work.
   - Pinning a comment persists (reload the page and it's still there).
   - Opening the deployed URL in two separate browser windows and pinning a comment in one shows it appear live in the other within a couple of seconds, without a manual refresh.

Alternatively, via the Vercel CLI: `npm i -g vercel`, `vercel login`, then `vercel --prod` from the repo root (add the same two env vars first via `vercel env add`, or in the dashboard after the first deploy).

The live deploy at [atrium-ten-rho.vercel.app](https://atrium-ten-rho.vercel.app/) was set up this way, git-connected to auto-deploy on every push to `main`.

## Architecture

A quick summary — the full write-up, including the Supabase schema/RLS, the Zustand "viewport bridge" pattern, and how the r3f render loop is tuned, lives in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**:

- Two routes: `/` (marketing/landing, scroll-driven) and `/project` (the tool, server-rendered per request so every reviewer sees current data).
- `projectStore` (Zustand) is the single cross-boundary bridge between DOM UI and the Canvas — it carries project/annotation data, selection state, and a "viewport bridge" of imperative three.js handles (the live `OrbitControls` instance, mesh/marker `Object3D`s) that DOM components outside the Canvas use to drive the camera.
- The Canvas runs `frameloop="demand"` — nothing renders unless something actually changed — with camera mode (orbit vs. first-person walkthrough) as two mutually-exclusive controllers sharing one camera.
- Supabase Realtime (Postgres Changes + Presence) delivers live sync over one channel per project; RLS policies are explicit per table, not a blanket allow-all.

## Known limitations

- **No collision detection in walkthrough mode.** Movement is clamped to a padded version of the model's bounding box, not per-mesh — it's possible to walk through walls or furniture. A deliberate scope decision, not an oversight (see `WalkthroughControls.tsx`).
- **No authentication.** Every reviewer is anonymous, identified only by a randomly assigned call-sign name per browser tab — there's no login flow yet, by design for this build.
- **Single seeded project.** The schema supports multiple projects, but only one ("Meridian House") is seeded; nothing else in the data model assumes that stays true.

## Documentation

| Doc | What's in it |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | App structure, the Zustand store/viewport-bridge pattern, r3f rendering, the Supabase schema and RLS, how Realtime sync works, and two real bugs hit and fixed along the way |
| [docs/DECISIONS.md](docs/DECISIONS.md) | An ADR-style log of the meaningful technical decisions made building this, and why |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | A measurement-first performance pass across GLB loading, render cost, re-render behaviour, and bundle size, with real before/after numbers |
| [docs/AI-USAGE.md](docs/AI-USAGE.md) | How Claude Code was used throughout this build — see [AI usage](#ai-usage) below |
| [docs/ASSETS.md](docs/ASSETS.md) | Every third-party asset, its source, and its licence |

## AI usage

This project was built with Claude Code in a prompt-driven, one-prompt-per-feature workflow — plan, implement, verify against the real running app, commit. [docs/AI-USAGE.md](docs/AI-USAGE.md) gives the full, honest account, including three specific cases where the first answer was wrong and only caught by checking it against real evidence (a second measurement, a live Supabase project, a reproduced browser session) rather than trusted on its own reasoning.

## Credits

The apartment model rendered throughout ATRIUM is **"Modern apartment interior"** by Katydid ([sketchfab.com/Katydid](https://sketchfab.com/Katydid.)), sourced from [Sketchfab](https://sketchfab.com/3d-models/modern-apartment-interior-400c9069181a4342a7142433dfa3466e) and licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/):

> This work is based on "Modern apartment interior"
> (https://sketchfab.com/3d-models/modern-apartment-interior-400c9069181a4342a7142433dfa3466e)
> by Katydid (https://sketchfab.com/Katydid.) licensed under CC-BY-4.0
> (http://creativecommons.org/licenses/by/4.0/)

Scene lighting uses Poly Haven's "Brown Photostudio 02" HDRI, CC0. Full details, licences, and the optimisation pipeline applied to each asset are in [docs/ASSETS.md](docs/ASSETS.md).
