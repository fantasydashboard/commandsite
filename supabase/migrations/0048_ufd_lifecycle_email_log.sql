-- CommandSite · UFD lifecycle email log
-- ---------------------------------------------------------------------------
-- Tracks every non-welcome lifecycle email sent to a UFD trial user
-- so the various cron jobs (day 3, day 6, day 8, etc.) don't double-
-- send. One row per (user_email, step) combination.
--
-- The welcome email lives in its own ufd_welcome_log table (mig 0046)
-- and stays there — it has a different lifecycle pattern (one-shot,
-- per email address ever) than the recurring lifecycle touches.

create table public.ufd_lifecycle_email_log (
  id          uuid primary key default gen_random_uuid(),
  user_email  text not null,
  user_name   text,
  step        text not null check (step in (
    'day_3_check',
    'day_6_expiring',
    'day_8_winback',
    'day_30_winback',
    'manual'
  )),
  sent_at     timestamptz not null default now(),
  message_id  text,
  source      text not null default 'lifecycle_cron',
  error       text,
  created_at  timestamptz not null default now()
);

create unique index ufd_lifecycle_email_log_email_step_uniq
  on public.ufd_lifecycle_email_log (user_email, step);

create index ufd_lifecycle_email_log_sent_at_idx
  on public.ufd_lifecycle_email_log (sent_at desc);

alter table public.ufd_lifecycle_email_log enable row level security;

create policy "admins read lifecycle log"
  on public.ufd_lifecycle_email_log for select
  using (public.is_admin());

create policy "service role manages lifecycle log"
  on public.ufd_lifecycle_email_log for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
