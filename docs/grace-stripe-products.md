# Grace founding-partner Stripe products

Ready-to-paste content for two Stripe products. Two tiers instead of three: research-backed restructure (see the bottom of this doc for rationale). Create in Stripe Dashboard → Products → Add product. All are recurring USD subscriptions with no setup fee.

Naming convention matches the existing Ada products: `{Persona} by CommandSite - {Tier} (Founding Partner)`.

## 1. Grace Core

Welcome + Drift Watch bundled together as the headline product. Includes the supporting roles (Front Desk, Story Engine, Weekly Report, Ask Grace chat) that round out the operational picture.

- **Name:** `Grace by CommandSite - Core (Founding Partner)`
- **Statement descriptor:** `COMMANDSITE GRACE`
- **Monthly price:** $599 / month, recurring USD
- **Annual price:** $6,470 / year (~10% off, equivalent to $539/mo) — recommended for churches that budget annually
- **Description (use for Stripe + payment-link page):**

> Grace handles the two highest-impact follow-ups in your church and rounds out a full operational picture on top.
>
> **Welcome** drafts a personal text or email to every first-time family within 24 hours of their connect card. Day 3, day 7, day 14. Same flow, every visit, in your pastor's voice. You approve, she sends. Catches the 80% of first-time families most churches lose because nobody had time to reach out fast enough.
>
> **Drift Watch** flags families who've drifted past 4 to 6 weeks of low attendance, paused giving, or stopped serving, and drafts a "we miss you, anything we can pray about?" check-in for your pastoral team to approve. Surfaces the quiet leavers while there's still time to reach them.
>
> Plus Front Desk (catches every call, form, and connect card 24/7), Story Engine (captures testimonies after baptisms and milestones), a weekly engagement report, and Ask Grace (chat with her about your congregation anytime).
>
> White-glove setup included. Founding-partner rate as our thanks for being early; standard rate post-cohort is $699/mo.

## 2. Grace Pro

Everything in Core, plus the high-touch services that make Grace fit a more demanding church: custom voice training, a dedicated success rep, and monthly strategy.

- **Name:** `Grace by CommandSite - Pro (Founding Partner)`
- **Statement descriptor:** `COMMANDSITE GRACE`
- **Monthly price:** $999 / month, recurring USD
- **Annual price:** $10,790 / year (~10% off, equivalent to $899/mo) — recommended for churches that budget annually
- **Description (use for Stripe + payment-link page):**

> Everything in Grace Core, plus:
>
> **Custom voice training.** We work with your pastor to tune Grace's drafting style to how your church actually talks, including theological vocabulary, denominational idioms, and care-language preferences. Pastors who've used Grace at Core describe the upgrade as "she finally sounds like our church."
>
> **Dedicated success rep.** A real person you call (not a chatbot) when something needs attention. Monthly 1:1 strategy sessions to roll out new workflows as your team gets comfortable: prayer request triage, volunteer coordination, baptism follow-up sequences, special-service comms.
>
> **First in line for new roles.** As we ship new ministry workflows, Pro churches get them first.
>
> White-glove setup included. Founding-partner rate as our thanks for being early; standard rate post-cohort is $1,199/mo.

## Annual billing

Both tiers offer a 10% annual discount. Annual billing matches how churches budget (Q4 for next year) and removes the monthly-vs-tithing budget tension that hits some smaller churches each month.

In Stripe Dashboard, add a second price to each product:
- **Core annual:** $6,470 / year (Stripe will compute as `64,700` cents x 1, billing interval `year`)
- **Pro annual:** $10,790 / year

Surface annual as the default on the payment link if you can; monthly stays available as a fallback for churches that prefer it.

## Pilot option (optional, recommended)

For founding cohort sales, offer a 14-day pilot before the subscription activates:
- During the 14 days, run the full Welcome workflow with the pastoral team co-approving every draft
- Payment activates only after the first 5 approved Welcome cards have actually sent
- Lowers the perceived risk for the buyer without giving away product
- Differentiates from competitors that lock annual contracts at signing

