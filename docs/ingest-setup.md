# Ingest setup — auto-add contacts from an external site

**What this does:** When a user signs up on an external site, a contact is
automatically added to that site's client workspace in CommandSite.

Data flow:
```
External site signup
  ↓
External site's Supabase fires a Database Webhook on new auth.users row
  ↓ POST with Authorization: Bearer cs_live_...
CommandSite Edge Function `ingest-contact`
  ↓ verifies key, inserts contact + event
CommandSite CRM
```

---

## One-time setup in CommandSite Supabase

### 1. Run the migration

Supabase SQL editor → paste `supabase/migrations/0003_ingest.sql` → **Run**.
This creates the `client_api_keys` table and two helper functions
(`create_client_api_key`, `revoke_client_api_key`).

### 2. Install Supabase CLI (macOS)

```bash
brew install supabase/tap/supabase
```

### 3. Link your local project to the CommandSite Supabase project

From the repo root:

```bash
supabase login
supabase link --project-ref hrdcjautrdkdpmwxuaar
```

(The project ref is the subdomain of your Supabase URL.)

### 4. Deploy the edge function

```bash
supabase functions deploy ingest-contact --no-verify-jwt
```

`--no-verify-jwt` is important — the function uses its own API-key auth,
not Supabase's JWT auth.

### 5. Note the function URL

```
https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/ingest-contact
```

---

## Generate an API key for a client

Run in the CommandSite Supabase SQL editor (you must be signed in as an
admin — the function is SECURITY DEFINER and checks `is_admin()`):

```sql
select * from public.create_client_api_key(
  '<client-uuid>',
  'Name of this key'                     -- e.g. "UFD signup webhook"
);
```

Copy the `full_key` value from the result **immediately** — it's shown
only once. If you lose it, revoke and generate a new one.

Key format: `cs_live_` + 48 hex chars (total 56 chars).

### Revoke a key

```sql
select public.revoke_client_api_key('<key-uuid>');
```

Find the key UUID with:
```sql
select id, name, key_prefix, last_used_at, revoked_at
from public.client_api_keys
where client_id = '<client-uuid>';
```

---

## Configure the external site

### Option A — Supabase Database Webhook (recommended if the external site uses Supabase Auth)

On **the external site's** Supabase project:

1. Dashboard → **Database** → **Webhooks** → **Create a new webhook**
2. **Name**: e.g. `commandsite-ingest`
3. **Table**: `auth.users`
4. **Events**: check **Insert** only
5. **Type**: HTTP Request
6. **Method**: POST
7. **URL**: `https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/ingest-contact`
8. **HTTP Headers**: add one header
   - Key: `Authorization`
   - Value: `Bearer <the cs_live_... key you generated>`
9. Save.

That's it. Every new signup on the external site fires the webhook → the
CommandSite function ingests it → the contact appears in the client's CRM.

### Option B — Next.js server action / API route

If webhooks aren't available (free-tier limitation, different stack), call
the function directly from your signup handler. Store the key in
`process.env.COMMANDSITE_INGEST_KEY` (server-only):

```ts
// Next.js server action / API route — DO NOT run this client-side.
await fetch('https://hrdcjautrdkdpmwxuaar.supabase.co/functions/v1/ingest-contact', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.COMMANDSITE_INGEST_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: user.email,
    first_name: user.firstName,
    last_name: user.lastName,
    phone: user.phone,          // optional
    company: user.company,      // optional
    source: 'website_signup',   // any string you want
  }),
})
```

---

## Payload shape

The function accepts two formats:

**1. Supabase webhook format** (automatic via Option A):
```json
{
  "type": "INSERT",
  "table": "users",
  "schema": "auth",
  "record": {
    "id": "uuid",
    "email": "user@example.com",
    "phone": "+15555551234",
    "raw_user_meta_data": {
      "full_name": "Jane Doe",
      "company": "Acme"
    }
  }
}
```

**2. Direct JSON** (for Option B):
```json
{
  "email": "user@example.com",
  "first_name": "Jane",
  "last_name": "Doe",
  "phone": "+15555551234",
  "company": "Acme",
  "source": "website_signup"
}
```

The function prefers explicit `first_name`/`last_name`, falls back to
splitting `full_name` from `raw_user_meta_data`. Either `email` or `phone`
must be present.

## Behavior

- **Default stage**: new contacts land in a stage whose name contains the
  word "trial" (case-insensitive). If no trial stage exists, they land in
  the first stage of the default pipeline.
- **Duplicate email**: same email signed up twice? Second call returns
  `200 { ok: true, duplicate: true }` — idempotent, no error. (Per-client
  unique index on email.)
- **Timeline**: every ingested contact gets a `contact_created` event with
  `actor_type = 'automation'` and `payload.via = 'ingest-contact'`.
- **Revoked keys**: return 401. Rotate by generating a new key, swapping
  the webhook header value, then revoking the old key.

## Troubleshooting

- **401 "Invalid key"**: bearer token missing, wrong format, or hash
  mismatch. Double-check you pasted the key exactly as returned.
- **400 "email or phone required"**: payload had neither. If signups on
  your site are phone-only, set `phone` in the payload.
- **Function invocation errors in Supabase dashboard**: check **Edge
  Functions → ingest-contact → Logs** for the stack trace.
