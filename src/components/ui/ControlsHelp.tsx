/**
 * src/components/ui/ControlsHelp.tsx
 *
 * A small, dismissible camera-controls reference for anyone opening
 * ATRIUM for the first time — a hackathon judge included — who has no
 * other way to discover that the model is navigable at all, let alone
 * how. Stacks directly below CameraModeToggle in the same top-right
 * column (right-6/right-10, one row further down than that component's
 * own top-20/sm:top-24), the same "only corner that doesn't collide with
 * ReviewList's left rail or Toast's bottom-centre" reasoning
 * ModeIndicator/PresenceIndicator/CameraModeToggle's own headers already
 * use for stacking in this exact corner. Unlike those three — which stay
 * mounted and simply sit z-ordered underneath ElementPanel when a
 * selection opens it — this one un-mounts outright whenever
 * selectedElementId is set: its own expanded panel is wide enough
 * (w-56) to genuinely overlap ElementPanel's left edge, not just sit
 * behind it, so "don't overlap the comment panel" is enforced by not
 * rendering at all while ElementPanel is open, not by trusting z-index.
 *
 * The bindings listed are read directly off the two controllers that
 * actually drive the camera, not assumed:
 *   - Orbit: OrbitControls (Scene.tsx) drives rotate; SmoothZoom.tsx
 *     drives wheel/pinch zoom. `enablePan={false}` on Scene.tsx's
 *     OrbitControls means panning is genuinely off in this build — so
 *     unlike orbit-controls' usual three-affordance reputation
 *     (rotate/zoom/pan), only rotate and zoom are listed here; claiming a
 *     pan gesture that does nothing would be worse than not mentioning it.
 *   - Walkthrough: WalkthroughControls.tsx's own FORWARD_KEYS/BACK_KEYS
 *     (WASD only, not arrows, as of P26 — Up/Down were repurposed),
 *     LEFT_KEYS/RIGHT_KEYS (still both A/D and the left/right arrows),
 *     EYE_UP_KEYS/EYE_DOWN_KEYS (the repurposed Up/Down arrows),
 *     ROTATE_LEFT_KEYS/ROTATE_RIGHT_KEYS (Q/E), and its pointerdown
 *     handler (`if (event.button !== 0) return` — left mouse button
 *     specifically) are the exact source for the four rows below.
 *   - Panorama: PanoramaControls.tsx's own left-button drag handler and
 *     ROTATE_LEFT_KEYS/ROTATE_RIGHT_KEYS (Q/E) — its only two inputs,
 *     since that mode never moves the camera, only turns it.
 *   - Tour: TourControls.tsx's own wheel and vertical-swipe listeners,
 *     plus TourHud.tsx's Prev/Next buttons (a third input method, listed
 *     here as "Buttons" since "click the on-screen Prev/Next" is what a
 *     visitor actually does, not a camera gesture the way the other rows
 *     are). No drag-to-look row for this mode, deliberately — tour never
 *     reads mouse-drag at all, by design (see TourControls.tsx's own
 *     header).
 *
 * Auto-opens once per browser tab (sessionStorage, not localStorage —
 * "once per session" is exactly what sessionStorage already means, and a
 * returning visitor in a fresh tab should see the hint again rather than
 * it staying silently dismissed forever from a visit days earlier).
 * Deliberately checked from a useEffect, not a lazy useState initializer
 * (Scene.tsx's detectMaxDpr uses that pattern, but that value only ever
 * feeds an imperative Canvas prop with no server-rendered DOM of its own
 * to mismatch): `open` here directly controls whether a whole panel
 * renders, and this page is server-rendered (see project/page.tsx) — the
 * server has no sessionStorage and must always emit the closed state, so
 * the client's first render has to match that before flipping open a
 * moment later, exactly what an effect is for. Wrapped in try/catch:
 * sessionStorage can throw in a locked-down private browsing context, and
 * the fallback (just don't auto-open; the "?" toggle still opens it
 * manually) is harmless either way.
 */
"use client";

import { useEffect, useState } from "react";
import { useProjectStore } from "@/store/projectStore";

const SESSION_KEY = "atrium:controls-help-seen";

