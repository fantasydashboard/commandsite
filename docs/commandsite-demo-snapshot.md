# CommandSite Demo Snapshot — pre-real-data state

Captured before wiring real data into `/dashboard/commandsite`. The demo
version (with mock data) lives at **`/dashboard/commandsite-demo`** so you
can compare against the live version any time.

To enable the demo URL:

```sql
insert into public.clients (slug, name)
values ('commandsite-demo', 'CommandSite (frozen demo)');
```

Then visit `/dashboard/commandsite-demo` whenever you want to see the
original design intent.

---

## Tab inventory + design intent

7 visible tabs (3 hidden until you scale — see `clients.ts`).

### Today

The morning-coffee surface. Mixes:

- **Live pulse strip** (brand-blue): new replies · demos today · MRR change
  overnight · viral referrals · churns
- **KPI strip**: high-priority count, medium count, MRR at risk, viral
  signups in 24h
- **Running on autopilot panel** (green-tinted): 6 active automations with
  per-automation stats. Headline: "412 auto-handled · 19 needed your eyes ·
  ~34h saved last 7 days"
- **Action queue**: 10 items mixed across kinds (reply needed, demo today,
  at-risk alert, MRR change, expansion signal, churn warning, celebration,
  task), filtered by priority

Design intent: open it once a day, glance at the autopilot panel for
reassurance the system is working, work the 1-3 high-priority items, close.

### Outreach

5 sub-views toggled by chips:

1. **Inbox** — exception-only. Shows replies the AI classifier flagged
   for human judgment (objections + low-confidence positives). High-confidence
   positives auto-promoted to pipeline + Calendly auto-sent.
   Auto-handled digest in collapsed `<details>` for transparency.
2. **Lead enrichment** — daily ICP-fit pull from Apollo + Clay. Each lead
   has AI-generated personalized opener + suggested sequence.
3. **Sequences** — read-only health table of all active cold-email sequences.
4. **Deliverability** — sending domain reputation, bounce rates, warming
   status. The "silent killer" surface for cold email.
5. **Demos** — show-up rate KPI + upcoming demos with auto-reminder status.

Design intent: 95% hands-off. Inbox should show 0-3 items most days.

### Pipeline

Sales kanban — 8 stages (Cold → Researched → Contacted → Replied →
Demo Booked → Demo Done → Proposal → Won) + Closed Lost in collapsed
details. Each card has next-action + due-date pill.

Design intent: deals auto-advance from system signals (replied = Replied,
Calendly booked = Demo Booked, etc.). Owner only intervenes at "Demo
Done → Proposal" personal moment.

### CRM (Customers)

B2B account list with health score, plan, MRR, last login, expansion
opportunity. Inline "signal" pills explain why a customer is flagged.

Design intent: the at-a-glance "who needs attention this week" view of
your existing book of business.

### Revenue

MRR / ARR / churn / plan mix / cohort retention / LTV:CAC / failed
payments. Standard SaaS metrics dashboard.

Design intent: the board-meeting numbers. Even with 3 customers, this is
where you check "am I growing?"

### Social

5 sub-views: Calendar · Composer · Inbox · Engaged Leads · Performance.
Reddit + LinkedIn + Twitter focused. Engaged Leads → Pipeline auto-promote
when ICP fit ≥ 80.

Design intent: top-of-funnel content engine. Composer auto-generates
weekly batch from your content calendar themes; you batch-approve Sundays.

### Settings (gear icon)

Team, plans, sending domains, suppression list, integrations (Stripe,
Smartlead, Apollo, Clay, RB2B, PostHog, Slack, Linear, GitHub, etc.),
API keys + webhooks, ICP definition.

---

## Cross-tab story (the demo's narrative connections)

These connections are part of the design — they're what make the dashboard
feel coherent rather than a pile of tabs:

- **Brett Whitaker** (Cool Comfort HVAC) replies positive in Outreach → auto-promoted
  to Pipeline as a Replied deal → AI-drafted Calendly link auto-sent → if he
  books, lands in Today as "demo today" → if he closes, becomes a Customer.
- **BrightVolt Electric** is at-risk in Customers (login dropped 60%) → triggers a
  Today alert → if they cancel, shows up as failed-payment in Revenue dunning.
- **Mason Whitaker** is a top customer (Customers tab) → posts about UFD on
  Twitter (Social Performance) → drives 3 attributed signups (Today celebration).
- **Aaron Buchanan** (HydroFlow) gets a warm intro from Sofia → shows in Outreach
  call queue as high-priority → moves through Pipeline.

When wiring real data, preserve this kind of cross-tab signal flow —
it's the difference between a useful dashboard and a tab directory.

---

## Key design rules to keep when going live

These are the principles the demo embodies — protect them as you wire real data:

1. **Auto-default + digest, never per-item approval.** Every AI draft
   should default to auto-action above a confidence threshold, with a
   visible digest of what shipped. Approval gates are the exception.

2. **"Source" indicators on read-only data.** Pulsing green dot pill
   showing "Synced from Smartlead · 4m ago." Tells the owner the data
   is alive without them doing anything.

3. **Inverse actions over approvals.** "Pause this customer" instead of
   "Approve this send." Default to action; let the owner intervene to stop.

4. **Today auto-aggregates, never curated.** Every item in Today should
   come from a system trigger, not from someone hand-typing it.

5. **Premature features stay hidden** until the customer count justifies
   them (Reputation at #10, Usage at #15, Support at #20). Visual focus
   matters more than feature breadth.

6. **One brand voice across all AI drafts.** Edited via Settings → Brand
   Voice prompt guide. Never hard-coded per module.

7. **Confidence threshold is configurable per automation** (visible in
   Settings + on the automation card on Today). Owner trust grows by
   tightening or loosening these thresholds, not by gating individual
   actions.

---

## Files that capture this design

- `src/lib/clients/commandsite/automations.ts` — the 10-automation registry
- `src/lib/clients/commandsite/today.ts` — action-queue fixture
- `src/lib/clients/commandsite/pipeline.ts` — pipeline deals + stages
- `src/lib/clients/commandsite/outreach.ts` — sequences + replies + leads + deliverability + demos
- `src/lib/clients/commandsite/companies.ts` — B2B customer accounts
- `src/lib/clients/commandsite/revenue.ts` — MRR/churn fixtures
- `src/lib/clients/commandsite/social.ts` — calendar + composer + inbox + leads + performance
- `src/lib/clients/commandsite/settings.ts` — config

When fixtures get replaced with real Supabase queries, keep the **shape**
of these data structures the same — every module reads from them. Change
the data source, not the contract.

---

## Tag the snapshot in git

After committing this state, tag it:

```bash
git tag -a demo-snapshot-pre-real-data -m "CommandSite demo state before wiring real data"
git push origin demo-snapshot-pre-real-data
```

You can always check out this tag to see the dashboard exactly as it
looks today.
