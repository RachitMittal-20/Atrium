/**
 * src/lib/assets.ts
 *
 * Named constants for every static 3D/image asset ATRIUM loads, so a path
 * is never hand-typed (and never drifts out of sync) in more than one
 * place. See docs/ASSETS.md for what each of these is, where it came from,
 * and its licence.
 *
 * Importing this module also starts loading the building model immediately
 * via useGLTF.preload — the model is large enough that starting the fetch
 * as early as possible (well before the 3D scene actually mounts) matters,
 * and drei/three cache the result, so the scene's own useGLTF call later
 * resolves instantly instead of re-fetching.
 */
import { useGLTF } from "@react-three/drei";

export const MODEL_PATH = "/models/apartment.glb";
export const HDRI_STUDIO_PATH = "/hdri/brown_photostudio_02_4k.exr";
export const HDRI_PANORAMA_PATH = "/hdri/art_studio_4k.jpg";

useGLTF.preload(MODEL_PATH);
