/**
 * src/components/ui/VisibilityToolbar.tsx
 *
 * The "layers" control for the 3D scene: one toggleable chip per element
 * category (Furniture, Fixture, Finish, Structural, Lighting — the shared
 * ELEMENT_CATEGORIES list from src/types/project.ts, the same one
 * ReviewList.tsx's category filter uses) plus a Reset. Lets a reviewer
 * strip the model back to, say, just structure and finishes by hiding
 * all Furniture in one click. Lives outside the Canvas, mounted once in
 * src/app/project/page.tsx.
 *
 * Everything goes through projectStore, never through a reference to the
 * scene: each chip calls toggleCategoryVisibility, Reset calls
 * resetVisibility, and both write hiddenElementIds — which
 * BuildingModel.tsx reads on the other side of the Canvas boundary to
 * flip each mesh's `visible` and switch off its raycast. This component
 * never touches a three.js object; it doesn't need the viewport bridge at
 * all.
 *
 * Each chip's state is derived, not stored: a category's visible/total
 * count is recomputed from `elements` and `hiddenElementIds`, so hiding a
 * single sofa from ElementPanel.tsx shows up here immediately as
 * "Furniture 9/10" without any extra bookkeeping. A chip reads as "on"
 * (brass, like CameraModeToggle's selected option and ReviewList's active
 * filter) while *any* of its elements are showing, and "off" (faint,
 * struck through) only once every one of them is hidden — matching
 * toggleCategoryVisibility's own rule, so clicking a lit chip always
 * hides the category and clicking a struck-through one always shows it.
 *
 * Placement: its own small toolbar docked bottom-right, not a section
 * inside ElementPanel. ElementPanel only exists while something is
 * selected, and category toggling is most useful *before* selecting
 * anything — to clear furniture out of the way so you can click the wall
 * behind it. Bottom-right is also the one corner still free: the
 * top-right column is already ModeIndicator → PresenceIndicator →
 * CameraModeToggle → ControlsHelp, the left edge is ReviewList's rail,
 * and bottom-centre belongs to the toasts and the mobile Comments pill.
 * It sits just above DemoDataBadge (bottom-6/bottom-8) at z-10 — the same
 * layer as the top-right column — so when ElementPanel (z-20, opaque)
 * opens on the right, or a mobile bottom sheet slides up, it simply sits
 * underneath rather than competing with them.
 *
 * Hidden entirely while a custom uploaded model is active (projectStore's
 * customModelUrl set): every chip here toggles visibility on the
 * *curated* schedule's categories, which aren't even the meshes on
 * screen once a custom model has replaced BuildingModel.tsx — showing it
 * then wouldn't merely do nothing, it would show controls that visibly
 * refer to a different model than the one in view. See
 * CustomModelControl.tsx for the "try your own model" feature this
 * yields to.
 */
"use client";

import { useMemo } from "react";
import { useProjectStore } from "@/store/projectStore";
import { ELEMENT_CATEGORIES, type ElementCategory } from "@/types/project";

interface CategoryCount {
  visible: number;
  total: number;
}

export function VisibilityToolbar() {
  const elements = useProjectStore((state) => state.elements);
  const hiddenElementIds = useProjectStore((state) => state.hiddenElementIds);
  const toggleCategoryVisibility = useProjectStore((state) => state.toggleCategoryVisibility);
  const resetVisibility = useProjectStore((state) => state.resetVisibility);
  const customModelUrl = useProjectStore((state) => state.customModelUrl);

  // Visible/total per category, derived fresh from the store every time
  // either input changes — see file header for why this is never stored.
  const counts = useMemo(() => {
    const result = Object.fromEntries(
      ELEMENT_CATEGORIES.map((category) => [category, { visible: 0, total: 0 }]),
    ) as Record<ElementCategory, CategoryCount>;
    for (const element of elements) {
      const count = result[element.category];
      count.total += 1;
      if (!hiddenElementIds.has(element.meshName)) count.visible += 1;
    }
    return result;
  }, [elements, hiddenElementIds]);

  const nothingHidden = hiddenElementIds.size === 0;

  // See file header — the curated categories this toolbar controls
  // aren't meaningful against whatever's actually on screen once a
  // custom model has replaced BuildingModel.tsx.
  if (customModelUrl) return null;

  return (
    <div
      role="group"
      aria-label="Element visibility"
      className="absolute bottom-14 right-6 z-10 flex w-40 flex-col gap-1 sm:bottom-16 sm:right-10"
    >
      <span className="pb-1 text-right font-mono text-3xs uppercase tracking-[0.18em] text-faint">Layers</span>

      {ELEMENT_CATEGORIES.map((category) => {
        const { visible, total } = counts[category];
        // "On" while anything in the category is still showing — mirrors
        // toggleCategoryVisibility's own any-visible rule in projectStore.
        const on = visible > 0;
        return (
          <button
            key={category}
            type="button"
            aria-pressed={on}
            aria-label={`${on ? "Hide" : "Show"} ${category} (${visible} of ${total} visible)`}
            onClick={() => toggleCategoryVisibility(category)}
            disabled={total === 0}
            className={`flex items-center justify-between gap-2 border bg-ground/70 px-2 py-1.5 font-mono text-3xs uppercase tracking-[0.18em] transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass ${
              on ? "border-brass text-brass" : "border-rule text-faint line-through hover:text-ink"
            }`}
          >
            <span>{category}</span>
            <span className="tabular-nums" aria-hidden="true">
              {visible}/{total}
            </span>
          </button>
        );
      })}

      {/* Disabled rather than hidden when there's nothing to reset, so the
          toolbar's footprint never jumps as chips are toggled. */}
      <button
        type="button"
        onClick={() => resetVisibility()}
        disabled={nothingHidden}
        className="mt-1 border border-rule bg-ground/70 px-2 py-1.5 font-mono text-3xs uppercase tracking-[0.18em] text-faint transition-colors hover:border-ruleHi hover:text-ink disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
      >
        Reset
      </button>
    </div>
  );
}
