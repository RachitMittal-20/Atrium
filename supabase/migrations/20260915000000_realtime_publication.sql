-- Adds annotations and annotation_replies to Postgres's supabase_realtime
-- publication, which is what makes inserts/updates on those two tables
-- stream out over Supabase Realtime's Postgres Changes feature at all —
-- without this, src/lib/realtime.ts's channel.on('postgres_changes', ...)
-- subscriptions would sit open and simply never receive anything. This is
-- the live multi-reviewer sync feature's one schema dependency: a pinned
-- comment or reply, once it lands in these tables, is what a second
-- browser window sees arrive a moment later.
--
-- Delivery still passes through each table's row level security SELECT
-- policy from the initial schema migration (both are "publicly readable
-- to anon"), so this statement only starts broadcasting changes that were
-- already visible to every client — it grants no new read access.
alter publication supabase_realtime add table public.annotations;
alter publication supabase_realtime add table public.annotation_replies;
