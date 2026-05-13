-- CommandSite · Outreach inbox tracking (replies + bounces)
-- ---------------------------------------------------------------------------
-- Adds the columns the gmail-inbox-poll function uses to record what
-- it finds when scanning the inbox:
--   • cs_replies.gmail_message_id  — unique, lets us dedupe across polls
--   • cs_replies.gmail_thread_id   — for grouping with future replies
--   • cs_leads.bounced_at          — set when mailer-daemon catches a bounce
--   • cs_leads.bounce_reason       — short reason string from the bounce body
--
-- Bounces don't land in cs_replies because they're not human replies —
-- they're delivery failures. The Outreach analytics strip reads them
-- directly off cs_leads.

alter table public.cs_replies
  add column if not exists gmail_message_id  text,
  add column if not exists gmail_thread_id   text;

-- Unique partial index so re-running the poll doesn't double-insert.
-- Partial-on-not-null because most existing rows are smartlead-sourced.
create unique index if not exists cs_replies_gmail_message_id_uniq
  on public.cs_replies (gmail_message_id)
  where gmail_message_id is not null;

alter table public.cs_leads
  add column if not exists bounced_at     timestamptz,
  add column if not exists bounce_reason  text;

create index if not exists cs_leads_bounced_idx
  on public.cs_leads (bounced_at)
  where bounced_at is not null;
