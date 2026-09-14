/**
 * src/components/ui/Toast.tsx
 *
 * The one toast ATRIUM shows: projectStore.toast, set by pinAnnotation's
 * failure path when persisting a pinned comment fails after it was
 * already applied optimistically. Its whole text doubles as the retry
 * control — clicking it calls toast.onRetry(), which re-runs the same
 * pin attempt — plus a small separate dismiss control for "never mind".
 *
 * Nothing else sets projectStore.toast today; this component doesn't
 * assume that stays true, it just renders whatever's there.
 */
"use client";

import { AnimatePresence, motion } from "motion/react";
import { useProjectStore } from "@/store/projectStore";
import { DURATION } from "@/lib/motion";

export function Toast() {
  const toast = useProjectStore((state) => state.toast);
  const dismissToast = useProjectStore((state) => state.dismissToast);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: DURATION.fast, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 border border-clay bg-surface px-4 py-3 shadow-lg sm:bottom-8"
        >
          <button
            type="button"
            onClick={() => toast.onRetry()}
            className="font-mono text-3xs uppercase tracking-[0.18em] text-clay transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
          >
            {toast.message}
          </button>
          <button
            type="button"
            onClick={dismissToast}
            aria-label="Dismiss"
            className="font-mono text-xs text-faint transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
