# CommandSite for Home Services — Full Setup Guide

A step-by-step guide for building everything in the Apex Heating & Air demo
into a real, production system. Organized **page by page**, with the tools
you need for each, what they cost, and the order to set them up in.

> **About the cost estimates** — Prices are listed both for the *recommended*
> tool and *alternatives* so you can shop. All prices are USD as of early
> 2026 and reflect public list prices for the smallest paid plan typically
> needed by a home-services business doing 100–250 jobs / month. Usage-based
> tools (Twilio, AI APIs) include a sample monthly estimate at SMB volume.
> A consolidated total is in [§12](#cost).

---

## Table of Contents

1. [Foundation (do this first)](#foundation)
2. [Page: Overview](#overview)
3. [Page: Performance Metrics](#metrics)
4. [Page: Schedule](#schedule)
5. [Page: Calls](#calls)
6. [Page: Quotes](#quotes)
7. [Page: Reviews](#reviews)
8. [Page: Reactivation](#reactivation)
9. [Page: CRM / Customers](#crm)
10. [Page: Email Marketing](#email)
11. [Page: Settings](#settings)
12. [Total cost estimate](#cost)
13. [Minimum viable path](#mvp)

---

<a id="foundation"></a>
## 1. Foundation (do this first)

Everything else depends on this layer. Set it up once, then every page can plug in.

### Tools

| Purpose | Recommended | Cost (recommended) | Alternatives | Cost (alternatives) |
|---|---|---|---|---|
| **Database** | Supabase (Postgres + auth + storage) | Free hobby → $25/mo Pro → $599/mo Team | Neon / Railway / Render | Neon $19/mo · Railway $5/mo + usage · Render $7/mo |
| **Frontend hosting** | Vercel | Free hobby → $20/mo Pro → $40/mo per seat | Netlify / Cloudflare Pages / Railway | Netlify $19/mo · CF Pages free → $20/mo · Railway $5/mo |
| **Domain** | Cloudflare Registrar | $10/yr (.com at cost) | Namecheap / GoDaddy | Namecheap $11/yr · GoDaddy $20/yr |
| **Background jobs / cron** | Supabase pg_cron (built in) | $0 (included with Supabase) | Inngest / Trigger.dev / GitHub Actions | Inngest free → $20/mo · Trigger.dev free → $20/mo · GH Actions free 2k min/mo |
| **Error tracking** | Sentry | Free 5k events/mo → $26/mo Team → $80/mo Business | Highlight / Honeybadger / Bugsnag | Highlight free → $50/mo · Honeybadger $26/mo · Bugsnag $89/mo |
| **AI for responses + drafting** | Anthropic Claude (Sonnet) | $3 / 1M input tokens, $15 / 1M output tokens — typically $5–30/mo for SMB | OpenAI GPT-4 / Google Gemini | GPT-4 $10/$30 per 1M · Gemini Pro $1.25/$5 per 1M |

### Steps

1. **Create a Supabase project** — `supabase.com` → New Project. Pick a region close to your customers.
2. **Set up the schema**: customers, jobs, calls, quotes, reviews, reactivations, email_campaigns, email_sends, settings (techs, hours, integrations). Use `supabase migration new <name>` so changes are tracked in git.
3. **Buy a domain** and point it at Vercel.
4. **Deploy a Vue/React/Next app to Vercel**. Wire it to the Supabase URL + anon key (set in Vercel env vars).
5. **Enable Supabase Auth** (email + password to start). Add row-level security policies so each business only sees its own data.
6. **Get an Anthropic API key** at `console.anthropic.com` (or OpenAI at `platform.openai.com`). Store as a secret in Supabase Edge Functions.

**Time:** 4–8 hours for a developer who's done this before.

---

<a id="overview"></a>
## 2. Page: Overview

The dashboard home — pulls live data from every other page. **No new tools needed**, just queries against the data the other pages already produce.

### What it shows

- "Today" pulse strip (calls, booked, captured revenue, on-call tech)
- Calls Handled donut breakdown
- Calls Captured trend chart
- Quote Follow-Ups bar chart
- Revenue Recovered card with daily sparkline
- Recent Activity feed
- "What CommandSite Did This Week" digest
- Setup Summary panel

### Steps

1. **Build a `/api/overview` edge function** that aggregates today's calls, today's jobs, week's reviews, week's reactivations, etc. into a single response.
2. **Schedule it via pg_cron** to refresh a materialized view every 5 minutes (so the page loads fast).
3. **Render the page** — pure read-only, just charts (Chart.js or Recharts) on top of the aggregated data.

**Time:** 4–6 hours once the underlying pages exist.

---

<a id="metrics"></a>
## 3. Page: Performance Metrics

Revenue trends, lead-source ROI, tech leaderboard, service mix donut, conversion funnel.

### Tools

| Purpose | Recommended | Cost (recommended) | Alternatives | Cost (alternatives) |
|---|---|---|---|---|
| **Charts** | Chart.js + vue-chartjs | Free (open source) | Recharts (React) / ECharts / Highcharts | Recharts free · ECharts free · Highcharts $535/dev/yr |
| **Accounting / revenue source of truth** | QuickBooks Online | Simple Start $35/mo · Essentials $65/mo · Plus $99/mo | Xero / FreshBooks / Wave | Xero $20–80/mo · FreshBooks $19–60/mo · Wave free |
| **Lead-source attribution** | Built-in tagging at intake | $0 (DIY) | CallRail / WhatConverts | CallRail $45/mo + $0.05/min · WhatConverts $30/mo |

### Steps

1. **Tag every incoming lead with a `source`** field at the point of capture (Google LSA, organic, referral, etc.). The AI receptionist (Calls page) should ask "How did you hear about us?" and log it.
2. **Connect QuickBooks** (or your accounting tool) via OAuth. Pull invoices nightly via cron.
3. **Compute lead-source ROI** server-side: `revenue / cost` per source. Cost comes from manually-entered ad spend (or from Google Ads / Meta API later).
4. **Build the conversion funnel** as a SQL query: `count(leads) > count(quotes) > count(booked) > count(complete) > count(reviews)` over the chosen window.
5. **Tech leaderboard** = `GROUP BY assigned_tech_id` with revenue + jobs + avg rating from the reviews table.

**Time:** 1–2 days. The hard part is QuickBooks OAuth + reliable nightly sync.

---

<a id="schedule"></a>
## 4. Page: Schedule

Today's dispatch board (tech rows × hour grid) + week-ahead calendar.

### Tools

| Purpose | Recommended | Cost (recommended) | Alternatives | Cost (alternatives) |
|---|---|---|---|---|
| **Field service software** | Build custom on Supabase | $0 (your dev time) | Jobber / Housecall Pro / ServiceTitan / FieldEdge | Jobber $69–249/mo · Housecall Pro $129–279/mo · ServiceTitan ~$398/mo + setup · FieldEdge $100/mo per user |
| **GPS tracking (optional)** | Samsara | $27–50/mo per vehicle + $99 one-time hardware | Life360 for Biz / GPSWOX / Bouncie / Verizon Connect | Life360 $9.99/mo per user · GPSWOX $4–25/mo per device · Bouncie $8/mo per vehicle · Verizon Connect $35/mo per vehicle |
| **Calendar sync** | Google Calendar API | Free (Google Workspace $7.20/user/mo if not already) | Outlook 365 API / CalDAV | M365 $6/user/mo · CalDAV free |
| **SMS dispatch notifications** | Twilio | $0.0083/SMS outbound + $1/mo per number | MessageBird / Telnyx / Plivo | MessageBird ~$0.0095/SMS · Telnyx $0.004/SMS · Plivo $0.0055/SMS |

### Steps

1. **Schema**: create a `jobs` table — customer_id, address, start_time, est_duration_min, est_value_cents, status, assigned_tech_id, notes, tag.
2. **Build the dispatch UI** — tech rows × hour columns, color-coded blocks for status. (See `src/modules/ApexScheduleModule.vue` for the layout.)
3. **Status updates**: tech taps "En Route" / "On Site" / "Done" in a mobile view (or the SMS-bot updates status from a tech's text reply).
4. **SMS the customer** when status changes to "En Route" with tech name + ETA. Twilio template: `"Marcus is on the way — ETA 17 min. Reply STOP to opt out."`
5. **Calendar sync** — push every job to a Google Calendar via the API so techs see it on their phones.
6. **(Optional) Live tech locations** — Life360/Samsara webhook → store last GPS ping → display on a map view next to the dispatch board.

**Time:** 1–2 weeks for a custom build. 2 days if you wrap an existing tool like Jobber.

**Recommendation:** start with custom on Supabase. Migrate to Jobber/ServiceTitan only if you grow beyond ~5 techs.

---

<a id="calls"></a>
## 5. Page: Calls

Sortable list of every AI-handled call with click-to-listen transcript modal.

### Tools

| Purpose | Recommended | Cost (recommended) | Alternatives | Cost (alternatives) |
|---|---|---|---|---|
| **Phone number + voice routing** | Twilio Voice | $1.15/mo per local number · $0.0085/min inbound · $0.013/min outbound | Telnyx / Plivo / Vonage | Telnyx $1/mo per number + $0.007/min · Plivo $0.80/mo + $0.0085/min · Vonage $1/mo + $0.013/min |
| **AI receptionist (the brain)** | Vapi.ai | $0.05/min platform fee + voice/STT/LLM passthrough — typical all-in **$0.10–0.15/min** | Bland.ai / Retell / Synthflow / DIY (OpenAI Realtime + Twilio Media Streams) | Bland $0.09/min all-in · Retell $0.07–0.31/min · Synthflow $29/mo + $0.13/min · DIY ~$0.06–0.10/min but weeks of dev |
| **Voice TTS** | ElevenLabs | Starter $5/mo (30k chars) · Creator $22/mo (100k) · Pro $99/mo (500k) — typical SMB $22/mo | Cartesia / OpenAI TTS / Azure / PlayHT | Cartesia $5–49/mo · OpenAI TTS $15 / 1M chars · Azure $4 / 1M chars · PlayHT $39/mo |
| **Speech-to-text (transcription)** | Deepgram Nova-2 | $0.0043/min real-time · $0.0036/min batch — ~$3/mo at 250 calls × 3 min | AssemblyAI / OpenAI Whisper API | AssemblyAI $0.37/hr ($0.0062/min) · Whisper $0.006/min |
| **Recording storage** | Supabase Storage | Free 1 GB → $0.021/GB/mo Pro | Cloudflare R2 / AWS S3 / Backblaze B2 | R2 $0.015/GB/mo (no egress fees) · S3 $0.023/GB/mo + egress · B2 $0.006/GB/mo |
| **Spam call filtering** | Built into Twilio + AI prompt | $0 (DIY in your prompt) | Truecaller for Biz / Hiya Connect / Nomorobo | Truecaller ~$25/mo · Hiya enterprise pricing · Nomorobo $1.99/mo per number |

### Steps

1. **Buy a Twilio number** that matches your business area code. Configure it to forward to your AI receptionist.
2. **Set up Vapi or Bland**:
   - Create an "Assistant" with a system prompt: business name, service area, hours, what to ask, when to dispatch, when to transfer to a human.
   - Connect it to your Twilio number.
   - Pick an ElevenLabs voice you like.
3. **Webhook to your backend on every call**: store caller, phone, time, duration, transcript, outcome (booked / dispatched / voicemail / opted_out), audio URL.
4. **AI summary**: after each call, run the transcript through Claude/GPT to extract: customer name, address, job type, urgency, recommended action. Store in the call record.
5. **Listen modal**: render the transcript with timestamps; if you want audio playback, use the Twilio recording URL + an `<audio>` element.
6. **Spam handling**: prompt your assistant: "If the caller is selling a service or asking about marketing/SEO, politely decline and end the call within 30 seconds." Mark these as `outcome=opted_out`.

**Time:** 2–3 days to wire up Vapi end-to-end. 1–2 weeks if you build the AI brain yourself with OpenAI Realtime API.

**Pricing example** for 250 calls/mo @ avg 3 min: ~$112.50 (AI) + ~$6.40 (Twilio) + ~$3.20 (transcription) = **~$125/mo**.

---

<a id="quotes"></a>
## 6. Page: Quotes

Kanban of open quotes by follow-up step (New → Day 1 → 3 → 7 → 14 → 30 → Booked) with the actual SMS/email shown on each card.

### Tools

| Purpose | Recommended | Cost (recommended) | Alternatives | Cost (alternatives) |
|---|---|---|---|---|
| **Quote/estimate creation** | Build custom on Supabase | $0 (your dev time) | Joist / Markate / Jobber / Housecall Pro | Joist free → $13/mo Pro · Markate $39/mo · Jobber $69–249/mo · Housecall $129–279/mo |
| **SMS sending** | Twilio Messaging | $0.0083/SMS outbound · $0.0079/SMS inbound · $1.15/mo per number | MessageBird / Telnyx / Plivo | MessageBird $0.0095/SMS · Telnyx $0.004/SMS · Plivo $0.0055/SMS |
| **Email sending** | Resend | Free 3k/mo → $20/mo for 50k → $90/mo for 500k | Postmark / SendGrid / AWS SES | Postmark $15/mo for 10k · SendGrid free 100/day → $19.95/mo for 50k · SES $0.10 per 1k |
| **Cron / scheduling** | Supabase pg_cron | $0 (included with Supabase) | Inngest / Trigger.dev / GitHub Actions | Inngest free → $20/mo · Trigger.dev free → $20/mo · GH Actions free 2k min/mo |
| **Two-way SMS reply parsing** | Twilio webhook → your backend | $0 (included in Twilio fees above) | MessageBird Flows / Plivo PHLO | MessageBird Flows free · Plivo PHLO usage-based |

### Steps

1. **Schema**: `quotes` table — customer_id, amount_cents, job_type, stage, days_in_stage, last_touch, created_at.
2. **Cadence engine**: a `quote_cadence_step` table maps stage → message template + channel (SMS or Email). When a quote enters a stage, schedule the next message via pg_cron.
3. **Templates**: store per-step SMS/email copy with `{{first_name}}`, `{{job_type}}`, `{{amount}}` placeholders. Render at send time.
4. **Two-way SMS**: customer reply lands at a Twilio webhook → your backend. If reply contains "YES" → mark as `booked`, cancel further nudges. If "STOP" → mark `opted_out`.
5. **Owner-call step (Day 14)**: pg_cron creates a task in your CRM/queue for the owner to call personally. SMS them: "Time to call {{customer}} — quote {{amount}} sent 14d ago, no reply."
6. **Kanban board**: a Vue/React component grouping quotes by stage, showing the rendered current-step message under each card.

**Time:** 3–5 days end-to-end.

**Pro tip:** the cadence is the secret sauce. Don't over-automate — the Day 14 call from a real human is what closes deals that the SMS nudges don't.

---

<a id="reviews"></a>
## 7. Page: Reviews

Reviews across Google/Facebook/Yelp/Nextdoor with AI-drafted replies for unanswered ones.

### Tools

| Purpose | Recommended | Cost (recommended) | Alternatives | Cost (alternatives) |
|---|---|---|---|---|
| **Review monitoring (multi-source)** | Build custom (poll Google + FB + Yelp APIs) | $0 (your dev time) | Birdeye / Podium / GatherUp / NiceJob / Reputation.com | Birdeye $299–499/mo · Podium $399/mo + setup · GatherUp $99–249/mo · NiceJob $75/mo · Reputation.com enterprise (~$500+/mo) |
| **Google Business Profile API** | Direct OAuth | Free | via Birdeye/Podium | Bundled in those tools (above) |
| **Facebook Graph API (Page reviews)** | Direct (Meta for Developers) | Free | via Birdeye/Podium | Bundled in those tools |
| **Yelp Fusion API** | Direct read-only | Free for read · ~$200+/mo for paid Yelp Reservations/Business tier (write replies) | n/a | n/a — Yelp gates write access |
| **Nextdoor** | No public API — manual entry only | $0 | Nextdoor for Business (paid ads, not API) | Ads start ~$3/click |
| **AI for draft responses** | Anthropic Claude (Sonnet) | ~$0.005–0.015 per response (~$5–15/mo at 1k responses) | OpenAI GPT-4 / Gemini | GPT-4 ~$0.02/response · Gemini Pro ~$0.005/response |
| **Review-request automation (post-job SMS)** | Twilio + cron (DIY) | $0.0083 per SMS (~$1–5/mo at 100–500 jobs) | NiceJob / Birdeye / Podium | Bundled in those tools above |

### Steps

1. **Connect Google Business Profile**: OAuth with `business.manage` scope. Poll the `reviews.list` endpoint every 15–60 min. Webhook isn't available, polling is the only option.
2. **Connect Facebook**: create a Facebook App, get Page access token, poll `/{page-id}/ratings` endpoint.
3. **Yelp**: read-only is free via Fusion API. Replies require Yelp's paid tier (~$200+/mo) and partner approval — most small businesses skip this.
4. **Nextdoor**: no API. Build a manual-entry form in the dashboard so the owner can paste reviews they get notified about.
5. **AI draft replies**: when a new unanswered review lands, send the review text + business context (services, tone, past responses) to Claude. Prompt:
   > "Draft a warm, specific reply for this {{rating}}-star {{source}} review. Match the business's voice (professional but human). If the review is negative, acknowledge the issue, take responsibility, offer to make it right. Don't be defensive."
6. **Owner approval flow**: render the AI draft in a textarea so the owner can edit, then "Approve & Post" — which calls the Google/Facebook API to publish the reply.
7. **Post-job review request**: 24h after `job_completed`, trigger an SMS via Twilio: `"Hi {{first_name}}, would you mind leaving us a Google review? {{review_link}}"` Track click-throughs.

**Time:** 3–5 days. Google + Facebook are easy; Yelp is messy if you need replies.

---

<a id="reactivation"></a>
## 8. Page: Reactivation

Dormant-customer outreach pipeline — identified → contacted → engaged → booked → won_back.

### Tools

| Purpose | Recommended | Cost (recommended) | Alternatives | Cost (alternatives) |
|---|---|---|---|---|
| **Customer DB with last-service tracking** | Supabase customers table | $0 (already on Supabase) | HubSpot CRM / Pipedrive / Airtable / Zoho CRM | HubSpot free → $50/seat/mo · Pipedrive $14–99/seat/mo · Airtable $20/seat/mo · Zoho $14–52/seat/mo |
| **Dormant-detection cron** | Supabase pg_cron | $0 (included with Supabase) | Inngest / Trigger.dev / GitHub Actions | Inngest free → $20/mo · Trigger.dev free → $20/mo · GH Actions free 2k min/mo |
| **SMS sending** | Twilio | $0.0083/SMS outbound (~$2–10/mo at 250–1200 monthly outreaches) | MessageBird / Telnyx / Plivo | MessageBird $0.0095/SMS · Telnyx $0.004/SMS · Plivo $0.0055/SMS |
| **AI for personalized messages** | Anthropic Claude (Sonnet) | ~$0.003 per message (~$3/mo at 1k messages) | OpenAI GPT-4 / Gemini Pro | GPT-4 ~$0.01/msg · Gemini Pro ~$0.002/msg |

### Steps

1. **Define "dormant"**: typically 9–18 months since last service. Configure as a setting (`dormant_threshold_days`).
2. **Weekly cron job**: `SELECT * FROM customers WHERE last_service_at < now() - interval '270 days' AND last_service_at > now() - interval '540 days' AND opted_out = false AND id NOT IN (SELECT customer_id FROM reactivations WHERE status != 'lost')`. Insert each into the `reactivations` table with `status = 'identified'`.
3. **Owner approval**: by default, queued reactivations sit at `identified` for owner review. Owner clicks "Send Outreach" or "Approve all" in the dashboard.
4. **Personalized SMS**: render a template with the customer's first name + last service type + months elapsed. Include a `$25 off first-back-visit` incentive.
5. **Reply parsing**: customer replies "YES" → mark `engaged`. Owner manually moves to `booked` once a job is scheduled. After job completes → `won_back`.
6. **Track ROI**: report total dollar value recovered per quarter so you can prove the program pays for itself.

**Time:** 2–3 days. Most of the work is the dormant-detection logic + reply parsing.

---

<a id="crm"></a>
## 9. Page: CRM / Customers

Every customer with funnel stage + full interaction timeline drawer.

### Tools

| Purpose | Recommended | Cost (recommended) | Alternatives | Cost (alternatives) |
|---|---|---|---|---|
| **Customer database** | Supabase Postgres | $0 (already on Supabase) | HubSpot / Pipedrive / Airtable | HubSpot free CRM → $50/seat/mo · Pipedrive $14–99/seat/mo · Airtable $20/seat/mo |
| **Unified timeline aggregator** | Custom Postgres view (UNIONs calls/sms/emails/jobs/reviews) | $0 (your dev time) | Segment / RudderStack | Segment $120/mo + usage · RudderStack open-source free, cloud $99/mo |
| **Address autocomplete** | Google Places API | Free 10k req/mo → $17 per 1k after (Autocomplete Per Session) | Mapbox / HERE / Smarty | Mapbox $0.50–0.75 per 1k · HERE $1 per 1k after free tier · Smarty $50/mo for 5k |
| **Phone validation** | Twilio Lookup | $0.005 per lookup (~$1–5/mo for SMB) | NumVerify / Abstract API / Numlookup | NumVerify free 100/mo → $14.99/mo · Abstract free 250/mo → $9/mo · Numlookup free 100/mo → $25/mo |

### Steps

1. **Schema**: `customers` (id, name, email, phone, address, source, first_contact_at, last_touch_at, lifetime_value_cents, funnel_stage, assigned_tech_id, tags, notes).
2. **Funnel stages**: new_lead → engaged → quoted → booked → job_complete → review_requested → won → dormant → lost. Stage transitions are typically auto (e.g., quote sent → `quoted`) but can be manually overridden.
3. **Timeline aggregator**: a SQL view (or edge function) that UNIONs:
   - calls (where customer_id matches)
   - sms_messages (sent + received)
   - email_sends
   - jobs (booked, complete)
   - reviews (request_sent, received)
   - notes (manually added)
   Sort reverse-chronologically. Each event has a `kind` field for icon/layout selection.
4. **Customer detail drawer**: side panel that opens on row click — header with stage chip + LTV + contact + tags + owner note, then the timeline below with kind-specific layouts (chat bubbles for SMS, stars for reviews, etc.).
5. **Inline note-taking**: textarea at the top of the drawer — autosaves to a `customer_notes` table.

**Time:** 4–6 days. Timeline aggregation is the trickiest part — denormalize aggressively for performance.

---

<a id="email"></a>
## 10. Page: Email Marketing

Campaign library — review requests, maintenance reminders, financing offers, seasonal pushes.

### Tools

| Purpose | Recommended | Cost (recommended) | Alternatives | Cost (alternatives) |
|---|---|---|---|---|
| **Transactional email sender** | Resend | Free 3k/mo (100/day) → $20/mo for 50k → $90/mo for 500k | Postmark / SendGrid / AWS SES / Loops | Postmark $15/mo for 10k · SendGrid free 100/day → $19.95/mo for 50k · SES $0.10 per 1k · Loops $49/mo for 5k contacts |
| **Bulk/broadcast email** | Resend (handles both) | Same as above (Resend Pro $20/mo covers most SMBs) | Mailchimp / Klaviyo / ConvertKit / MailerLite / Brevo | Mailchimp free 500 contacts → $20/mo for 500 → $135/mo for 10k · Klaviyo free 250 → $45/mo for 1.5k → $150/mo for 10k · ConvertKit free → $29/mo for 1k → $79/mo for 5k · MailerLite free 1k → $10/mo for 500 → $32/mo for 5k · Brevo free 300/day → $25/mo for 20k |
| **Domain auth (SPF / DKIM / DMARC)** | DNS records via Cloudflare | $0 (DNS is free) | Any DNS host | Same — no cost |
| **Template management** | Custom DB-stored MJML templates | $0 (your dev time) | Postmark templates / Loops / Stripo / BEE | Postmark templates included · Loops included · Stripo $15–95/mo · BEE Pro $30/mo |
| **Open/click/bounce tracking** | Resend webhooks | $0 (included) | All senders include this | Included |
| **Attribution (campaign → revenue)** | Custom (campaign_id on send, 30-day revenue lookback) | $0 (your dev time) | Klaviyo / HubSpot Marketing | Klaviyo $45+/mo includes attribution · HubSpot Marketing Pro $890/mo |

### Steps

1. **Pick a sender** — Resend is the easiest for developers; Mailchimp/Klaviyo if you want a full marketing GUI.
2. **Authenticate your domain** — set SPF, DKIM, DMARC records in Cloudflare DNS. This dramatically improves deliverability.
3. **Schema**:
   - `email_campaigns` (id, name, kind, trigger, active, subject, body, ...)
   - `email_sends` (id, campaign_id, customer_id, sent_at, status, opened_at, clicked_at, replied_at, bounced_at)
4. **Trigger types**:
   - **Transactional** (review request, quote confirm) — fired by app events
   - **Lifecycle** (90-day check-in, plan renewal) — fired by cron based on customer state
   - **Seasonal** (spring tune-up push) — manually sent by owner
   - **Broadcast** (financing offer to a segment) — manual send to filter
5. **Webhooks**: subscribe to Resend's webhook for `email.opened`, `email.clicked`, `email.bounced`, etc. Update the corresponding `email_sends` row.
6. **Reply-to handling**: route replies to a real inbox the owner monitors (or to your support team).
7. **Attribution**: for each booked job, look back 30 days to see if the customer clicked any campaign email. If yes, attribute the revenue to that campaign.

**Time:** 4–7 days. Domain auth + deliverability tuning is half the work.

**Compliance:** include a one-click unsubscribe link in every broadcast email. Track unsubscribes in `email_unsubscribes` table and skip those addresses in all future sends.

---

<a id="settings"></a>
## 11. Page: Settings

Business hours, tech roster, AI receptionist config, integrations, service area.

### Tools

| Purpose | Recommended | Cost (recommended) | Alternatives | Cost (alternatives) |
|---|---|---|---|---|
| **Settings storage** | Supabase Postgres (single `business_settings` row + related tables) | $0 (already on Supabase) | n/a | n/a |
| **OAuth flows for integrations** | Each provider's standard OAuth (DIY) | $0 (your dev time, ~half day per provider) | Nango / Pipedream Connect / Merge.dev | Nango free → $250/mo · Pipedream free → $19/mo · Merge.dev $650+/mo |
| **Encrypted credential storage** | Supabase Vault (built-in) | $0 (included) | HashiCorp Vault / AWS Secrets Manager / Doppler | HashiCorp Vault free OSS · AWS Secrets $0.40/mo per secret · Doppler free → $7/seat/mo |
| **Address validation for service area** | Google Geocoding API | $5 per 1k requests (first 200/day free) | Mapbox / HERE / Smarty / USPS | Mapbox $0.75 per 1k · HERE $1 per 1k · Smarty $50/mo · USPS API free (US only) |

### Steps

1. **Business settings table**: hours (per-day open + start + end), after-hours fee, AI greeting, voicemail script, spam handling rule, transfer threshold.
2. **Techs table**: id, name, role, phone, on_call, active, jobs_this_month, avg_rating. Editable in the UI.
3. **Integration connections** — for each tool (Twilio, Stripe, Google Business, etc.):
   - Standard OAuth flow → store access + refresh tokens encrypted in `integration_credentials`.
   - "Connect" button kicks off OAuth, "Disconnect" revokes the token.
4. **Service area**: store an array of ZIP codes (or polygon geometry for fancier setups). When a call comes in, validate the caller's location and politely decline if out of area.
5. **Sticky save bar**: track `dirty` state in the UI — don't actually persist until owner clicks "Save changes" so they can experiment freely.
6. **Audit log**: every settings change logs `who / what / when` to a `settings_audit` table — invaluable for "wait, who turned off the after-hours line?" debugging.

**Time:** 3–4 days.

---

<a id="cost"></a>
## 12. Total Monthly Cost (Realistic SMB)

For an HVAC business doing 250 calls / 100 jobs / 5k emails per month:

| Item | Cost |
|---|---|
| Supabase (Pro plan) | $25 |
| Vercel (Pro plan) | $20 |
| Domain | ~$1 |
| Anthropic API (AI replies, drafts, summaries) | $15–30 |
| Twilio (number + voice + SMS) | $40–60 |
| AI receptionist (Vapi/Bland) | $100–150 |
| Resend (email) | $20 |
| ElevenLabs (TTS voice) | $22 |
| Deepgram (transcription) | $15–20 |
| QuickBooks Online | $35 |
| Google Business / Facebook / Yelp APIs | $0 (free tiers) |
| Sentry error tracking | $26 |
| **Total** | **~$320–410 / month** |

For comparison, ServiceTitan starts at ~$400/mo and goes way up. Housecall Pro is $129–279/mo. **A custom build matches or beats them on cost** while giving you 10× more flexibility — but you do need a developer (or yourself) to maintain it.

---

<a id="mvp"></a>
## 13. Minimum Viable Path (4 weeks, solo developer)

If you want to ship something usable fast, build in this order and skip the rest until v2:

### Week 1 — Foundation + CRM
- Supabase + Vue/Next on Vercel
- Customers table + customer detail drawer
- Manual call log (no AI receptionist yet) — owner taps "New Call" and types caller info

### Week 2 — Calls + Quotes
- Twilio number forwarding to owner's cell (no AI yet)
- Quote creation form + cadence engine (SMS only, via Twilio)
- Day 1/3/7/14/30 follow-up automation

### Week 3 — Reviews + Email
- Google Business Profile review polling + AI-drafted replies
- Resend setup with 3 transactional emails: review request, quote confirm, welcome
- Domain auth (SPF/DKIM/DMARC)

### Week 4 — Schedule + Settings
- Simple jobs table + tech-row dispatch UI
- Settings page for hours / techs / spam rule
- Deploy to a real domain, give owner login

**Then iterate:** add the AI receptionist (week 5–6), then reactivation (week 7), then performance metrics (week 8). The Overview page comes for free once everything else exists.

---

## Final notes

- **Don't build everything at once.** Owners will tell you within a week which features they actually use. Build the Calls + Quotes pages first — those drive 80% of the revenue impact.
- **The AI is the moat.** A dispatch board exists in 50 SaaS tools. An AI that books jobs at 2 AM and a system that drafts thoughtful review replies — that's the differentiator. Spend most of your prompt-engineering time there.
- **Multi-tenant from day one.** Every table needs a `business_id` column and an RLS policy that filters by it. Adding multi-tenancy later is painful.
- **The Settings page determines whether the AI sounds like the business.** Treat the greeting, voicemail script, and spam-handling rules like product copy, not an afterthought.

Good luck. The hardest part isn't any single integration — it's making them feel like one product.
