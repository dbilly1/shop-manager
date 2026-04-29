-- ─── 010: store invite temp password server-side ─────────────────────────────
-- Removes the need to put the password in the invite URL (where it leaks via
-- browser history, server logs, and Referer headers). The invite page reads
-- it from the DB; it's nulled out on accept.

alter table public.shop_invites
  add column if not exists temp_password text;

-- Only super_admin / service_role / the inviter should ever read the password.
-- The invite acceptance page reads via the admin client (service_role bypasses
-- RLS), so no permissive policy is needed.
