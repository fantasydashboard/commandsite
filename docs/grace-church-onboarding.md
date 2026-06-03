# Grace onboarding, small/mid churches (200 to 1,500 attendance)

Paid to live for a founding-cohort church. Built for the validation phase: hand-run the first 2-3 cohorts, then automate the repeatable parts (see "Automate later" at the bottom). Founding partners get white-glove from the senior pastor's first email.

Voice rules: pastoral, plainspoken, deferential to the pastor's ministry context. Two-week onboarding to first live send. Only promise what's true. No em dashes anywhere in client-facing communication.

---

## 1. Post-payment welcome + roadmap email

Fires the moment Stripe payment clears. A clear, gentle roadmap so the pastor (or their assistant) doesn't feel they just signed up for one more thing they don't have time for.

**Subject:** welcome to the founding cohort, here's the path

> Pastor [First name], welcome aboard. Genuinely glad to have [Church name] as one of the founding churches.
>
> Here's exactly what happens over the next two weeks. No surprises.
>
> 1. This week: ten minutes of intake from you (link below). Mostly about your church's voice. A few samples of how you actually write to families (a recent welcome message, a care follow-up, an update to the congregation), so Grace sounds like you, not like a chatbot.
> 2. Within a few days: a 30-minute kickoff call. We connect Grace to Planning Center (or whatever you use for connect cards and attendance), walk through her first visitor follow-up drafts together on a screen-share, and decide what stays in her lane (logistics, follow-up cadence, drift flags) and what stays in yours (pastoral conversations, theology, anything that needs your voice in the room).
> 3. The days after: Grace starts in shadow mode. She drafts every message she'd normally send (visitor texts, drift outreach, return-visit notes) but nothing fires until you approve it. You spend 10 minutes a day for a week reviewing what she'd send and telling me what to tweak.
> 4. Around two weeks in: once she sounds like you and you're comfortable, we flip her live. From there it's about 10 minutes a day of you approving what she's already drafted.
>
> Two links to start whenever you've got a sec:
> - The quick intake: [intake link]
> - Grab your kickoff time: https://calendly.com/josh-commandsite/30-min-discovery-church-walkthrough
>
> Reply here anytime. I run all of this personally. I spent 20 years in church ministry before this, so if anything feels off, push back. We'll get it right.
>
> Josh
>
> Founder, CommandSite

---

## 2. The intake (church-specific)

Multi-step form with a progress bar (Typeform for now). Order: easy church facts first, voice section last and framed as the most important. Collect the **★ required** to start; the rest can come on the kickoff. Conditional notes in *(italics)*.

### Step 1: Your church (1 min)

- ★ Church name (exactly as it should appear)
- ★ Pastor's first name + what congregation calls you (Pastor First, First, Reverend, etc.)
- ★ Best email + cell
- ★ Church website
- ★ City + state
- Denomination or theological tradition (non-denom, Baptist, Methodist, Presbyterian, Pentecostal, EFCA, etc.) *(used by Grace for tone calibration only, not for content)*
- Average weekly attendance
- Year founded

### Step 2: How people show up (1 min)

- ★ Where does someone leave their info as a first-time visitor today? (connect card paper / digital form / app sign-up / "we don't really track it consistently" / other ___)
- What tool are you using for that? (Planning Center, Tithely, Subsplash, Church Community Builder, custom, none) *(determines integration path on kickoff)*
- Roughly how many first-time visitors do you get on a typical Sunday?
- Roughly how many of those return? (honest answer is fine, even "I have no idea")

### Step 3: How you reach back today (1 min)

- ★ After a first-time visit, what does someone on your team currently do? (honest, including "nothing systematic")
- Who on staff or volunteer team owns first-time visitor follow-up today? (you, exec pastor, assimilation team, volunteer, nobody specifically)
- How quickly does someone reach out, typically?
- What would you LIKE the follow-up to look like, if time wasn't the problem?

### Step 4: Drift detection (30 sec)

