-- Lifecycle email automation (Phase 2 of AI Marketing — Email channel).
-- Three new tables:
--   email_sequences      — drip campaigns ("Trial drip", "Win-back", etc.)
--   email_sequence_steps — individual emails inside a sequence with timing
--   email_send_log       — audit trail of every send + idempotency guard

create table public.email_sequences (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  key         text not null,                        -- e.g. 'trial_drip'
  name        text not null,
  description text,
  -- Which cohort this sequence targets. Cohort keys are interpreted by
  -- the runner per-client (e.g., for UFD, 'trial' = users with active
  -- trial; 'expired' = trial ended without paid).
  cohort      text not null,
  enabled     boolean not null default false,
  -- Anchor for day_offset math: 'trial_started_at' | 'trial_expires_at'
  -- | 'profile_created_at'. Defaults to trial_started_at since UFD's
  -- existing flow uses that.
  anchor_field text not null default 'trial_started_at',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, key)
);
create index email_sequences_client_idx on public.email_sequences (client_id, enabled);

create table public.email_sequence_steps (
  id              uuid primary key default gen_random_uuid(),
  sequence_id     uuid not null references public.email_sequences(id) on delete cascade,
  template_key    text not null,                    -- references email_templates.key
  day_offset      int  not null,
  skip_if_paid    boolean not null default false,
  use_expiry_date boolean not null default false,   -- timing relative to trial_expires_at instead
  step_order      int  not null,
  created_at      timestamptz not null default now()
);
create index email_sequence_steps_seq_idx on public.email_sequence_steps (sequence_id, step_order);

-- email_send_log — every send, success or failure. Joined to recipient
-- email + template + sequence step for audit, and used by the runner as
-- the idempotency check ("don't send the same step to the same user
-- twice").
create table public.email_send_log (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  recipient     text not null,                      -- lowercased
  -- UFD's Supabase user id (text, not uuid — different project so the FK
  -- isn't enforceable from CommandSite's side).
  user_id       text,
  template_key  text,
  template_id   uuid references public.email_templates(id) on delete set null,
  draft_id      uuid references public.email_drafts(id) on delete set null,
  sequence_id   uuid references public.email_sequences(id) on delete set null,
  step_id       uuid references public.email_sequence_steps(id) on delete set null,
  subject       text,
  status        text not null default 'sent'
                  check (status in ('sent','failed','skipped')),
  resend_id     text,
  error_message text,
  sent_at       timestamptz not null default now()
);
create index email_send_log_client_idx
  on public.email_send_log (client_id, sent_at desc);
create index email_send_log_recipient_idx
  on public.email_send_log (client_id, recipient, template_key);
-- Idempotency: a given (client, recipient, template) can only be logged
-- once when it's part of a sequence. One-off sends don't get the unique
-- constraint (sequence_id is null).
create unique index email_send_log_idempotency
  on public.email_send_log (client_id, recipient, template_key)
  where sequence_id is not null;

create trigger email_sequences_touch
  before update on public.email_sequences
  for each row execute function public.touch_updated_at();

-- RLS
alter table public.email_sequences      enable row level security;
alter table public.email_sequence_steps enable row level security;
alter table public.email_send_log       enable row level security;

create policy "admins manage email sequences" on public.email_sequences
  for all using (public.is_admin()) with check (public.is_admin());
create policy "clients read own email sequences" on public.email_sequences
  for select using (client_id = public.current_client_id());
create policy "clients update own email sequences" on public.email_sequences
  for update using (client_id = public.current_client_id())
                with check (client_id = public.current_client_id());

create policy "admins manage email sequence steps" on public.email_sequence_steps
  for all using (public.is_admin()) with check (public.is_admin());
create policy "clients read own email sequence steps" on public.email_sequence_steps
  for select using (
    exists (
      select 1 from public.email_sequences s
      where s.id = email_sequence_steps.sequence_id
        and s.client_id = public.current_client_id()
    )
  );

create policy "admins manage email send log" on public.email_send_log
  for all using (public.is_admin()) with check (public.is_admin());
create policy "clients read own email send log" on public.email_send_log
  for select using (client_id = public.current_client_id());
