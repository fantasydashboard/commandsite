-- CommandSite · Multi-tenant email accounts
-- ---------------------------------------------------------------------------
-- Generalizes Gmail OAuth credential storage from a single account
-- (cs_settings.gmail_*) to many — one per "tenant." Today's tenants:
--   • 'commandsite' — Josh's outreach inbox (josh@commandsite.io)
--   • 'ufd'         — UFD support inbox (support@ultimatefantasydashboard.com)
--
-- Future tenants when CommandSite signs paying customers:
--   • 'cust-<uuid>' — each cs_customers row gets its own tenant key,
--     mapped to the customer's connected Google Workspace. That's how
--     Ada/Grace lifecycle emails go out from THEIR domain, not Josh's.
--
-- Existing cs_settings.gmail_* columns stay populated as the
-- 'commandsite' default for backwards compatibility. The send + poll
-- functions read from email_accounts when a tenant is requested,
-- falling back to cs_settings when tenant='commandsite' (or unset).

create table public.email_accounts (
  tenant_key            text primary key check (tenant_key ~ '^[a-z0-9][a-z0-9_-]*$'),
  display_label         text not null,
  account_email         text not null,
  refresh_token         text not null,
  connected_at          timestamptz not null default now(),
  -- Optional FK to cs_customers when tenant_key is 'cust-<uuid>'.
  -- Null for first-party tenants ('commandsite', 'ufd').
  customer_id           uuid references public.cs_customers(id) on delete cascade,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index email_accounts_customer_id_idx
  on public.email_accounts (customer_id)
  where customer_id is not null;

alter table public.email_accounts enable row level security;

create policy "admins manage email_accounts"
  on public.email_accounts for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "service role manages email_accounts"
  on public.email_accounts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- updated_at trigger
create or replace function public.touch_email_accounts()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger email_accounts_touch
  before update on public.email_accounts
  for each row execute function public.touch_email_accounts();
