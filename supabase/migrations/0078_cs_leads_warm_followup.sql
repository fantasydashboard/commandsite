-- 0078: warm-followup pipeline columns on cs_leads
--
-- After a prospect replies to a cold email and Josh replies back, the
-- conversation often goes silent. Cold T2/T3 cadence is wrong for this
-- case (those assume no prior engagement). This migration adds the
-- minimum schema to track a warm-followup queue per lead:
--
--   - warm_followup_due_at: when the cron should draft the next nudge
--     (NULL = no follow-up scheduled, default state)
--   - warm_followup_state: lifecycle state of the warm follow-up
--     'queued'             scheduled, waiting for due_at
--     'drafting'           cron picked it up, calling the LLM
--     'ready_for_review'   draft is in the approval queue
--     'sent'               approved + sent (terminal)
--     'paused'             Josh hit pause (terminal until reactivated)
--     'canceled'           Josh canceled this follow-up (terminal)
--
-- The cron query needs an index on (warm_followup_due_at) filtered to
-- 'queued' rows so the per-tick lookup stays O(log n) as the lead
-- count grows.

alter table public.cs_leads
  add column if not exists warm_followup_due_at timestamptz,
  add column if not exists warm_followup_state text
    check (warm_followup_state in ('queued', 'drafting', 'ready_for_review', 'sent', 'paused', 'canceled'));

create index if not exists cs_leads_warm_followup_due_idx
  on public.cs_leads (warm_followup_due_at)
  where warm_followup_state = 'queued';

comment on column public.cs_leads.warm_followup_due_at is
  'When the warm-followup cron should draft the next nudge for this lead. NULL means no warm follow-up is scheduled.';

comment on column public.cs_leads.warm_followup_state is
  'Lifecycle of the current warm follow-up draft. NULL = no warm followup ever scheduled. queued/drafting/ready_for_review are in-flight states. sent/paused/canceled are terminal.';
