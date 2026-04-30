-- Per-step template variants for activation-aware personalization.
--
-- Each sequence step keeps its existing template_key as the default
-- ("works for everyone, possibly generic"). The new template_key_connected
-- column points to an optional personalized variant used only when the
-- recipient has connected a league. The runner picks at send time:
--
--   if user has connected a league AND template_key_connected is set
--     → use template_key_connected
--   else
--     → use template_key
--
-- Existing rows keep template_key_connected = NULL and behave unchanged.

alter table public.email_sequence_steps
  add column template_key_connected text;
