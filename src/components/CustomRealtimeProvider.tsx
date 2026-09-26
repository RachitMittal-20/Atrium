/**
 * src/components/CustomRealtimeProvider.tsx
 *
 * RealtimeProvider.tsx's sibling for a custom-model session — mounted
 * unconditionally in src/app/project/page.tsx (like RealtimeProvider
 * itself), but its own effect no-ops unless BOTH a custom model is active
 * and that session actually reached Storage (customSessionId non-null;
 * see projectStore.ts's own comment for why a local-blob-only session has
 * no one else who could join it). RealtimeProvider.tsx's own effect,
 * conversely, now skips whenever a custom model is active at all — see
 * that file's own updated header — so exactly one of these two providers
 * is ever actually subscribed to anything at a time, the same "only one
 * model's own version of a feature is ever live" rule this codebase
 * already applies everywhere else a custom and curated model both have
 * their own version of something (ElementPanel/UploadedElementPanel,
 * ReviewList/UploadedReviewList).
 *
 * Writes to the exact same presentReviewers/selfReviewerId/
 * connectionStatus fields RealtimeProvider.tsx does, not a parallel set —
 * that's what lets PresenceIndicator.tsx keep working unmodified for a
 * custom-model session too; it already just reads those three fields and
 * has no idea which provider is the one currently filling them.
 *
 * self (this tab's own reviewer identity) is generated fresh per mount,
 * same as RealtimeProvider's own useState lazy initializer — a new
 * upload or a fresh join both deserve a new name/colour, there being no
 * login to persist one across.
 */
"use client";

import { useEffect, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { generateReviewer } from "@/lib/realtime";
import { subscribeToCustomSession } from "@/lib/customRealtime";

export function CustomRealtimeProvider() {
  const [self] = useState(generateReviewer);
  const customModelUrl = useProjectStore((state) => state.customModelUrl);
  const customSessionId = useProjectStore((state) => state.customSessionId);

  useEffect(() => {
    if (!customModelUrl || !customSessionId) return;

    useProjectStore.getState().setSelfReviewer(self.id);

    const unsubscribe = subscribeToCustomSession(customSessionId, self, {
      onAnnotationBroadcast: (annotation) => {
        const state = useProjectStore.getState();
        state.mergeRemoteCustomAnnotation(annotation);
        // mergeRemoteCustomAnnotation deliberately doesn't flash the row
        // itself (see its own comment) — this IS the live-broadcast path,
        // so the flash belongs here, not in the shared merge action a
        // late joiner's bulk catch-up (commit 4) also calls.
        useProjectStore.setState({ recentlyAddedAnnotationId: annotation.id });
      },
      onPresenceSync: (reviewers) => useProjectStore.getState().setPresentReviewers(reviewers),
      onStatusChange: (status) => useProjectStore.getState().setConnectionStatus(status),
      onStateRequested: () => useProjectStore.getState().customAnnotations,
      onStateReceived: (annotations) => {
        const state = useProjectStore.getState();
        // Each one goes through the same id-deduplicating merge a single
        // live broadcast does — answering the same request twice (every
        // already-connected peer replies independently) or a hundred
        // pins arriving split across two different replies is exactly as
        // safe as one clean answer. No flash here either, same reasoning
        // as the live-broadcast path's own comment: a bulk catch-up
        // shouldn't flash every pre-existing pin at once.
        annotations.forEach((annotation) => state.mergeRemoteCustomAnnotation(annotation));
      },
    });

    return unsubscribe;
  }, [customModelUrl, customSessionId, self]);

  return null;
}
