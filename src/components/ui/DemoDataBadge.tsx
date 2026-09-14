/**
 * src/components/ui/DemoDataBadge.tsx
 *
 * The corner label that admits the model is running on the local seed
 * data from src/data/project.ts rather than a live Supabase project —
 * shown whenever projectStore.isDemoData is true, which
 * ProjectHydrator.tsx sets from src/app/project/page.tsx's own fallback
 * (Supabase unreachable, unconfigured, or the fetch failed). Renders
 * nothing at all once real data is loaded.
 *
 * bottom-right, not bottom-left: bottom-left sits directly under
 * ReviewList's left-docked rail (fixed, left-0, an opaque surface) at
 * every width this app supports, which visually covers anything else
 * placed there — confirmed by it actually happening, not assumed.
 * Bottom-right is the one corner nothing else in this route's chrome
 * claims (top-left is the wordmark, top-right is ModeIndicator, the
 * whole left edge is ReviewList, the right edge is ElementPanel when
 * open, bottom-centre is Toast).
 */
"use client";

import { useProjectStore } from "@/store/projectStore";

export function DemoDataBadge() {
  const isDemoData = useProjectStore((state) => state.isDemoData);
  if (!isDemoData) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-20 flex items-center gap-2 sm:bottom-8 sm:right-10">
      <span className="h-1.5 w-1.5 rounded-full bg-clay" aria-hidden="true" />
      <span className="font-mono text-3xs uppercase tracking-[0.18em] text-faint">Demo data</span>
    </div>
  );
}
