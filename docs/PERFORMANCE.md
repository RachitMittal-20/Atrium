# Performance pass

A measurement-first pass through the four areas asked for: GLB loading,
render cost under `frameloop="demand"`/`"always"`, Zustand re-render
behaviour, and production bundle size. Every number below was actually
measured against a real build and a real (or real-headless-browser)
client — nothing here is estimated or assumed. Where a fix was contained
and low-risk it's applied and verified; where it wasn't, it's documented
with a concrete suggested fix instead of being risked this close to the
deadline.

Scope: measurement and safe optimisation only. Nothing about annotation,
realtime sync, or walkthrough *functional* behaviour changed — every fix
below was re-verified against the live Supabase project (pinning a
comment, realtime delivery into a walkthrough-mode window) after landing.

## Methodology

- **Bundle size**: `next build` (Turbopack), then measuring the actual
  `.js` files under `.next/static/chunks` referenced by each route's
  served HTML (`grep`-ing the real `<script>` tags out of
  `.next/server/app/index.html` and a `next start` response for
  `/project`, not guessing which chunk belongs to which route). Raw
  bytes via `wc -c`, transfer-equivalent bytes via `gzip -9 | wc -c`
  (matches what an HTTP client actually receives once the server
  compresses the response — confirmed the server really does this, see
  below, rather than assuming gzip application).
- **GLB/HDRI transfer**: `curl -D -` against a running server (both `next
  dev` and `next start`) with and without `Accept-Encoding: gzip`, and a
  Playwright `page.on("response")` listener against a real headless
  Chromium load of both routes — this is what caught the 19.2MB HDRI
  fetch that Lighthouse's own network-request capture missed (see
  below).
- **Render cost**: a Playwright `page.addInitScript` patches
  `WebGLRenderingContext`/`WebGL2RenderingContext`'s
  `drawElements`/`drawArrays`/`drawElementsInstanced`/`drawArraysInstanced`
  before any app code runs, counting real GPU draw calls over a fixed
  3-second window. This is a direct measurement of "did three.js actually
  render," not a proxy like counting `requestAnimationFrame` ticks (which
  fire continuously regardless of whether anything drew).
- **Re-render counts**: temporary `console.count()` instrumentation in
  the component under test, reproduced with real Supabase inserts (via a
  temporary `window.__supabase` exposure, the same technique used for the
  P18 realtime investigation) so the store update is a genuine realtime
  merge, not a simulated one. All instrumentation was removed before
  landing the fix — the only trace of it is this document.
- **Lighthouse**: `lighthouse` CLI (v13.0.3) against `next start` (a real
  production build, not dev), performance + best-practices categories,
  default simulated-throttling profile (the standard Lighthouse mobile
  preset: ~1.6 Mbps down, 150ms RTT, 4× CPU slowdown).

## Findings

| # | Issue | Impact | Status |
|---|---|---|---|
| 1 | GLB served uncompressed-on-top? | N/A — confirmed already gzip-compressed in transit | Confirmed working, no fix needed |
| 2 | GLB re-fetched/re-parsed on interaction | N/A — confirmed fetched exactly once per session | Confirmed working, no fix needed |
| 3 | Duplicate three.js copy in the bundle | N/A — confirmed exactly one copy | Confirmed working, no fix needed |
| 4 | Walkthrough mode's `frameloop="always"` rendered continuously even standing still | ~1400 draw calls/sec wasted whenever walkthrough was open and idle | **Fixed** |
| 5 | `ElementPanel` re-rendered on every annotation change anywhere, including remote arrivals for unrelated elements | 6 wasted re-renders measured for 3 unrelated remote inserts | **Fixed** |
| 6 | `@supabase/supabase-js` reachable from the marketing homepage's bundle via `BuildingModel.tsx`'s static import chain | −244KB raw / −62KB gzip off every homepage visitor's JS, even though the homepage never touches Supabase | **Fixed** |
| 7 | `public/models`/`public/hdri` served with `Cache-Control: max-age=0` (revalidate every load) vs Next's own hashed chunks getting a 1-year immutable cache | Every repeat page load re-validates a 1.3MB+19.2MB asset pair | **Fixed** |
| 8 | Studio HDRI (`brown_photostudio_02_4k.exr`) was a **19.2MB** uncompressed EXR, fetched by both `/` and `/project`, for image-based lighting only (`background={false}`) | Was by far the single largest asset on either page — larger than the GLB, the JS bundle, and every other asset combined | **Fixed** — swapped for Poly Haven's own 2K export of the same source HDRI: 19.2MB → 4.9MB (−74.4%) |
| 9 | Draco decoder loaded from a third-party CDN (`gstatic.com`) rather than self-hosted | External dependency; minor extra DNS/TLS round trip on first load | Documented, not fixed (low priority, small effect) |
| 10 | `HDRI_PANORAMA_PATH` (`art_studio_4k.jpg`, 6MB) defined in `src/lib/assets.ts` but never imported anywhere | Dead reference, not a load-time cost (unrequested files in `public/` cost nothing) | Documented (housekeeping, not performance) |

