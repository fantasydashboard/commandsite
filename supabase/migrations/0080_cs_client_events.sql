-- CommandSite · cs_client_events
-- ---------------------------------------------------------------------------
-- Per-customer usage event log. Two-purpose:
--
--   1. Monthly customer-facing report ("here's what Grace did for you this
--      month"). Aggregates by customer + month + event_kind.
--   2. Internal client-health signal for Josh. Spotting silent churn risk:
--      a customer who hasn't logged in in 14 days, a customer whose
--      drafts-approved rate dropped, etc.
--
-- Append-only. Never updated, never deleted (except via cascade on customer
-- delete). Each row is one thing that happened.
--
-- Event taxonomy (extend as new functions ship; no enum so this stays
-- flexible without a migration per new event kind):
--
--   Value-delivered events (count in the monthly report):
--     visitor_captured         — first-time visitor logged in member system
--     welcome_drafted          — Grace generated a welcome email draft
--     welcome_approved         — operator approved a welcome draft
--     welcome_sent             — welcome email actually went out
--     drift_identified         — Drift Watch flagged a member as drifting
--     drift_outreach_drafted   — Grace drafted a check-in to a drifter
--     drift_outreach_sent      — drift outreach actually went out
--     reply_received           — inbound reply landed in the inbox
--     reply_handled            — operator marked a reply as handled
--     sage_chat                — operator asked Sage / Ada / Grace a question
--
--   Engagement events (drive the internal health view):
--     login                    — operator signed in
--     dashboard_view           — operator opened a dashboard page
--     draft_approved           — operator approved a queued draft (any kind)
--     draft_rejected           — operator rejected a queued draft (any kind)
--
-- Optional cost_cents column attaches Anthropic / NeverBounce / Google API
-- spend to the event when relevant. NULL for free events (login, sent
-- emails, etc.). Future "cost by customer" view rolls these up directly.

create table public.cs_client_events (
  id                uuid primary key default gen_random_uuid(),

  -- The customer this event belongs to. Cascade so deleting a churned
  -- customer cleans up their audit trail too.
  customer_id       uuid not null references public.cs_customers(id) on delete cascade,

  -- One of the event_kinds documented above. Free-form text (not an enum)
  -- so adding new event types doesn't require a migration. Validate at
  -- the helper layer instead.
  event_kind        text not null,

  -- Free-form payload — shape depends on event_kind. Examples:
  --   sage_chat:        { question: '...', answer_chars: 412, model: 'claude-sonnet-4-6' }
  --   welcome_sent:     { recipient_email: '...', subject: '...' }
  --   drift_identified: { member_name: '...', days_since_last_seen: 73 }
  --   login:            { user_id: <uuid>, user_agent: '...' }
  payload           jsonb not null default '{}'::jsonb,

  -- Cost attribution. NULL when the event is free (login, send). Set
  -- when an AI call backed the event (sage_chat, welcome_drafted).
  -- In cents so we can sum without floating-point drift.
  cost_cents        integer,

  -- Source function or surface that emitted the event. Useful for
  -- debugging ("which function logged this?") and for filtering
  -- engagement events by surface.
  source            text,

  -- Optional: the operator who triggered it (NULL for system / cron).
  actor_id          uuid references auth.users(id) on delete set null,

  created_at        timestamptz not null default now()
);

-- Most queries are "events for this customer in this time window."
-- Compound index supports those efficiently.
create index cs_client_events_customer_id_idx
  on public.cs_client_events (customer_id, created_at desc);

-- "Show me all welcome_sent events this month" or "what did Sage answer
-- across all customers" queries hit this one.
create index cs_client_events_kind_idx
  on public.cs_client_events (event_kind, created_at desc);

-- Cost rollup queries: "sum cost_cents by customer for last month."
create index cs_client_events_cost_idx
  on public.cs_client_events (customer_id, created_at desc)
  where cost_cents is not null;


-- ── RLS ──────────────────────────────────────────────────────────────
-- Same shape as cs_customers itself: admin can read + write everything,
-- service role manages it (used by edge functions inserting events).
-- Customer-facing read (Christina sees her own events for an in-app
-- report) is intentionally deferred until the customer auth bridge
-- between public.users and cs_customers exists.

alter table public.cs_client_events enable row level security;

create policy "admins read cs_client_events"
  on public.cs_client_events for select
  using (public.is_admin());

create policy "admins manage cs_client_events"
  on public.cs_client_events for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "service role manages cs_client_events"
  on public.cs_client_events for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');


comment on table public.cs_client_events is
  'Per-customer usage event log. Drives monthly customer reports + internal client-health signals. Append-only. See header for event taxonomy.';
