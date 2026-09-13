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
 */
import { create } from "zustand";
import { ELEMENTS, ANNOTATIONS, PROJECT } from "@/data/project";
import type { Annotation, Element, Project } from "@/types/project";

interface ProjectState {
  // --- Project data ---
  project: Project;
  elements: Element[];
  annotations: Annotation[];

  // --- Selection (formerly selectionStore) ---
  hoveredElementId: string | null;
  selectedElementId: string | null;
  setHovered: (id: string) => void;
  clearHovered: () => void;
  setSelected: (id: string) => void;
  clearSelected: () => void;

  // --- Selectors ---
  /** The Element whose meshName matches a BuildingModel mesh id, if any. */
  getElementByMeshId: (meshId: string) => Element | undefined;
  /** Every Annotation pinned to a given Element, in no particular order. */
  getAnnotationsForElement: (elementId: string) => Annotation[];
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: PROJECT,
  elements: ELEMENTS,
  annotations: ANNOTATIONS,

  hoveredElementId: null,
  selectedElementId: null,
  setHovered: (id) => set({ hoveredElementId: id }),
  clearHovered: () => set({ hoveredElementId: null }),
  setSelected: (id) => set({ selectedElementId: id }),
  clearSelected: () => set({ selectedElementId: null }),

  getElementByMeshId: (meshId) => get().elements.find((element) => element.meshName === meshId),
  getAnnotationsForElement: (elementId) =>
    get().annotations.filter((annotation) => annotation.elementId === elementId),
}));