## Detail

### 1–3. GLB loading — confirmed working, no changes made

- **Compression in transit**: `curl -D - -H "Accept-Encoding: gzip"` against both `next dev` and `next start` shows `Content-Encoding: gzip` on `apartment.glb`, and the transferred body is genuinely smaller than the file on disk — **1,325,180 bytes on disk → 1,140,968 bytes actually transferred** (~14% smaller), even though the GLB's own payload is already Draco-compressed geometry + WebP textures. That reduction comes from the glTF JSON chunk (node graph, accessors, material defs for 43+ meshes), which gzip still meaningfully shrinks even though the embedded binary barely compresses further (a local `gzip -9` of the raw file independently gets it to 1,109,374 bytes, confirming the server isn't leaving compression on the table).
- **No re-fetch on interaction**: a Playwright `request` listener counted exactly **1** request for `apartment.glb` per page session, before and after switching camera modes (orbit ↔ walkthrough), opening/closing ElementPanel, and selecting different elements. `src/lib/assets.ts`'s `useGLTF.preload(MODEL_PATH)` plus drei/`three-stdlib`'s loader cache (keyed by URL) is doing exactly what its own comment claims.
- **No re-upload to GPU**: `BuildingModel.tsx`'s `meshMaterials` is `useMemo`'d on `[materials, interactive]`, and `materials` is the same cached object reference from `useGLTF` across renders — clones only get created once, not per render. Geometry comes straight from the same cached parse result, so three.js's internal `WebGLGeometries` cache (keyed by geometry identity) never sees a "new" geometry to re-upload.
- **No duplicate three.js**: grepped every built chunk for three.js's own `revision` string constant — it appears exactly once (`"186"`), across the entire production build. No second copy pulled in by a mismatched `three-stdlib` peer version or similar.
- **Draco decoder**: `@react-three/drei`'s `useGLTF` fetches the Draco WASM decoder from `https://www.gstatic.com/draco/versioned/decoders/1.5.5/` by default (confirmed by reading drei's source, not assumed) — a third-party CDN dependency, not self-hosted. Lighthouse's network trace shows it costing ~87KB and one extra DNS/TLS round trip. Not fixed: self-hosting it means vendoring decoder files and calling `useGLTF.setDecoderPath`, a real but small win not worth the risk this close to the deadline.

### 4. Walkthrough's `frameloop="always"` — fixed

