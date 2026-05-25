-- CommandSite · Fix RLS policies on cs_lead_campaigns + cs_lead_events
-- ---------------------------------------------------------------------------
-- Migrations 0068 + 0069 wrote policies with only USING and no WITH CHECK,
-- which silently blocks INSERTs (the operator clicks Create and nothing
-- happens, no error surfaced). The other tables in this codebase use
-- `using (public.is_admin()) with check (public.is_admin())` — adopting
-- the same pattern here.
--
-- Idempotent: drops the old policies if present, recreates with both
-- clauses. Safe to re-apply.

-- ── cs_lead_campaigns ─────────────────────────────────────────────

drop policy if exists "admins manage cs_lead_campaigns" on public.cs_lead_campaigns;
drop policy if exists "service role manages cs_lead_campaigns" on public.cs_lead_campaigns;

create policy "admins manage cs_lead_campaigns"
  on public.cs_lead_campaigns for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "service role manages cs_lead_campaigns"
  on public.cs_lead_campaigns for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');


-- ── cs_lead_events ────────────────────────────────────────────────

drop policy if exists "admins read cs_lead_events"        on public.cs_lead_events;
drop policy if exists "admins write cs_lead_events"       on public.cs_lead_events;
drop policy if exists "service role manages cs_lead_events" on public.cs_lead_events;

create policy "admins manage cs_lead_events"
  on public.cs_lead_events for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "service role manages cs_lead_events"
  on public.cs_lead_events for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
