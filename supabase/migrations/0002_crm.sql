-- CommandSite CRM block
-- Adds: pipelines, stages, contacts, contact_events (append-only), contact_notes.
-- RLS model (option A): admins manage everything; the client user who owns the
-- workspace can read AND write their own rows. contact_events is append-only for
-- client users (no update/delete) so the journey log stays trustworthy.

-- ---------------------------------------------------------------------------
-- pipelines
-- ---------------------------------------------------------------------------
create table public.pipelines (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  name        text not null,
  is_default  boolean not null default true,
  created_at  timestamptz not null default now()
);
create index pipelines_client_id_idx on public.pipelines (client_id);

-- ---------------------------------------------------------------------------
-- stages (kanban columns, ordered, per-pipeline)
-- ---------------------------------------------------------------------------
create table public.stages (
  id           uuid primary key default gen_random_uuid(),
  pipeline_id  uuid not null references public.pipelines(id) on delete cascade,
  name         text not null,
  position     int  not null,
  color        text,
  is_won       boolean not null default false,
  is_lost      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index stages_pipeline_id_idx on public.stages (pipeline_id);

-- ---------------------------------------------------------------------------
-- contacts (the address book — not a login user)
-- ---------------------------------------------------------------------------
create table public.contacts (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients(id) on delete cascade,
  first_name         text,
  last_name          text,
  email              text,
  phone              text,                                -- E.164 preferred
  company            text,
  title              text,
  source             text,                                -- 'website_form' | 'manual' | 'import' | ...
  owner_name         text,                                -- free text until team users exist
  pipeline_id        uuid references public.pipelines(id) on delete set null,
  stage_id           uuid references public.stages(id)    on delete set null,
  tags               jsonb not null default '[]'::jsonb,
  custom_fields      jsonb not null default '{}'::jsonb,
  last_contacted_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index contacts_client_id_idx on public.contacts (client_id);
create index contacts_stage_id_idx  on public.contacts (stage_id);
create unique index contacts_client_email_unique
  on public.contacts (client_id, lower(email))
  where email is not null;
create index contacts_client_phone_idx
  on public.contacts (client_id, phone)
  where phone is not null;

-- ---------------------------------------------------------------------------
-- contact_events (append-only journey log — the backbone of follow-up & timeline)
-- ---------------------------------------------------------------------------
create table public.contact_events (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id)  on delete cascade,
  contact_id   uuid not null references public.contacts(id) on delete cascade,
  event_type   text not null,                -- 'contact_created' | 'stage_changed' | 'email_sent' | ...
  actor_type   text not null default 'system', -- 'admin' | 'client_user' | 'system' | 'automation' | 'contact'
  actor_id     uuid,                          -- public.users.id for humans; null for system/automation
  payload      jsonb not null default '{}'::jsonb,
  occurred_at  timestamptz not null default now()
);
create index contact_events_contact_id_occurred_at_idx
  on public.contact_events (contact_id, occurred_at desc);
create index contact_events_client_id_occurred_at_idx
  on public.contact_events (client_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- contact_notes (editable, free-form. A note write also appends 'note_added' to events.)
-- ---------------------------------------------------------------------------
create table public.contact_notes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id)  on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  author_id   uuid references public.users(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index contact_notes_contact_id_idx on public.contact_notes (contact_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger (shared helper)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger contacts_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

create trigger contact_notes_updated_at
  before update on public.contact_notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.pipelines      enable row level security;
alter table public.stages         enable row level security;
alter table public.contacts       enable row level security;
alter table public.contact_events enable row level security;
alter table public.contact_notes  enable row level security;

-- pipelines
create policy "admins manage pipelines"
  on public.pipelines for all
  using (public.is_admin()) with check (public.is_admin());

create policy "clients manage own pipelines"
  on public.pipelines for all
  using (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());

-- stages (scoped by pipeline ownership)
create policy "admins manage stages"
  on public.stages for all
  using (public.is_admin()) with check (public.is_admin());

create policy "clients manage stages in own pipelines"
  on public.stages for all
  using (
    pipeline_id in (
      select id from public.pipelines where client_id = public.current_client_id()
    )
  )
  with check (
    pipeline_id in (
      select id from public.pipelines where client_id = public.current_client_id()
    )
  );

-- contacts
create policy "admins manage contacts"
  on public.contacts for all
  using (public.is_admin()) with check (public.is_admin());

create policy "clients manage own contacts"
  on public.contacts for all
  using (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());

-- contact_events: append-only for clients (SELECT + INSERT only, no UPDATE/DELETE)
create policy "admins manage contact_events"
  on public.contact_events for all
  using (public.is_admin()) with check (public.is_admin());

create policy "clients read own contact_events"
  on public.contact_events for select
  using (client_id = public.current_client_id());

create policy "clients insert own contact_events"
  on public.contact_events for insert
  with check (client_id = public.current_client_id());

-- contact_notes
create policy "admins manage contact_notes"
  on public.contact_notes for all
  using (public.is_admin()) with check (public.is_admin());

create policy "clients manage own contact_notes"
  on public.contact_notes for all
  using (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());
