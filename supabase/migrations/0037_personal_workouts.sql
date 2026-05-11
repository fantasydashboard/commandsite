-- Josh Personal · workout log
-- ---------------------------------------------------------------------------
-- One row per workout session. The weekly plan provides the *planned*
-- exercises (3 sets × 6 of bench, etc.); this table records what Josh
-- *actually* did — weight per set, reps per set, RPE if logged.
--
-- The progression logic in generate-weekly-plan reads from this table:
-- "last week Josh did bench 145×6, 145×5, 140×5 at RPE 8/9/9 — suggest
-- 150×5 working set this week."

create table public.personal_workouts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,

  -- The date the workout was performed (or planned, for the upcoming row).
  workout_date        date not null,

  -- 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full_body' | 'cardio' | 'rest'
  workout_type        text not null,

  -- Snapshot of what Sage planned (from the weekly plan at log time).
  -- Lets us tell "what was prescribed" vs "what was done" even after
  -- the weekly plan gets regenerated.
  -- Shape: [{ name, sets: "3 × 6", load: "145 lbs", notes }]
  planned_exercises   jsonb,

  -- What Josh actually did. Shape:
  -- [{ name, sets: [{ weight: 145, reps: 6, rpe: 8 }, ...], notes }]
  -- Empty array when planned but not yet logged.
  actual_exercises    jsonb not null default '[]'::jsonb,

  duration_min        integer,
  notes               text,

  -- 'planned' (auto-generated for today/tomorrow), 'in_progress', 'completed', 'skipped'
  status              text not null default 'planned'
                      check (status in ('planned','in_progress','completed','skipped')),
  completed_at        timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Only one workout per user per day (lets the UI upsert cleanly)
  unique (user_id, workout_date)
);

create index personal_workouts_user_date_idx
  on public.personal_workouts (user_id, workout_date desc);

create index personal_workouts_status_idx
  on public.personal_workouts (user_id, status, workout_date desc);

alter table public.personal_workouts enable row level security;

create policy "users read own workouts"
  on public.personal_workouts for select
  using (auth.uid() = user_id);

create policy "users manage own workouts"
  on public.personal_workouts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- updated_at trigger
create or replace function public.touch_personal_workouts()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger personal_workouts_touch
  before update on public.personal_workouts
  for each row execute function public.touch_personal_workouts();