- Do you have any way today to notice when a regular family stops attending? (Planning Center attendance reports / volunteer team that watches / "usually somebody mentions it" / no)
- How many Sundays missed before someone reaches out? *(default we'll set Grace to is 3 Sundays. Tunable.)*
- Who on your team would want to know when a family is drifting? Just you, or also a care team / small group leader?

### Step 5: Your voice (the one that matters most)

*Framed as optional in the form; capture live on the kickoff if they skip it. Without this, Grace sounds like generic church software.*

- How do you want to come across to families? (warm, plainspoken, scripturally-grounded, no-nonsense, etc.)
- ★ The big one: forward or paste **3 to 5 real examples** of how you actually write to families (a recent welcome text or email, a care follow-up, a Sunday update to the congregation, a personal note to a family in a hard season). This is what makes Grace sound like you. *(If easier, we'll grab these together on the kickoff.)*
- How do you typically sign off? ("Pastor First", "First", "Pastor First, Cornerstone Family", etc.)
- ★ What should Grace **never** speak to on your behalf? (Default off-limits: theology questions, doctrinal positions, anything political, anything pastoral that needs your actual voice in the room. Tell us anything else.)

### Step 6: Your team (30 sec)

- ★ Who else on staff or volunteer leadership will see Grace's drafts? (name + role, comma-separated)
- ★ Who approves Grace's drafts before they send? (you only, you + assistant, assimilation lead, etc.)
- ★ Where should approvals and alerts go? (cell for texts, email, both, Slack)

### Step 7: Tools to connect (kickoff handles)

Just check what you use, no setup here:
- Planning Center (People, Check-Ins, Groups)
- Subsplash
- Tithely
- Church Community Builder
- Breeze ChMS
- A custom or homegrown system (we'll figure out the connect on kickoff)
- Mailchimp / Constant Contact for weekly emails
- Your phone system / texting platform (if separate)

### Step 8: Last thing

- What's the #1 thing slipping through the cracks that you most want Grace to fix first? (Visitor follow-up, drift detection, prayer requests, volunteer coordination, weekly comms, something else)
- Anything else we should know? (a particular ministry season coming up, a recent transition on staff, anything sensitive)

---

## 3. Onboarding runbook (paid to live)

The step-by-step for hand-running it. Keep shadow mode FAST. The research says churches lose 80% of visitors when nobody follows up in 24 hours, so the goal is Grace drafting on real visitor cards within days, not at the end of week two.

1. **Payment clears (Stripe)** → send the welcome + roadmap email, the intake link, and the kickoff link. *(Manual for now; automate off the Stripe event when ready.)*
2. **Review their intake** → note what's missing to cover on the kickoff. Especially flag any banned topics they specified beyond the defaults.
3. **Kickoff call (30 min):** walk their visitor flow, then connect tools live on screen-share. Planning Center connect is the most common path. Capture voice samples here if they didn't paste any.
4. **Provision their client in CommandSite:** add the slug to `clients.ts` + theme in `clientThemes.ts`, enable Grace's modules (Today, Front Desk Guests, Care Drift, Sundays Comms, Metrics, Giving, Settings), seed their real ministry team + groups + attendance baseline, configure Grace's follow-up cadence (default: visitor day 1 / day 3 / day 14), drift threshold (default: 3 missed Sundays), send window (default: weekdays 9 AM to 7 PM church time), approval routing.
5. **Voice calibration:** load their samples, run a first batch of test drafts in shadow mode, one round of pastor edits until the voice sounds like them. Pastors are pickier about voice than service-business owners; budget extra time here.
6. **Shadow mode live (within a few days):** Grace drafts on real visitor cards and real attendance data, sends nothing. Pastor + assigned approver watch for 7 days. This is the week-one win.
7. **Go live:** flip on; first approved Grace messages go out. Start with visitor follow-up only; bring drift detection live one week later so the pastor has time to absorb each new behavior.
8. **Week-1 check-in call:** lock the 10-minutes-a-day approval habit. Confirm Grace's voice is landing. Catch anything off. Tune drift threshold if needed.

---

## What Josh sets up outside this doc

- **Stripe:** payment links for the three founding products (see `docs/grace-stripe-products.md`). Founding rate, setup waived.
- **Intake form:** load Section 2 into Typeform with the labeled fields. Put the resulting link into the welcome email.
- **The trigger:** for now, send the three onboarding links by hand when payment clears. Later, the existing Stripe webhook fires the welcome email automatically off the paid event.

---

## Automate later (after 2-3 hand-built churches)

- Move the intake into CommandSite's onboarding wizard.
- Self-serve OAuth connect button for Planning Center (their API supports it).
- Template the client provisioning (Grace tenant scaffolding from intake answers).
- Client-facing onboarding checklist for the pastor (lifts completion 20-30%).
- Eventually let Grace run the intake conversationally on a discovery call.

Build it into the product, dogfooded, not a pile of external tools.

---

## Sensitive cases to be ready for on the kickoff call

These come up in church onboarding more than in service-business onboarding. Have a clean answer ready:

- "What about pastoral confidentiality?" Grace never reads or stores anything from one-on-one pastoral conversations. Her surfaces are visitor cards, attendance, and outreach drafts that the pastor approves before sending. Nothing private in, nothing private out.
- "Will Grace ever speak to theology?" No. The intake banned-topics list is enforced in her drafting prompt. If a recipient asks her a theology question, she politely routes it back to the pastor.
- "What happens when a family is grieving?" Grace flags it (her drift detection picks up reduced attendance, life-event notes, etc.) and drafts a pastoral note for the pastor to review. The pastor's voice goes out, not a generic condolence. Grace never sends grief-adjacent content without explicit approval.
- "Can the staff see what Grace is drafting?" Whoever the pastor designates as an approver sees the draft queue. The pastor controls who's in that group from the settings page.
- "What if we don't like a draft she sent?" Every draft is approved by a human before it sends. If something landed badly, the pastor edits it, sends a clarification, and we tune Grace's voice in the next review cycle.
