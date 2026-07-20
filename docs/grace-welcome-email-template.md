# Grace church welcome email template

The email Josh sends to a church after they agree to Grace Core founding pricing.
First used 2026-06-12 for Focal Point Church (Christina Spoon).

This email replaces both the formal "welcome to Grace" email AND any timeline
clarification email. It does double duty: welcomes them as a customer, answers
their "what are the next steps?" question, and delivers the three action links
in one send.

**2026-06-27 update:** intake is now a per-church Google Doc, not a shared Google
Form. The Form blocked delegation (sequential page completion, no save and
resume, no async editing) and Focal Point's Christina Spoon hit the wall trying
to route sections to staff. Doc lets the team fill in their pieces in parallel
and @-mention each other. Per-church workflow: copy the master template, rename,
share. See `feedback_grace_intake_via_doc.md` in memory for the rule.

## Production links (founding cohort)

These are the live URLs. Reuse the same three for every new Grace church.

- **Stripe payment link (Core $599/mo + Setup $1,249 bundled, 14-day trial)**:
  `https://buy.stripe.com/28E6oA7EUeRaa9N2GWcs800`
- **Google Doc questionnaire template** (master copy, make a per-church copy before sending):
  `https://docs.google.com/document/d/1qiZMxk93wmDUExtkSnpC9oImTs_564vIUtScm80VnFk/edit?usp=sharing`
  Per-church workflow: open the template, File > Make a copy, rename to
  `[Church Name] · Grace Setup Questionnaire`, share with edit access to the
  primary contact (`{{contact_email}}`), paste that copy's share link into the
  email as `{{questionnaire_link}}`.
- **Calendly kickoff call** (60-min, Grace Kickoff event):
  `https://calendly.com/josh-commandsite/commandsite-discovery-walkthrough-churches-clone`

## When to send

Right after the church agrees to terms. The triggering signal is usually a
short "we're in, what's next?" email from the buyer. This email serves as both
the welcome and the answer to that question.

If they mention a vacation window or specific people who need to be back, frame
the timeline around that explicitly (as in the Focal Point version below). If
no scheduling constraints came up, drop the "(no team needed)" framing and just
list the steps without the date headers.

## Email template

Subject: Welcome to Grace + your kickoff timeline

```
Hey {{contact_first_name}},

Thanks, and you're welcome on the six months of 1:1 support. You're our
founding cohort, so this rollout gets the white-glove treatment from me
personally. Glad you're in.

{{optional_timing_note}} Here's a potential timeline:

{{phase_1_dates}} (no team needed):

STEP 1 - Payment: Bundled link below covers the setup and your Core
subscription, which won't start charging until 14 days later (covers our
onboarding window).
Complete payment here: https://buy.stripe.com/28E6oA7EUeRaa9N2GWcs800

STEP 2 - Questionnaire: Once payment is done, you and the team can fill in
sections at your own pace. Each section has a suggested-owner tag so you can
route the pieces; whoever's around can answer their parts and the rest can
complete theirs as they return.
Complete the questionnaire here: {{questionnaire_link}}

{{phase_2_dates}} (kickoff with your full team):

STEP 3 - Kickoff call: Book a 60-minute slot once everyone's back. I'll have
Grace partially configured by then based on the questionnaire answers we have.
On the call, we'll walk through her setup live, approve her voice, and confirm
your Sunday go-live date.
Book our kickoff call here: https://calendly.com/josh-commandsite/commandsite-discovery-walkthrough-churches-clone

{{phase_3_dates}} (build):
I spend that week building out your specific Welcome and Drift Watch flows,
importing your member data, and tuning Grace to match how {{church_name}}
sounds.

{{phase_4_dates}}:
Grace goes live for {{church_name}}. We'll pick the exact Sunday on the
kickoff call based on where we land.

Three quick things worth noting:
- No rush on the payment or questionnaire by any specific date. Take the time
  you need to do them well.
- When you book the kickoff, pick any time {{availability_note}} that works
  for you and the right people in the room.
- Any questions at all between now and the kickoff, just reply here. I'm your
  direct line for the next six months.

Looking forward to building this with you,
Josh
```

## Variable reference

- `{{contact_first_name}}` — primary buyer's first name (e.g., Christina)
- `{{church_name}}` — the church name (e.g., Focal Point)
- `{{questionnaire_link}}` — share link to the per-church copy of the Doc
  template. Make the copy first (see Production links above), rename it after
  the church, share with edit access to the primary contact, then drop the
  share URL here.
- `{{optional_timing_note}}` — if they mentioned a vacation or constraint, lead
  with a sentence acknowledging it. Default for Focal Point was:
  "Your vacation window actually works in our favor."
  If no constraint, replace with: "Here's how the next few weeks shape up."
- `{{phase_1_dates}}` — date range from now until the kickoff is possible.
  e.g., "Now through July 5"
- `{{phase_2_dates}}` — week the kickoff happens. e.g., "Week of July 6"
- `{{phase_3_dates}}` — the build week, normally the week after the kickoff.
  e.g., "Week of July 13"
- `{{phase_4_dates}}` — the go-live Sunday, normally 1-2 Sundays after kickoff.
  e.g., "Sunday July 19 or 26"
- `{{availability_note}}` — when to book from. e.g., "from July 6 onward" if
  they have a vacation window, or just "that works for you" if no constraint.

## Tone notes (learned from the Focal Point send)

1. Open by acknowledging whatever they just thanked you for. Don't open with
   "That's exciting" or any AI-sounding generic enthusiasm. The "you're welcome
   on the six months of 1:1 support" line works because it mirrors back exactly
   what they wrote.

2. The founding-cohort framing ("you're our founding cohort, so this rollout
   gets the white-glove treatment") is load-bearing. It justifies the special
   pricing AND sets the expectation that this won't be a polished mass-market
   experience. Don't drop it.

3. STEP 1 / STEP 2 / STEP 3 bold headers help the email get forwarded inside
   the church. Each step is something a different team member might own.

4. The "(no team needed)" / "(with your full team)" annotations on the phase
   headers are what make the timeline feel collaborative instead of imposed.

5. Drop the `>` markers before links. The link styling already signals action;
   adding `>` reads like terminal output and looks slightly raw.

6. "I'm your direct line for the next six months" reinforces the 1:1 support
   without being repetitive about it.

## What NOT to do

- Don't promise specific dates for go-live in this email. Use "we'll pick the
  exact Sunday on the kickoff call." Locking the date here pressures both you
  and them.
- Don't include the agenda for the kickoff call in this email. That's what the
  Calendly description (and pre-call reminder) is for. Keep this email focused
  on getting them to the kickoff.
- Don't open with a markdown blockquote or any formatting that won't render in
  Gmail. The whole body should paste cleanly into a Gmail compose window with
  bold + bullets as the only formatting.

## After they receive this email

Track in your head (or in CommandSite once #132 ships):

| Trigger | Your move |
| --- | --- |
| Stripe webhook: payment succeeded | Tag them as a founding customer, create their cs_clients row |
| Questionnaire Doc filled in (or pinged complete) | Start prepping their kickoff materials |
| Calendly booking confirmed | Block the 4-5 hours before the call for prep |
| Day 3 with no payment | Send a soft nudge ("any questions on the Stripe link?") |
| Day 5 with no questionnaire | Send a soft nudge ("any blockers on the questionnaire?") |

## Related docs

- `docs/grace-stripe-products.md` — the underlying Stripe spec for the bundled
  link (Core + Setup + 14-day trial)
- `docs/grace-church-onboarding.md` — the broader onboarding playbook (kickoff
  call agenda, build week tasks, go-live checklist)
