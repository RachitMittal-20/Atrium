/**
 * src/store/selectionStore.ts
 *
 * Single source of truth for hover and selection in the 3D scene: one
 * hoveredElementId and one selectedElementId, both plain string IDs (never
 * Three.js objects — those stay local to whichever component created
 * them). This is the bridge across the Canvas boundary: BuildingModel
 * writes to it from inside the Canvas as the user hovers/clicks meshes,
 * and any DOM UI (an inspector panel, breadcrumbs) reads from it outside
 * the Canvas, without either side needing React context to cross that
 * boundary — context doesn't propagate into a separate r3f reconciler
 * root the way a plain external store does.
 */
import { create } from "zustand";

interface SelectionState {
  hoveredElementId: string | null;
  selectedElementId: string | null;
  setHovered: (id: string) => void;
  clearHovered: () => void;
  setSelected: (id: string) => void;
  clearSelected: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  hoveredElementId: null,
  selectedElementId: null,
  setHovered: (id) => set({ hoveredElementId: id }),
  clearHovered: () => set({ hoveredElementId: null }),
  setSelected: (id) => set({ selectedElementId: id }),
  clearSelected: () => set({ selectedElementId: null }),
}));
