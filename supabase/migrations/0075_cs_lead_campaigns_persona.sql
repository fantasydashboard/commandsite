-- Migration 0075 — persona column on cs_lead_campaigns
-- ----------------------------------------------------------------------------
-- Add a persona axis to campaigns so the lead-sourcing-cron and downstream
-- auto-drafter know which assistant brand a campaign is targeting. Two
-- values today: 'ada' (HVAC + home services) and 'grace' (churches).
--
-- Flow:
--   1. Operator picks 'ada' or 'grace' when creating a campaign in
--      CommandSiteCampaignsSettings.vue.
--   2. lead-sourcing-cron reads campaign.persona, applies the matching
--      industry-preset keywords, AND tags each inserted lead with
--      persona_ada / persona_grace.
--   3. outreach-auto-draft routes by lead tag → draft-cold-email OR
--      draft-cold-email-grace.
--   4. The frontend research modal + leads page also branch their scoring
--      calls (score-leads-ada vs score-leads-grace) on the same axis.
--
-- Why a column on campaigns instead of inferring from keywords: explicit is
-- better. Some keywords ("community", "outreach") could match either world,
-- and we don't want a misclassified campaign sending HVAC-voiced emails to
-- pastors. The operator picks; the cron honors.

alter table public.cs_lead_campaigns
  add column if not exists persona text not null default 'ada';

alter table public.cs_lead_campaigns
  drop constraint if exists cs_lead_campaigns_persona_check;

alter table public.cs_lead_campaigns
  add constraint cs_lead_campaigns_persona_check
  check (persona in ('ada', 'grace'));

comment on column public.cs_lead_campaigns.persona is
  'Which assistant brand this campaign targets. Drives scoring + drafting routing. Values: ada (home services) | grace (churches).';
