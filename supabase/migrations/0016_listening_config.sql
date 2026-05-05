-- listening_config: per-client search config for the auto-monitor.
-- Phase 2 of social listening. The cron-scheduled social-listening-poll
-- function reads enabled rows from here, queries Reddit's free public
-- read API for each (subreddit, keyword) combination, and inserts new
-- matches into social_mentions.
--
-- Phase 3 will add 'x' as a platform once paid X API access is in place.

create table if not exists public.listening_config (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,

  -- Only 'reddit' supported in Phase 2; check expanded later.
  platform        text not null check (platform in ('reddit')),

  -- Lists of subreddits (no 'r/' prefix) and keywords/phrases to search.
  -- Each (subreddit, keyword) pair is one Reddit search request per poll.
  subreddits      text[] not null default '{}',
  keywords        text[] not null default '{}',

  enabled         boolean not null default false,
  last_polled_at  timestamptz,
  last_poll_error text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (client_id, platform)
);

create trigger listening_config_touch
  before update on public.listening_config
  for each row execute function public.touch_updated_at();

alter table public.listening_config enable row level security;

create policy "admins manage listening config"
  on public.listening_config
  for all using (public.is_admin()) with check (public.is_admin());

create policy "clients read own listening config"
  on public.listening_config
  for select using (client_id = public.current_client_id());

create policy "clients insert own listening config"
  on public.listening_config
  for insert with check (client_id = public.current_client_id());

create policy "clients update own listening config"
  on public.listening_config
  for update using (client_id = public.current_client_id())
              with check (client_id = public.current_client_id());

-- Dedup index on social_mentions: prevents the auto-monitor from
-- inserting the same Reddit post twice. Manually-entered mentions can
-- still share URLs (rare and intentional), so we scope to a partial
-- index on auto-monitor inserts only — but distinguishing them needs
-- an extra column. For Phase 2 simplicity, dedup on (client_id,
-- source_url) for ALL rows: a duplicate URL is almost always a dupe.
create unique index if not exists social_mentions_source_url_idx
  on public.social_mentions (client_id, source_url);
