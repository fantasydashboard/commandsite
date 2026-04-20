# CommandSite

Custom dashboard platform. Admin builds unique dashboards per client; each client logs in and sees only their own.

Stack: Vue 3 + TypeScript + Pinia + Vue Router, Supabase (auth + Postgres + RLS), Tailwind CSS, Vercel.

## Local setup

```bash
npm install
cp .env.example .env   # fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

## Supabase setup

1. Create a new Supabase project.
2. In the SQL Editor, run `supabase/migrations/0001_init.sql`.
3. Create your admin auth user: Authentication → Users → Add user (email + password).
4. Copy that user's UUID, then run in SQL editor:

   ```sql
   insert into public.users (id, email, full_name, role)
   values ('<uuid>', 'you@example.com', 'Your Name', 'admin');
   ```

5. Put the project URL and `anon` key in `.env`.

## Creating a client

1. Sign in as admin → lands on `/admin`.
2. **New client** → fill name/slug/tier/rate.
3. **Configure** → toggle modules on/off.
4. Create the client's auth user in Supabase, then insert a matching row:

   ```sql
   insert into public.users (id, email, full_name, role, client_id)
   values ('<auth-uuid>', 'client@example.com', 'Client Name', 'client', '<client-id>');
   ```

5. Client signs in → lands on `/dashboard/<slug>`.

## Adding a module

1. Create `src/modules/MyModule.vue` with props `{ client, config }`.
2. Register it in `src/modules/registry.ts`.
3. Enable per-client from the admin panel.

## Deploy

Push to GitHub, import the repo in Vercel, set the two env vars, done. `vercel.json` handles SPA rewrites.
