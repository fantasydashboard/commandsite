-- Josh Personal · profile + preferences (Phase 3 onboarding)
-- ---------------------------------------------------------------------------
-- One row per admin user. Captures the static "about you" data Apple
-- Health can't tell us — height, age, sex (for BMR formula), activity
-- level, dietary restrictions, injuries, equipment available, etc.
--
-- The morning brief generator + weekly plan generator both read this
-- + the latest blood work + the metrics window to produce truly
-- personalized output instead of generic recommendations.
--
-- computed_targets is a denormalized cache of derived numbers (BMR,
-- TDEE, daily cal target, protein target, fat ceiling, etc.) so the
-- dashboard doesn't recompute them on every render. Recomputed
-- whenever the profile is edited or weight changes meaningfully.

create table public.personal_profile (
  -- Single-row design: PK = the admin user's id. Trying to insert
  -- a second profile row would fail because of the FK + uniqueness.
  user_id              uuid primary key references auth.users(id) on delete cascade,

  -- ── Body baseline (for BMR / macro targets)
  height_cm            numeric not null,
  age                  integer not null check (age between 13 and 100),
  sex_at_birth         text not null check (sex_at_birth in ('male', 'female')),
  body_fat_pct         numeric,                   -- optional; refines lean-mass calcs

  -- ── Goals
  primary_goal         text not null check (primary_goal in ('cut', 'recomp', 'maintain', 'bulk')),
  target_weight_lbs    numeric,
  target_deadline      date,
  weekly_loss_rate_lbs numeric,                   -- e.g. 0.5 for half-pound/week cut

  -- ── Activity
  activity_level       text not null check (activity_level in (
    'sedentary',           -- desk job, little/no exercise
    'lightly_active',      -- light exercise 1-3 days/week
    'moderately_active',   -- moderate exercise 3-5 days/week
    'very_active',         -- heavy exercise 6-7 days/week
    'extra_active'         -- very heavy + physical job
  )),
  workouts_per_week_target integer not null default 4,
  preferred_split          text,                  -- 'push_pull_legs', 'upper_lower', 'full_body', 'custom'
  preferred_workout_time   text,                  -- 'morning', 'midday', 'evening'
  session_duration_min     integer,               -- typical session length

  -- ── Diet preferences (free-form arrays, Sage parses)
  foods_disliked       text[] default '{}',       -- ['tofu', 'mushrooms']
  foods_avoided        text[] default '{}',       -- ['pork', 'shellfish'] — for moral/religious/medical
  cuisines_loved       text[] default '{}',       -- ['mexican', 'mediterranean']
  eating_window_start  text,                      -- '07:30' — first meal time
  eating_window_end    text,                      -- '20:00' — last meal time
  cooking_skill        text check (cooking_skill in ('none', 'basic', 'comfortable', 'enthusiast')),
  meal_prep_day        text default 'saturday',   -- when grocery + prep happens

  -- ── Injuries / limitations (one row per injury would be nicer
  -- long-term, but jsonb keeps this single-table for v1)
  injuries             jsonb default '[]',        -- [{body_part, note, since, revisit_at}]

  -- ── Equipment + venue
  has_home_gym         boolean default false,
  home_equipment       text[] default '{}',       -- ['squat_rack', 'trap_bar', 'dumbbells']
  has_commercial_gym   boolean default true,

  -- ── Health context
  conditions           text[] default '{}',       -- ['hypothyroid', 'high_bp']
  medications          text[] default '{}',
  sleep_target_hours   numeric default 7.5,
  typical_bedtime      text,                      -- '22:30'

  -- ── Computed targets (cached). Shape:
  --   { bmr, tdee, daily_cal, protein_g, fat_g_min, fat_g_target,
  --     sat_fat_g_ceiling, carbs_g, fiber_g, water_oz, protein_per_lb,
  --     deficit_or_surplus, computed_at, computed_from: { weight_lbs, ... } }
  -- This stays close to source-of-truth — recomputed when profile
  -- edits or weight drifts > 2 lbs from the value used last.
  computed_targets     jsonb,

  -- ── Sage's interpretation (LLM-generated at end of onboarding)
  -- Open-ended notes Sage wrote after seeing profile + bloodwork:
  -- "Given your cut + LDL trend, I'm capping sat fat aggressively
  --  at 16g/day vs the typical 22g for your size."
  sage_initial_read    text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create or replace function public.personal_profile_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger personal_profile_updated_at
  before update on public.personal_profile
  for each row execute function public.personal_profile_set_updated_at();

-- RLS — admin only, and only their own row.
alter table public.personal_profile enable row level security;

create policy "admins read own profile"
  on public.personal_profile for select
  using (public.is_admin() and user_id = auth.uid());

create policy "admins manage own profile"
  on public.personal_profile for all
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());
