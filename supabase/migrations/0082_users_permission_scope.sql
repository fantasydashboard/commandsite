-- Adds a church-level permission scope to users. This is DISTINCT from the
-- platform-level `role` (admin|client): every church staffer stays role='client';
-- permission_scope describes what they can do WITHIN their church. 'full' = church
-- admin (may manage the church's team + settings). Null reads as 'member'.
-- Hard per-scope data enforcement is a later pass; this column is managed + shown now.
alter table public.users
  add column if not exists permission_scope text
  check (permission_scope is null or permission_scope in
    ('full', 'pastoral_care', 'finance', 'volunteers', 'comms_only', 'member'));

comment on column public.users.permission_scope is
  'Church-level scope (full|pastoral_care|finance|volunteers|comms_only|member). NOT platform access; role stays client. full = church admin.';
