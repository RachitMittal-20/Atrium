/**
 * src/components/ui/CustomModelControl.tsx
 *
 * "Try your own model" — lets a reviewer pick a .glb/.gltf off their own
 * machine and have it replace the curated apartment in the viewer. Lives
 * outside the Canvas in ordinary DOM, mounted once in
 * src/app/project/page.tsx. Placement: the top-left corner, below the
 * ATRIUM wordmark/project-label block — the top-right column already
 * stacks four items deep (ModeIndicator, PresenceIndicator,
 * CameraModeToggle, ControlsHelp) and VisibilityToolbar claims bottom-
 * right, so top-left is the one corner with room, and it pairs
 * thematically with the "what project am I looking at" text already
 * there ("what *model* am I looking at" sitting right below it).
 *
 * Three pieces of UI, matching the mono/brass toolbar-chip language
 * CameraModeToggle.tsx/VisibilityToolbar.tsx already use (border-rule,
 * font-mono text-3xs uppercase tracking, brass for the active/notable
 * state) rather than the heavier primary/ghost Button component, which
 * reads as a page-level call to action, not a small toolbar item:
 *
 *  1. No custom model active: a single "Try your own model" chip,
 *     really a styled <label> wrapping a hidden file input restricted to
 *     .glb/.gltf. On selection, creates an object URL
 *     (URL.createObjectURL) and hands it to projectStore's
 *     setCustomModel — see that action's own comment for the full reset
 *     it performs. No drag-and-drop: the brief called it a nice-to-have,
 *     not required, and a plain file input covers the actual requirement
 *     with far less code.
 *
 *  2. A custom model active: the required "this is a local preview"
 *     note (never hidden — a scoped-down feature that pretends not to be
 *     one is worse than one that says so plainly), showing the uploaded
 *     file's own name, plus a "Back to Meridian House" button that calls
 *     clearCustomModel.
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

import { useId, type ChangeEvent } from "react";
import { useProjectStore } from "@/store/projectStore";

const ACCEPTED_EXTENSIONS = ".glb,.gltf";

// The same 1.65m default WalkthroughControls.tsx's own fixed
// EYE_HEIGHT_METERS constant uses — restated here as the slider's
// min/max/step, not imported (see that file's own comment on why this
// value is duplicated, not shared, across the two files).
const EYE_HEIGHT_MIN_METERS = 1.2;
const EYE_HEIGHT_MAX_METERS = 2.0;
const EYE_HEIGHT_STEP_METERS = 0.05;

const chipClassName =
  "border border-rule bg-surface px-3 py-1.5 font-mono text-3xs uppercase tracking-[0.18em] text-faint transition-colors hover:border-ruleHi hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass";

export function CustomModelControl() {
  const customModelUrl = useProjectStore((state) => state.customModelUrl);
  const customModelName = useProjectStore((state) => state.customModelName);
  const customEyeHeightMeters = useProjectStore((state) => state.customEyeHeightMeters);
  const cameraMode = useProjectStore((state) => state.cameraMode);
  const setCustomModel = useProjectStore((state) => state.setCustomModel);
  const clearCustomModel = useProjectStore((state) => state.clearCustomModel);
  const setCustomEyeHeightMeters = useProjectStore((state) => state.setCustomEyeHeightMeters);
  const sliderId = useId();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared unconditionally, not just on success — without this,
    // selecting the *same* filename twice in a row (after clearing the
    // custom model, say) wouldn't fire a change event the second time,
    // since the input's own value never appeared to change.
    event.target.value = "";
    if (!file) return;
    setCustomModel(URL.createObjectURL(file), file.name);
  };

  return (
    <div className="absolute left-6 top-24 z-10 flex flex-col items-start gap-2 sm:left-10 sm:top-28">
      {customModelUrl ? (
        <>
          {/* The required "this is a local preview" note — see file
              header. Always visible while a custom model is active,
              never collapsed behind a toggle the way ControlsHelp's own
              panel is: this is a limitation the reviewer needs to see,
              not a reference they opt into. */}
          <div className="max-w-56 border border-brass/40 bg-surface px-3 py-2">
            <p className="font-mono text-3xs uppercase tracking-[0.18em] text-brass">Custom model — local preview</p>
            <p className="mt-1 truncate font-mono text-3xs text-faint" title={customModelName ?? undefined}>
              {customModelName}
            </p>
            <p className="mt-1 text-3xs text-faint">No spec sheet, comments, or saving — gone on refresh.</p>
          </div>

          <button type="button" onClick={() => clearCustomModel()} className={chipClassName}>
            Back to Meridian House
          </button>

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
        </>
      ) : (
        <label className={`cursor-pointer ${chipClassName}`}>
          Try your own model
          <input type="file" accept={ACCEPTED_EXTENSIONS} onChange={handleFileChange} className="sr-only" />
        </label>
      )}
    </div>
  );
}
