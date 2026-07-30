-- person_id lets the send layer resolve a guest's email (pco_people / PCO) at
-- send time. Populated by the next guest re-scan.
alter table public.pco_workflow_cards add column if not exists person_id text;
