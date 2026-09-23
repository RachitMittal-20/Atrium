/**
 * src/components/RealtimeProvider.tsx
 *
 * The client-only mount point for live multi-reviewer sync. Mounted once
 * in src/app/project/page.tsx, right alongside ProjectHydrator — renders
 * nothing itself; its only job is opening src/lib/realtime.ts's channel
 * in a useEffect and wiring its events into projectStore's actions.
 *
 * The useEffect requirement here is the exact same one ProjectHydrator.tsx's
 * header explains at length: projectStore is a module-level singleton, and
 * Next.js server-renders "use client" components by default, so mutating
 * it anywhere but a post-mount effect risks one request's realtime state
 * leaking into another's SSR output. Nothing below touches the store
 * outside this component's effect.
 *
 * Skips subscribing entirely when isDemoData is true — see
 * DemoDataBadge.tsx and projectStore.ts's own header: demo mode means
 * Supabase was never reachable this session, so there is no real channel
 * to join. PresenceIndicator.tsx makes the same check for the same
 * reason, rather than this component pretending to be live with an empty
 * channel.
 *
 * The reviewer identity (self) is generated once via useState's lazy
 * initializer — during render, but that's safe here specifically because
 * generateReviewer() only calls crypto.randomUUID()/Math.random(), never
 * touches the store or any per-request server data. It's still not
 * *written* to the store until the effect below runs.
 */
"use client";

import { useEffect, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { generateReviewer, subscribeToProject } from "@/lib/realtime";

interface RealtimeProviderProps {
  projectId: string;
  isDemoData: boolean;
}

export function RealtimeProvider({ projectId, isDemoData }: RealtimeProviderProps) {
  const [self] = useState(generateReviewer);

  useEffect(() => {
    if (isDemoData) return;

    useProjectStore.getState().setSelfReviewer(self.id);

    const unsubscribe = subscribeToProject(projectId, self, {
      onAnnotationInsert: (annotation) => useProjectStore.getState().mergeRemoteAnnotation(annotation),
      onReplyInsert: (annotationId, reply) => useProjectStore.getState().mergeRemoteReply(annotationId, reply),
      onColorOverrideUpsert: (elementId, color) =>
        useProjectStore.getState().mergeRemoteColorOverride(elementId, color),
      onColorOverrideRemoved: (elementId) => useProjectStore.getState().mergeRemoteColorOverrideRemoved(elementId),
      onPresenceSync: (reviewers) => useProjectStore.getState().setPresentReviewers(reviewers),
      onStatusChange: (status) => useProjectStore.getState().setConnectionStatus(status),
    });

    return unsubscribe;
  }, [projectId, isDemoData, self]);

  return null;
}
