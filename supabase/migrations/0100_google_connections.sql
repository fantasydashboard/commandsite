-- CommandSite · Google (Gmail) per-church OAuth connections
-- Multi-tenant mirror of pco_connections (see 0081). Each church authorizes
-- CommandSite through Google's consent screen; encrypted send-capable tokens
-- land here, one row per church PER connected address (multiple staff can
-- each connect their own sending address). Tokens are AES-GCM ciphertext
-- (crypto.ts, TOKEN_ENC_KEY); RLS restricts to admins + the service role.
create table public.google_connections (
  tenant_key         text not null check (tenant_key ~ '^[a-z0-9][a-z0-9_-]*$'),
  display_label      text not null,
  access_token_enc   text not null,
  refresh_token_enc  text not null,
  expires_at         timestamptz not null,
  scopes             text not null,
  org_name           text,
  connected_by       text,
  connected_email    text not null,
  customer_id        uuid references public.cs_customers(id) on delete cascade,
  is_default         boolean not null default false,
  user_id            uuid references public.users(id) on delete set null,
  connected_at       timestamptz not null default now(),
  last_refreshed_at  timestamptz,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (tenant_key, connected_email)
);

create index google_connections_customer_id_idx
  on public.google_connections (customer_id)
  where customer_id is not null;

create index google_connections_tenant_idx
  on public.google_connections (tenant_key);

create unique index google_connections_one_default
  on public.google_connections (tenant_key)
  where is_default;

alter table public.google_connections enable row level security;

create policy "admins manage google_connections"
  on public.google_connections for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "service role manages google_connections"
  on public.google_connections for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.touch_google_connections()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger google_connections_touch
  before update on public.google_connections
  for each row execute function public.touch_google_connections();

-- If the default connection is deleted, promote the oldest remaining
-- connection for that church to default so getGoogleAccessToken(tenant)'s
-- no-email lookup (is_default = true) never comes up empty. Safe against the
-- google_connections_one_default partial unique index: we only promote when
-- zero defaults remain for the tenant.
create or replace function public.google_connections_promote_default()
returns trigger language plpgsql as $$
begin
  if old.is_default then
    if not exists (select 1 from public.google_connections where tenant_key = old.tenant_key and is_default)
       and exists (select 1 from public.google_connections where tenant_key = old.tenant_key) then
      update public.google_connections
      set is_default = true
      where tenant_key = old.tenant_key
        and connected_email = (
          select connected_email from public.google_connections
          where tenant_key = old.tenant_key
          order by connected_at asc, connected_email asc
          limit 1
        );
    end if;
  end if;
  return old;
end;
$$;

create trigger google_connections_promote_default_trg
  after delete on public.google_connections
  for each row execute function public.google_connections_promote_default();
