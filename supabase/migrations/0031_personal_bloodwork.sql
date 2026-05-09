-- Josh Personal · bloodwork panels (Phase 4 part 1 — manual entry)
-- ---------------------------------------------------------------------------
-- One row per blood draw. Markers stored as jsonb so we can add new
-- markers without a migration. Concerns derived at save time (any
-- marker out of range becomes a concern row) so the dashboard can
-- query "active concerns" without re-deriving on every render.
--
-- Manual entry now (Path A); PDF upload + Claude vision extract
-- comes later (Path B). Same schema serves both.

create table public.personal_bloodwork_panels (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  drawn_at        date not null,
  drawn_by        text,                       -- 'Quest Diagnostics' / 'LabCorp' / etc.
  notes           text,                       -- "Annual physical" / "Quarterly check-in"

  -- Marker values as jsonb. Shape:
  --   { "ldl_mg_dl": 148, "hdl_mg_dl": 52, "triglycerides_mg_dl": 88,
  --     "a1c_pct": 5.4, "vit_d_ng_ml": 32, "tsh_miu_l": 2.1,
  --     "total_testosterone_ng_dl": 640, "crp_mg_l": 0.8,
  --     "fasting_glucose_mg_dl": 92, "alt_u_l": 28, "ast_u_l": 24,
  --     "hemoglobin_g_dl": 14.5, ... }
  -- Keys map to canonical names so the targets calculator can read
  -- them without a translation layer.
  markers         jsonb not null default '{}',

  -- Sage's panel-level read (LLM-generated when full pipeline lands).
  -- For manual entry we leave this null; the targets card derives a
  -- terse rationale from the AHA tier rules in targets.ts.
  sage_read       text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index personal_bloodwork_panels_user_drawn_at_idx
  on public.personal_bloodwork_panels (user_id, drawn_at desc);

create or replace function public.personal_bloodwork_panels_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger personal_bloodwork_panels_updated_at
  before update on public.personal_bloodwork_panels
  for each row execute function public.personal_bloodwork_panels_set_updated_at();

alter table public.personal_bloodwork_panels enable row level security;

create policy "admins read own bloodwork"
  on public.personal_bloodwork_panels for select
  using (public.is_admin() and user_id = auth.uid());

create policy "admins manage own bloodwork"
  on public.personal_bloodwork_panels for all
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());

-- Concerns are derived (LDL > 130 → concern, A1C > 5.7 → concern, etc.)
-- We compute them in TS rather than in SQL so the threshold logic
-- stays alongside the targets math. Just a virtual lookup over the
-- markers — no separate table needed for v1.
