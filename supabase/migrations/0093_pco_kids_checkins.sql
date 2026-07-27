-- Local mirror of kids check-ins for the family-drift signal. Filled in chunks by
-- pco-fetch, read by compute. Service-role writes, admins read. PK dedupes a child
-- who checked into two services the same day to one row (pooled attendance only
-- cares that they were present that day).
create table if not exists public.pco_kids_checkins (
  client_id    uuid not null references public.clients(id) on delete cascade,
  person_id    text not null,
  first        text not null,
  last         text not null,
  checkin_date date not null,
  kind         text not null,
  primary key (client_id, person_id, checkin_date)
);
create index if not exists pco_kids_checkins_client_date_idx on public.pco_kids_checkins (client_id, checkin_date);

alter table public.pco_kids_checkins enable row level security;
create policy "admins read kids checkins" on public.pco_kids_checkins
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
