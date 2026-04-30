-- social_mentions: tracked Reddit / X / etc. posts that mention UFD or
-- ask a question UFD answers. Phase 1 (this migration) — manual entry +
-- status tracking. Phase 2 will add an auto-monitor that polls Reddit/X
-- read APIs for keyword matches and inserts here.

create table public.social_mentions (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,

  -- Where the mention lives.
  platform        text not null check (platform in ('reddit', 'x', 'other')),
  source_url      text not null,

  -- Author handle (no platform prefix). Helps recognize repeat mentioners.
  author          text,

  -- Free-form snippet of what was said. For Reddit, often the post title +
  -- a paragraph; for X, the tweet text.
  snippet         text not null default '',

  -- Why this mention matters: 'mention' (named UFD), 'question' (asking
  -- something UFD solves), 'competitor' (talking about a tool we compete
  -- with), 'opportunity' (something tangential we could engage with).
  kind            text not null default 'mention'
                    check (kind in ('mention', 'question', 'competitor', 'opportunity')),

  -- Lifecycle.
  status          text not null default 'new'
                    check (status in ('new', 'drafted', 'responded', 'ignored')),

  -- Free-form internal notes + the AI-drafted reply (if any).
  notes           text,
  draft_reply     text,

  -- Set when we actually responded (manual or via a future auto-publish).
  responded_at    timestamptz,
  response_url    text,

  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index social_mentions_client_status_idx
  on public.social_mentions (client_id, status, created_at desc);
create index social_mentions_client_platform_idx
  on public.social_mentions (client_id, platform, created_at desc);

create trigger social_mentions_touch
  before update on public.social_mentions
  for each row execute function public.touch_updated_at();

alter table public.social_mentions enable row level security;

create policy "admins manage social mentions" on public.social_mentions
  for all using (public.is_admin()) with check (public.is_admin());

create policy "clients read own social mentions" on public.social_mentions
  for select using (client_id = public.current_client_id());

create policy "clients insert own social mentions" on public.social_mentions
  for insert with check (client_id = public.current_client_id());

create policy "clients update own social mentions" on public.social_mentions
  for update using (client_id = public.current_client_id())
              with check (client_id = public.current_client_id());

create policy "clients delete own social mentions" on public.social_mentions
  for delete using (client_id = public.current_client_id());