`WalkthroughControls.tsx` (added for the walkthrough-mode feature) already
calls `invalidate()` on every keydown, every frame it actually moves the
camera, and every `pointermove` while dragging to look around — the exact
self-re-invalidation pattern every other continuous interaction in this
app already uses (`easeCameraTo`'s GSAP tweens, `InvalidateOnScroll`).
Scene.tsx nonetheless switched the whole Canvas to `frameloop="always"`
whenever walkthrough was active, on the assumption that WASD needed
continuous rendering. Measured that assumption directly:

| Condition | Draw calls / 3s idle | Draw calls / 3s while moving |
|---|---|---|
| Orbit mode | 0 | — |
| Walkthrough, `frameloop="always"` (before) | **4,200** (~1,400/s) | 2,876 |
| Walkthrough, `frameloop="demand"` (after) | **0** | 1,865 |

Switching `Scene.tsx` back to a single, unconditional `frameloop="demand"`
(removing the mode-dependent branch entirely) eliminated 100% of the idle
draw calls while leaving active-movement rendering intact — confirmed
smooth movement, look-around, bounds clamping, and orbit-mode restore
still all work identically (re-ran the full P19 walkthrough functional
test suite after the change). No console spam observed in either mode
beyond one pre-existing, unrelated `THREE.Clock` deprecation warning from
three.js itself.

### 5. `ElementPanel`'s over-broad `annotations` subscription — fixed

Audited every `useProjectStore(...)` call in the codebase (32 call sites
across 11 components). Nearly all of them already use the correct,
minimal single-field selector pattern (`(state) => state.someField`).
`ReviewList.tsx` and `BuildingModel.tsx` both subscribe to the *entire*
`annotations` array, but that's not over-subscription — they each
genuinely render something for every annotation (a list row; a 3D
marker), so there's no narrower slice to give them.

`ElementPanel.tsx` was the one real case: it subscribed to the full
`annotations` array purely to `useMemo`-filter it down to the *selected
element's* thread — but since the subscribed array gets a new reference
on every store write regardless of which element it touched, the
`useMemo` bought nothing (its own dependency was never stable), and the
component re-rendered on every single annotation change anywhere,
including a remote realtime arrival for a completely different,
unselected element.

Fixed by filtering *inside* a `useShallow`-wrapped selector
(`zustand/react/shallow`) instead of subscribing to the raw array and
filtering after: the derived thread is now compared by shallow array
equality, so a re-render only happens when the annotations belonging to
the *currently open* element actually change.

Measured directly (temporary `console.count()`, reverted before landing):

| Scenario | `ElementPanel` re-renders |
|---|---|
| 3 remote inserts for an **unrelated** element, before fix | 6 |
| 3 remote inserts for an **unrelated** element, after fix | **0** |
| 1 remote insert for the **currently-open** element, after fix | 2 (correct — dev-mode double-render; still updates) |

Confirmed the fix doesn't change any observable behaviour: a relevant
remote annotation still appears in the open panel within the same
realtime delivery window as before.

### 6. `@supabase/supabase-js` leaking into the homepage bundle — fixed

The marketing homepage (`/`) renders `Hero` → `HeroScene` →
`<BuildingModel interactive={false} />` for its cinematic 3D shot.
`BuildingModel.tsx` statically imports `useProjectStore` from
`@/store/projectStore` unconditionally (hooks can't be called
conditionally), and `projectStore.ts` in turn had a static top-level
`import { createAnnotation } from "@/lib/queries"` — which imports
`src/lib/supabase.ts`, which calls `createClient()` from
`@supabase/supabase-js` (740KB on disk, unminified) at module scope. That
whole chain was reachable from, and therefore bundled into, the homepage
— even though `interactive={false}` means the homepage's hero shot never
calls `pinAnnotation` or touches Supabase at all.

Fixed with a single, contained change: `pinAnnotation` now does
`const { createAnnotation } = await import("@/lib/queries")` instead of a
static top-level import. `pinAnnotation` was already `async`/awaited, so
this is a drop-in change with identical behaviour — the dynamic import
just means that code, and everything it pulls in, only ever loads into a
browser that actually calls this action (which `/` never does).

Measured by building twice (once before, once after, same methodology
both times — every chunk the homepage's own served HTML actually
references, summed):

| | Raw JS | Gzip JS |
|---|---|---|
| Homepage (`/`), before | 2,217,595 B | 631,949 B |
| Homepage (`/`), after | 1,973,266 B | 569,504 B |
| **Difference** | **−244,329 B (−11.0%)** | **−62,445 B (−9.9%)** |

Confirmed zero remaining `@supabase`/`GoTrueClient`/`createClient`
references in any chunk the homepage's HTML references after the fix
(grepped every one). Confirmed `/project` still gets the full Supabase
client (in its own, separately-loaded chunk) and that pinning a comment
against the live Supabase project still works end to end, through a real
production (`next start`) build — no rollback toast, new row visible,
zero console errors.

### 7. Static asset cache headers — fixed

`public/models/apartment.glb` and everything under `public/hdri/` were
served with `Cache-Control: public, max-age=0` — Next.js only assigns its
own long-lived, hashed-filename cache headers to `/_next/static/*` build
output (confirmed: a `/_next/static/chunks/*.js` request returns
`Cache-Control: public, max-age=31536000, immutable`), not to arbitrary
files under `public/`. Every single page load was revalidating a 1.3MB+
GLB and a 19.2MB HDRI.

Added a `headers()` rule in `next.config.ts` giving `/models/:path*` and
`/hdri/:path*` `Cache-Control: public, max-age=86400` (one day) —
deliberately *not* `immutable` or a full year, since these filenames
aren't content-hashed (`docs/ASSETS.md`'s optimisation pipeline always
writes `apartment.glb`, not a hash-suffixed name), so an aggressively
long non-revalidating cache would risk a returning visitor being stuck on
a stale asset for months if the model or HDRI is ever re-exported before
final submission. Confirmed via `curl -D -` against a `next start`
server: both asset types now return `max-age=86400`.

