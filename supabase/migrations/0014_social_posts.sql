-- social_posts: composer + queue for Reddit / X distribution.
--
-- Phase 1 (this migration) — drafts + scheduled + manual-publish workflow.
-- Until Reddit OAuth + X API integrations land in phases 2/3, the
-- "publish" action is manual: copy body to clipboard, paste into the
-- platform's submit page, then mark as published in CommandSite.
--
-- Phase 2/3 will add a server-side publisher that hits Reddit/X APIs and
-- updates external_id + published_at automatically.

create table public.social_posts (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,

  -- Which platform this post targets.
  platform        text not null check (platform in ('reddit', 'x')),

  -- Body text. Reddit uses markdown; X is plain text up to ~280 chars.
  -- Title (Reddit only — required by the platform).
  title           text,
  body            text not null default '',

  -- Reddit-only target subreddit (without 'r/' prefix). Null for X.
  subreddit       text,

  -- Optional card URL — typically a UFD share link or hosted graphic.
  card_url        text,

  -- Lifecycle.
  status          text not null default 'draft'
                    check (status in ('draft', 'scheduled', 'published', 'failed')),
  scheduled_for   timestamptz,
  published_at    timestamptz,

  -- Set after a successful publish (manual or automated). external_url
  -- lets us link back to the live post.
  external_id     text,
  external_url    text,
  error_message   text,

  -- Authorship.
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index social_posts_client_status_idx
  on public.social_posts (client_id, status, scheduled_for);
create index social_posts_client_created_idx
  on public.social_posts (client_id, created_at desc);

create trigger social_posts_touch
  before update on public.social_posts
  for each row execute function public.touch_updated_at();

alter table public.social_posts enable row level security;

create policy "admins manage social posts" on public.social_posts
  for all using (public.is_admin()) with check (public.is_admin());

create policy "clients read own social posts" on public.social_posts
  for select using (client_id = public.current_client_id());

create policy "clients insert own social posts" on public.social_posts
  for insert with check (client_id = public.current_client_id());

create policy "clients update own social posts" on public.social_posts
  for update using (client_id = public.current_client_id())
              with check (client_id = public.current_client_id());

create policy "clients delete own social posts" on public.social_posts
  for delete using (client_id = public.current_client_id());
