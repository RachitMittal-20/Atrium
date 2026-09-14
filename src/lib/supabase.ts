/**
 * src/lib/supabase.ts
 *
 * The one Supabase client the browser creates, typed against the schema
 * in src/types/database.ts — generated from the migration in
 * supabase/migrations/, never hand-edited; regenerate that file instead
 * if the schema changes.
 *
 * Not wired into the app yet. See supabase/migrations/ and
 * supabase/seed.sql for what this points at; reading/writing through it
 * from projectStore is the next piece of work, not this one.
 *
 * Uses the anon key, which is safe to ship to the browser by design:
 * every table it can touch is gated by the row level security policies
 * in the schema migration, not by this key staying secret.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — set both in .env.local.",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
