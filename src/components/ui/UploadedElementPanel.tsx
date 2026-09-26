/**
 * src/components/ui/UploadedElementPanel.tsx
 *
 * ElementPanel.tsx's sibling for a custom (uploaded) model — the payoff
 * for clicking a mesh in UploadedModel.tsx, the same way ElementPanel is
 * the payoff for clicking one in BuildingModel.tsx. A separate component
 * rather than ElementPanel branching internally: an UploadedElement
 * (projectStore.ts) has none of Element's spec/status/responsibleParty/
 * history fields — there is no curated schedule behind an arbitrary
 * upload — so this panel only ever shows what genuinely exists for one:
 * a rename field, a category picker (reusing the exact same
 * ELEMENT_CATEGORIES the curated model's VisibilityToolbar.tsx already
 * uses, not a second parallel list — that's what lets Hide/Show's
 * category chips apply to a custom model too once enough elements have
 * one assigned), recolor, and Hide/Show. No comments section yet — see
 * projectStore.ts's own header for why pin/comment on a custom model is
 * separate, not-yet-built work.
 *
 * Mounted once in src/app/project/page.tsx, alongside (never instead of)
 * ElementPanel — the two are mutually exclusive in practice, not by any
 * shared gate: ElementPanel's own `elements` lookup finds nothing for a
 * custom-model selection and stays closed, and this panel's own
 * `uploadedElements` lookup finds nothing for a curated-model selection
 * for the identical reason, so at most one is ever open regardless of
 * which model is mounted.
 *
 * Rename writes straight to projectStore's renameUploadedElement on every
 * keystroke (a plain controlled input, no separate "save" step) — this is
 * local, in-memory, session-only state to begin with (see
 * UploadedElement's own comment), so there's nothing to protect against
 * losing by debouncing or requiring an explicit commit; matches how the
 * curated model's own recolor swatches apply on click with no confirm
 * step either.
 *
 * Because rename writes on every keystroke, `element` (found by meshName
 * in the store's uploadedElements array) is a brand-new object after each
 * letter — renameUploadedElement replaces the array entry with a spread
 * copy. The focus-management and Escape effects below therefore key on
 * `elementKey` (the element's meshName, which a rename never changes)
 * and not on `element` itself. Keying on the object was a real bug: the
 * focus effect re-ran after every keystroke, its cleanup and setup both
 * moved focus to the Close button, and the cursor left the Name field
 * after a single letter. Keyed on meshName, those effects now run only
 * when a *different* element is selected or the panel opens/closes —
 * which is exactly when moving focus is wanted.
 */
"use client";

import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { useProjectStore } from "@/store/projectStore";
import { DURATION, PIN_BREAKPOINT } from "@/lib/motion";
import { useIsMobile } from "@/lib/responsive";
import { ELEMENT_CATEGORIES, type ElementCategory } from "@/types/project";
import { Label } from "./Label";
import { Rule } from "./Rule";
import { Button } from "./Button";

// Deliberately restated rather than imported from ElementPanel.tsx (which
// doesn't export its own copy) — a small, stable, purely visual constant,
// the same "cheap to restate, not worth a cross-file coupling for two
// components that otherwise share no logic" reasoning BuildingModel.tsx/
// UploadedModel.tsx already apply to their own shared brass hex values.
const SWATCH_COLORS: { hex: string; name: string }[] = [
  { hex: "#D4A24C", name: "Brass" },
  { hex: "#8DAE84", name: "Verdigris" },
  { hex: "#C97B52", name: "Clay" },
  { hex: "#E9E5DC", name: "Vellum" },
  { hex: "#8B9099", name: "Warm Grey" },
  { hex: "#262A30", name: "Charcoal" },
  { hex: "#5E3A28", name: "Walnut" },
  { hex: "#2F4A3D", name: "Forest" },
];

