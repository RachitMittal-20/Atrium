-- ATRIUM — custom-model Storage bucket
--
-- Until now, "Try your own model" (Invitation.tsx) never left the browser:
-- it called URL.createObjectURL(file) and kept the model in a blob URL
-- that only ever resolves inside the tab that uploaded it. That's fine
-- for one person previewing their own file, but it means a second
-- reviewer opening a "shared session" link has nothing to load — the
-- model itself was never anywhere a second tab could reach. This bucket
-- is what makes a custom model an actual file at a real URL, which is the
-- precondition for anything built on top of it (a shareable session link,
-- realtime pin/comment sync, presence) to mean anything at all.
--
-- Public, not signed-URL-gated: there's no auth in this app at all (every
-- other table's own RLS comments already say as much — "anonymous insert,
-- because every reviewer *is* anon"), and a custom-model session is
-- explicitly ephemeral and unlisted, not sensitive — the same trust model
-- src/lib/supabase.ts's own header already applies to the anon key itself
-- ("safe to ship... every table it can touch is gated by RLS policies,
-- not by this key staying secret"). Anyone who has the session's URL can
-- already reach the file through the app; a public bucket just means they
-- can also reach it directly, which changes nothing about who could see
-- the model in the first place.
--
-- file_size_limit is a plain byte cap, not a MIME allowlist: glTF's own
-- binary (.glb) and JSON (.gltf) forms don't have one universally agreed
-- MIME type across browsers/OSes (a .glb is commonly reported as
-- application/octet-stream, not model/gltf-binary), and the app already
-- constrains the file picker itself to .glb/.gltf (Invitation.tsx's own
-- ACCEPTED_EXTENSIONS) — restricting content-type here on top of that
-- would only risk rejecting a legitimate upload on a mislabelled MIME
-- sniff, for no real security benefit against an already-public bucket.
insert into storage.buckets (id, name, public, file_size_limit)
values ('custom-models', 'custom-models', true, 104857600); -- 100 MiB

create policy "custom model files are publicly readable"
  on storage.objects for select
  to anon
  using (bucket_id = 'custom-models');

-- Anonymous insert, same reasoning as annotations' own "anyone can pin an
-- annotation" policy: there's no login, so every uploader *is* anon, and
-- letting anon insert into this one bucket (not storage.objects broadly —
-- the bucket_id check scopes it) is what makes uploading from the browser
-- possible at all without a server-side upload proxy this app has no
-- other reason to build.
create policy "anyone can upload a custom model file"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'custom-models');
