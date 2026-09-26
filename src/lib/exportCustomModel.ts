/**
 * src/lib/exportCustomModel.ts
 *
 * Turns the current, edited state of a "try your own model" session back
 * into a downloadable .glb — the other half of the round trip whose first
 * half is UploadedModel.tsx's own load path. A plain module, not a
 * component (same shape as customModelUpload.ts/customRealtime.ts): one
 * exported function CustomModelControl.tsx's Download button calls, plus
 * the few names UploadedModel.tsx needs to read the same file back.
 *
 * What survives the trip, and how each edit is stored in the file:
 *   - Recolor  -> baked straight into the material's baseColorFactor.
 *                 UploadedModel's recolor effect already writes the
 *                 override onto the live material, so exporting that
 *                 material *is* exporting the color; nothing extra to
 *                 store, and nothing to read back on load.
 *   - Rename   -> written as the node's own `name`. UploadedModel derives
 *                 a mesh's display name from mesh.name on load, so a
 *                 renamed part comes back under its new name for free.
 *   - Category -> a glTF node `extras` entry (ATRIUM_CATEGORY_KEY).
 *                 glTF has no notion of an element category, so this is
 *                 the format's own escape hatch for app-specific data;
 *                 GLTFLoader hands it back as mesh.userData on load.
 *   - Hidden   -> a second `extras` entry (ATRIUM_HIDDEN_KEY). glTF has
 *                 no per-node visibility either, and dropping hidden
 *                 meshes from the file instead would make "hide" a
 *                 one-way door — the part could never be shown again
 *                 after re-uploading. The mesh stays in the file, flagged.
 * Comments (pins) are deliberately not exported: they are review-session
 * data, not model data, and they already sync/live on their own channel
 * (customRealtime.ts).
 *
 * Runs against a *clone* of the live scene, never the scene itself — the
 * cleanup below (resetting hover glow, stripping runtime-only userData)
 * would otherwise visibly flicker or corrupt what the reviewer is looking
 * at. Object3D.clone(true) copies the node graph (and a deep JSON copy of
 * userData) but shares geometry and textures with the original, which is
 * safe here because nothing below mutates either; materials are cloned
 * again explicitly for the same reason UploadedModel.tsx clones them.
 *
 * Known limitation: UploadedModel.tsx replaces every standard material's
 * emissive with its brass hover color on load, so a source file's own
 * emissive (a glowing lamp, say) is already gone by the time this runs;
 * the export writes plain, non-emissive materials rather than trying to
 * recover what the file originally had.
 */
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { UploadedElement } from "@/store/projectStore";

/** The projectStore element-registry key UploadedModel.tsx registers its
 *  root scene under (registerElementObject), so CustomModelControl.tsx —
 *  outside the Canvas, with no ref to it — can look the root up at click
 *  time. Nothing enumerates that registry, so a non-mesh key is safe. */
export const CUSTOM_MODEL_ROOT_KEY = "__atrium_custom_model_root__";

/** glTF `extras` key holding an ElementCategory string. Read back by
 *  UploadedModel.tsx's traversal on load. */
export const ATRIUM_CATEGORY_KEY = "atriumCategory";

/** glTF `extras` key holding `true` for a mesh that was hidden when
 *  exported. Read back by UploadedModel.tsx on load. */
export const ATRIUM_HIDDEN_KEY = "atriumHidden";

/** "chair.glb" -> "chair-edited.glb"; "chair-edited.gltf" stays
 *  "chair-edited.glb" rather than stacking a second suffix. Always .glb
 *  out, whatever went in — the exporter below always writes binary. */
export function editedFileName(sourceName: string): string {
  const base = sourceName.replace(/\.(glb|gltf)$/i, "").replace(/-edited$/i, "");
  return `${base || "model"}-edited.glb`;
}

/**
 * Builds the .glb bytes for the model's current edited state.
 *
 * @param root      the live scene UploadedModel.tsx rendered (its clone).
 * @param elements  projectStore's uploadedElements — the source of truth
 *                  for each mesh's current displayName and category.
 * @param hidden    projectStore's hiddenElementIds.
 */
export async function buildEditedModelGlb(
  root: THREE.Object3D,
  elements: readonly UploadedElement[],
  hidden: ReadonlySet<string>,
): Promise<ArrayBuffer> {
  const byMeshName = new Map(elements.map((element) => [element.meshName, element]));
  const exportRoot = root.clone(true);

  exportRoot.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    // The store key UploadedModel.tsx stashed on every mesh — the join
    // between this scene graph and `elements`.
    const meshName = object.userData.meshName as string | undefined;
    const element = meshName ? byMeshName.get(meshName) : undefined;

    // Fresh materials with the live hover glow reset, so a mesh that
    // happened to be mid-hover (or mid-tween) when the button was pressed
    // doesn't get a brass glow baked into the file. The recolor is
    // already on `color`, so it carries through untouched.
    const cleaned = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
    for (const material of Array.isArray(cleaned) ? cleaned : [cleaned]) {
      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
        material.emissive.set(0x000000);
        material.emissiveIntensity = 1;
      }
    }
    object.material = cleaned;

    // Runtime-only key — meaningless in a file, and re-derived on load.
    delete object.userData.meshName;

    if (!element) return;
    object.name = element.displayName;

    // Written from *current* state and cleared when absent, so a flag
    // left over from an earlier import can't outlive the edit that
    // undid it (a part hidden in the source file, then shown again).
    if (element.category) {
      object.userData[ATRIUM_CATEGORY_KEY] = element.category;
    } else {
      delete object.userData[ATRIUM_CATEGORY_KEY];
    }
    if (hidden.has(element.meshName)) {
      object.userData[ATRIUM_HIDDEN_KEY] = true;
    } else {
      delete object.userData[ATRIUM_HIDDEN_KEY];
    }
  });

  // binary -> one self-contained .glb; onlyVisible false so hidden meshes
  // stay in the file (see file header on why "hidden" is a flag, not a
  // deletion).
  const result = await new GLTFExporter().parseAsync(exportRoot, { binary: true, onlyVisible: false });
  if (!(result instanceof ArrayBuffer)) {
    throw new Error("GLTFExporter returned JSON instead of a binary .glb");
  }
  return result;
}

/** Builds the .glb and hands it to the browser as a file download. The
 *  only DOM-touching function in this module; CustomModelControl.tsx is
 *  its one caller. */
export async function downloadEditedModel(
  root: THREE.Object3D,
  elements: readonly UploadedElement[],
  hidden: ReadonlySet<string>,
  sourceFileName: string,
): Promise<void> {
  const glb = await buildEditedModelGlb(root, elements, hidden);
  const url = URL.createObjectURL(new Blob([glb], { type: "model/gltf-binary" }));

  // The standard programmatic-download idiom: a throwaway <a download>
  // clicked once. Revoked on a short delay rather than immediately —
  // revoking in the same tick can cancel the download in some browsers.
  const link = document.createElement("a");
  link.href = url;
  link.download = editedFileName(sourceFileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
