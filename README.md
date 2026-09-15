This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

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
publication, which live comment sync depends on.

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
