-- Per-user freeform notes attached by admins/client team. Identified by
-- (client_id, user_email) since `user_email` is the natural key that
-- threads UFD profiles, Stripe customers, and Resend events together —
-- and we don't always have a stable internal user_id across those sources.

create table public.user_notes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  user_email  text not null,
  body        text not null,
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index user_notes_client_email_idx on public.user_notes (client_id, user_email);

create trigger user_notes_touch
  before update on public.user_notes
  for each row execute function public.touch_updated_at();

alter table public.user_notes enable row level security;

create policy "admins manage user_notes" on public.user_notes
  for all using (public.is_admin()) with check (public.is_admin());

create policy "clients read own user_notes" on public.user_notes
  for select using (client_id = public.current_client_id());
create policy "clients insert own user_notes" on public.user_notes
  for insert with check (client_id = public.current_client_id());
create policy "clients update own user_notes" on public.user_notes
  for update using (client_id = public.current_client_id())
                with check (client_id = public.current_client_id());
create policy "clients delete own user_notes" on public.user_notes
  for delete using (client_id = public.current_client_id());
