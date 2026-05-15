-- Josh Personal · meal planning v2 — feedback loop + per-plan servings + flexible window
-- ---------------------------------------------------------------------------
-- Three changes land together because the popover flow uses all three:
--   (1) personal_weekly_plans gains end_date, servings_by_slot,
--       included_slots, reviewed_at — the new "Plan next" popover lets
--       Josh customize each plan instead of inheriting profile defaults.
--   (2) personal_meal_feedback — per-meal reactions Josh gives mid-week
--       (inline 👎/👍) or at review time (structured Qs).
--   (3) personal_ingredient_prefs — derived "never_again / loved /
--       caution" verdicts per ingredient. This is what Sage READS when
--       generating the next plan ("NEVER USE: dill, mushrooms").
--
-- The asymmetry is intentional: feedback is the raw log, prefs is the
-- distilled rule set. A new feedback row can update or create a pref,
-- but prefs can also be edited manually (e.g. Josh adds "shellfish"
-- without ever flagging a meal).

-- ── (1) Extend personal_weekly_plans for per-plan customization ─────

alter table public.personal_weekly_plans
  add column if not exists end_date          date,
  add column if not exists servings_by_slot  jsonb not null default '{"breakfast":1,"lunch":1,"dinner":1,"snacks":1}'::jsonb,
  add column if not exists included_slots    jsonb not null default '["breakfast","lunch","dinner","snacks"]'::jsonb,
  add column if not exists reviewed_at       timestamptz;

-- Backfill end_date for existing rows assuming the old 7-day Mon-Sun shape.
update public.personal_weekly_plans
  set end_date = week_starting + interval '6 days'
  where end_date is null;

alter table public.personal_weekly_plans
  alter column end_date set not null;


-- ── (2) personal_meal_feedback ──────────────────────────────────────

create table public.personal_meal_feedback (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  plan_id             uuid not null references public.personal_weekly_plans(id) on delete cascade,

  -- Position in the plan. day_idx 0 = first day of the plan window.
  -- Allow up to 30 so a 30-day plan would fit if we ever stretch.
  day_idx             integer not null check (day_idx >= 0 and day_idx <= 30),
  meal_slot           text    not null check (meal_slot in ('breakfast','lunch','dinner','snacks')),

  -- Snapshot of the meal name at feedback time (the plan itself can be
  -- regenerated; we don't want feedback to silently re-point).
  meal_name           text,

  reaction            text not null check (reaction in ('loved','liked','neutral','never_again')),
  reason_category     text check (reason_category in ('taste','ingredient','prep_effort','portion','not_my_thing','other')),
  flagged_ingredient  text,
  notes               text,

  -- Where the row came from. 'inline' = mid-week 👎/👍 tap (reaction
  -- only, no reason yet); 'review' = end-of-week popover (full row);
  -- 'chat' = Sage wrote it from a chat conversation.
  source              text not null default 'inline' check (source in ('inline','review','chat')),

  created_at          timestamptz not null default now()
);

create index personal_meal_feedback_user_created_idx
  on public.personal_meal_feedback (user_id, created_at desc);

create index personal_meal_feedback_plan_idx
  on public.personal_meal_feedback (plan_id);

create index personal_meal_feedback_ingredient_idx
  on public.personal_meal_feedback (flagged_ingredient)
  where flagged_ingredient is not null;

alter table public.personal_meal_feedback enable row level security;

create policy "admins read own meal feedback"
  on public.personal_meal_feedback for select
  using (public.is_admin() and user_id = auth.uid());

create policy "admins manage own meal feedback"
  on public.personal_meal_feedback for all
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());


-- ── (3) personal_ingredient_prefs ────────────────────────────────────

create table public.personal_ingredient_prefs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  ingredient    text not null,
  verdict       text not null check (verdict in ('loved','never_again','caution')),

  -- Up to ~5 feedback rows that drove the current verdict, newest first.
  evidence_ids  uuid[] not null default '{}',

  -- Aggregated reason snippets (e.g. ["too oily", "texture"])
  reasons       text[] not null default '{}',

  set_at        timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (user_id, ingredient)
);

create index personal_ingredient_prefs_user_verdict_idx
  on public.personal_ingredient_prefs (user_id, verdict);

create or replace function public.personal_ingredient_prefs_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger personal_ingredient_prefs_updated_at
  before update on public.personal_ingredient_prefs
  for each row execute function public.personal_ingredient_prefs_set_updated_at();

alter table public.personal_ingredient_prefs enable row level security;

create policy "admins read own ingredient prefs"
  on public.personal_ingredient_prefs for select
  using (public.is_admin() and user_id = auth.uid());

create policy "admins manage own ingredient prefs"
  on public.personal_ingredient_prefs for all
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());