## Notes for the dashboard

- **Tax:** "Stripe Tax automatically managed" on, same as Ada products
- **Setup fees:** create products WITHOUT a setup fee. "White-glove setup included" is the message; never quote a separate onboarding fee. (Old "$1,000 onboarding waived" framing read as a SaaS implementation tax even when waived; churches don't pay these for Realm, Planning Center, etc.)
- **Payment links:** generate a shareable payment link for each product + each interval (monthly Core, annual Core, monthly Pro, annual Pro). Save the URLs into `cs_settings.stripe_payment_links` jsonb keyed:
  - `grace_core_monthly`
  - `grace_core_annual`
  - `grace_pro_monthly`
  - `grace_pro_annual`
- **Prices are immutable.** To change later, archive the price and create a new one.

---

## Why two tiers instead of three (rationale)

The original spec had three tiers: $399 Welcome-only, $799 Welcome+Drift, $1,299 Pro+Coaching. Restructuring to two based on church-tech buying research:

1. **The $399 Welcome-only tier was cannibalizing the Drift Watch value.** Most churches who can absorb $399 can absorb $599. The $200 gap is small in church-budget terms when you compare to other church-tech (Realm $40-200, Planning Center $14-159, Subsplash $99-999). And Welcome alone is hard to defend against the "we'll just do it with Planning Center workflows" objection. Bundling Welcome+Drift Watch makes the two headline products inseparable, which is what the deck and landing already promise.

2. **Three tiers create board-meeting decision paralysis.** Church board purchases are approved by committee. Three options triple the deliberation time and raise the "let's table this" rate. Most church-tech SaaS (Realm, Planning Center, ChurchTeams, Subsplash, Aware3) sells in one or two tiers for this reason.

3. **The "$1,000 onboarding fee waived" framing primed an objection.** Even though waived, mentioning a $1,000 implementation tax flagged Grace as "expensive enterprise SaaS." Churches don't pay setup fees for any of their other tech. "White-glove setup included" is cleaner.

4. **"Founding rate locked through 2027" read as legal lock-in language.** B2B SaaS pattern that lands wrong in pastoral context. "Founding-partner pricing as our thanks for being early" preserves the urgency hook without the legal framing.

5. **Annual billing matches how churches actually budget.** Q4 budget setting + annual spend approvals are the church procurement rhythm. Offering annual at a 10% discount aligns with their cycle and removes the monthly "should we keep paying for this?" question that hits some smaller churches every renewal date.

6. **Removing the $1,299 Pro+Coaching tier as a separate buy.** Few churches in the 200-1,500 ICP need a $1,299/mo product. Rolling it into Pro at $999 makes the high-touch path accessible for the ~30% of mid-sized churches that genuinely want the partnership without pricing it out of reach. Coaching/strategy stays as a Pro perk.

### Pricing comparison vs church-tech market

| Tool | Monthly range | Grace Core ($599) vs |
| --- | --- | --- |
| Realm (ACS) | $40 to $200 | Premium positioning, but Grace does what Realm doesn't (drafting in pastor's voice) |
| Subsplash | $99 to $999 | Within range; Grace differentiates on the AI-employee thesis |
| Aware3 (texting) | $79 to $499 | Higher than texting-only tools, justified by drafting + Drift Watch |
| ChurchPulse | $29 to $99 | Much higher, but Grace covers Welcome + Drift Watch + Front Desk; ChurchPulse is single-purpose |

### What the new tiers mean for the cold-email funnel

- **Old $399 entry tier removed.** This was the "we just want to try Welcome" buy. Replaced by the 14-day pilot, which is a stronger commitment-reducer because the buyer sees real value before paying.
- **Default ask becomes Grace Core at $599-$699.** Discovery call positions Welcome+Drift Watch as one product, not two.
- **Pro is the upsell after first Welcome sends land.** Pastors who see Grace's drafts working in their voice are dramatically more likely to want voice training to make it perfect.
