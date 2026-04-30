-- Resend email event log for the UFD client module.
-- Populated by the resend-webhook Edge Function whenever Resend fires an
-- event (sent/delivered/opened/clicked/bounced/complained). Joined back to
-- UFD profiles by recipient email address in the ufd-users function to
-- power the per-user engagement columns on the cohort modals.

create table public.ufd_email_events (
  id            uuid primary key default gen_random_uuid(),
  -- Svix message id; used to dedupe webhook redeliveries. Resend uses
  -- Svix as its webhook transport and guarantees the id is stable across
  -- retries for the same event.
  svix_id       text unique not null,
  email_id      text not null,
  event_type    text not null,
  recipient     text not null,
  subject       text,
  from_address  text,
  click_url     text,
  occurred_at   timestamptz not null,
  payload       jsonb,
  received_at   timestamptz not null default now()
);

create index ufd_email_events_recipient_idx  on public.ufd_email_events (recipient);
create index ufd_email_events_email_id_idx   on public.ufd_email_events (email_id);
create index ufd_email_events_occurred_idx   on public.ufd_email_events (occurred_at desc);

-- Service-role-only access. Edge Functions query with service-role; no
-- direct client access.
alter table public.ufd_email_events enable row level security;

create policy "admins read ufd_email_events"
  on public.ufd_email_events for select
  using (public.is_admin());
