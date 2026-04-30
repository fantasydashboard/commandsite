-- A/B testing on a per-step basis.
--
-- When template_key_b is set on a sequence step, the runner does a
-- deterministic 50/50 split per recipient (hash of lowercased email mod 2)
-- and sends either template_key (variant 'a') or template_key_b (variant 'b').
-- The chosen variant is recorded in email_send_log.ab_variant so downstream
-- analysis can compare open / click / paid-conversion by variant.
--
-- Sticky per recipient: the same user always gets the same variant for the
-- same step, even across retries. Independent across steps (a user might be
-- in 'a' for trial_expired and 'b' for expired_offer_first).
--
-- Existing rows: template_key_b NULL => no A/B test on that step (default).

alter table public.email_sequence_steps
  add column template_key_b text;

alter table public.email_send_log
  add column ab_variant text
    check (ab_variant in ('a', 'b'));

create index email_send_log_ab_variant_idx
  on public.email_send_log (client_id, template_key, ab_variant)
  where ab_variant is not null;

-- Step-level idempotency: prevents sending both variants of the same A/B
-- step to the same recipient. The existing template_key-based unique
-- index (migration 0009) catches dupes within a single template; this
-- one catches dupes across variants of the same step.
create unique index email_send_log_step_idempotency
  on public.email_send_log (client_id, recipient, step_id)
  where step_id is not null;
