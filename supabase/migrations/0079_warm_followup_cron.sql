-- 0079: pg_cron schedule for the warm-followup drafter.
--
-- Pairs with migration 0078 (cs_leads.warm_followup_due_at /
-- warm_followup_state columns) and the warm-followup-cron Edge Function.
-- Runs every 30 minutes. Picks up at most BATCH_CAP=5 overdue leads per
-- tick and drafts warm follow-ups for each.
--
-- Why 30 minutes (not 5 like the cold cron): warm follow-ups are
-- LOW-volume by design. A pastor or contractor who replied last week
-- and went silent doesn't need a 5-minute-fresh draft. Spacing the
-- cron out also keeps Anthropic spend predictable.

select cron.schedule(
  'warm-followup-cron-every-30-min',
  '*/30 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_functions_base_url') || '/warm-followup-cron',
    headers := jsonb_build_object()
  );
  $$
);

comment on extension pg_cron is
  'pg_cron schedules: outreach-auto-draft (cold T1, every 5 min), outreach-auto-send (every 5 min), gmail-inbox-poll (every 5 min), draft-followup-emails (every 30 min), warm-followup-cron (every 30 min, this migration).';
