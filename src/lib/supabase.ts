/**
 * src/lib/supabase.ts
 *
 * The one Supabase client this app creates — used from both sides now:
 * src/app/project/page.tsx calls it server-side (a Next.js Server
 * Component, not a browser) to load initial data, and projectStore.ts
 * calls it client-side to persist a pinned comment. Typed against the
 * schema in src/types/database.ts — generated from the migration in
 * supabase/migrations/, never hand-edited; regenerate that file instead
 * if the schema changes.
 *
 * Exports `supabase` as `null`, rather than throwing, when
 * NEXT_PUBLIC_SUPABASE_URL/ANON_KEY aren't set. That's deliberate: this
 * app's hard fallback (src/app/project/page.tsx falls back to the local
 * seed data in src/data/project.ts whenever Supabase isn't reachable or
 * configured) needs a value it can check, not a module that crashes on
 * import before any fallback logic gets a chance to run. src/lib/
 * queries.ts is the only place that reads this export.
 *
 * `persistSession`/`autoRefreshToken` are off: there's no auth flow, so
 * there's no session to persist, and leaving them on tries to touch
 * browser storage that doesn't exist when this runs on the server.
 *
 * Uses the anon key, which is safe to ship to the browser by design:
 * every table it can touch is gated by the row level security policies
 * in the schema migration, not by this key staying secret.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient<Database> | null =
  supabaseUrl && supabaseAnonKey
    ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
