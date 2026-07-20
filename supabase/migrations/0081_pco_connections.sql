-- CommandSite · Planning Center per-church OAuth connections
-- ---------------------------------------------------------------------------
-- The multi-tenant successor to a single PCO Personal Access Token in
-- .env.local. Each church authorizes CommandSite through Planning Center's
-- own OAuth consent screen; the resulting tokens land here, one row per
-- church. Josh is never an admin on the church's PCO account, and onboarding
-- a new church becomes a button instead of a token handoff.
--
-- SECURITY POSTURE (deliberate):
--   • access_token / refresh_token are stored ENCRYPTED at the application
--     layer (AES-GCM, key = TOKEN_ENC_KEY edge secret) — see
--     functions/_shared/crypto.ts. A database dump without that key is inert.
--     They are TEXT here because the column holds base64(iv || ciphertext),
--     never plaintext.
--   • RLS: only admins (dashboard) and the service role (edge functions)
--     ever touch this table. No church-scoped user can read another church's
--     tokens — or any tokens at all.
--   • Grow custody deliberately: request the minimum PCO scopes, and never
--     the `giving` scope until giving is actually built. `scopes` records
--     exactly what was granted so we can audit it.
--
-- tenant_key is the church's dashboard slug (e.g. 'focal-point-church'), the
-- same identity used everywhere else in the app. That's the join key the
-- pull layer uses to ask "which token do I use for this church?"

create table public.pco_connections (
  tenant_key         text primary key check (tenant_key ~ '^[a-z0-9][a-z0-9_-]*$'),
  display_label      text not null,               -- "Focal Point Church"

  -- What Planning Center handed back on the OAuth exchange. Tokens are
  -- ciphertext (see crypto.ts); expires_at is the access_token deadline so
  -- the refresh helper knows when to rotate without a probe request.
  access_token_enc   text not null,
  refresh_token_enc  text not null,
  expires_at         timestamptz not null,
  scopes             text not null,               -- space-separated granted scopes

  -- Who/what connected — best-effort identity for the Settings UI. Never
  -- load-bearing; the token is the source of truth for access.
  org_name           text,                        -- PCO organization name
  connected_by       text,                        -- person who authorized
  connected_email    text,

  -- Optional link to a paying customer record (as email_accounts does).
  -- Null for the pilot / first-party churches.
  customer_id        uuid references public.cs_customers(id) on delete cascade,

  connected_at       timestamptz not null default now(),
  last_refreshed_at  timestamptz,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index pco_connections_customer_id_idx
  on public.pco_connections (customer_id)
  where customer_id is not null;

alter table public.pco_connections enable row level security;

-- Admins manage connections from the dashboard (connect / disconnect / view
-- status). is_admin() is defined in 0001_init.sql.
create policy "admins manage pco_connections"
  on public.pco_connections for all
  using (public.is_admin())
  with check (public.is_admin());

-- Edge functions (oauth callback, refresh helper, scheduled pulls) run as the
-- service role and need full access to read/rotate tokens.
create policy "service role manages pco_connections"
  on public.pco_connections for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- updated_at trigger (same shape as touch_email_accounts)
create or replace function public.touch_pco_connections()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger pco_connections_touch
  before update on public.pco_connections
  for each row execute function public.touch_pco_connections();