### 8. The 19.2MB HDRI — fixed

The single largest finding of this pass, by a wide margin, when this
document was first written. Playwright's real (non-simulated) network
capture against a genuine headless Chromium load of `/` showed:

```
GET /hdri/brown_photostudio_02_4k.exr → 200, Content-Length: 20159867
```

**19.2MB**, fetched by *both* `/` (the Hero) and `/project` (`Scene.tsx`)
— larger than the GLB (1.3MB), the entire homepage JS bundle after fix #6
(1.9MB), and every other asset on either page combined. It didn't appear
in Lighthouse's own `network-requests` audit output for `/` at all (its
simulated-throttle trace window apparently completed before that request
resolved), which is exactly why this pass cross-checked with a real
browser rather than trusting one tool's capture — the LCP/TTI numbers
below are consistent with this file dominating load time, even though
Lighthouse couldn't attribute it directly.

It's used purely for image-based lighting (`<Environment files={...}
background={false} />` in both `Scene.tsx` and `HeroScene.tsx` — never
rendered as a visible background), and three.js pre-filters any
environment map through a PMREM (pre-filtered mipmap) generator before
using it for diffuse/specular IBL regardless of source resolution. A full
4K, effectively-uncompressed EXR provides no visible benefit over a much
smaller source for this use case.

Originally left documented rather than fixed, because re-encoding an HDR
image correctly needs tooling this environment didn't have (`convert`/
`magick`/`oiiotool`/`exrtools`/Python's `OpenEXR` were all checked and
unavailable). Resolved without that tooling by going back to the exact
same source instead of re-encoding blind: **Poly Haven publishes the same
"Brown Photostudio 02" HDRI at multiple native resolutions already
processed by the original author**, so the fix is a swap, not a re-encode
— same source, same processing, just the 2K export instead of the 4K
one, downloaded directly from
`https://dl.polyhaven.org/file/ph-assets/HDRIs/exr/2k/brown_photostudio_02_2k.exr`
and its MD5 checksum verified against Poly Haven's own API
(`9c5514879eb48ead00b1bcf0cf0549f6`, matched exactly) before use.

| | Size |
|---|---|
| Before (4K EXR) | 20,159,867 B (19.2MB) |
| After (2K EXR) | 5,161,529 B (4.9MB) |
| **Reduction** | **−14,998,338 B (−74.4%)** |

(The performance doc's original estimate here was "~90%," based on a
hypothetical 1–2K `.hdr` re-encode rather than Poly Haven's own 2K EXR
export specifically — the real, measured number for the fix actually
shipped is 74.4%, reported here as measured rather than adjusted to match
the earlier guess.)

