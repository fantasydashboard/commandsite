-- Church-level congregation access for a user. Focal Point runs English + a
-- Brazilian ministry; a narrower role (pastoral care, volunteers, comms) can be
-- scoped to one congregation so they aren't wading through the whole church.
-- 'all' (or null) = every congregation; a church admin (permission_scope='full')
-- is always effectively 'all'. Managed + shown now; hard enforcement (the
-- congregation lens honoring this per user) is a later pass.
alter table public.users
  add column if not exists congregation_scope text
  check (congregation_scope is null or congregation_scope in ('all', 'english', 'brazilian'));

comment on column public.users.congregation_scope is
  'Church-level congregation access (all|english|brazilian). Null reads as all. NOT platform access.';
