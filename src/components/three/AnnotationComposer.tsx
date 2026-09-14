/**
 * src/components/three/AnnotationComposer.tsx
 *
 * The small form that appears the instant a pin-mode click captures a
 * point on the model — author name, a comment body, Cancel and Pin. Reads
 * `pendingPin` from projectStore (set by BuildingModel.tsx's click
 * handler) and is the only thing that turns it into a real Annotation.
 *
 * Anchored with drei's Html in its default (billboard) mode, not
 * `transform` like AnnotationMarker — a form needs to stay upright and
 * readable regardless of which way the surface it landed on faces; only
 * the persistent ring markers need to visually sit flush against a
 * surface. `center` keeps it centred exactly on the captured point.
 *
 * No `occlude`: the anchor point sits exactly on the surface it was
 * pinned to, so an occlusion raycast from the camera through that same
 * point is right on the edge of self-occluding — it flickered the whole
 * form in and out of the DOM at some angles. Unlike AnnotationMarker
 * (which really does need to hide behind walls long-term), this is a
 * form the user is actively typing into for a few seconds; staying
 * visible regardless of viewing angle is the right trade here.
 *
 * Rendered by BuildingModel.tsx inside the same rotated local-space group
 * as every mesh and every AnnotationMarker, at `pendingPin.position` —
 * already in that group's local space (BuildingModel converted the raycast
 * hit there before ever calling setPendingPin), so no further transform
 * is needed here.
 */
"use client";

import { useMemo, useState } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useProjectStore, type PendingPin } from "@/store/projectStore";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import type { Annotation } from "@/types/project";

interface AnnotationComposerProps {
  pendingPin: PendingPin;
}

export function AnnotationComposer({ pendingPin }: AnnotationComposerProps) {
  const position = useMemo(() => new THREE.Vector3(...pendingPin.position), [pendingPin.position]);
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");

  const canSubmit = author.trim().length > 0 && body.trim().length > 0;

  const handleCancel = () => {
    useProjectStore.getState().clearPendingPin();
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const state = useProjectStore.getState();
    const element = pendingPin.meshName ? state.getElementByMeshId(pendingPin.meshName) : undefined;

    const annotation: Annotation = {
      id: `an-${crypto.randomUUID()}`,
      elementId: element?.id ?? null,
      position: pendingPin.position,
      normal: pendingPin.normal,
      author: author.trim(),
      body: body.trim(),
      createdAt: new Date().toISOString(),
      status: "Open",
      replies: [],
    };
    state.addAnnotation(annotation);
    state.exitPinMode();
  };

  return (
    <Html position={position} center pointerEvents="auto">
      <div className="flex w-64 flex-col gap-3 border border-ruleHi bg-surface p-4 shadow-lg">
        <Label as="div">New comment</Label>

        <div className="flex flex-col gap-1">
          <Label as="label" className="text-faint">
            Author
          </Label>
          <input
            type="text"
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            placeholder="Your name"
            autoFocus
            className="border border-rule bg-surface2 px-2 py-1.5 font-mono text-2xs text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label as="label" className="text-faint">
            Comment
          </Label>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="What needs attention here?"
            rows={3}
            className="resize-none border border-rule bg-surface2 px-2 py-1.5 text-2xs text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleCancel} className="px-4 py-2">
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={handleSubmit} disabled={!canSubmit} className="px-4 py-2">
            Pin
          </Button>
        </div>
      </div>
    </Html>
  );
}
