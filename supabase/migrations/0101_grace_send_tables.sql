-- Audit + idempotency log for Grace's outbound sends, and a per-church
-- do-not-contact suppression list. RLS: admins + service role manage; a church's
-- users may READ their own (dashboard "what did Grace send").
create table public.grace_send_log (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  message_type  text not null,           -- 'guest_welcome'
  card_id       text,
  person_id     text,
  recipient     text,                     -- intended recipient email
  sender        text,                     -- the connected Google address sent from
  status        text not null check (status in
                  ('sent','redirected_to_test','suppressed','rate_limited','deferred_quiet_hours','no_email','blocked','failed')),
  gmail_message_id text,
  error         text,
  created_at    timestamptz not null default now(),
  unique (client_id, message_type, card_id)
);
create index grace_send_log_client_created_idx on public.grace_send_log (client_id, created_at desc);

alter table public.grace_send_log enable row level security;
create policy "service role manages grace_send_log" on public.grace_send_log for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "admins manage grace_send_log" on public.grace_send_log for all
  using (public.is_admin()) with check (public.is_admin());
create policy "church reads own grace_send_log" on public.grace_send_log for select
  using (public.is_admin() or client_id = public.current_client_id());

create table public.grace_suppressions (
  client_id  uuid not null references public.clients(id) on delete cascade,
  email      text not null,
  reason     text,
  created_at timestamptz not null default now(),
  primary key (client_id, email)
);
alter table public.grace_suppressions enable row level security;
create policy "service role manages grace_suppressions" on public.grace_suppressions for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "admins manage grace_suppressions" on public.grace_suppressions for all
  using (public.is_admin()) with check (public.is_admin());
create policy "church reads own grace_suppressions" on public.grace_suppressions for select
  using (public.is_admin() or client_id = public.current_client_id());
