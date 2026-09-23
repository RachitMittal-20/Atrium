/**
 * src/components/ui/CameraModeToggle.tsx
 *
 * The ORBIT/WALKTHROUGH/PANORAMA segmented control — drives
 * projectStore's cameraMode, which src/components/three/Scene.tsx reads
 * to decide whether OrbitControls, WalkthroughControls or
 * PanoramaControls is driving the camera this frame (see that file's
 * header). Options render straight from OPTIONS below, so a third mode
 * is just a third entry, with the same styling as the others. Visually a smaller sibling of
 * ReviewList.tsx's ALL/OPEN/RESOLVED filter (same border/mono/active-
 * brass pattern), stacked directly below PresenceIndicator — right-6/
 * right-10, matching ModeIndicator and PresenceIndicator's own alignment
 * exactly, one row further down.
 *
 * Deliberately reads/writes only cameraMode: it doesn't touch `mode`
 * (review/pin), pendingPin, or anything realtime-related — switching
 * camera modes never interrupts an in-progress pin or the realtime
 * subscription, by construction, not by any extra guard here.
 */
"use client";

import { useProjectStore } from "@/store/projectStore";
import type { CameraMode } from "@/store/projectStore";

const OPTIONS: { value: CameraMode; label: string }[] = [
  { value: "orbit", label: "Orbit" },
  { value: "walkthrough", label: "Walkthrough" },
  { value: "panorama", label: "Panorama" },
];

export function CameraModeToggle() {
  const cameraMode = useProjectStore((state) => state.cameraMode);
  const setCameraMode = useProjectStore((state) => state.setCameraMode);

  return (
    <div
      role="tablist"
      aria-label="Camera mode"
      className="absolute right-6 top-20 z-10 flex gap-1 sm:right-10 sm:top-24"
    >
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={cameraMode === value}
          onClick={() => setCameraMode(value)}
          className={`border px-2 py-1.5 font-mono text-3xs uppercase tracking-[0.18em] transition-colors ${
            cameraMode === value ? "border-brass text-brass" : "border-rule text-faint hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
