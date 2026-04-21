-- CommandSite ingest pipeline
-- Adds: client_api_keys (for external systems to POST contacts) and a
-- SECURITY DEFINER helper that generates a full key, returns it once,
-- and stores only the sha256 hash.

create table public.client_api_keys (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  name         text not null,                    -- human label, e.g. "UFD signup webhook"
  key_prefix   text not null,                    -- first 16 chars (cs_live_xxxxxxxx) — safe to display
  key_hash     text not null,                    -- sha256 hex of the full key
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index client_api_keys_client_id_idx on public.client_api_keys (client_id);
create unique index client_api_keys_prefix_active
  on public.client_api_keys (key_prefix)
  where revoked_at is null;

alter table public.client_api_keys enable row level security;

-- Admin manages everything
create policy "admins manage client_api_keys"
  on public.client_api_keys for all
  using (public.is_admin()) with check (public.is_admin());

-- Clients see metadata for their own keys (the hash is one-way; the full
-- key was only ever returned from the SECURITY DEFINER function below,
-- so it isn't recoverable from this table).
create policy "clients read own keys"
  on public.client_api_keys for select
  using (client_id = public.current_client_id());

-- ---------------------------------------------------------------------------
-- Key generator
-- Returns the full secret ONCE. The caller must save it immediately;
-- only the sha256 hash is persisted.
--
-- Usage:
--   select * from public.create_client_api_key(
--     '<client-uuid>',
--     'Name of this key'
--   );
-- ---------------------------------------------------------------------------
create or replace function public.create_client_api_key(
  p_client_id uuid,
  p_name      text
)
returns table(full_key text, id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_key text;
  v_prefix   text;
  v_hash     text;
  v_id       uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden: only admins can generate api keys';
  end if;

  v_full_key := 'cs_live_' || encode(gen_random_bytes(24), 'hex');
  v_prefix   := substring(v_full_key, 1, 16);
  v_hash     := encode(digest(v_full_key, 'sha256'), 'hex');

  insert into public.client_api_keys (client_id, name, key_prefix, key_hash)
  values (p_client_id, p_name, v_prefix, v_hash)
  returning client_api_keys.id into v_id;

  return query select v_full_key, v_id;
end
$$;

revoke all on function public.create_client_api_key(uuid, text) from public;
grant execute on function public.create_client_api_key(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Revoke helper (admins only)
-- ---------------------------------------------------------------------------
create or replace function public.revoke_client_api_key(p_key_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  update public.client_api_keys set revoked_at = now() where id = p_key_id;
end
$$;

revoke all on function public.revoke_client_api_key(uuid) from public;
grant execute on function public.revoke_client_api_key(uuid) to authenticated;
