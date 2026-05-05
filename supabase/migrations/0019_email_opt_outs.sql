-- Per-recipient opt-out from a specific sequence (or all sequences if
-- sequence_id is null). The lifecycle runner checks this table before
-- sending and skips any (recipient, sequence_id) match.
--
-- Used by the "Skip this user" action on the Email Pipeline view.

create table if not exists public.email_recipient_opt_outs (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  recipient   text not null,                                -- lowercased email
  -- null = skip this recipient across ALL sequences for the client
  sequence_id uuid references public.email_sequences(id) on delete cascade,
  reason      text,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (client_id, recipient, sequence_id)
);

create index if not exists email_recipient_opt_outs_lookup_idx
  on public.email_recipient_opt_outs (client_id, recipient);

alter table public.email_recipient_opt_outs enable row level security;

create policy "admins manage opt outs"
  on public.email_recipient_opt_outs
  for all using (public.is_admin()) with check (public.is_admin());

create policy "clients read own opt outs"
  on public.email_recipient_opt_outs
  for select using (client_id = public.current_client_id());

create policy "clients insert own opt outs"
  on public.email_recipient_opt_outs
  for insert with check (client_id = public.current_client_id());

create policy "clients delete own opt outs"
  on public.email_recipient_opt_outs
  for delete using (client_id = public.current_client_id());