export function UploadedElementPanel() {
  const customModelUrl = useProjectStore((state) => state.customModelUrl);
  const selectedElementId = useProjectStore((state) => state.selectedElementId);
  const uploadedElements = useProjectStore((state) => state.uploadedElements);
  const clearSelected = useProjectStore((state) => state.clearSelected);
  const toggleElementVisibility = useProjectStore((state) => state.toggleElementVisibility);
  const setElementColor = useProjectStore((state) => state.setElementColor);
  const clearElementColor = useProjectStore((state) => state.clearElementColor);
  const renameUploadedElement = useProjectStore((state) => state.renameUploadedElement);

  // customModelUrl gated explicitly, not just left to the lookup below
  // coming up empty: without this, switching from a custom model back to
  // the curated one on the *same* selectedElementId string (a plain
  // coincidence — mesh.uuid values don't collide with curated meshNames
  // in practice, but nothing guarantees it) could theoretically show a
  // stale uploaded-element panel over the curated model. Cheap, explicit
  // insurance for a case that shouldn't happen rather than one that's
  // merely unlikely.
  const element = useMemo(
    () => (customModelUrl ? (uploadedElements.find((candidate) => candidate.meshName === selectedElementId) ?? null) : null),
    [customModelUrl, uploadedElements, selectedElementId],
  );

  // The stable identity of whichever element the panel is showing — see
  // file header for why the effects below depend on this string and not
  // on `element`, which changes identity on every rename keystroke.
  const elementKey = element?.meshName ?? null;

  const isHidden = useProjectStore((state) => (element ? state.hiddenElementIds.has(element.meshName) : false));
  const elementColor = useProjectStore((state) => (element ? state.elementColors.get(element.meshName) : undefined));

  const isMobile = useIsMobile(PIN_BREAKPOINT);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  // Same focus-management and Escape-to-close behaviour as ElementPanel.tsx
  // — see that file's own comment for why this lives in an effect keyed
  // on the element. Here it is keyed on elementKey (meshName), not the
  // element object, so typing in the Name field never re-runs it — see
  // file header.
  useEffect(() => {
    if (elementKey === null) return;
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      lastFocusedRef.current?.focus();
    };
  }, [elementKey]);

  useEffect(() => {
    if (elementKey === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearSelected();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [elementKey, clearSelected]);

  const handleDragEnd = (_event: PointerEvent, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 500) clearSelected();
  };

  return (
    <AnimatePresence>
      {element && (
        <motion.div
          key={element.meshName}
          role="dialog"
          aria-modal="true"
          aria-label={element.displayName}
          drag={isMobile ? "y" : false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.15}
          onDragEnd={isMobile ? handleDragEnd : undefined}
          initial={isMobile ? { y: "100%" } : { x: "100%" }}
          animate={isMobile ? { y: 0 } : { x: 0 }}
          exit={isMobile ? { y: "100%" } : { x: "100%" }}
          transition={{ duration: DURATION.base, ease: [0.16, 1, 0.3, 1] }}
          className={
            isMobile
              ? "fixed inset-x-0 bottom-0 z-20 flex h-[70vh] flex-col border-t border-rule bg-surface"
              : "fixed top-4 bottom-4 right-0 z-20 flex w-full max-w-95 flex-col border-l border-rule bg-surface"
          }
        >
          {isMobile && (
            <div className="flex justify-center py-3" aria-hidden="true">
              <div className="h-1 w-10 rounded-full bg-ruleHi" />
            </div>
          )}

          <div className="flex items-start justify-between gap-4 px-6 py-5">
            <Label>Custom model element</Label>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => clearSelected()}
              aria-label="Close panel"
              className="font-mono text-xs text-faint transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <label className="flex flex-col gap-1.5">
              <Label as="span">Name</Label>
              <input
                type="text"
                value={element.displayName}
                onChange={(event) => renameUploadedElement(element.meshName, { displayName: event.target.value })}
                placeholder="Name this element"
                className="border border-rule bg-ground px-3 py-2 font-display text-lg text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
              />
            </label>

            <label className="mt-4 flex flex-col gap-1.5">
              <Label as="span">Category</Label>
              <select
                value={element.category ?? ""}
                onChange={(event) =>
                  renameUploadedElement(element.meshName, {
                    category: event.target.value === "" ? null : (event.target.value as ElementCategory),
                  })
                }
                className="border border-rule bg-ground px-3 py-2 font-mono text-2xs uppercase tracking-[0.1em] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
              >
                <option value="">Uncategorized</option>
                {ELEMENT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 font-mono text-3xs text-faint">
              Assigning a category lets it toggle with the Hide/Show chips.
            </p>

            {isHidden && (
              <p className="mt-4 font-mono text-3xs uppercase tracking-[0.18em] text-faint">Hidden in model</p>
            )}

            <Rule className="my-5" label="Color" />
            <div className="flex flex-wrap items-center gap-2">
              {SWATCH_COLORS.map((swatch) => (
                <button
                  key={swatch.hex}
                  type="button"
                  aria-label={`Set color to ${swatch.name}`}
                  aria-pressed={elementColor?.toLowerCase() === swatch.hex.toLowerCase()}
                  onClick={() => void setElementColor(element.meshName, swatch.hex)}
                  style={{ backgroundColor: swatch.hex }}
                  className={`h-6 w-6 rounded-full border transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                    elementColor?.toLowerCase() === swatch.hex.toLowerCase()
                      ? "scale-110 border-ink"
                      : "border-rule hover:scale-105"
                  }`}
                />
              ))}
              <label
                aria-label="Choose a custom color"
                className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-rule transition-transform hover:scale-105"
              >
                <input
                  type="color"
                  value={elementColor ?? "#000000"}
                  onChange={(event) => void setElementColor(element.meshName, event.target.value)}
                  className="absolute -left-1 -top-1 h-8 w-8 cursor-pointer border-none p-0"
                />
              </label>
            </div>
            {elementColor && (
              <button
                type="button"
                onClick={() => void clearElementColor(element.meshName)}
                className="mt-2 font-mono text-3xs uppercase tracking-[0.18em] text-faint transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
              >
                Reset to original
              </button>
            )}

            <Rule className="my-5" />
            <p className="font-mono text-3xs text-faint">
              Name, category, color, and visibility for this file — kept in this browser tab only, gone on refresh.
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-rule px-6 py-5">
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              aria-pressed={isHidden}
              onClick={() => toggleElementVisibility(element.meshName)}
            >
              {isHidden ? "Show element" : "Hide element"}
            </Button>
            <Button
              type="button"
              variant="primary"
              className="w-full"
              onClick={() => useProjectStore.getState().enterPinMode()}
            >
              Pin a comment
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
