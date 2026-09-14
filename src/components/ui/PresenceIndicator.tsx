/**
 * src/components/ui/PresenceIndicator.tsx
 *
 * The top-right presence chip cluster for live multi-reviewer sync: one
 * small initial chip per reviewer currently on the project's realtime
 * channel (src/lib/realtime.ts), coloured from that reviewer's own
 * palette pick, plus a tabular "N online" count. Reads projectStore's
 * presentReviewers/connectionStatus, both written only from
 * RealtimeProvider.tsx's effect — this component itself is read-only.
 *
 * Positioned top-6/top-8 offset by one line below ModeIndicator's own
 * top-6/top-8 badge (right-6/right-10, matching its horizontal alignment
 * exactly) rather than sharing its row — the two badges have unrelated
 * lifetimes (mode is always present; presence only exists once a
 * realtime connection has). Every other corner is already claimed (see
 * DemoDataBadge.tsx's header for the full map); stacking below
 * ModeIndicator in the one corner it partially owns was the only option
 * that doesn't collide with ReviewList's left rail, Toast/
 * RemoteCommentToast's bottom-centre, or ElementPanel's right edge.
 *
 * Renders nothing in demo mode: isDemoData means Supabase was never
 * reachable this session (see DemoDataBadge.tsx), so there is no real
 * channel and nothing to honestly call "reviewers online" — showing a
 * fake "1 online" chip here would be exactly the "pretend to be live"
 * the connection-status handling below is written to avoid.
 *
 * connectionStatus === "reconnecting" replaces the chips entirely with a
 * muted mono "Reconnecting" label — never shows stale chips next to a
 * dropped connection, which would misrepresent who's actually still
 * watching.
 */
"use client";

import { useProjectStore } from "@/store/projectStore";

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function PresenceIndicator() {
  const isDemoData = useProjectStore((state) => state.isDemoData);
  const reviewers = useProjectStore((state) => state.presentReviewers);
  const connectionStatus = useProjectStore((state) => state.connectionStatus);

  if (isDemoData) return null;

  return (
    <div className="pointer-events-none absolute right-6 top-14 flex items-center gap-2 sm:right-10 sm:top-16">
      {connectionStatus === "reconnecting" ? (
        <span className="font-mono text-3xs uppercase tracking-[0.18em] text-faint">Reconnecting</span>
      ) : (
        <>
          <div className="flex -space-x-1.5">
            {reviewers.map((reviewer) => (
              <span
                key={reviewer.id}
                title={reviewer.name}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-ground font-mono text-[9px] leading-none text-ground"
                style={{ backgroundColor: reviewer.color }}
                aria-hidden="true"
              >
                {initials(reviewer.name)}
              </span>
            ))}
          </div>
          <span className="font-mono text-3xs tabular-nums uppercase tracking-[0.18em] text-faint">
            {reviewers.length} online
          </span>
        </>
      )}
    </div>
  );
}
