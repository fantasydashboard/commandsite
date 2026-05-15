-- Josh Personal · audit + reverse-able log of target/profile changes
-- ---------------------------------------------------------------------------
-- Sage's update_target and update_profile tools write here BEFORE
-- mutating personal_profile, so every change Sage makes is:
--   (1) inspectable — "show me what Sage changed this week"
--   (2) reversible — revert_target_change(id) restores old_value and
--       chains the reversal as another row (reverted_by_id pointer)
--
-- Manual edits from the dashboard UI also write here (source='manual')
-- so the change history is one timeline, not split by source.
--
-- scope tells you which JSONB to patch:
--   'target'  → personal_profile.computed_targets[field_key]
--   'profile' → personal_profile.field_key (top-level column)

create table public.personal_target_changes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  changed_at      timestamptz not null default now(),

  scope           text not null check (scope in ('target', 'profile')),
  field_key       text not null,            -- 'water_oz' / 'sat_fat_g_ceiling' / 'eating_window_end' / etc

  old_value       jsonb,                    -- previous value, NULL only on first-ever set
  new_value       jsonb not null,

  reason          text,                     -- Sage's stated reason for the change
  source          text not null default 'sage' check (source in ('sage', 'manual')),

  -- Reversal chain. When change B reverts change A:
  --   B.new_value = A.old_value
  --   A.reverted_at = B.changed_at
  --   A.reverted_by_id = B.id
  -- This keeps the ledger append-only (no UPDATE-in-place) so the
  -- history reads cleanly top-to-bottom.
  reverted_at     timestamptz,
  reverted_by_id  uuid references public.personal_target_changes(id),

  created_at      timestamptz not null default now()
);

create index personal_target_changes_user_changed_at_idx
  on public.personal_target_changes (user_id, changed_at desc);

create index personal_target_changes_scope_field_idx
  on public.personal_target_changes (user_id, scope, field_key, changed_at desc);

alter table public.personal_target_changes enable row level security;

create policy "admins read own target changes"
  on public.personal_target_changes for select
  using (public.is_admin() and user_id = auth.uid());

create policy "admins manage own target changes"
  on public.personal_target_changes for all
  using (public.is_admin() and user_id = auth.uid())
  with check (public.is_admin() and user_id = auth.uid());