export function ControlsHelp() {
  const [open, setOpen] = useState(false);
  const elementPanelOpen = useProjectStore((state) => state.selectedElementId !== null);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SESSION_KEY)) return;
      window.sessionStorage.setItem(SESSION_KEY, "1");
      // A one-time "check an external system on mount, then reveal",
      // exactly the case react-hooks/set-state-in-effect's own message
      // carves out ("subscribe for updates... calling setState... when
      // external state changes") — sessionStorage is that external
      // system. The lint rule's generic heuristic can't tell that apart
      // from the cascading-render anti-pattern it's meant to catch, so
      // it's suppressed here specifically rather than restructured away.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true);
    } catch {
      // Private/locked-down browsing context — sessionStorage unavailable.
    }
  }, []);

  // See file header: this badge doesn't merely defer to ElementPanel's
  // higher z-index the way its column-mates do — it un-mounts entirely,
  // since its own expanded panel is wide enough to genuinely overlap
  // ElementPanel's left edge rather than sit harmlessly behind it.
  if (elementPanelOpen) return null;

  return (
    <div className="absolute right-6 top-28 z-10 flex flex-col items-end gap-2 sm:right-10 sm:top-32">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Hide camera controls" : "Show camera controls"}
        className={`flex h-6 w-6 items-center justify-center border font-mono text-3xs transition-colors ${
          open ? "border-brass text-brass" : "border-rule text-faint hover:text-ink"
        }`}
      >
        ?
      </button>

      {open && (
        <div className="w-56 border border-rule bg-surface p-3 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-3xs uppercase tracking-[0.18em] text-brass">Camera controls</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close camera controls"
              className="font-mono text-2xs leading-none text-faint hover:text-ink"
            >
              ×
            </button>
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <p className="font-mono text-3xs uppercase tracking-[0.18em] text-faint">Orbit</p>
              <dl className="mt-1.5 space-y-1">
                <div className="flex justify-between gap-3 text-2xs">
                  <dt className="text-faint">Drag</dt>
                  <dd className="text-ink">Rotate</dd>
                </div>
                <div className="flex justify-between gap-3 text-2xs">
                  <dt className="text-faint">Scroll / pinch</dt>
                  <dd className="text-ink">Zoom</dd>
                </div>
              </dl>
            </div>

            <div>
              <p className="font-mono text-3xs uppercase tracking-[0.18em] text-faint">Walkthrough</p>
              <dl className="mt-1.5 space-y-1">
                <div className="flex justify-between gap-3 text-2xs">
                  <dt className="text-faint">WASD</dt>
                  <dd className="text-ink">Move</dd>
                </div>
                <div className="flex justify-between gap-3 text-2xs">
                  <dt className="text-faint">Drag</dt>
                  <dd className="text-ink">Look around</dd>
                </div>
                <div className="flex justify-between gap-3 text-2xs">
                  <dt className="text-faint">Up / Down</dt>
                  <dd className="text-ink">Eye height</dd>
                </div>
                <div className="flex justify-between gap-3 text-2xs">
                  <dt className="text-faint">Q / E</dt>
                  <dd className="text-ink">Rotate view</dd>
                </div>
              </dl>
            </div>

            <div>
              <p className="font-mono text-3xs uppercase tracking-[0.18em] text-faint">Panorama</p>
              <dl className="mt-1.5 space-y-1">
                <div className="flex justify-between gap-3 text-2xs">
                  <dt className="text-faint">Drag</dt>
                  <dd className="text-ink">Look around</dd>
                </div>
                <div className="flex justify-between gap-3 text-2xs">
                  <dt className="text-faint">Q / E</dt>
                  <dd className="text-ink">Rotate view</dd>
                </div>
              </dl>
            </div>

            <div>
              <p className="font-mono text-3xs uppercase tracking-[0.18em] text-faint">Tour</p>
              <dl className="mt-1.5 space-y-1">
                <div className="flex justify-between gap-3 text-2xs">
                  <dt className="text-faint">Scroll / swipe</dt>
                  <dd className="text-ink">Step</dd>
                </div>
                <div className="flex justify-between gap-3 text-2xs">
                  <dt className="text-faint">Buttons</dt>
                  <dd className="text-ink">Prev / Next</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
