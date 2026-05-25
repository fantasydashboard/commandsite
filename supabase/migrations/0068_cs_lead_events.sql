-- CommandSite · Lead event audit log
-- ---------------------------------------------------------------------------
-- The conversation-timeline backbone. Every state change, manual note,
-- system event, or operator action on a cs_leads row writes a row here.
-- The Lead Detail Modal renders these chronologically alongside
-- cs_outreach_sends + cs_replies to produce the per-lead history view.
--
-- Why a separate table (vs. a JSON history column on cs_leads):
--   • Queryable across leads (e.g., "all status flips this week")
--   • Cleanly RLS-able
--   • Survives lead deletes via cascade
--   • Indexable by event_type for future filters

create table public.cs_lead_events (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.cs_leads(id) on delete cascade,

  -- Event taxonomy — one of these. Add to the check when new sources appear.
  -- 'status_change'      — cs_leads.status flipped (from old → new)
  -- 'paused'             — outreach_paused turned true (trigger or operator)
  -- 'resumed'            — outreach_paused turned false (operator-only)
  -- 'draft_generated'    — draft_cold_email_* filled (cron + LLM step)
  -- 'enriched'           — email / website / social filled (enrichment cron)
  -- 'note'               — free-text note from the operator
  -- 'campaign_assigned'  — lead pulled in from a specific campaign
  event_type  text not null check (event_type in (
    'status_change', 'paused', 'resumed',
    'draft_generated', 'enriched', 'note', 'campaign_assigned'
  )),

  -- Free-form payload — shape depends on event_type.
  -- status_change: { from: 'new', to: 'contacted' }
  -- paused: { reason: 'Reply received' }
  -- resumed: { by: <uuid> }
  -- draft_generated: { touch: 1, model: 'claude-sonnet-4-6' }
  -- enriched: { fields_filled: ['contact_email'] }
  -- note: { text: '...' }
  -- campaign_assigned: { campaign_id: <uuid>, campaign_name: '...' }
  payload     jsonb not null default '{}'::jsonb,

  -- Human-readable summary for the timeline. Optional — when null the UI
  -- falls back to a deterministic render of event_type + payload.
  summary     text,

  -- Who fired it. NULL = system (trigger / cron). Set = operator action.
  actor_id    uuid references auth.users(id),

  created_at  timestamptz not null default now()
);

create index cs_lead_events_lead_id_idx     on public.cs_lead_events (lead_id, created_at desc);
create index cs_lead_events_event_type_idx  on public.cs_lead_events (event_type, created_at desc);

-- RLS: admin-only, mirrors cs_leads
alter table public.cs_lead_events enable row level security;

create policy "admins read cs_lead_events"
  on public.cs_lead_events for select
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.role = 'admin'
    )
  );

create policy "admins write cs_lead_events"
  on public.cs_lead_events for insert
  with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.role = 'admin'
    )
  );

-- Service-role (cron + triggers) can always write
create policy "service role manages cs_lead_events"
  on public.cs_lead_events for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');


-- ── Triggers to populate the log automatically ───────────────────────

-- 1. status_change — fires on cs_leads.status flip
create or replace function public.cs_lead_events_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.cs_lead_events (lead_id, event_type, payload, summary)
    values (
      new.id,
      'status_change',
      jsonb_build_object('from', old.status, 'to', new.status),
      'Status: ' || old.status || ' → ' || new.status
    );
  end if;
  return new;
end;
$$;

drop trigger if exists cs_leads_log_status_change on public.cs_leads;
create trigger cs_leads_log_status_change
  after update on public.cs_leads
  for each row
  execute function public.cs_lead_events_on_status_change();


-- 2. paused / resumed — fires on cs_leads.outreach_paused flip
create or replace function public.cs_lead_events_on_pause_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.outreach_paused is distinct from old.outreach_paused then
    if new.outreach_paused then
      insert into public.cs_lead_events (lead_id, event_type, payload, summary)
      values (
        new.id,
        'paused',
        jsonb_build_object('reason', new.outreach_paused_reason),
        'Outreach paused' || case when new.outreach_paused_reason is not null
          then ': ' || new.outreach_paused_reason else '' end
      );
    else
      insert into public.cs_lead_events (lead_id, event_type, payload, summary)
      values (
        new.id,
        'resumed',
        '{}'::jsonb,
        'Outreach resumed'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cs_leads_log_pause_change on public.cs_leads;
create trigger cs_leads_log_pause_change
  after update on public.cs_leads
  for each row
  execute function public.cs_lead_events_on_pause_change();


-- 3. draft_generated — fires when draft_cold_email_at is set (or replaced)
create or replace function public.cs_lead_events_on_draft()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.draft_cold_email_at is distinct from old.draft_cold_email_at
     and new.draft_cold_email_at is not null then
    insert into public.cs_lead_events (lead_id, event_type, payload, summary)
    values (
      new.id,
      'draft_generated',
      jsonb_build_object(
        'touch', greatest(new.send_count + 1, 1),
        'model', new.draft_cold_email_model
      ),
      'Draft generated · Touch ' || greatest(new.send_count + 1, 1)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists cs_leads_log_draft_generated on public.cs_leads;
create trigger cs_leads_log_draft_generated
  after update on public.cs_leads
  for each row
  execute function public.cs_lead_events_on_draft();


comment on table public.cs_lead_events is
  'Audit log for cs_leads. Triggers populate status_change, paused, resumed, draft_generated automatically. Crons + operator actions can insert other event types (campaign_assigned, enriched, note) directly.';
