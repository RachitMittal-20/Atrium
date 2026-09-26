/**
 * src/lib/customModelUpload.ts
 *
 * Puts an uploaded .glb/.gltf somewhere a second browser tab can actually
 * reach it — the precondition the whole custom-model realtime-sync round
 * depends on (see supabase/migrations/20260918000000_custom_model_storage
 * .sql's own header for why this exists at all). A plain module, not a
 * component, mirroring src/lib/queries.ts/realtime.ts's own shape: one
 * function, imported directly by whichever component handles the file
 * input (today, only Invitation.tsx).
 *
 * The session id doubles as the storage path's own directory (`<id>/
 * <filename>`) rather than being a separate value tracked anywhere else —
 * there's no database row for a custom-model session (see projectStore
 * .ts's own customSessionId comment), so the storage path itself has to be
 * everything a joining tab needs to reconstruct the model's public URL
 * from nothing but the session id plus the original filename, both of
 * which travel in the shareable URL's own query string (see
 * src/app/project/page.tsx's join-flow effect).
 *
 * Returns null, not a thrown error, on every failure path (Supabase not
 * configured, the bucket rejecting the upload, a network failure) — the
 * same "never crash, always have a fallback" shape this app's other
 * Supabase-touching code already follows (src/app/project/page.tsx's own
 * loadInitialData, src/lib/supabase.ts's own null-client comment). The
 * caller's fallback here is the *original* local-blob-URL behavior this
 * function is replacing, not a blank error state — a failed upload still
 * leaves today's single-viewer preview fully working.
 */
import { supabase } from "@/lib/supabase";

const BUCKET = "custom-models";

export interface CustomModelUpload {
  /** A public Storage URL — reachable from any browser, not just the tab
   *  that uploaded it, unlike the blob URL this replaces. */
  url: string;
  /** The session id a shareable /project?session=<id> URL carries — also
   *  the storage path's own directory, so a joining tab can reconstruct
   *  `url` above from nothing but this and the original filename. */
  sessionId: string;
}

export async function uploadCustomModel(file: File): Promise<CustomModelUpload | null> {
  if (!supabase) return null;

  const sessionId = crypto.randomUUID();
  const path = `${sessionId}/${file.name}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) {
    console.error("[customModelUpload] upload failed, falling back to local preview:", error.message);
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, sessionId };
}

/** The inverse of the path scheme above — a joining tab (src/app/project/
 *  page.tsx) has a session id and a filename from the URL's own query
 *  string and needs the same public URL the uploader already got back
 *  from uploadCustomModel, without re-uploading anything. Returns null
 *  under the same "Supabase not configured" condition uploadCustomModel
 *  does, for the same reason. */
export function customModelPublicUrl(sessionId: string, fileName: string): string | null {
  if (!supabase) return null;
  const path = `${sessionId}/${fileName}`;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
