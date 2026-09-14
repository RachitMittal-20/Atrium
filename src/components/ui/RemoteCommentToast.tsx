/**
 * src/components/ui/RemoteCommentToast.tsx
 *
 * The corner announcement for a remote comment's arrival — "NEW COMMENT
 * FROM [AUTHOR]", set by projectStore.ts's mergeRemoteAnnotation whenever
 * a genuinely new (not this client's own optimistic echo) annotation
 * shows up over realtime. Auto-dismisses itself after AUTO_DISMISS_MS;
 * unlike Toast.tsx (whose message stays until the reviewer acts on it),
 * this one is purely informational — nothing to retry, so it shouldn't
 * linger.
 *
 * Positioned bottom-24/sm:bottom-28, directly above Toast.tsx's own
 * bottom-6/sm:bottom-8 — both are centred and could otherwise occupy the
 * exact same pixels if a pin's own save-retry toast and a remote
 * arrival's toast were ever showing at once.
 */
"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useProjectStore } from "@/store/projectStore";
import { DURATION } from "@/lib/motion";

const AUTO_DISMISS_MS = 4000;

export function RemoteCommentToast() {
  const remoteToast = useProjectStore((state) => state.remoteToast);
  const dismissRemoteToast = useProjectStore((state) => state.dismissRemoteToast);

  useEffect(() => {
    if (!remoteToast) return;
    const timeout = setTimeout(() => dismissRemoteToast(), AUTO_DISMISS_MS);
    return () => clearTimeout(timeout);
  }, [remoteToast, dismissRemoteToast]);

  return (
    <AnimatePresence>
      {remoteToast && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: DURATION.fast, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none fixed bottom-24 left-1/2 z-30 -translate-x-1/2 border border-brass/40 bg-surface px-4 py-2.5 sm:bottom-28"
        >
          <span className="font-mono text-3xs uppercase tracking-[0.18em] text-brass">
            New comment from {remoteToast.author}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