**Visually verified**, not assumed: took matched before/after screenshots
of the homepage at an identical scroll position (both after the same
6-second settle past the Hero's entrance animation) and diffed them
pixel-by-pixel. The two screenshots differ (mean abs diff 4.2/255 across
the full frame), but that difference is concentrated in the headline
text, which shifts by a pixel or two between two independent page loads
due to GSAP animation/network timing variance — not the 3D content. Diffed
the pure model viewport strip alone (excluding the text rows): **mean
absolute pixel difference of 0.26/255 (~0.1%)**, with a max single-pixel
difference of 30/255 (one anti-aliased edge) — visually indistinguishable,
exactly as expected for a lighting-only asset that's pre-filtered through
a PMREM regardless of source resolution.

**What changed**: downloaded to `raw-assets/brown_photostudio_02_2k.exr`
(the 4K original stays in `raw-assets/` too, kept for reference exactly
like the model's own raw original); deployed copy at
`public/hdri/brown_photostudio_02_2k.exr` (the old 4K deployed copy was
removed — nothing referenced it anymore); `src/lib/assets.ts`'s
`HDRI_STUDIO_PATH` now points at the 2K file. `docs/ASSETS.md` updated to
reflect the 2K source. The caching fix in #7 still applies automatically
to the new filename (`/hdri/:path*` is a glob, not a hardcoded name).

### 9–10. Minor / housekeeping

- Draco decoder loaded from `gstatic.com` rather than self-hosted (see
  §1–3) — small, low-priority, not fixed.
- `HDRI_PANORAMA_PATH` (`src/lib/assets.ts`, pointing at the 6MB
  `art_studio_4k.jpg`) is defined but never imported by anything —
  dead code, not a load-time cost (an unrequested file under `public/`
  is never fetched), flagged here for housekeeping rather than as a
  performance issue.

## Lighthouse

Run against a real production build (`next start`), default
simulated-throttling profile, `/` (the homepage), both before and after
the HDRI fix (finding #8):

| Metric | Before (4K HDRI) | After (2K HDRI) |
|---|---|---|
| Performance score | 70 / 100 | 73 / 100 |
| Best Practices score | 100 / 100 | 100 / 100 |
| First Contentful Paint | 0.8s | 0.8s |
| Largest Contentful Paint | 11.2s | 11.2s |
| Total Blocking Time | 150ms | 140ms |
| Cumulative Layout Shift | 0.002 | 0.003 |
| Speed Index | 4.9s | **3.6s** |
| Time to Interactive | 11.2s | 11.2s |

Speed Index improved meaningfully (4.9s → 3.6s, a real, visible
"page feels ready sooner" win) and the Performance score ticked up, but
LCP/TTI did **not** move — which corrects this document's own earlier
speculation. The original write-up guessed the 19.2MB HDRI was "most
likely" behind the 11.2s LCP/TTI figure; having now actually fixed that
asset and re-run the exact same test, that guess doesn't hold up. Checked
why: Lighthouse's own `largest-contentful-paint-element` audit returns no
element at all for this page in either run, and the HDRI request itself
never appears in Lighthouse's `network-requests` capture before or after
(the same puzzling gap noted in the original write-up, cross-checked with
Playwright's real-browser capture both times). Whatever is actually
pinning LCP/TTI at 11.2s here is something Lighthouse's simulated-mobile
trace can't attribute to a concrete resource — plausibly an artifact of
how it handles a canvas/WebGL-painted page combined with animated
(GSAP/SplitText) text under 4× CPU throttling, not asset weight. Leaving
this as an open, honestly-labelled question rather than repeating a
now-disproven guess; it isn't fixable by further asset trimming based on
the evidence actually in hand.

FCP (0.8s, unchanged) is unaffected by the 3D scene's own asset weight
either way — the Hero's `<Suspense fallback={null}>` means the page's own
text/layout paints immediately, matching CLS's near-zero score in both
runs.

## What changed

- `src/components/three/Scene.tsx` — removed the walkthrough-only
  `frameloop="always"` branch; always `"demand"` now.
- `src/components/ui/ElementPanel.tsx` — `thread` (the selected element's
  annotation list) now selected via `useShallow` with filtering inside
  the selector, instead of subscribing to the whole `annotations` array
  and filtering in a `useMemo` after the fact.
- `src/store/projectStore.ts` — `pinAnnotation` now dynamically imports
  `@/lib/queries` instead of a static top-level import.
- `next.config.ts` — added a `headers()` rule giving `/models/*` and
  `/hdri/*` a one-day `Cache-Control` instead of the framework default of
  revalidating every request.
- `src/lib/assets.ts` — `HDRI_STUDIO_PATH` now points at
  `brown_photostudio_02_2k.exr` instead of the 4K file.
- `public/hdri/brown_photostudio_02_2k.exr` added (the deployed 2K HDRI);
  `public/hdri/brown_photostudio_02_4k.exr` removed (nothing references
  it anymore — the original stays archived in `raw-assets/`).
- `raw-assets/brown_photostudio_02_2k.exr` added — the untouched Poly
  Haven download, MD5-verified, kept alongside the existing 4K one for
  the record.
- `docs/ASSETS.md` — updated to reflect the 2K source.

No changes to `src/lib/realtime.ts`, `src/components/RealtimeProvider.tsx`,
`src/components/three/AnnotationMarker.tsx`, `src/components/three/
WalkthroughControls.tsx`, or any annotation/pin/realtime store action's
actual logic — every fix here is either a bundling/loading-strategy
change or a subscription-narrowing change with identical observable
output, and every one was re-verified against the live Supabase project
after landing.
