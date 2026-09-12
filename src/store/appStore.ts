/**
 * src/store/appStore.ts
 *
 * App-wide load state, independent of any single page. `hasLoaded` marks
 * that the initial load sequence (assets + Preloader) has resolved at
 * least once; `isPreloaderComplete` flips true the moment the Preloader's
 * exit wipe finishes. Any component — most importantly the hero — reads
 * `isPreloaderComplete` to know it's safe to start animating, instead of
 * guessing at a timeout or animating underneath the overlay.
 */
import { create } from "zustand";

interface AppState {
  hasLoaded: boolean;
  isPreloaderComplete: boolean;
  setHasLoaded: (hasLoaded: boolean) => void;
  setPreloaderComplete: (isPreloaderComplete: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  hasLoaded: false,
  isPreloaderComplete: false,
  setHasLoaded: (hasLoaded) => set({ hasLoaded }),
  setPreloaderComplete: (isPreloaderComplete) => set({ isPreloaderComplete }),
}));
