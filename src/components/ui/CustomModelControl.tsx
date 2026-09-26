/**
 * src/components/ui/CustomModelControl.tsx
 *
 * The "a custom model is active" state for "try your own model" — the
 * initial trigger (the file picker that starts this whole flow) now lives
 * on the landing screen instead, in src/components/Invitation.tsx, next
 * to "Enter Project": that's the moment a visitor actually decides which
 * model they're looking at, and it sets projectStore's customModelUrl
 * directly before navigating to /project, the same action this file's
 * own file input used to call. This component's only job now is what
 * happens *after* that — rendering nothing at all while customModelUrl is
 * null, since there is no longer an in-project way to start a custom
 * model session (a reviewer who wants to try a different file goes back
 * to the landing screen, the same way choosing the curated project in
 * the first place is a landing-screen decision, not an in-project one).
 *
 * Lives outside the Canvas in ordinary DOM, mounted once in
 * src/app/project/page.tsx.
 *
 * Placement — top-center on wide screens, top-left below the wordmark on
 * narrow ones. It used to sit in the top-left column at all widths, but
 * above PIN_BREAKPOINT (900px, lib/motion.ts) UploadedReviewList.tsx
 * docks a 320px comments panel to the left edge from top-24 down to
 * bottom-4, which landed directly on top of this cluster and hid every
 * button in it whenever the comments panel was open. The other edges
 * are taken too: UploadedElementPanel.tsx docks to the right edge, and
 * TourHud.tsx/VisibilityToolbar.tsx own the bottom. The top strip is the
 * one band no docked panel reaches, and top-center in particular is
 * clear of the wordmark block (left) and the mode/presence/camera stack
 * (right). It sits at top-16, just under ModeIndicator.tsx's transient
 * pin-mode hint (also top-center, ending about 58px down) and above the
 * comments panel's own top edge (96px). At or below 900px those panels
 * become bottom sheets instead, leaving the left column free again, so
 * the original top-left placement is kept there — a centered row would
 * collide with the top-right stack on a phone-width screen.
 *
 * The position classes below are three *non-overlapping* width ranges
 * (under 640px, 640–900px, 901px and up) rather than a base position
 * with an override on top. That is deliberate, and it fixed a real bug
 * in this file's first version of the move: Tailwind emits a px-based
 * `min-[901px]:` rule *before* the rem-based `sm:` (40rem) rule in the
 * generated stylesheet, so an `sm:left-10` sitting next to a
 * `min-[901px]:left-1/2` silently won at every width from 640px up and
 * the cluster never moved. Ranges that can't both match can't fight over
 * source order. Tailwind also compiles `max-[N]` as strictly *less than*
 * N, which is why the bounds are 640/901 rather than 639/900 — those
 * leave no gap at an exact 640px or 900px viewport.
 *
 * Three pieces of UI while a custom model is active, matching the
 * mono/brass toolbar-chip language CameraModeToggle.tsx/
 * VisibilityToolbar.tsx already use (border-rule, font-mono text-3xs
 * uppercase tracking, brass for the active/notable state) rather than the
 * heavier primary/ghost Button component, which reads as a page-level
 * call to action, not a small toolbar item:
 *
 *  1. The required "this is a local preview" note (never hidden — a
 *     scoped-down feature that pretends not to be one is worse than one
 *     that says so plainly), showing the uploaded file's own name, plus
 *     a "Back to Meridian House" button that calls clearCustomModel.
 *
 *  2. A "Download edited .glb" button — how a reviewer keeps their work,
 *     since the session itself is gone on refresh. It looks up the live
 *     scene UploadedModel.tsx registered under CUSTOM_MODEL_ROOT_KEY,
 *     reads the current element list and hidden set straight from the
 *     store at click time (getState, not a subscription — nothing here
 *     needs to re-render as edits happen, only to read them once when
 *     pressed), and hands all three to downloadEditedModel in
 *     src/lib/exportCustomModel.ts, which owns everything about what goes
 *     into the file. Re-uploading that file on the landing screen shows
 *     the same edits — see UploadedModel.tsx's header, "Round trip," for
 *     the load-side half. A failed export shows a short inline message
 *     rather than throwing: the reviewer's session is still intact, and
 *     they can simply try again. The two buttons share one wrapping row
 *     so the cluster stays short.
 *
 *  3. Only while a custom model is active *and* cameraMode is
 *     "walkthrough": a manual eye-height slider (customEyeHeightMeters),
 *     because an uploaded model has no door mesh to calibrate real-world
 *     scale off of the way the curated apartment does — see Scene.tsx's
 *     own header for the full reasoning, and WalkthroughControls.tsx's
 *     eyeHeightMetersOverride prop for where this value actually lands.
 *     The reviewer drags it while standing in the walkthrough view and
 *     watches the camera height respond, the same "tune by eye" loop the
 *     brief asked for — this is deliberately the *only* manually-tunable
 *     calibration value; walking speed and the vertical eye-offset range
 *     stay governed by the same rough box-height guess metersPerUnit
 *     itself uses, not separately exposed.
 */
"use client";

