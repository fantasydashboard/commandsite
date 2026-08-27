-- Shared snooze / never-flag state.
--
-- This lived in localStorage, so every staff member had a private copy. With one
-- user that is invisible; with four it silently diverges: the care lead
-- dismisses a family, the pastor still sees them, and they both call. Hiding is
-- a fact about the person ("this is staff", "they are travelling"), not a
-- preference of whoever is looking, so it belongs to the church.
--
-- flag_id is the same `signal:name` key the UI already uses (flags.ts flagId),
-- so existing localStorage entries migrate across untouched.
create table if not exists public.care_flag_hides (
  client_id       uuid not null references public.clients(id) on delete cascade,
  flag_id         text not null,
  reason          text not null check (reason in ('dismissed', 'snoozed')),
  -- Null for a permanent hide. A snooze past this timestamp stops hiding.
  until           timestamptz,
  note            text,
  -- Denormalised on purpose: public.users only lets a user read their OWN row,
  -- so a church user could never resolve a colleague's name through a join.
  -- Attribution is the whole point once more than one person is working the
  -- lists, so the name is written at the time of the action.
  created_by      uuid references public.users(id) on delete set null,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (client_id, flag_id)
);

create index if not exists care_flag_hides_client_idx on public.care_flag_hides (client_id);

alter table public.care_flag_hides enable row level security;

-- Any user of the church may hide and unhide: the person working a list is the
-- person who knows a flag is wrong, and gating it to full scope would push them
-- back to snoozing the same person every week.
create policy "church manages own care hides" on public.care_flag_hides for all
  using (public.is_admin() or client_id = public.current_client_id())
  with check (public.is_admin() or client_id = public.current_client_id());

comment on table public.care_flag_hides is
  'Church-wide snooze / never-flag state for care + serving flags. Keyed by the UI flag id (signal:name). Replaces per-browser localStorage so staff see the same lists.';
