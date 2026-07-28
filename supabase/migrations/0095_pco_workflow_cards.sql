-- Local mirror of PCO Starting Point workflow cards for the guest pipeline.
-- Filled in chunks by pco-fetch, read by compute. Service-role writes, admins
-- read. PK dedupes a card to one row. Mirrors pco_kids_checkins.
create table if not exists public.pco_workflow_cards (
  client_id      uuid not null references public.clients(id) on delete cascade,
  workflow_id    text not null,
  card_id        text not null,
  campus         text not null,
  name           text not null,
  created_date   date not null,
  completed_date date,
  step_name      text not null default '',
  primary key (client_id, card_id)
);
create index if not exists pco_workflow_cards_client_created_idx on public.pco_workflow_cards (client_id, created_date);

alter table public.pco_workflow_cards enable row level security;
create policy "admins read workflow cards" on public.pco_workflow_cards
  for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
