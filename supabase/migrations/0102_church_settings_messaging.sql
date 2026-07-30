-- Messaging config per church. Safe by default: sending OFF, test mode ON.
alter table public.church_settings
  add column if not exists messaging jsonb not null default '{}'::jsonb;

-- Seed Focal Point with safe defaults (fill testRecipient with Josh's address
-- via the dashboard/settings before enabling).
update public.church_settings cs
set messaging = jsonb_build_object(
  'enabled', false,
  'testMode', true,
  'testRecipient', '',
  'timezone', 'America/New_York',
  'quietStartHour', 8,
  'quietEndHour', 20,
  'ratePerHour', 50,
  'ratePerDay', 200
)
from public.clients c
where cs.client_id = c.id and c.slug = 'focal-point-church';

-- If Focal Point has no church_settings row yet, insert one with the defaults.
insert into public.church_settings (client_id, messaging)
select c.id, jsonb_build_object(
  'enabled', false, 'testMode', true, 'testRecipient', '',
  'timezone', 'America/New_York', 'quietStartHour', 8, 'quietEndHour', 20,
  'ratePerHour', 50, 'ratePerDay', 200)
from public.clients c
where c.slug = 'focal-point-church'
  and not exists (select 1 from public.church_settings s where s.client_id = c.id);
