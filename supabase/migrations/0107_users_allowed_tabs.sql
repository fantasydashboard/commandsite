-- Per-page access, replacing the fixed scope bundles in the UI.
--
-- permission_scope bundled tabs into named roles (pastoral_care always meant
-- Front Desk AND Care & Drift together), so a church that wants one person over
-- Front Desk and a different person over Care & Drift could not express it. That
-- is exactly how churches assign these.
--
-- Added ALONGSIDE permission_scope rather than replacing it, because the scope
-- string is still load-bearing in two places that have nothing to do with which
-- tabs render: the RLS policy on church_settings writes
-- (current_permission_scope() = 'full') and the gate on exports containing
-- congregant names. Those are trust level; this is page access. Conflating them
-- is what made the bundles rigid in the first place.
--
-- NULL means "fall back to the scope bundle", so every existing user keeps
-- exactly the access they have today and nothing needs backfilling.
alter table public.users
  add column if not exists allowed_tabs text[];

comment on column public.users.allowed_tabs is
  'Dashboard tabs this user may see. NULL falls back to the permission_scope bundle (see access.ts SCOPE_TABS). Page access only; permission_scope still governs trust level for settings writes and PII exports.';
