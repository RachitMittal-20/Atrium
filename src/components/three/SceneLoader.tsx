/**
 * src/components/three/SceneLoader.tsx
 *
 * A DOM overlay — not an r3f element — shown while Scene.tsx's model and
 * environment are still loading. It has to live outside the Canvas: drei's
 * useProgress is a plain Zustand store backed by the same
 * THREE.DefaultLoadingManager the Preloader tracks, so it's readable from
 * regular React regardless of where the reader sits relative to the
 * Canvas's own (separate) reconciler root — which is also exactly why a
 * DOM-rendered loading UI can't just be a Suspense fallback *inside* the
 * Canvas. The actual Suspense boundary around the model lives in
 * Scene.tsx with fallback={null}; this component is what the viewer sees
 * while that's pending.
 *
 * Deliberately reuses the Preloader's visual language — a tracked mono
 * label over a brass hairline that fills with progress — so entering the
 * project doesn't introduce a second loading idiom.
 */
"use client";

import { useProgress } from "@react-three/drei";
import { Label } from "@/components/ui/Label";

export function SceneLoader() {
  const { active, progress } = useProgress();

  if (!active) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-ground">
      <div className="flex w-64 flex-col items-center gap-4">
        <Label>Loading Scene</Label>
        <div className="h-px w-full bg-rule">
          <div
            className="h-px bg-brass transition-[width] duration-150 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
