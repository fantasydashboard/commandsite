-- Let a church user read their own church's sync state so the dashboard can show
-- a "catching up" status during backfill. pco_sync_state holds only phase and
-- progress metadata (no PII rosters), so church-user read access is safe. The
-- staging data tables (assignments, attendance, members) stay admin-only.
create policy "clients read own sync state" on public.pco_sync_state
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.client_id = pco_sync_state.client_id
    )
  );
