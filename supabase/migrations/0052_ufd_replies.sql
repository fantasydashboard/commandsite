-- CommandSite · UFD replies (parallel to cs_replies)
-- ---------------------------------------------------------------------------
-- When a UFD trial user replies to one of the lifecycle emails (sent
-- from support@ultimatefantasydashboard.com), the reply lands here.
-- Bones drafts a response (drafted_response field), Josh approves
-- via the UFD Reply Approval Queue, response sends in-thread.
--
-- Why a separate table from cs_replies: clean tenant separation +
-- ufd-specific classifications (no objection/positive/etc cold-email
-- shape — UFD replies are usually feedback, support questions, or
-- account help requests).

create table public.ufd_replies (
  id                          uuid primary key default gen_random_uuid(),

  -- Linked back to a UFD trial user (by email — UFD's user table
  -- lives in a separate Supabase, so we don't FK)
  user_email                  text not null,
  user_name                   text,

  -- The lifecycle email this is replying to (informational)
  reply_to_step               text,                  -- 'welcome' | 'day_3_check' | etc.
  reply_to_message_id         text,                  -- Gmail message_id of the original send

  -- Reply content
  from_email                  text not null,
  from_name                   text,
  subject                     text,
  body                        text not null,
  received_at                 timestamptz not null default now(),

  -- Gmail tracking (for threading + dedup)
  gmail_message_id            text unique,
  gmail_thread_id             text,

  -- Bones classification — UFD-specific shape
  classification              text check (classification in (
    'feedback',           -- "the cards don't work for keeper leagues"
    'question',           -- "how do I connect my Sleeper league?"
    'support',            -- "can't log in"
    'cancel',             -- "please cancel my account"
    'praise',             -- "love this, just wanted to say"
    'oof',                -- out of office auto-reply
    'unsubscribe',
    'unclassified'
  )),
  classification_confidence   real check (classification_confidence between 0 and 1),
  classification_reason       text,
  classification_model        text,
  classified_at               timestamptz,

  -- Bones-drafted response
  drafted_response            text,
  drafted_at                  timestamptz,

  -- Approval / sent state
  draft_approved              boolean not null default false,
  draft_approved_at           timestamptz,
  draft_sent_at               timestamptz,

  -- Auto-handling (for OOF / unsubscribe)
  auto_handled                boolean not null default false,
  auto_handled_action         text,
  auto_handled_at             timestamptz,

  -- Manual handling
  needs_review                boolean not null default true,
  reviewed_by                 uuid,
  reviewed_at                 timestamptz,

  raw_payload                 jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index ufd_replies_received_at_idx on public.ufd_replies (received_at desc);
create index ufd_replies_user_email_idx  on public.ufd_replies (user_email);
create index ufd_replies_thread_id_idx   on public.ufd_replies (gmail_thread_id);
create index ufd_replies_needs_review_idx on public.ufd_replies (needs_review) where needs_review = true;

alter table public.ufd_replies enable row level security;

create policy "admins read ufd_replies"
  on public.ufd_replies for select
  using (public.is_admin());

create policy "admins manage ufd_replies"
  on public.ufd_replies for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "service role manages ufd_replies"
  on public.ufd_replies for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.touch_ufd_replies()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger ufd_replies_touch
  before update on public.ufd_replies
  for each row execute function public.touch_ufd_replies();
