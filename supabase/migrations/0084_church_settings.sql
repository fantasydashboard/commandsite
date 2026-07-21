-- Per-church settings (privacy/role-gating config, and room to grow). Keyed by
-- client_id. The privacy toggles that were sample-only now persist here and are
-- read by the dashboard to gate what each user sees (UI-level enforcement).
create table if not exists public.church_settings (
  client_id  uuid primary key references public.clients(id) on delete cascade,
  privacy    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Helper: the caller's church-level permission scope. security definer so it can
-- read public.users regardless of that table's RLS (mirrors current_client_id()).
create or replace function public.current_permission_scope()
returns text language sql stable security definer set search_path = public as $$
  select permission_scope from public.users where id = auth.uid();
$$;
revoke all on function public.current_permission_scope() from public;
grant execute on function public.current_permission_scope() to authenticated;

alter table public.church_settings enable row level security;

-- Any user in the church (or an admin) may READ their church's settings, so the
-- dashboard can apply the privacy gates.
create policy "read own church settings"
  on public.church_settings for select
  using (public.is_admin() or client_id = public.current_client_id());

-- Only an admin or a 'full'-scope church admin may write.
create policy "admins and full-scope manage church settings"
  on public.church_settings for all
  using (public.is_admin() or (client_id = public.current_client_id() and public.current_permission_scope() = 'full'))
  with check (public.is_admin() or (client_id = public.current_client_id() and public.current_permission_scope() = 'full'));

create or replace function public.touch_church_settings()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger church_settings_touch
  before update on public.church_settings
  for each row execute function public.touch_church_settings();
