-- Make email_templates.key NOT NULL so the (client_id, key) unique
-- constraint can serve as an upsert conflict target.
--
-- PostgREST's `onConflict: 'client_id,key'` requires the unique index
-- columns to be NOT NULL — otherwise Postgres can't infer the constraint
-- (because two NULLs are considered distinct in a unique index).
--
-- Templates always have a key in practice (the import + composer both
-- assign one). Any historical NULLs get a stable placeholder.

update public.email_templates
  set key = 'untitled-' || id::text
  where key is null;

alter table public.email_templates
  alter column key set not null;
