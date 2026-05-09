-- Josh Personal · meal log (Path C — Ask Sage chat companion)
-- ---------------------------------------------------------------------------
-- Sage's log_meal tool writes here when Josh tells her what he ate
-- via chat ("Sage, log: had the sirloin meal at Longhorn") or
-- manually elsewhere in the dashboard. Stores the description Josh
-- gave plus Sage's macro estimates so adherence-vs-plan becomes
-- trackable later.
--
-- Macro estimates are Claude's best guess from the description text
-- (not gospel — the lab analysis comes from a real food log if/when
-- we wire MyFitnessPal-style entry). Storing them lets the morning
-- brief reference today's actual intake without another LLM call.

create table public.personal_meal_log (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,

  logged_at             timestamptz not null default now(),

  -- Free-form description Josh gave ("7oz Renegade sirloin, side
  -- house salad with vinaigrette, steamed broccoli")
  description           text not null,

  -- Sage's best-effort macro estimates from the description.
  -- All optional — sometimes Josh just logs "small lunch out" with
  -- no detail and Sage skips estimates.
  estimated_cal         numeric,
  estimated_protein_g   numeric,
  estimated_fat_g       numeric,
  estimated_sat_fat_g   numeric,
  estimated_carbs_g     numeric,

  -- Optional structured meal slot — "breakfast" / "lunch" / "dinner" /
  -- "snack" — derived from time of day or stated by Josh.
  meal_slot             text check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),

  -- Where the entry came from: chat (Sage logged via tool), manual
  -- (UI form Josh fills), or apple_health (future MyFitnessPal sync).
  source                text not null default 'chat' check (source in ('chat', 'manual', 'apple_health')),

  created_at            timestamptz not null default now()
);

create index personal_meal_log_user_logged_at_idx
  on public.personal_meal_log (user_id, logged_at desc);

alter table public.personal_meal_log enable row level security;

create policy "admins read own meal log"
  on public.personal_meal_log for select
  using (public.is_admin() and user_id = auth.uid());

create policy "admins manage own meal log"
  on public.personal_meal_log for all
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());
