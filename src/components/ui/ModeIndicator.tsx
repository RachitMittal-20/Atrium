/**
 * src/components/ui/ModeIndicator.tsx
 *
 * The chrome for spatial annotation's Review/Pin toggle: a small corner
 * badge always showing which mode you're in, and — only while armed and
 * waiting for a click — the centred mono hint that tells you what to do
 * next. Also the one place "C" and "Escape" are wired globally: this is
 * the natural owner of that behaviour since it's mounted once at the page
 * level (src/app/project/page.tsx) alongside ElementPanel, and it's the
 * mode those two keys actually control.
 *
 * "C" is ignored while a text input/textarea has focus (typing the letter
 * "c" into AnnotationComposer's fields must not toggle the mode). Escape
 * always runs — it's the documented way out of pin mode from anywhere,
 * composer open or not.
 */
"use client";

import { useEffect } from "react";
import { useProjectStore } from "@/store/projectStore";
import { isTypingTarget } from "@/lib/keyboard";

export function ModeIndicator() {
  const mode = useProjectStore((state) => state.mode);
  const pendingPin = useProjectStore((state) => state.pendingPin);

  // Cursor is mode-wide, not per-mesh — BuildingModel's own hover handlers
  // stand down while mode is "pin" (see its handlePointerOver/Out) so this
  // is the only thing touching the cursor for the whole duration.
  useEffect(() => {
    document.body.style.cursor = mode === "pin" ? "crosshair" : "auto";
    return () => {
      document.body.style.cursor = "auto";
    };
  }, [mode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (useProjectStore.getState().mode === "pin") {
          useProjectStore.getState().exitPinMode();
        }
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (event.key.toLowerCase() === "c") {
        useProjectStore.getState().togglePinMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <div className="pointer-events-none absolute right-6 top-6 flex items-center gap-2 sm:right-10 sm:top-8">
        <span
          className={`h-1.5 w-1.5 rounded-full ${mode === "pin" ? "bg-brass" : "bg-verdigris"}`}
          aria-hidden="true"
        />
        <span className="font-mono text-3xs uppercase tracking-[0.18em] text-faint">
          Mode: {mode === "pin" ? "Pin" : "Review"}
        </span>
      </div>

      {mode === "pin" && !pendingPin && (
        <div className="pointer-events-none absolute top-6 left-1/2 -translate-x-1/2 sm:top-8">
          <span className="whitespace-nowrap bg-ground/80 px-3 py-1.5 font-mono text-3xs uppercase tracking-[0.18em] text-brass">
            Click anywhere on the model to pin a comment
          </span>
        </div>
      )}
    </>
  );
}
