# Ada onboarding — bath & kitchen remodelers

Everything to take a shop from "we're ready" to live. Built for the validation phase: hand-run the first 2-3, then automate the repeatable parts (see "Automate later" at the bottom). Founding clients get white-glove, which the research says pays for itself above ~$10k/yr ACV.

Voice rules: founder-direct, plainspoken, no em dashes. Two-week onboarding (not 7). Only promise what's true.

---

## 1. Post-payment welcome + roadmap email

Fires the moment Stripe payment clears. A clear roadmap kills post-purchase anxiety and prevents onboarding ghosting.

**Subject:** you're in, here's what happens next

> [First name], welcome aboard. Genuinely glad to have you as one of the founding shops.
>
> Here's exactly what happens over the next couple of weeks so there are no surprises:
>
> 1. Today: a few quick questions from me (link below) so I can set Ada up around how your shop actually runs. About 10 minutes. The important one is a couple of examples of how you text and email customers, so she sounds like you and not a robot.
> 2. This week: a 30-minute kickoff (grab a time below). We connect your tools together on a screen-share (Google Local Services, Houzz, your phone number, QuickBooks), so you're not wrestling with any of it alone.
> 3. The days after: I build Ada around your shop and she starts in shadow mode, drafting on your real leads but sending nothing. You watch her work and tell me what to tweak.
> 4. Around two weeks in: once she sounds like you and you're comfortable, we flip her live. From there it's about 15 minutes a day of you approving what she's already drafted.
>
> Two links to start whenever you've got a sec:
> - The quick setup questions: [intake link]
> - Grab your kickoff time: https://calendly.com/josh-commandsite/bath-kitchen-walkthrough
>
> Reply here anytime with questions. I run all of this personally.
>
> Josh

---

## 2. The intake (bath & kitchen specific)

Multi-step form with a progress bar (Typeform for now). Order: quick/easy first, the voice section last and framed as optional-or-live. Collect the **★ required** to start; the rest can come on the kickoff. Conditional notes in *(italics)*.

### Step 1 — Your shop (1 min)
- ★ Business name (exactly as it should appear)
- ★ Owner name + what you go by
- ★ Main phone number *(the number Ada will text from)*
- ★ Best email
- Website
- ★ Service area (cities, or your home base + radius)
- Years in business / year founded
- License(s) you want shown (FL CGC, NARI, etc.)

### Step 2 — What you build (1 min)
- ★ What you do (check all): full bath remodel · powder room / half bath · kitchen remodel · cabinet refacing · countertops + backsplash · tile / wet rooms · accessibility / aging-in-place · whole-home · other ___
- ★ Typical project size: average **bath** ticket ___ · average **kitchen** ticket ___
- Typical time from first contact to signed job (your sales cycle)
- Do you do free in-home consultations / estimates? (yes/no)
- Walk me through your quote process in a sentence (e.g., consult → measure → proposal → follow-up)

### Step 3 — Where your leads come from (1 min)
- ★ Lead sources (check all): Google Local Services Ads · Houzz · Google search / reviews · Angi · referrals · NextDoor · Instagram · your website · other ___
- Which ones do you pay for, and roughly how much/month? (LSA budget, Houzz, Angi)
- Roughly how many leads or quotes a month?
- Current close rate, if you track it

### Step 4 — Quote follow-up (30 sec)
- After a quote goes out, what do you do today to follow up? (honest answer is fine, including "nothing")
- How persistent should Ada be: soft check-ins / standard / stay-on-it
- Any customers or quotes that should be off-limits for auto follow-up?

### Step 5 — Reviews & referrals (30 sec)
- Where do you collect reviews? (Google, Houzz, Facebook)
- Paste your Google review link *(if reviews is on)*
- Do you have a referral offer? (e.g., "$500 off for them, $500 for you") — terms ___

### Step 6 — Your team & how you run (1 min)
- ★ Who's on the team (names + roles)? *(used for the dashboard and for personal touches like "Diego mentioned you loved the tile")*
- ★ Who approves Ada's drafts before they send? (you, or who?)
- ★ Where should approvals and alerts go? (cell for texts, email, both)
- Your hours / when is it OK for Ada to send customer messages? (send window)

### Step 7 — Tools to connect (we do this together on the kickoff)
Just check what you use, no setup needed here:
- Google Local Services Ads (Google Guaranteed)
- Houzz Pro
- Google Business Profile (for reviews)
- QuickBooks
- A CRM or job tool (Buildertrend, Jobber, other ___)
- Your phone system / carrier

### Step 8 — Your voice (the one that matters most)
*Framed as optional in the form; capture live on the kickoff if they skip it.*
- How do you want to come across to customers? (warm, professional, no-nonsense, etc.)
- ★ The big one: forward or paste **3 to 5 real examples** of how you actually text or email customers (a quote follow-up, a reply, a thank-you). This is what makes Ada sound like you. *(If easier, we'll grab these together on the call.)*
- How do you sign off your texts/emails? ("Marc", "Marc, Heritage", etc.)
- Anything Ada should never say or do?

### Step 9 — Last thing
- What's the #1 thing slipping through the cracks that you most want fixed first?
- Anything else I should know?

---

## 3. Onboarding runbook (paid → live)

The step-by-step for hand-running it. Keep shadow mode FAST: the research says 90% of customers churn without a week-one win, so the goal is Ada drafting on their real leads within days, not at the end of week two.

1. **Payment clears (Stripe)** → send the welcome+roadmap email, the intake link, and the kickoff link. *(Manual for now; automate off the Stripe event later.)*
2. **Review their intake** → note what's missing to cover on the kickoff.
3. **Kickoff call (30 min):** walk their week, then connect tools live on a screen-share (LSA email forwarding, Houzz lead forwarding, Google Business, QuickBooks, phone/texting). Capture voice samples here if they didn't paste any.
4. **Provision their client in CommandSite:** add the slug to `clients.ts` + theme in `clientThemes.ts`, enable modules, seed their real services/team/lead sources, and configure Ada's roles, follow-up cadence, send window, approval threshold, and notification routing.
5. **Voice calibration:** load their samples, tune the drafts, one round of edits until it sounds like them.
6. **Shadow mode live (within a few days):** Ada drafts on their real leads, sends nothing. Owner watches. This is the week-one win.
7. **Go live:** flip on; first approved sends go out from their number.
8. **Week-1 check-in call:** lock the 15-minutes-a-day approval habit (adoption = retention), catch anything off.

---

## What Josh sets up outside this doc
- **Stripe:** a subscription payment link for the founding rate (setup waived). Decision: charge month-1 at signing to lock commitment.
- **Intake form:** load Section 2 into Typeform (multi-step, progress bar). Put the resulting link into the welcome email.
- **The trigger:** for now, send the 3 links by hand when payment clears. Later, fire them automatically off the Stripe payment event.

## Automate later (after 2-3 hand-built)
Move the intake into CommandSite's onboarding wizard, add self-serve OAuth connect buttons (Google, QuickBooks), template the client provisioning, add a client-facing onboarding checklist (lifts completion 20-30%), and eventually let Ada run the intake conversationally. Build it into the product, dogfooded, not a pile of external tools.
