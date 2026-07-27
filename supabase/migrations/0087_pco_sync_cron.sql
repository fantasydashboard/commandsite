-- 0087: nightly pg_cron schedule for pco-sync (live PCO data sync).
--
-- Fires once nightly (04:00 UTC). POSTs to the pco-sync Edge Function with an
-- empty body, which is the no-tenant "all connected churches" path. Authenticates
-- with the shared X-Cron-Secret header (Vault secret 'health_cron_secret');
-- pco-sync validates it against its PCO_SYNC_CRON_SECRET function env var (set to
-- the same value). pco-sync is verify_jwt=false so the call reaches the function.
--
-- Prereqs already present from earlier migrations (0058 / 0079): pg_cron + pg_net
-- extensions and the Vault secrets 'supabase_functions_base_url' and
-- 'health_cron_secret'.
--
-- IMPORTANT: Josh must set the PCO_SYNC_CRON_SECRET function secret to the same
-- value as the 'health_cron_secret' Vault secret, or the cron fires but pco-sync
-- rejects it (visible in cron.job_run_details).

select cron.schedule(
  'pco-sync-nightly',
  '0 4 * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_functions_base_url') || '/pco-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'health_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
