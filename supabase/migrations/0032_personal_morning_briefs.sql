-- Josh Personal · daily morning brief from Sage (Path A of Phase 5)
-- ---------------------------------------------------------------------------
-- One row per (user, brief_date). Sage drafts a fresh brief each
-- morning (eventually via cron, manual now) by reading the user's
-- profile + targets + latest bloodwork + 7-day metrics + today's
-- plan slice + active goals, then writing four short sections:
--
--   - todays_focus     — what to actually do today, anchored in data
--   - watch_out_for    — guardrails Sage is enforcing today + why
--   - patterns_noticed — anomalies / correlations from recent data
--   - goal_check       — quick on/off-track read across active goals
--
-- The unique constraint on (user_id, brief_date) means clicking
-- "regenerate" upserts — we only keep the latest version of each day's
-- brief. context_snapshot stores the data Sage was given so we can
-- debug her reasoning later (or replay with a tweaked prompt).

create table public.personal_morning_briefs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,

  -- The DAY this brief is FOR (Sage's "today is Saturday May 9" date),
  -- not the timestamp it was generated. Lets us pick "today's brief"
  -- without timezone math.
  brief_date          date not null,

  -- Four short sections (~30-90 words each)
  todays_focus        text,
  watch_out_for       text,
  patterns_noticed    text,
  goal_check          text,

  -- One-line headline Sage writes summarizing the day's vibe (e.g.
  -- "Push day, HRV recovered, watch sat fat at lunch")
  headline            text,

  -- Generation metadata
  generated_at        timestamptz not null default now(),
  generated_by        text not null default 'manual'  check (generated_by in ('manual', 'cron', 'auto_after_data')),
  model               text default 'claude-sonnet-4-6',

  -- Snapshot of the data fed into the prompt — useful for debugging
  -- Sage's reasoning + replaying with a different prompt.
  context_snapshot    jsonb,

  created_at          timestamptz not null default now(),

  -- One brief per user per day; regenerations overwrite
  unique (user_id, brief_date)
);

create index personal_morning_briefs_user_date_idx
  on public.personal_morning_briefs (user_id, brief_date desc);

-- RLS: admin only, own row
alter table public.personal_morning_briefs enable row level security;

create policy "admins read own briefs"
  on public.personal_morning_briefs for select
  using (public.is_admin() and user_id = auth.uid());

create policy "admins manage own briefs"
  on public.personal_morning_briefs for all
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());
