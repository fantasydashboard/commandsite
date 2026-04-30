-- Email channel for the AI Marketing module. Two related tables:
--   email_templates — saved, reusable assets (the "library")
--   email_drafts    — work-in-progress + sent log; mirrors social_post_drafts
--
-- Lifecycle sequencing comes in a later migration. This one focuses on
-- one-off AI-drafted emails + saved templates.

-- ---------------------------------------------------------------------------
-- email_templates — reusable per-client saved emails. Compatible shape with
-- structured content (subject, body parts) so the same row can power both
-- the AI generator and a static template.
-- ---------------------------------------------------------------------------
create table public.email_templates (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  -- Slug used in code/automation references (e.g. 'trial_welcome'). Unique
  -- per client; null is allowed for ad-hoc templates that don't need to be
  -- targeted by code.
  key           text,
  name          text not null,
  description   text,
  -- Structured content shape returned by the AI generator. JSONB so the
  -- shape can evolve without migrations. See ai-email-generate for the
  -- canonical shape.
  content       jsonb not null default '{}'::jsonb,
  -- Pre-rendered HTML for fast preview / send without re-running renderer.
  -- Updated whenever content changes (or on edit).
  html          text,
  subject       text,
  preview_text  text,
  -- Lifecycle metadata for V2 (sequence_id, day_offset, skip_if_paid,
  -- use_expiry_date) — currently unused but added to avoid another
  -- migration for that flow.
  metadata      jsonb not null default '{}'::jsonb,
  status        text not null default 'draft'
                  check (status in ('draft', 'ready', 'archived')),
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (client_id, key)
);
create index email_templates_client_idx on public.email_templates (client_id, status, updated_at desc);

create trigger email_templates_touch
  before update on public.email_templates
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- email_drafts — generated/edited drafts pending review or sent. One-off
-- counterpart to email_templates (templates are reusable, drafts are
-- single-use). Tracks recipient/cohort + send result.
-- ---------------------------------------------------------------------------
create table public.email_drafts (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,
  topic           text,
  -- Same structured content shape as email_templates.content
  content         jsonb not null default '{}'::jsonb,
  html            text,
  subject         text,
  preview_text    text,
  status          text not null default 'draft'
                    check (status in ('draft','approved','scheduled','sending','sent','failed','rejected')),
  -- Send target — either a single recipient or a cohort key (free_trial,
  -- expired, etc.). null until the user decides to send.
  recipient       text,
  cohort          text,
  -- Optional reference to the source template (if drafted from one).
  template_id     uuid references public.email_templates(id) on delete set null,
  ai_meta         jsonb,
  approved_by     uuid references public.users(id),
  approved_at     timestamptz,
  scheduled_for   timestamptz,
  sent_at         timestamptz,
  resend_id       text,
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index email_drafts_client_status_idx on public.email_drafts (client_id, status, created_at desc);

create trigger email_drafts_touch
  before update on public.email_drafts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.email_templates enable row level security;
alter table public.email_drafts    enable row level security;

create policy "admins manage email templates"
  on public.email_templates
  for all using (public.is_admin()) with check (public.is_admin());
create policy "clients read own email templates"
  on public.email_templates
  for select using (client_id = public.current_client_id());
create policy "clients write own email templates"
  on public.email_templates
  for insert with check (client_id = public.current_client_id());
create policy "clients update own email templates"
  on public.email_templates
  for update using (client_id = public.current_client_id())
                with check (client_id = public.current_client_id());
create policy "clients delete own email templates"
  on public.email_templates
  for delete using (client_id = public.current_client_id());

create policy "admins manage email drafts"
  on public.email_drafts
  for all using (public.is_admin()) with check (public.is_admin());
create policy "clients read own email drafts"
  on public.email_drafts
  for select using (client_id = public.current_client_id());
create policy "clients write own email drafts"
  on public.email_drafts
  for insert with check (client_id = public.current_client_id());
create policy "clients update own email drafts"
  on public.email_drafts
  for update using (client_id = public.current_client_id())
                with check (client_id = public.current_client_id());
create policy "clients delete own email drafts"
  on public.email_drafts
  for delete using (client_id = public.current_client_id());
