/**
 * src/components/CustomModelJoin.tsx
 *
 * The other half of a shareable custom-model session — Invitation.tsx's
 * own upload flow is the *creating* side (upload, get a session id, push
 * to /project?session=<id>&name=<file>); this is the *joining* side, for
 * whichever tab opens that URL without having uploaded anything itself.
 * Mounted once in src/app/project/page.tsx, alongside ProjectHydrator.
 *
 * Renders nothing — its only job is a post-mount effect (Client Component
 * state, same "never touch the store outside an effect" rule
 * ProjectHydrator.tsx's own header explains for the identical reason:
 * projectStore is a module-level singleton, and mutating it during render
 * risks one request's state leaking into another's SSR output).
 *
 * The guard that matters: this only ever hydrates customModelUrl when the
 * store doesn't already have one. That's what keeps the *uploading* tab's
 * own effect a no-op — Invitation.tsx already called setCustomModel
 * synchronously, before router.push ever lands here, so by the time this
 * component's effect runs, customModelUrl is already set and this returns
 * immediately. A tab that instead opens the URL cold (a pasted link, or
 * this same tab hard-refreshed — the store has no persistence, so a
 * refresh wipes it exactly like a fresh tab would) has nothing set yet,
 * and reconstructs the model's public Storage URL from nothing but the
 * session id and filename the URL itself carries — see
 * src/lib/customModelUpload.ts's customModelPublicUrl for why those two
 * values are enough (there's no database row for a custom-model session
 * to look anything up from).
 *
 * useSearchParams needs a Suspense boundary in the App Router or it opts
 * the whole route into fully client-rendered — see this component's own
 * mount point in page.tsx for the wrapping <Suspense>.
 */
"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useProjectStore } from "@/store/projectStore";
import { customModelPublicUrl } from "@/lib/customModelUpload";

export function CustomModelJoin() {
  const searchParams = useSearchParams();
  const customModelUrl = useProjectStore((state) => state.customModelUrl);
  const setCustomModel = useProjectStore((state) => state.setCustomModel);

  useEffect(() => {
    // Already active — either this tab's own upload just set it, or an
    // earlier run of this same effect already did. Either way, nothing to
    // join: see file header.
    if (customModelUrl) return;

    const sessionId = searchParams.get("session");
    const name = searchParams.get("name");
    if (!sessionId || !name) return;

    const url = customModelPublicUrl(sessionId, name);
    if (!url) return; // Supabase not configured — nothing reachable to join.

    setCustomModel(url, name, sessionId);
  }, [searchParams, customModelUrl, setCustomModel]);

  return null;
}
