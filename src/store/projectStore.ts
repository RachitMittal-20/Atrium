/**
 * src/store/projectStore.ts
 *
 * The single store for everything project-related, replacing the earlier
 * selectionStore.ts (hover/selection state is still exactly here, just
 * grown to hold the project it's actually selecting *within*). Still the
 * one bridge across the Canvas boundary — BuildingModel writes
 * hoveredElementId/selectedElementId from inside the Canvas, any DOM UI
 * (an inspector panel, a comment thread) reads them and the underlying
 * Element/Annotation data from outside it.
 *
 * Seeded synchronously from src/data/project.ts at store creation — there
 * is no async load yet, this *is* "the loaded project" until Supabase
 * persistence (P15/P16) replaces the source, at which point only this
 * file's initial state needs to change, not its shape or its consumers.
 *
 * Also carries the "viewport bridge": the OrbitControls instance (Scene.tsx
 * registers it once mounted) and each interactive mesh's/annotation's live
 * Object3D (BuildingModel.tsx and AnnotationMarker.tsx register one each
 * as they mount). ElementPanel.tsx and ReviewList.tsx read these, entirely
 * from outside the Canvas, to ease the camera onto whatever got selected.
 * These are imperative three.js handles, not UI state — kept in closed-over
 * plain objects rather than store state, so registering one on every
 * mesh/marker mount never triggers a re-render the way calling set() would.
 *
 * Spatial annotation: `mode` is the review/pin toggle ModeIndicator.tsx
 * displays and drives from "C"/Escape, and ElementPanel.tsx's "Pin a
 * comment" button drives via enterPinMode(). `pendingPin` is the
 * point+normal+mesh a click captured while in pin mode, read by
 * AnnotationComposer.tsx to render the composer and, on submit, turned
 * into a real Annotation via addAnnotation — which also stamps
 * `recentlyAddedAnnotationId`, so ReviewList.tsx can flash the new row
 * without needing its own "was this here before" bookkeeping.
 *
 * `hoveredAnnotationId` is the two-way hover bridge between
 * AnnotationMarker.tsx (a 3D ring) and ReviewList.tsx (a DOM row) — either
 * side writes it, both sides read it, so hovering one always highlights
 * the other regardless of which one the pointer is actually over.
 *
 * `mobileTab` is the one piece of layout state ElementPanel.tsx and
 * ReviewList.tsx coordinate on below PIN_BREAKPOINT, where they share a
 * single bottom sheet (SPEC/COMMENTS tabs) rather than stacking two —
 * see ReviewList.tsx's file header for the full mobile layout rationale.
 */
import { create } from "zustand";
import type * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { ELEMENTS, ANNOTATIONS, PROJECT } from "@/data/project";
import type { Annotation, Element, Project, Vec3 } from "@/types/project";

interface ViewportBridge {
  controls: OrbitControlsImpl | null;
  invalidate: (() => void) | null;
}

export type ProjectMode = "review" | "pin";
export type MobileTab = "spec" | "comments";

export interface PendingPin {
  position: Vec3;
  normal: Vec3;
  /** The mesh id the pinning click landed on — null in the (currently
   *  theoretical) case of a click that doesn't resolve to a mapped mesh. */
  meshName: string | null;
}

interface ProjectState {
  // --- Project data ---
  project: Project;
  elements: Element[];
  annotations: Annotation[];
  /** Appends a freshly pinned Annotation and marks it for ReviewList's flash. */
  addAnnotation: (annotation: Annotation) => void;

  // --- Selection (formerly selectionStore) ---
  hoveredElementId: string | null;
  selectedElementId: string | null;
  setHovered: (id: string) => void;
  clearHovered: () => void;
  setSelected: (id: string) => void;
  /** Also resets mobileTab to "spec" — the next panel that opens (from a
   *  fresh mesh click) should always start on its spec, never stranded on
   *  whatever tab a previous, now-closed panel was left on. */
  clearSelected: () => void;

  // --- Spatial annotation: pin mode ---
  mode: ProjectMode;
  pendingPin: PendingPin | null;
  /** Closes any open element panel and arms pin mode for the next click. */
  enterPinMode: () => void;
  /** Back to Review, discarding any captured-but-unsubmitted pin. */
  exitPinMode: () => void;
  togglePinMode: () => void;
  setPendingPin: (pin: PendingPin) => void;
  /** Drops the captured point without leaving pin mode — "wrong spot,
   *  let me click again" rather than "get me out of this entirely". */
  clearPendingPin: () => void;

