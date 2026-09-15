# Decisions

An ADR-style log of the meaningful technical decisions made building
ATRIUM, kept short: the decision, why, and what was considered instead.
Ordered roughly chronologically by when each was made.

---

**Model units are measured off the real bounding sphere, never
hardcoded.**

The source GLB's node transforms are all identity, so three.js takes the
raw vertex data literally and the apartment ends up several thousand
units across rather than metre-scale — there's no metres-per-unit figure
published with the asset to convert by. `Scene.tsx`'s `Model()` measures
the actual rendered `THREE.Box3`/bounding sphere after centering and
derives `camera.near`/`far`, `ContactShadows`' size, `OrbitControls`'
min/max distance, and `WalkthroughControls`' eye height/move
speed/bounds-padding all as ratios of that one measurement. *Considered
instead*: reading the fit result off drei's `Bounds` `onFit` callback —
ruled out after reading its source: `onFit` only ever fires for
orthographic cameras, and for a perspective camera `fit()` silently
delegates to `reset()`, which never calls it. Confirmed by testing: with
`onFit` as the only source of this data, `OrbitControls` never mounted
at all.

---

**Disable, don't unmount, `OrbitControls` during walkthrough mode.**

Walkthrough mode needed some way to hand camera control to a different
component (`WalkthroughControls`) while orbit mode was inactive.
`OrbitControls` stays mounted the whole time; only its `enabled` prop
toggles to `false`. *Why*: an unmounted-then-remounted `OrbitControls`
constructs a brand-new instance with its orbit target reset to the
origin — switching back to orbit would visibly snap the camera to a
default framing instead of resuming wherever the user left it.
*Considered instead*: conditionally rendering `OrbitControls` only in
orbit mode — rejected once this consequence was traced through, since it
directly breaks the "resume exactly where you were" requirement.
Confirmed via reading drei's source that a disabled `OrbitControls`
genuinely stops calling `.update()` each frame, so it doesn't fight
`WalkthroughControls`' direct writes to `camera.position`/`quaternion`
while inactive.

---

**Revision history is keyed by `meshName`, not element `id`.**

`ElementRevisionEntry.meshName` matches `Element.meshName` — the 3D
model's own mesh name, baked into the GLB — rather than `Element.id`.
*Why*: `meshName` is the one identifier guaranteed to line up between the
static local seed data and an independently-seeded live Supabase
project. Locally, `Element.id` is a fixed `"el-*"` string; a real
Supabase project assigns its own `uuid` per row, which the static seed
data has no way to predict in advance. Keying on `id` would mean the
seeded revision history silently stopped matching the moment the app
switched from demo data to a live backend. *Considered instead*: seeding
revision history through the same Supabase-backed path as everything
else — not done, since no UI in this build actually edits an element's
status/spec fields yet, so there's nothing live to hydrate revision
history from; it stays static, seeded, demo-quality data by design, with
the meshName key as the one thing making it still line up with live
element rows.

---

**`frameloop="demand"` everywhere, including walkthrough mode — not
`"always"`.**

Briefly, walkthrough mode ran the whole Canvas under `frameloop="always"`
on the assumption that continuous WASD movement needs a new frame every
tick regardless. Measured against the alternative rather than assumed:
`WalkthroughControls` already calls `invalidate()` on every keydown,
every frame it actually moves the camera, and every look-around
pointermove — the same self-re-invalidation pattern every other
continuous interaction in the app already used. `"always"` bought
nothing but ~1,400 wasted draw calls/second while walkthrough was open
and the user stood still (measured via a patched
`drawElements`/`drawArrays` count, not guessed). Switched to a single,
unconditional `frameloop="demand"` for the whole Canvas. See
[docs/PERFORMANCE.md](PERFORMANCE.md) finding #4.

---

**Removed drei's `<PerformanceMonitor>`-driven `dpr` adjustment entirely,
rather than tuning its thresholds.**

`PerformanceMonitor` estimates fps by counting `useFrame` ticks in a
rolling window — a metric that assumes `frameloop="always"`, where a
healthy app renders every tick. Under this app's `frameloop="demand"`, a
healthy *idle* app renders zero frames, which `PerformanceMonitor` read
as a severe framerate drop and "corrected" by forcing `dpr` down to 1, a
React state change that resizes the WebGL drawing buffer — confirmed,
via temporary instrumentation, to fire spuriously during fast orbit-drag
sessions and to correlate with a real, reproduced stall (~537ms in one
measured run). *Considered instead*: retuning `PerformanceMonitor`'s
`bounds`/`iterations`/`ms` thresholds to be less sensitive under demand
mode — rejected because the underlying metric (tick density in a fixed
window) is structurally incapable of telling "genuinely struggling" apart
from "correctly idle" under demand mode; no threshold fixes that, only
narrows how often it misfires. Removed the mechanism outright instead:
`dpr` is now a fixed `[1, 2]`, matching what the range already defaulted
to before any decline/incline ever fired. See
[docs/PERFORMANCE.md](PERFORMANCE.md) finding #11 for the full
investigation, including what was ruled out first.

---

**Sourced a native 2K HDRI export rather than re-encoding the 4K one.**

The studio HDRI used for image-based lighting was a 19.2MB uncompressed
4K EXR — by a wide margin the single largest asset on either page, used
purely for IBL (`background={false}`; three.js pre-filters any
environment map through a PMREM generator before use regardless of
source resolution, so 4K bought no visible benefit here). *Why not
re-encode*: this environment had no image-processing tooling available
(`convert`/`magick`/`oiiotool`/`exrtools`/Python's `OpenEXR` were all
checked and unavailable) — re-encoding an HDR image correctly without
the right tools risks silently degrading it. *What was done instead*:
Poly Haven publishes the same "Brown Photostudio 02" HDRI at multiple
native resolutions, already correctly processed by the original author —
downloaded the 2K export directly from Poly Haven's own CDN and
MD5-verified it against Poly Haven's public API before use. Same source,
same processing, just the smaller resolution Poly Haven itself already
publishes. 19.2MB → 4.9MB (−74.4%), visually verified via a pixel diff of
matched before/after screenshots (mean absolute difference ~0.1% on the
model viewport). See [docs/PERFORMANCE.md](PERFORMANCE.md) finding #8 and
[docs/ASSETS.md](ASSETS.md).

---

**`OrbitControls.minDistance` derived as a ratio of `camera.near`, not of
the model's bounding radius.**

Originally `minDistance = extent.radius * 0.6` — a value with no
relationship to the near clip plane. At this model's actual measured
scale (radius ≈ 7,027), that clamped the camera to a minimum of ~4,216
units from its orbit target, while the near plane itself was only ~70
units away — a ~60× gap that made it structurally impossible to dolly
past the exterior shell in orbit mode, since the clamp stopped zoom long
before the camera could ever get close to interior geometry. Re-derived
as `camera.near * 1.5` (both measured off the same bounding sphere, so
the ratio holds regardless of the model's actual scale) — close enough
to cross the building envelope, with headroom above the literal near
plane since `minDistance` bounds camera-to-*target* distance, not
camera-to-*geometry* distance, and a target sitting flush against a
surface could in principle put real geometry closer to the camera than
`minDistance` alone guarantees. *Considered instead*: shipping exactly
`camera.near` (ratio 1.0, the literal edge) — tested clean in two
different rooms with no visible clipping, but rejected as the value to
ship in favor of a small margin above it, since the untested case (an
element flush against a wall) wasn't ruled out, only the two rooms
actually tried.
