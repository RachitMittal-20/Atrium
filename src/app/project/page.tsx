/**
 * src/app/project/page.tsx
 *
 * The tool itself — a full-viewport 3D viewer for the apartment model,
 * reached from the "Enter Project" buttons in the Hero and the
 * Invitation. Chrome is minimal: the ATRIUM wordmark and a mono project
 * label float over the top-left corner, matching the Hero's chrome, over
 * the graphite ground showing through wherever the model doesn't.
 */
import { Scene } from "@/components/three/Scene";
import { SceneLoader } from "@/components/three/SceneLoader";
import { Label } from "@/components/ui/Label";
import { ElementPanel } from "@/components/ui/ElementPanel";

export default function ProjectPage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-ground">
      <Scene className="h-full w-full" />
      <SceneLoader />

      <div className="pointer-events-none absolute left-6 top-6 flex flex-col gap-2 sm:left-10 sm:top-8">
        <span className="font-display text-sm tracking-wide text-ink">ATRIUM</span>
        <Label>Project 001 — Meridian House</Label>
      </div>

      <ElementPanel />
    </main>
  );
}
