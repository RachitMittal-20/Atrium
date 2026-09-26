/**
 * src/components/three/UploadedAnnotationComposer.tsx
 *
 * AnnotationComposer.tsx's sibling for a custom model — the small form
 * that appears the instant a pin-mode click captures a point on an
 * uploaded mesh (UploadedModel.tsx's own handleClick, mirroring
 * BuildingModel.tsx's). Reads `pendingCustomPin` from projectStore and is
 * the only thing that turns it into a real (if ephemeral) CustomAnnotation
 * via pinCustomAnnotation.
 *
 * Positioned directly at pendingCustomPin.position — no local-space
 * conversion needed the way BuildingModel.tsx's own rotated group forces
 * on AnnotationComposer, since UploadedModel carries no equivalent fixed
 * rotation (see that file's own header). Rendered by UploadedModel.tsx as
 * a sibling of its own <primitive>, same as UploadedAnnotationMarker.tsx.
 *
 * Submitting closes the composer immediately, the same "the marker
 * appearing is what tells the user the pin registered" reasoning
 * AnnotationComposer's own header gives — except here there's no network
 * round trip to not wait for either, since pinCustomAnnotation is a plain
 * synchronous append.
 */
"use client";

import { useMemo, useState } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useProjectStore, type PendingPin } from "@/store/projectStore";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";

interface UploadedAnnotationComposerProps {
  pendingPin: PendingPin;
}

export function UploadedAnnotationComposer({ pendingPin }: UploadedAnnotationComposerProps) {
  const position = useMemo(() => new THREE.Vector3(...pendingPin.position), [pendingPin.position]);
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");

  const canSubmit = author.trim().length > 0 && body.trim().length > 0;

  const handleCancel = () => {
    useProjectStore.getState().clearPendingCustomPin();
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const state = useProjectStore.getState();
    state.pinCustomAnnotation({
      meshName: pendingPin.meshName,
      position: pendingPin.position,
      normal: pendingPin.normal,
      author: author.trim(),
      body: body.trim(),
    });
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
