-- CommandSite · Customer welcome email tracking
-- ---------------------------------------------------------------------------
-- When a cs_customers row flips from 'onboarding' to 'active', the
-- customer-welcome-send edge function drafts a persona-aware welcome
-- email (Ada for service, Grace for church) and ships it through
-- gmail-send. These columns track the result so we don't double-send
-- and so the dashboard can surface "welcome sent" state.

alter table public.cs_customers
  add column if not exists welcome_sent_at         timestamptz,
  add column if not exists welcome_email_subject   text,
  add column if not exists welcome_email_body      text,
  add column if not exists welcome_send_error      text;
