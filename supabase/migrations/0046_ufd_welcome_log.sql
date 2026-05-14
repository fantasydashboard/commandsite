-- CommandSite · UFD welcome email log
-- ---------------------------------------------------------------------------
-- Tracks which UFD trial signups have received the auto-sent welcome
-- email so the cron doesn't double-send. Unique on user_email — one
-- welcome per email address ever.
--
-- The welcome is a fixed template (firstName substitution only), sent
-- via gmail-send within ~5 minutes of signup. Different from cold
-- outreach: no scoring, no approval queue, no LLM call per send.

create table public.ufd_welcome_log (
  id                uuid primary key default gen_random_uuid(),
  user_email        text not null unique,
  user_name         text,
  user_signup_date  timestamptz,
  sent_at           timestamptz not null default now(),
  message_id        text,                 -- Gmail message id from gmail-send
  source            text not null default 'welcome_cron',
  error             text,                 -- non-null when send failed; row still inserted to avoid retry storm
  created_at        timestamptz not null default now()
);

create index ufd_welcome_log_sent_at_idx on public.ufd_welcome_log (sent_at desc);

alter table public.ufd_welcome_log enable row level security;

create policy "admins read ufd_welcome_log"
  on public.ufd_welcome_log for select
  using (public.is_admin());

create policy "service role manages ufd_welcome_log"
  on public.ufd_welcome_log for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
