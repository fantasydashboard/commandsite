-- Josh Personal · weekly meal + workout plans (Path B of Phase 5)
-- ---------------------------------------------------------------------------
-- One row per (user, week_starting Monday). Sage drafts a fresh plan
-- each Saturday morning by reading profile + targets + bloodwork +
-- 7-day metrics + active goals + last week's actuals, then generates
-- 7 days of meals + workouts + an aggregated shopping list + a list
-- of biomarker-driven swaps with rationale.
--
-- Plans are draft-then-approve: when first generated, approved_at is
-- null. Josh reviews, edits if needed, hits "Approve & generate
-- shopping list" — that sets approved_at. The week's plan can be
-- regenerated any time before Monday (upserts via the unique index).
--
-- The days/shopping_list/swaps/strategy fields match the existing
-- mock shape in src/lib/clients/josh-personal/health.ts so the Plan
-- module's UI works against either source without changes.

create table public.personal_weekly_plans (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,

  -- Monday of the week this plan covers. ISO date.
  week_starting      date not null,

  -- Sage's strategy paragraph — explains WHY this week looks the way
  -- it does (deficit target, sat fat tightening, volume changes, etc.)
  strategy           text,

  -- 7-day plan body. Array of day objects with shape:
  --   { day, date, workout, workout_detail, workout_exercises[],
  --     meals: { breakfast, lunch, dinner, snacks },
  --     totalCal, totalProtein }
  days               jsonb not null default '[]',

  -- Aggregated grocery list, grouped by category, with quantities.
  -- Shape: array of { name, qty, category }
  shopping_list      jsonb not null default '[]',

  -- Biomarker-driven changes Sage made vs. her default. Shape:
  -- array of { day, change, why }
  swaps              jsonb not null default '[]',

  -- Aggregate stats for the hero card (avg cal, avg protein, deficit, etc.)
  -- Shape: { avg_cal, avg_protein, workout_days, deficit_vs_maintain,
  --          shopping_count, shopping_estimate_usd }
  totals             jsonb,

  -- Generation metadata
  generated_at       timestamptz not null default now(),
  generated_by       text not null default 'manual' check (generated_by in ('manual', 'cron', 'auto_after_data')),
  model              text default 'claude-sonnet-4-6',
  context_snapshot   jsonb,

  -- Approval flow — when Josh hits "Approve & generate shopping list"
  approved_at        timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- One plan per user per week; regenerations upsert
  unique (user_id, week_starting)
);

create index personal_weekly_plans_user_week_idx
  on public.personal_weekly_plans (user_id, week_starting desc);

create or replace function public.personal_weekly_plans_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger personal_weekly_plans_updated_at
  before update on public.personal_weekly_plans
  for each row execute function public.personal_weekly_plans_set_updated_at();

-- RLS: admin only, own row
alter table public.personal_weekly_plans enable row level security;

create policy "admins read own weekly plans"
  on public.personal_weekly_plans for select
  using (public.is_admin() and user_id = auth.uid());

create policy "admins manage own weekly plans"
  on public.personal_weekly_plans for all
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());
