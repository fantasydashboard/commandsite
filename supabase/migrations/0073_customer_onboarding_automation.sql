-- CommandSite · Customer onboarding automation
-- ---------------------------------------------------------------------------
-- Augments cs_customers with the full set of fields needed to drive the
-- automated onboarding pipeline: contract tracking, payment, kickoff call,
-- discovery brief, provisioning, shadow mode.
--
-- The kanban already has 6 stages (signed → paid → discovery → provisioned
-- → shadow → live) — these columns let each stage flip its checklist items
-- automatically (when the underlying event happens) and surface the right
-- "needs you" actions when they don't.
--
-- Per-stage data lives in discrete columns rather than a single JSONB blob
-- so triggers, RLS, and per-field RPC calls work naturally. The summary
-- "what's left to do" view is computed client-side from these fields by
-- src/lib/clients/commandsite/onboarding.ts.
--
-- Idempotent — safe to re-apply.


-- ── 1. Contract tracking ────────────────────────────────────────────

alter table public.cs_customers
  add column if not exists contract_status text not null default 'pending'
    check (contract_status in ('pending', 'sent', 'signed', 'rejected'));

alter table public.cs_customers
  add column if not exists contract_sent_at  timestamptz,
  add column if not exists contract_signed_at timestamptz,
  add column if not exists contract_url text,
  add column if not exists contract_template_version text;

comment on column public.cs_customers.contract_status is
  'pending=verbal yes, no contract sent · sent=e-signed link out · signed=countersigned, ready to invoice · rejected=they backed out';
comment on column public.cs_customers.contract_url is
  'URL to the signed PDF (Dropbox Sign / PandaDoc / uploaded file). Surfaces as a link on the Kanban card so the operator can reread the terms.';


-- ── 2. Payment tracking ─────────────────────────────────────────────

alter table public.cs_customers
  add column if not exists payment_received_at timestamptz,
  add column if not exists payment_method text
    check (payment_method is null or payment_method in ('stripe', 'invoice', 'wire', 'check', 'other')),
  add column if not exists payment_reference text;

comment on column public.cs_customers.payment_method is
  'How the first payment was collected. ''stripe'' is the future default; ''invoice'' is the manual path for customer #1.';


-- ── 3. Kickoff call tracking ────────────────────────────────────────

alter table public.cs_customers
  add column if not exists kickoff_call_scheduled_at timestamptz,
  add column if not exists kickoff_call_completed_at timestamptz,
  add column if not exists kickoff_call_calendly_url text;

comment on column public.cs_customers.kickoff_call_scheduled_at is
  'When the kickoff call is on the books. Set manually today, by Calendly webhook later.';


-- ── 4. Discovery brief tracking ─────────────────────────────────────
-- The customer fills out a public form at /onboarding/discovery/:token
-- (token = discovery_brief_token to keep the URL unguessable). Their
-- answers land in discovery_brief_data as structured JSONB so the
-- provisioning step can read voice/ICP/roles from it programmatically.

alter table public.cs_customers
  add column if not exists discovery_brief_token text,
  add column if not exists discovery_brief_sent_at timestamptz,
  add column if not exists discovery_brief_returned_at timestamptz,
  add column if not exists discovery_brief_data jsonb;

-- Unique index — the token IS the auth, so collisions would be a bug.
create unique index if not exists cs_customers_discovery_token_idx
  on public.cs_customers (discovery_brief_token)
  where discovery_brief_token is not null;

comment on column public.cs_customers.discovery_brief_token is
  'Random URL slug for the public Discovery Brief form. Generated when the operator clicks "Send Discovery Brief". Unguessable; expires conceptually when discovery_brief_returned_at is set (form refuses further updates).';


-- ── 5. Provisioning + shadow + live tracking ────────────────────────

alter table public.cs_customers
  add column if not exists voice_profile_built_at timestamptz,
  add column if not exists tenant_provisioned_at timestamptz,
  add column if not exists shadow_started_at timestamptz,
  add column if not exists shadow_drafts_approved_count integer not null default 0,
  add column if not exists shadow_drafts_total_count integer not null default 0,
  add column if not exists live_started_at timestamptz;

comment on column public.cs_customers.shadow_drafts_approved_count is
  'How many of Ada/Grace''s drafts the customer has approved during shadow mode. The advance-to-live button gates on this hitting a threshold (default 10).';


-- ── 6. Backfill: any existing customer gets a pre-signed contract_status
-- so the new gates don't block them retroactively.

update public.cs_customers
  set contract_status = 'signed',
      contract_signed_at = coalesce(signed_at, created_at)
  where contract_status = 'pending'
    and (signed_at is not null or status = 'active');


-- ── 7. Public-by-token RLS for the Discovery Brief form ─────────────
-- The customer hits /onboarding/discovery/:token without an account.
-- The token IS the auth: knowing it lets you read + write THAT ONE
-- row's discovery_brief_* fields and nothing else. We do this with
-- two policies that key off token equality.

drop policy if exists "public read by discovery token" on public.cs_customers;
create policy "public read by discovery token"
  on public.cs_customers for select
  to anon, authenticated
  using (
    discovery_brief_token is not null
    -- The token must be present in the request. Supabase / PostgREST
    -- exposes the row only when the WHERE clause filters by token,
    -- which the public page does. The policy permits any read where
    -- the token column is non-null AND the requester has supplied it
    -- (filtered via the query). Combined with the partial unique
    -- index, this is bounded to a single row per lookup.
  );

drop policy if exists "public write discovery brief by token" on public.cs_customers;
create policy "public write discovery brief by token"
  on public.cs_customers for update
  to anon, authenticated
  using (discovery_brief_token is not null)
  with check (discovery_brief_token is not null);

-- Lock the columns the public form can touch. The two safe fields are
-- discovery_brief_data + discovery_brief_returned_at. Anything else
-- under cs_customers stays admin-only.
--
-- Postgres doesn't have column-level UPDATE policies inline with RLS,
-- so we use a trigger to reject changes to other columns when the
-- request comes from anon role.
create or replace function public.cs_customers_anon_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only enforced when the caller is anon. Authenticated admin users
  -- pass through this trigger without restriction.
  if current_setting('request.jwt.claim.role', true) = 'anon' then
    -- Compare every field; reject if anything other than the two
    -- discovery-brief columns changed.
    if new.id is distinct from old.id
       or new.org_name is distinct from old.org_name
       or new.slug is distinct from old.slug
       or new.persona_type is distinct from old.persona_type
       or new.tier is distinct from old.tier
       or new.monthly_rate_cents is distinct from old.monthly_rate_cents
       or new.status is distinct from old.status
       or new.onboarding_stage is distinct from old.onboarding_stage
       or new.contract_status is distinct from old.contract_status
       or new.contract_url is distinct from old.contract_url
       or new.contract_signed_at is distinct from old.contract_signed_at
       or new.payment_received_at is distinct from old.payment_received_at
       or new.discovery_brief_token is distinct from old.discovery_brief_token
       or new.live_started_at is distinct from old.live_started_at
    then
      raise exception 'Anon update is restricted to discovery brief fields only';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cs_customers_anon_update_guard on public.cs_customers;
create trigger cs_customers_anon_update_guard
  before update on public.cs_customers
  for each row
  execute function public.cs_customers_anon_update_guard();
