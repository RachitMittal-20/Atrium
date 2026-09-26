/**
 * src/components/Invitation.tsx
 *
 * "THE INVITATION" — the close of the scroll narrative: a tall, quiet
 * section that hands off to the tool itself. The line reveals with the
 * same masked-line technique as the Hero headline (SplitText into lines,
 * sweep up from below the mask edge) for visual continuity — the one
 * difference is what starts it: the Hero's reveal is gated on the
 * preloader finishing, this one plays once when scrolled into view.
 *
 * No pinning or horizontal scroll here, so the 900px rule doesn't apply —
 * only prefers-reduced-motion matters, and when it's set this skips
 * SplitText and the timeline entirely: the line and button are plain,
 * static, and already visible.
 *
 * Two choices sit side by side below the headline, not one: "Enter
 * Project" (primary, gold) opens the curated Meridian House model;
 * "Try your own model" (ghost, secondary) is the entry point for a
 * reviewer's own .glb/.gltf — moved here from a small corner chip inside
 * the project view itself (src/components/ui/CustomModelControl.tsx,
 * which still owns everything about an *already-active* custom model —
 * the local-preview note, the eye-height slider, "Back to Meridian
 * House" — just not this initial trigger). This is the moment a visitor
 * actually decides which model they're looking at, so the choice lives
 * here instead of being discovered after the fact inside the tool.
 * Selecting a file uploads it to Supabase Storage first (see
 * src/lib/customModelUpload.ts and the migration that provisions its
 * bucket) so a session id exists that a second browser tab could later
 * join — real backend work this feature didn't need before, now that a
 * custom-model session can be shared, not just previewed solo. If that
 * upload fails for any reason (Supabase unreachable, a network error),
 * this falls back to the original local-only blob URL: the preview still
 * works for the one tab that uploaded it, it just isn't shareable, the
 * same "degrade instead of break" shape src/app/project/page.tsx's own
 * loadInitialData already follows. Either way this sets projectStore's
 * customModelUrl (the same action CustomModelControl's own file input
 * always called) and then navigates to /project, appending ?session=
 * &name= to the URL only when the upload actually succeeded — the store
 * is a module-level singleton, so a client-side route change (router.push,
 * not a full reload) carries that state across straight through, the same
 * way ProjectHydrator's own hydrate() never touches customModelUrl and so
 * never clobbers it either.
 */
"use client";

import { useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { Button, buttonClassName } from "@/components/ui/Button";
import { useProjectStore } from "@/store/projectStore";
import { DURATION, EASE_WEIGHTED } from "@/lib/motion";
import { uploadCustomModel } from "@/lib/customModelUpload";

// Matches CustomModelControl.tsx's own file input — see that file's
// header for why .glb/.gltf only and no drag-and-drop.
const ACCEPTED_EXTENSIONS = ".glb,.gltf";

export function Invitation() {
  const lineRef = useRef<HTMLHeadingElement>(null);
  const buttonWrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const setCustomModel = useProjectStore((state) => state.setCustomModel);
  // A real, new latency this feature introduces — a local blob URL was
  // instant, an upload isn't. Surfaced here rather than left silent so a
  // multi-second gap before /project doesn't read as a stuck click.
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared unconditionally, matching CustomModelControl.tsx's own
    // handler — without this, picking the same filename twice in a row
    // wouldn't fire a second change event.
    event.target.value = "";
    if (!file) return;

    setIsUploading(true);
    const uploaded = await uploadCustomModel(file);
    setIsUploading(false);

    if (uploaded) {
      setCustomModel(uploaded.url, file.name, uploaded.sessionId);
      router.push(`/project?session=${uploaded.sessionId}&name=${encodeURIComponent(file.name)}`);
    } else {
      setCustomModel(URL.createObjectURL(file), file.name, null);
      router.push("/project");
    }
  };

  useLayoutEffect(() => {
    const line = lineRef.current;
    const buttonWrap = buttonWrapRef.current;
    if (!line || !buttonWrap) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) return; // leave both in their natural, visible state

    const split = SplitText.create(line, { type: "lines", mask: "lines" });
    gsap.set(split.lines, { yPercent: 100, willChange: "transform" });
    gsap.set(buttonWrap, { autoAlpha: 0, y: 16 });

    const tl = gsap.timeline({
      scrollTrigger: { trigger: line, start: "top 75%", toggleActions: "play none none none" },
      onComplete: () => {
        gsap.set(split.lines, { willChange: "auto" });
        split.revert();
      },
    });

    tl.to(split.lines, { yPercent: 0, duration: DURATION.cinematic, ease: EASE_WEIGHTED }).to(
      buttonWrap,
      { autoAlpha: 1, y: 0, duration: DURATION.base, ease: EASE_WEIGHTED },
      "-=1.2",
    );

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
      split.revert();
    };
  }, []);

  return (
    <section className="flex w-full flex-col items-center justify-center gap-14 px-6 py-40 text-center sm:px-10 sm:py-52 md:py-64">
      <h2
        ref={lineRef}
        className="font-display text-[clamp(38px,7vw,96px)] leading-[0.95] tracking-[0.02em] text-ink"
      >
        See it instead.
      </h2>
      <div ref={buttonWrapRef} className="flex flex-wrap items-center justify-center gap-4">
        <Button href="/project" variant="primary">
          Enter Project
        </Button>
        <label
          className={`${isUploading ? "pointer-events-none opacity-60" : "cursor-pointer"} ${buttonClassName("ghost")}`}
        >
          {isUploading ? "Uploading…" : "Try your own model"}
          <input
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            onChange={handleFileChange}
            disabled={isUploading}
            className="sr-only"
          />
        </label>
      </div>
    </section>
  );
}