  // --- Review list: hover bridge, new-row flash, mobile tab ---
  hoveredAnnotationId: string | null;
  setHoveredAnnotation: (id: string) => void;
  clearHoveredAnnotation: () => void;
  /** Set by addAnnotation; ReviewList.tsx clears it itself after its flash
   *  animation finishes — see that file for why the timeout lives there. */
  recentlyAddedAnnotationId: string | null;
  clearRecentlyAdded: () => void;
  mobileTab: MobileTab;
  setMobileTab: (tab: MobileTab) => void;

  // --- Selectors ---
  /** The Element whose meshName matches a BuildingModel mesh id, if any. */
  getElementByMeshId: (meshId: string) => Element | undefined;
  /** Every Annotation pinned to a given Element, in no particular order. */
  getAnnotationsForElement: (elementId: string) => Annotation[];

  // --- Viewport bridge (see file header) ---
  registerViewport: (viewport: Partial<ViewportBridge>) => void;
  getViewport: () => ViewportBridge;
  /** Called from BuildingModel's mesh ref callback on mount/unmount. */
  registerElementObject: (meshId: string, object: THREE.Object3D | null) => void;
  getElementObject: (meshId: string) => THREE.Object3D | null;
  /** Called from AnnotationMarker's ref effect on mount/unmount. */
  registerAnnotationObject: (annotationId: string, object: THREE.Object3D | null) => void;
  getAnnotationObject: (annotationId: string) => THREE.Object3D | null;
}

export const useProjectStore = create<ProjectState>((set, get) => {
  const viewport: ViewportBridge = { controls: null, invalidate: null };
  const elementObjects: Record<string, THREE.Object3D | null> = {};
  const annotationObjects: Record<string, THREE.Object3D | null> = {};

  return {
    project: PROJECT,
    elements: ELEMENTS,
    annotations: ANNOTATIONS,
    addAnnotation: (annotation) =>
      set((state) => ({
        annotations: [...state.annotations, annotation],
        recentlyAddedAnnotationId: annotation.id,
      })),

    hoveredElementId: null,
    selectedElementId: null,
    setHovered: (id) => set({ hoveredElementId: id }),
    clearHovered: () => set({ hoveredElementId: null }),
    setSelected: (id) => set({ selectedElementId: id }),
    clearSelected: () => set({ selectedElementId: null, mobileTab: "spec" }),

    mode: "review",
    pendingPin: null,
    enterPinMode: () => set({ mode: "pin", selectedElementId: null, pendingPin: null }),
    exitPinMode: () => set({ mode: "review", pendingPin: null }),
    togglePinMode: () =>
      set((state) =>
        state.mode === "pin"
          ? { mode: "review", pendingPin: null }
          : { mode: "pin", selectedElementId: null, pendingPin: null },
      ),
    setPendingPin: (pin) => set({ pendingPin: pin }),
    clearPendingPin: () => set({ pendingPin: null }),

    hoveredAnnotationId: null,
    setHoveredAnnotation: (id) => set({ hoveredAnnotationId: id }),
    clearHoveredAnnotation: () => set({ hoveredAnnotationId: null }),
    recentlyAddedAnnotationId: null,
    clearRecentlyAdded: () => set({ recentlyAddedAnnotationId: null }),
    mobileTab: "spec",
    setMobileTab: (tab) => set({ mobileTab: tab }),

    getElementByMeshId: (meshId) => get().elements.find((element) => element.meshName === meshId),
    getAnnotationsForElement: (elementId) =>
      get().annotations.filter((annotation) => annotation.elementId === elementId),

    registerViewport: (partial) => Object.assign(viewport, partial),
    getViewport: () => viewport,
    registerElementObject: (meshId, object) => {
      elementObjects[meshId] = object;
    },
    getElementObject: (meshId) => elementObjects[meshId] ?? null,
    registerAnnotationObject: (annotationId, object) => {
      annotationObjects[annotationId] = object;
    },
    getAnnotationObject: (annotationId) => annotationObjects[annotationId] ?? null,
  };
});
