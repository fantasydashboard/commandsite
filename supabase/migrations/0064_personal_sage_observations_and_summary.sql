-- Josh Personal · Sage's long-term memory + 30-day summary cache
-- ---------------------------------------------------------------------------
-- Two surfaces for the new History tab:
--
-- (1) personal_sage_observations — Sage's persistent notes about Josh.
--     "Under-eats protein at breakfast (15/20 days observed)." "Skips
--     workouts when sleep <6h (correlation 0.7)." Sage writes these
--     when she spots durable patterns. The History tab browses them.
--     Reading these at the top of every brief / now-state generation
--     gives her continuity (an actual coach who has been working with
--     you for months).
--
-- (2) personal_sage_summary — cached 30-day recap. One row per user.
--     Refresh button regenerates via generate-history-summary edge
--     function. Same pattern as personal_now_state.

-- ── (1) sage_observations ──────────────────────────────────────────

create table public.personal_sage_observations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,

  -- The observation itself, 1-3 sentences max.
  body            text not null,

  -- Free-form tags so the UI can group / filter (e.g. ['nutrition', 'breakfast']).
  tags            text[] not null default '{}',

  -- Sage's confidence after she wrote it.
  confidence      text not null default 'pattern' check (confidence in ('hunch', 'pattern', 'confirmed')),

  -- Optional pointers to evidence rows (e.g. patterns_detected ids,
  -- experiment ids) that drove the observation.
  evidence_refs   jsonb not null default '[]'::jsonb,

  -- 'active' shows on the History tab. 'archived' is what dismiss does.
  status          text not null default 'active' check (status in ('active', 'archived')),

  -- When Sage last validated this observation against fresh data
  -- (future: nightly job updates this if pattern still holds).
  last_validated_at timestamptz,
  set_at          timestamptz not null default now(),
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index personal_sage_observations_user_status_idx
  on public.personal_sage_observations (user_id, status, set_at desc);

create or replace function public.personal_sage_observations_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger personal_sage_observations_updated_at
  before update on public.personal_sage_observations
  for each row execute function public.personal_sage_observations_set_updated_at();

alter table public.personal_sage_observations enable row level security;

create policy "admins read own observations"
  on public.personal_sage_observations for select
  using (public.is_admin() and user_id = auth.uid());

create policy "admins manage own observations"
  on public.personal_sage_observations for all
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());


-- ── (2) sage_summary cache ─────────────────────────────────────────

create table public.personal_sage_summary (
  user_id         uuid primary key references auth.users(id) on delete cascade,

  -- Sage's prose summary of the last 30 days.
  body            text not null,

  -- Optional structured callouts the UI can render as chips
  -- (e.g. [{ label: '2 experiments completed', kind: 'experiments' }, ...]).
  highlights      jsonb not null default '[]'::jsonb,

  -- Window the summary covers
  window_start    date not null,
  window_end      date not null,

  generated_at    timestamptz not null default now(),
  model           text default 'claude-sonnet-4-6',
  context_snapshot jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create or replace function public.personal_sage_summary_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger personal_sage_summary_updated_at
  before update on public.personal_sage_summary
  for each row execute function public.personal_sage_summary_set_updated_at();

alter table public.personal_sage_summary enable row level security;

create policy "admins read own summary"
  on public.personal_sage_summary for select
  using (public.is_admin() and user_id = auth.uid());

create policy "admins manage own summary"
  on public.personal_sage_summary for all
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());