import { useId, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { CUSTOM_MODEL_ROOT_KEY, downloadEditedModel } from "@/lib/exportCustomModel";

// The same 1.65m default WalkthroughControls.tsx's own fixed
// EYE_HEIGHT_METERS constant uses — restated here as the slider's
// min/max/step, not imported (see that file's own comment on why this
// value is duplicated, not shared, across the two files).
const EYE_HEIGHT_MIN_METERS = 1.2;
const EYE_HEIGHT_MAX_METERS = 2.0;
const EYE_HEIGHT_STEP_METERS = 0.05;

const chipClassName =
  "border border-rule bg-surface px-3 py-1.5 font-mono text-3xs uppercase tracking-[0.18em] text-faint transition-colors hover:border-ruleHi hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass";

// The cluster's position — see file header ("Placement") for why these
// are three non-overlapping width ranges and not a base + override.
const clusterPositionClassName =
  "max-[640px]:left-6 max-[640px]:top-24 " +
  "min-[640px]:max-[901px]:left-10 min-[640px]:max-[901px]:top-28 " +
  "min-[901px]:left-1/2 min-[901px]:top-16 min-[901px]:-translate-x-1/2 min-[901px]:items-center";

export function CustomModelControl() {
  const customModelUrl = useProjectStore((state) => state.customModelUrl);
  const customModelName = useProjectStore((state) => state.customModelName);
  const customEyeHeightMeters = useProjectStore((state) => state.customEyeHeightMeters);
  const cameraMode = useProjectStore((state) => state.cameraMode);
  const clearCustomModel = useProjectStore((state) => state.clearCustomModel);
  const setCustomEyeHeightMeters = useProjectStore((state) => state.setCustomEyeHeightMeters);
  const sliderId = useId();

  // Download button state — see file header, item 2. `isExporting` stops a
  // double-click from starting two exports of a large model at once;
  // `exportFailed` drives the inline retry message.
  const [isExporting, setIsExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);

  // See file header — no custom model active means there is nothing left
  // for this component to render; the trigger that used to fill this
  // spot lives on the landing screen now.
  if (!customModelUrl) return null;

  const handleDownload = async () => {
    const state = useProjectStore.getState();
    const root = state.getElementObject(CUSTOM_MODEL_ROOT_KEY);
    // No root means UploadedModel hasn't finished loading (or unmounted)
    // — nothing to export yet, same "try again" outcome as a real failure.
    if (!root) {
      setExportFailed(true);
      return;
    }

    setIsExporting(true);
    setExportFailed(false);
    try {
      await downloadEditedModel(root, state.uploadedElements, state.hiddenElementIds, customModelName ?? "model.glb");
    } catch (error) {
      console.error("[CustomModelControl] export failed:", error);
      setExportFailed(true);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`absolute z-10 flex flex-col items-start gap-2 ${clusterPositionClassName}`}>
      {/* The required "this is a local preview" note — see file header.
          Always visible while a custom model is active, never collapsed
          behind a toggle the way ControlsHelp's own panel is: this is a
          limitation the reviewer needs to see, not a reference they opt
          into. */}
      <div className="max-w-56 border border-brass/40 bg-surface px-3 py-2">
        <p className="font-mono text-3xs uppercase tracking-[0.18em] text-brass">Custom model — local preview</p>
        <p className="mt-1 truncate font-mono text-3xs text-faint" title={customModelName ?? undefined}>
          {customModelName}
        </p>
        <p className="mt-1 text-3xs text-faint">
          Comments are gone on refresh. Colors, names, categories and hidden parts can be downloaded as a .glb.
        </p>
      </div>

      {/* The two action buttons, side by side (wrapping if the screen is
          too narrow for both) — see file header, items 1 and 2. Download
          is disabled, not hidden, while an export runs so the button
          visibly acknowledges the press on a large model. */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={() => clearCustomModel()} className={chipClassName}>
          Back to Meridian House
        </button>
        <button type="button" onClick={handleDownload} disabled={isExporting} className={`${chipClassName} disabled:opacity-60`}>
          {isExporting ? "Preparing…" : "Download edited .glb"}
        </button>
      </div>
      {exportFailed && (
        <p role="alert" className="max-w-56 font-mono text-3xs text-faint">
          Couldn&apos;t export the model — try again.
        </p>
      )}

      {/* Only while walkthrough is actually showing this model — see
          file header on why this is the one manually-tunable value. */}
      {cameraMode === "walkthrough" && (
        <div className="w-48 border border-rule bg-surface px-3 py-2">
          <label htmlFor={sliderId} className="flex items-center justify-between gap-2">
            <span className="font-mono text-3xs uppercase tracking-[0.18em] text-faint">Eye height</span>
            <span className="font-mono text-3xs tabular-nums text-ink">{customEyeHeightMeters.toFixed(2)}m</span>
          </label>
          <input
            id={sliderId}
            type="range"
            min={EYE_HEIGHT_MIN_METERS}
            max={EYE_HEIGHT_MAX_METERS}
            step={EYE_HEIGHT_STEP_METERS}
            value={customEyeHeightMeters}
            onChange={(event) => setCustomEyeHeightMeters(Number(event.target.value))}
            className="mt-2 w-full accent-brass"
          />
        </div>
      )}
    </div>
  );
}
