-- Local mirror of the active PCO People roster for duplicate detection (and
-- future congregation/roster signals). Fully replaced on each weekly re-scan.
-- Service-role writes, admins read. Mirrors pco_kids_checkins.
create table if not exists public.pco_people (
  client_id  uuid not null references public.clients(id) on delete cascade,
  person_id  text not null,
  first      text,
  last       text,
  name       text,
  emails     text[] not null default '{}',
  phones     text[] not null default '{}',
  membership text,
  created    date,
  primary key (client_id, person_id)
);
create index if not exists pco_people_client_idx on public.pco_people (client_id);

alter table public.pco_people enable row level security;
create policy "admins read people" on public.pco_people
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
