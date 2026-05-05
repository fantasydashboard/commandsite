-- Extend social_posts to support AI-planned posts.
-- Generated posts land here as status='planned' with planned_for + creative_type
-- set; users review, edit, and either schedule, send manually, or delete.

alter table public.social_posts
  drop constraint if exists social_posts_status_check;

alter table public.social_posts
  add constraint social_posts_status_check
  check (status in ('planned', 'draft', 'scheduled', 'published', 'failed'));

alter table public.social_posts
  add column if not exists planned_for date,
  add column if not exists creative_type text,
  add column if not exists plan_batch_id uuid;

create index if not exists social_posts_planned_idx
  on public.social_posts (client_id, planned_for)
  where status = 'planned';
create index if not exists social_posts_batch_idx
  on public.social_posts (plan_batch_id);
