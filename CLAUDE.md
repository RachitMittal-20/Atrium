# ATRIUM — Engineering Working Agreement

**Project:** ATRIUM — an interactive design presentation tool for architecture
and interior design studios. Built solo for the ArchScale Guild hackathon,
problem statement AS-08 ("Make Design Presentation an Interactive
Experience"). The core idea: replace static drawing PDFs with a navigable 3D
model where any element can be clicked for its specification and status, and
where reviewers pin comments to exact 3D coordinates instead of describing
locations in email.

This file is the standing working agreement for this project. Follow it on
every future turn, not just this one.

## Rules

1. **Plan first.** Before writing code for any task, state the complete plan:
   which files you will create or replace, what each is responsible for, and
   how they connect. Only start writing once the whole plan is settled. Never
   discover the design halfway through.

2. **Write whole files.** Always write a file complete and correct in one
   pass. When something needs to change later, rewrite the entire file from
   scratch rather than patching lines into the existing version. Never leave
   a file in a half-edited state.

3. **Comment for a reader.** Every file opens with a block comment explaining
   what it does and where it sits in the architecture. Inside, each
   meaningful block gets a short comment saying what it does and which other
   part of the app it talks to. Someone should be able to read any file top
   to bottom and understand the system without opening another file.

4. **No speculative complexity.** No abstraction layers, no config systems,
   no generic utilities until there are two real callers. Prefer obvious code
   over clever code.

5. **One task, one commit.** Stop when the task is done. Do not start the
   next piece of work in the same pass. Commit with a clear Conventional
   Commits message before moving on, so the git history reads as a build log.

6. **Types are real.** Strict TypeScript. No `any`. Shared types live in
   `src/types` and are imported, never redeclared.

## Stack

- Next.js 15, App Router, TypeScript strict
- Tailwind CSS v4 (CSS-first config via `@theme`, no `tailwind.config.js`)
- GSAP + `@gsap/react` (free for commercial use, ScrollTrigger + SplitText
  included) — owns everything scroll- and 3D-camera-related
- Lenis — smooth scroll, driven from `gsap.ticker`, never its own RAF loop
- three.js + `@react-three/fiber` + `@react-three/drei` — the 3D scene
- Zustand — shared state across the React/Canvas boundary
- Motion — UI panel and modal transitions only (never scroll or 3D)
- Supabase — Postgres, auth, realtime
- pnpm as the package manager

## Visual direction

Architectural, dark, cinematic and restrained. Deep graphite ground, warm
vellum text, a single brass accent. Enormous negative space. Hairline rules
like drafting lines. Display type: Bodoni Moda. Interface type: IBM Plex
Sans. Data/labels: IBM Plex Mono, uppercase, tracked.
