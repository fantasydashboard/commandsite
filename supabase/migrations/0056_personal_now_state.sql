-- Josh Personal · "Now state" cache for the Today page hero card
-- ---------------------------------------------------------------------------
-- One row per user. Sage generates the hero text on demand (refresh
-- button) and writes here; the page reads cached state on load so it
-- renders instantly. time_bucket is a hint to the generator (morning /
-- midday / evening / late) so the prompt can lead with the right tone.
--
-- suggested_actions is a small array of {label, kind, payload} the UI
-- can render as tap-able chips ("+16oz water" → log_metric water_intake;
-- "Open Plan" → route; "Mark sleep" → quick log popover).
--
-- This is a single-row-per-user cache, not a log. Each refresh upserts.

create table public.personal_now_state (
  user_id           uuid primary key references auth.users(id) on delete cascade,

  -- Sage's generated content
  hero_text         text not null,
  secondary_text    text,
  suggested_actions jsonb not null default '[]'::jsonb,

  -- Generation context
  time_bucket       text not null check (time_bucket in ('morning', 'midday', 'evening', 'late')),
  generated_at      timestamptz not null default now(),
  model             text default 'claude-sonnet-4-6',

  -- Snapshot of inputs Sage saw at generation time (for debugging/repro)
  context_snapshot  jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create or replace function public.personal_now_state_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger personal_now_state_updated_at
  before update on public.personal_now_state
  for each row execute function public.personal_now_state_set_updated_at();

alter table public.personal_now_state enable row level security;

create policy "admins read own now state"
  on public.personal_now_state for select
  using (public.is_admin() and user_id = auth.uid());

create policy "admins manage own now state"
  on public.personal_now_state for all
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());
