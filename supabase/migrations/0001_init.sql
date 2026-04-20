-- CommandSite initial schema
-- Tables: clients, users, client_modules
-- Run against a fresh Supabase project via SQL editor or `supabase db push`.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  active        boolean not null default true,
  tier          text not null default 'standard',  -- 'basic' | 'standard' | 'premium' (free-form for now)
  monthly_rate  numeric(10, 2) not null default 0,
  created_at    timestamptz not null default now()
);

create index clients_slug_idx on public.clients (slug);

-- ---------------------------------------------------------------------------
-- users (profile rows linked 1:1 to auth.users)
-- ---------------------------------------------------------------------------
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null check (role in ('admin', 'client')),
  client_id   uuid references public.clients(id) on delete set null,
  created_at  timestamptz not null default now(),
  -- admins may have no client; clients must be linked to one
  constraint client_requires_client_id check (role <> 'client' or client_id is not null)
);

create index users_client_id_idx on public.users (client_id);

-- ---------------------------------------------------------------------------
-- client_modules (which modules are enabled for a given client)
-- ---------------------------------------------------------------------------
create table public.client_modules (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  module_key  text not null,   -- e.g. 'metrics', 'crm', 'projects', 'social'
  enabled     boolean not null default true,
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (client_id, module_key)
);

create index client_modules_client_id_idx on public.client_modules (client_id);

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so RLS on users doesn't recurse)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.users where id = auth.uid();
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.current_client_id() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_client_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.clients        enable row level security;
alter table public.users          enable row level security;
alter table public.client_modules enable row level security;

-- clients: admins full access, client users can read their own row only
create policy "admins manage clients"
  on public.clients for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "clients read own row"
  on public.clients for select
  using (id = public.current_client_id());

-- users: admins full access; each user can read their own profile row
create policy "admins manage users"
  on public.users for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "users read self"
  on public.users for select
  using (id = auth.uid());

-- client_modules: admins full access; clients read modules for their client
create policy "admins manage client_modules"
  on public.client_modules for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "clients read own modules"
  on public.client_modules for select
  using (client_id = public.current_client_id());

-- ---------------------------------------------------------------------------
-- Bootstrap your admin account
-- ---------------------------------------------------------------------------
-- 1. Create the auth user in Supabase Auth (dashboard or signUp).
-- 2. Run (replacing the uuid + email) to promote yourself:
--
-- insert into public.users (id, email, full_name, role)
-- values ('<auth-user-uuid>', 'josh@getinthelimelight.com', 'Josh Daniel', 'admin');
