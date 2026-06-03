# Grace founding-rate Stripe products

Ready-to-paste content for three Stripe products. Mirrors the Heritage / Ada founding-rate pattern. Create in Stripe Dashboard → Products → Add product. All are recurring monthly USD subscriptions with no setup fee (the $1,000 standard onboarding fee is waived for founding partners).

Naming convention matches the existing Ada products so the dashboard stays consistent: `{Persona} by CommandSite - {Tier} (Founding Rate)`.

## 1. Welcome (visitor follow-up)

- **Name:** `Grace by CommandSite - Welcome (Founding Rate)`
- **Price:** $399 / month, recurring USD
- **Statement descriptor:** `COMMANDSITE GRACE`
- **Description (use for both Stripe and the payment-link page):**

> Grace handles every first-time visitor follow-up for your church. Within 24 hours of someone leaving a connect card, Grace drafts a personal text in your voice; you tap approve, it sends. Same flow on day 3 and day 14 to keep them in the loop. Catches the 80% of visitors most small churches lose because nobody has time to reach out fast enough.
>
> Founding-partner rate, locked through 2027. Standard rate post-cohort is $499/mo plus a $1,000 onboarding fee. Both waived for founding churches.

## 2. Welcome + Drift

- **Name:** `Grace by CommandSite - Welcome + Drift (Founding Rate)`
- **Price:** $799 / month, recurring USD
- **Statement descriptor:** `COMMANDSITE GRACE`
- **Description:**

> Everything in Welcome, plus drift detection: Grace flags families who've missed 3+ Sundays and drafts a personal "we miss you, anything we can pray about?" outreach for staff to approve. Catches the quiet leavers before they're gone for good, instead of finding out months later when someone mentions it.
>
> Founding-partner rate, locked through 2027. Standard rate post-cohort is $899/mo plus a $1,000 onboarding fee. Both waived for founding churches.

## 3. Pro + Coaching

- **Name:** `Grace by CommandSite - Pro + Coaching (Founding Rate)`
- **Price:** $1,299 / month, recurring USD
- **Statement descriptor:** `COMMANDSITE GRACE`
- **Description:**

> Everything in Welcome + Drift, plus a monthly 1:1 with Josh. We work through new ministry workflows together (prayer request triage, volunteer coordination, weekly comms), tune Grace's voice to the way your church actually talks, and roll out new roles as your team gets comfortable. For churches that want a partner walking it out, not just software.
>
> Founding-partner rate, locked through 2027. Standard rate post-cohort is $1,499/mo plus a $1,000 onboarding fee. Both waived for founding churches.

## Notes for the dashboard

- **Tax:** "Stripe Tax automatically managed" on, same as Ada products.
- **Setup fees:** create products WITHOUT a setup fee (founding-partner waiver). When standard pricing launches post-cohort, create separate products with the $1,000 setup component.
- **Payment links:** generate a shareable payment link for each product after creation, save the three URLs into `cs_settings.stripe_payment_links` jsonb (keyed `grace_welcome`, `grace_welcome_drift`, `grace_pro_coaching`) when that schema gets added.
- **Prices are immutable.** To change later, archive the price and create a new one.
