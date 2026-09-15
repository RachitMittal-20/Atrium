# How Claude Code was used

An honest account of how this build used Claude Code, for judges
evaluating AI-assisted work. The short version: prompt-driven development,
one prompt per feature or fix, with a review-and-commit cycle after each
— and several cases where the first answer Claude Code gave was wrong,
caught only because it was checked against real evidence rather than
trusted on its own reasoning. Those corrections are reported here
specifically, because a transparent account of AI-assisted engineering
should include when the AI was wrong, not just when it worked.

## Workflow

Each git commit in this repo corresponds to one user-scoped prompt: a
feature ("add walkthrough camera mode"), a fix ("orbit camera not
smooth"), a pass ("performance pass across four areas"). The working
agreement in `CLAUDE.md` set ground rules Claude Code followed
throughout — plan before writing code, write whole files rather than
partial patches, comment for a reader, avoid speculative abstraction, one
task per commit with a Conventional Commits message. The result is a git
history (`git log --oneline`) that reads as a build log: 25 commits,
each one a complete, working, committed unit, from `chore: scaffold
Next.js 16 app` through the orbit-zoom fix most recently landed.

Within a task, the loop was: read the relevant existing code first
(never assume a file's shape from memory), plan, implement, verify — and
verification meant something concrete, not "looks right": `tsc
--noEmit`/`eslint` for type and lint correctness, and for anything
touching rendering, camera behaviour, or realtime sync, an actual
headless-browser (Playwright) test driving the real running app —
clicking, dragging, zooming, opening a second browser tab — with
screenshots taken and looked at, not assumed to be correct because the
code compiled.

## Cases where the first guess was wrong

### 1. The HDRI wasn't actually the LCP driver

During the performance pass, the 19.2MB studio HDRI (`docs/PERFORMANCE.md`
finding #8) was the single largest asset found on either page by a wide
margin — larger than the GLB, the JS bundle, and everything else
combined. The natural, and initially stated, hypothesis was that this
asset was "most likely" the thing pinning Lighthouse's Largest
Contentful Paint / Time to Interactive figures at 11.2 seconds.

That guess didn't survive contact with a second measurement. After
actually fixing the asset (swapping in Poly Haven's 2K export) and
re-running the exact same Lighthouse test, LCP and TTI **did not move at
all** — still 11.2s, before and after. Speed Index improved meaningfully
(4.9s → 3.6s) and the Performance score ticked up, but the specific
figure the original guess targeted was unaffected. Rather than quietly
dropping the claim, `docs/PERFORMANCE.md`'s Lighthouse section documents
the correction explicitly: Lighthouse's own `largest-contentful-paint-element`
audit returns no element at all for this page in either run, and the
HDRI request never appears in Lighthouse's own network-requests capture
either — whatever is actually pinning LCP/TTI here is something
Lighthouse's simulated-mobile trace can't attribute to a concrete
resource, plausibly related to how it handles a canvas/WebGL-painted page
under CPU throttling, not asset weight. That's left as an open, honestly
labelled question rather than a re-stated guess, because the evidence in
hand doesn't support a confident answer either way.

### 2. `PerformanceMonitor` was misdiagnosed at first

Investigating a live-site report of "orbit camera not smooth," the first
pass concluded there was no real rendering regression — attributing the
report to ordinary cold-start behavior on a fresh Vercel deployment. The
user pushed back with concrete, drag-speed-correlated evidence that this
wasn't a cold-start artifact. That pushback triggered a second, deeper
investigation, which specifically ruled out the most obvious
hypothesis first — that `OrbitControls`' damping decay was somehow
failing to keep re-invalidating frames under `frameloop="demand"` after a
fast flick — by instrumenting real mouse-drag gestures and measuring
actual rendered frames after release. That hypothesis was wrong: damping
decay was rendering *more* tail frames for a fast flick than a slow drag,
exactly as real inertial-decay physics would predict, not fewer. Only
after that was ruled out did the investigation turn to
`<PerformanceMonitor>`, find that its fps-sampling model is structurally
incompatible with `frameloop="demand"` (it counts `useFrame` ticks in a
window, and a healthy idle demand-mode app renders zero frames by
design), and confirm the mechanism directly by temporarily logging its
`onDecline`/`onIncline` callbacks during a reproduced fast-drag session —
catching the exact spurious firings and their correlation with a real,
measured 537ms stall.

The honest caveat documented alongside that fix matters here too: the
Playwright sandbox this investigation ran in renders via SwiftShader (CPU
software rendering, confirmed via `WEBGL_debug_renderer_info`), not real
GPU hardware, so absolute frame-timing numbers in that environment are
noisy and capped well below real-world throughput. `docs/PERFORMANCE.md`
says so directly rather than presenting sandbox timing numbers as if they
were representative of the deployed site's actual performance on real
hardware, and explicitly recommends the original reporter re-test the
deployed fix themselves.

### 3. The realtime reconnect-storm root cause took two passes to find

Live multi-reviewer sync was built, tested, and initially appeared to
work. A later review by the user reported it wasn't actually working.
The first thing checked was the obvious candidate — Row Level Security
policies blocking the read — which turned out to be correctly configured
already. The actual root cause (the `annotations`/`annotation_replies`
tables were never added to Postgres's `supabase_realtime` publication, a
separate step from RLS entirely — see `docs/ARCHITECTURE.md`) was found
by checking Realtime's actual publication membership directly against
the Supabase project rather than re-reading application code that looked
correct on inspection.

While reproducing and testing that fix, a second, unrelated, genuine bug
surfaced: a reconnect-loop recursion that could peg a tab's CPU and crash
it with a stack overflow, triggered specifically by React StrictMode's
mount→cleanup→mount double-invocation racing against
`client.removeChannel()`'s asynchronous unsubscribe handshake re-firing
the same status callback. This wasn't something initially planned for —
it was caught because the fix for the first bug was tested against the
real dev-mode double-invocation behavior rather than a single mount, and
the resulting stack-overflow crash was investigated down to its actual
mechanism (traced in `src/lib/realtime.ts`'s own inline comments) rather
than worked around with a blunt debounce.

## Where Claude Code's evidence-gathering shaped the eventual approach

Several fixes in this build were only landed at the specific value or
scope they ended up at because of direct measurement rather than a
reasonable-sounding first number:

- **The `minDistance` orbit-zoom fix** (most recent work in this repo)
  was tuned by live-editing the value against a running dev server and
  re-running a Playwright zoom test with real screenshots, across three
  candidate values, rather than picking one number and shipping it. The
  final value (`camera.near * 1.5`) was chosen specifically because
  testing showed the more aggressive literal-edge-case value
  (`camera.near * 1.0`) also worked cleanly in both rooms tested — but
  the margin was kept anyway, since two tested rooms don't rule out every
  case a `minDistance`-vs-near-plane distinction could bite on. See
  `docs/DECISIONS.md`.
- **The HDRI fix** specifically avoided re-encoding an asset blind in an
  environment with no verified image-processing tooling, instead finding
  and verifying (via MD5 checksum against the publisher's own API) an
  already-correct alternative export from the same source.
- **The bundle-size fix** (`@supabase/supabase-js` leaking into the
  homepage bundle) was confirmed with an exact before/after byte count of
  every chunk the homepage's served HTML actually references — not an
  estimate — and confirmed fixed by grepping the post-fix build for zero
  remaining Supabase-related references in any chunk the homepage
  reaches.

None of this is to claim every prompt in this build produced correct
code on the first attempt with no review — it's to say that where the
first answer was wrong, it was caught by checking it against something
real (a second measurement, a live Supabase project, a reproduced browser
session), and the correction — not just the eventual fix — is what's
documented.
