-- Feedback loop for the Strategist agent. Two complementary mechanisms:
--   1) Per-item reactions (thumbs up/down + optional comment) on each
--      theme / topic that a Strategist run proposed
--   2) A free-form "notes_for_next_run" string on the run itself
-- Both flow into the next run's system prompt so the agent course-corrects.

alter table public.social_strategy_runs
  add column feedback_notes text;

create table public.social_strategy_feedback (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.social_strategy_runs(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete cascade,
  item_type    text not null check (item_type in ('theme', 'topic')),
  item_index   int  not null,
  reaction     text check (reaction in ('up', 'down')),
  comment      text,
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (run_id, item_type, item_index)
);
create index social_strategy_feedback_run_idx
  on public.social_strategy_feedback (run_id);
create index social_strategy_feedback_client_idx
  on public.social_strategy_feedback (client_id, created_at desc);

create trigger social_strategy_feedback_touch
  before update on public.social_strategy_feedback
  for each row execute function public.touch_updated_at();

alter table public.social_strategy_feedback enable row level security;

create policy "admins manage strategy feedback"
  on public.social_strategy_feedback
  for all using (public.is_admin()) with check (public.is_admin());

create policy "clients read own strategy feedback"
  on public.social_strategy_feedback
  for select using (client_id = public.current_client_id());

create policy "clients insert own strategy feedback"
  on public.social_strategy_feedback
  for insert with check (client_id = public.current_client_id());

create policy "clients update own strategy feedback"
  on public.social_strategy_feedback
  for update using (client_id = public.current_client_id())
                with check (client_id = public.current_client_id());

create policy "clients delete own strategy feedback"
  on public.social_strategy_feedback
  for delete using (client_id = public.current_client_id());

-- Allow clients to update feedback_notes on their own strategy runs (the
-- existing policy only covered SELECT). They can only update their own
-- client_id rows.
create policy "clients update own strategy run notes"
  on public.social_strategy_runs
  for update using (client_id = public.current_client_id())
                with check (client_id = public.current_client_id());
