-- CommandSite-as-a-business · solo-founder settings (cs_settings)
-- ---------------------------------------------------------------------------
-- Singleton row holding the config Josh edits over time:
--   • Founder profile (name, email, signature)
--   • Public links (Calendly, demo Loom, pricing page)
--   • ICP definition (drives lead scoring + AI personalization)
--   • AI brand voice (drives all generated copy)
--   • Automation thresholds (when AI auto-acts vs flags for review)
--
-- Phase 2 of "make CommandSite-for-CommandSite real."

create table public.cs_settings (
  -- Singleton: only one row, always id = 1
  id                                integer primary key default 1 check (id = 1),

  -- ── Founder profile
  founder_name                      text default 'Josh',
  founder_email                     text,
  email_signature                   text,

  -- ── Public links
  calendly_link                     text,
  product_demo_link                 text,
  pricing_page_link                 text,

  -- ── ICP (drives lead-scoring + qualification)
  icp_description                   text,
  icp_industries                    text[] not null default array[]::text[],
  icp_team_size_min                 integer default 4,
  icp_team_size_max                 integer default 25,
  -- Label shown next to the size range. "techs" for HVAC, "staff" for
  -- churches, "weekly attendance" if you ever target ministries by size, etc.
  -- Stays editable so the same form serves whatever vertical you're in.
  icp_team_size_unit                text default 'techs',
  icp_geos                          text[] not null default array[]::text[],
  icp_disqualifiers                 text[] not null default array[]::text[],

  -- ── AI brand voice (drives all drafts)
  ai_voice_prompt_guide             text,
  ai_voice_signature_phrases        text[] not null default array[]::text[],
  ai_voice_do_say                   text[] not null default array[]::text[],
  ai_voice_dont_say                 text[] not null default array[]::text[],

  -- ── Automation thresholds (0..1 floats; pct integer for ICP score)
  -- Above these thresholds the system auto-acts. Below = needs your eyes.
  reply_classifier_auto_threshold   real default 0.90 check (reply_classifier_auto_threshold between 0 and 1),
  pipeline_promote_threshold        real default 0.90 check (pipeline_promote_threshold between 0 and 1),
  social_engager_icp_threshold      integer default 80 check (social_engager_icp_threshold between 0 and 100),

  created_at                        timestamptz not null default now(),
  updated_at                        timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function public.cs_settings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cs_settings_updated_at
  before update on public.cs_settings
  for each row
  execute function public.cs_settings_set_updated_at();

-- RLS: admin only
alter table public.cs_settings enable row level security;

create policy "admins manage cs_settings"
  on public.cs_settings for all
  using (public.is_admin())
  with check (public.is_admin());

-- Seed the singleton row with sensible defaults
insert into public.cs_settings (
  id,
  founder_name,
  icp_description,
  icp_industries,
  icp_geos,
  icp_disqualifiers,
  ai_voice_prompt_guide,
  ai_voice_signature_phrases,
  ai_voice_do_say,
  ai_voice_dont_say
) values (
  1,
  'Josh',
  '4-25 person home-services owner-operators in the US Sun Belt + Southeast. Decision-maker is the owner or GM. Currently losing measurable revenue to missed after-hours calls. Already paying for at least one SaaS tool (Jobber, Housecall Pro) — proves they''ll pay for software. Sweet spot: 6-12 techs, $1-5M annual revenue, growth-mode (added a tech in last 12 months).',
  array['HVAC','Plumbing','Electrical','Landscaping','Roofing','Pool service','Pest control','Cleaning'],
  array['US (Sun Belt + Southeast preferred)'],
  array[
    'Solo operator (1 person — too small for our pricing)',
    'Already has a full-time office manager + dedicated CSM tool (less wedge)',
    'Franchise location with no decision authority over software',
    'Trade companies under $200k annual revenue'
  ],
  'You are Josh, the solo founder of CommandSite — a vertical SaaS for home-services businesses (HVAC, plumbing, electrical, etc.). Write all communications in first person, with the warmth of someone who built this for himself first.\n\nVoice: direct and warm, never corporate. Talk like a person to another business owner. Be confident about what works and honest about what doesn''t.\n\nAvoid: corporate-speak ("synergy," "leverage," "robust"), manufactured cheer, and overused SaaS-marketing phrases ("game-changer," "blessed beyond measure"). Use plain English.\n\nAlways end pastor-signed messages with "— Josh." Pair invitations with a way to opt out gracefully ("no pressure if it''s not the right fit"). When acknowledging objections, agree first, defend never.',
  array['— Josh','Built it for myself + my own use case','Founder DMs you back'],
  array['Genuinely','Fair pushback','Hit reply if anything''s off','No pressure'],
  array['Synergy','Leverage (as a verb)','Best-in-class','Game-changer','Robust','Hey {{first_name}}! with manufactured cheer']
)
on conflict (id) do nothing;
