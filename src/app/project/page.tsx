/**
 * src/app/project/page.tsx
 *
 * The tool itself — a full-viewport 3D viewer for the apartment model,
 * reached from the "Enter Project" buttons in the Hero and the
 * Invitation. Chrome is minimal: the ATRIUM wordmark and a mono project
 * label float over the top-left corner, matching the Hero's chrome, over
 * the graphite ground showing through wherever the model doesn't.
 * ModeIndicator mirrors it top-right with the Review/Pin badge,
 * PresenceIndicator stacks directly below it with the same alignment,
 * CameraModeToggle (the ORBIT/WALKTHROUGH/PANORAMA/TOUR switch) stacks below that, and
 * ControlsHelp (a dismissible "?" reference for the camera bindings each
 * mode actually uses) stacks below that. VisibilityToolbar (per-category
 * show/hide chips + Reset) takes the otherwise-free bottom-right corner,
 * just above DemoDataBadge — see its own header for why there.
 * CustomModelControl ("try your own model" — see its own header) stacks
 * below the top-left wordmark/label block instead, the other corner with
 * room to spare.
 *
 * A Server Component, not a client one: loadInitialData below runs on
 * the server, before this page ever reaches the browser. The wordmark
 * block's project label is rendered directly from that server-fetched
 * data — real data in the first paint, no store read needed for it at
 * all. Everything else is wrapped in ProjectHydrator, which seeds
 * projectStore with this same data client-side — see that file's header
 * for why it does that in a useEffect rather than during render (a real
 * cross-request bug, not a style preference). RealtimeProvider mounts
 * the same way, for the same reason, to open live multi-reviewer sync's
 * realtime channel — see its own header.
 *
 * loadInitialData falls back to the local seed data in
 * src/data/project.ts, and flags isDemoData, whenever Supabase isn't
 * configured, the project table is empty, or any part of the fetch
 * throws — DemoDataBadge surfaces that fallback in the corner, and
 * RealtimeProvider/PresenceIndicator both skip realtime entirely rather
 * than pretending to be live against a backend that was never reachable.
 * This route must never ship a blank screen because a network call
 * failed; catching everything here and always returning a valid
 * HydrationData is what guarantees that.
 */
import { Scene } from "@/components/three/Scene";
import { SceneLoader } from "@/components/three/SceneLoader";
import { Label } from "@/components/ui/Label";
import { ElementPanel } from "@/components/ui/ElementPanel";
import { ModeIndicator } from "@/components/ui/ModeIndicator";
import { PresenceIndicator } from "@/components/ui/PresenceIndicator";
import { CameraModeToggle } from "@/components/ui/CameraModeToggle";
import { ControlsHelp } from "@/components/ui/ControlsHelp";
import { VisibilityToolbar } from "@/components/ui/VisibilityToolbar";
import { TourHud } from "@/components/ui/TourHud";
import { CustomModelControl } from "@/components/ui/CustomModelControl";
import { ReviewList } from "@/components/ui/ReviewList";
import { DemoDataBadge } from "@/components/ui/DemoDataBadge";
import { Toast } from "@/components/ui/Toast";
import { RemoteCommentToast } from "@/components/ui/RemoteCommentToast";
import { ProjectHydrator } from "@/components/ProjectHydrator";
import { RealtimeProvider } from "@/components/RealtimeProvider";
import { getProject, getElements, getAnnotations, getColorOverrides } from "@/lib/queries";
import { PROJECT, ELEMENTS, ANNOTATIONS } from "@/data/project";
import type { HydrationData } from "@/store/projectStore";

// Without this, Next.js prerenders this route once at build time (it has
// no dynamic segment or request-time API to force the other way on its
// own) — loadInitialData would only ever run during `next build`, baking
// in whatever annotations existed then for every visitor after. This is
// a live review tool; every request needs its own fetch.
export const dynamic = "force-dynamic";

async function loadInitialData(): Promise<HydrationData> {
  try {
    const project = await getProject();
    if (!project) {
      throw new Error("Supabase returned no project row — has the seed migration been applied?");
    }
    const [elements, annotations, colorOverrides] = await Promise.all([
      getElements(project.id),
      getAnnotations(project.id),
      getColorOverrides(project.id),
    ]);
    return { project, elements, annotations, colorOverrides, isDemoData: false };
  } catch (error) {
    // Deliberately broad: missing env vars, an unreachable project, an
    // RLS/policy error, an empty table — every one of them lands here,
    // and every one of them means the same thing to this route: show the
    // local demo data instead of a blank or half-broken page.
    const message = error instanceof Error ? error.message : String(error);
    console.error("[project] Falling back to local demo data:", message);
    // colorOverrides: [] — the local demo data has no equivalent seed
    // constant (see HydrationData's own comment on why); demo mode always
    // starts with nothing recolored.
    return { project: PROJECT, elements: ELEMENTS, annotations: ANNOTATIONS, colorOverrides: [], isDemoData: true };
  }
}

export default async function ProjectPage() {
  const initial = await loadInitialData();

  return (
    <ProjectHydrator initial={initial}>
      <RealtimeProvider projectId={initial.project.id} isDemoData={initial.isDemoData} />
      <main className="relative h-screen w-screen overflow-hidden bg-ground">
        <Scene className="h-full w-full" />
        <SceneLoader />

        <div className="pointer-events-none absolute left-6 top-6 flex flex-col gap-2 sm:left-10 sm:top-8">
          <span className="font-display text-sm tracking-wide text-ink">ATRIUM</span>
          <Label>
            Project {initial.project.code} — {initial.project.name}
          </Label>
        </div>

        <ModeIndicator />
        <PresenceIndicator />
        <CameraModeToggle />
        <ControlsHelp />
        <VisibilityToolbar />
        <CustomModelControl />
        <ReviewList />
        <ElementPanel />
        <DemoDataBadge />
        <Toast />
        <RemoteCommentToast />
        <TourHud />
      </main>
    </ProjectHydrator>
  );
}
