# Product

## Register

brand

## Users

CommandSite sells two AI-employee products under one parent brand. Both PRODUCT.md users are buyers landing on the marketing site; the personas they meet (Ada, Grace) are the products.

**Ada — for local service businesses.**
Owner-operators of 4-25 person field-service companies (HVAC, plumbing, electrical, roofing, landscaping, contractors). Reading the site at 9pm on a phone in a truck cab between jobs, or at a kitchen table after the kids are down. Skeptical of SaaS. Has been pitched by ServiceTitan/Housecall Pro/Jobber and either bought one or bounced off them. Has considered hiring a CSR ($30-50K + benefits) and stalled. Wants every missed call answered, every quote chased, every job reviewed — without hiring or rebuilding their stack.

**Grace — for churches.**
Senior pastors, executive pastors, ops directors, and admins at small-to-mid churches (50-1500 attendees). Reading on a laptop between Tuesday meetings. Reflexively wary of "AI in ministry" — has heard the phrase used badly. Carries the pain of first-time families slipping away, members drifting past 60 days, and five disconnected systems (Planning Center, MailChimp, ChMS, giving platform, group texts). Wants the systems work to stop eating relational time.

## Product Purpose

CommandSite builds custom AI employees for SMBs and ministries. The brand surfaces (landing, services pages, churches page, eventual case studies) exist to do one thing: convince the visitor that **Ada / Grace is a real, named coworker built for them specifically — not a generic chatbot wrapped in marketing**.

Success on a brand surface =
1. Visitor leaves with a clear mental model: "Ada/Grace is a person on my team, custom-built, $499–$1499/mo, replaces tasks I'd hire for."
2. Visitor either books a kickoff call or shares the page with a partner/board.
3. Anti-success: visitor thinks "another AI tool" and bounces.

The marketing site is the entire top of funnel. Outbound (Apollo/Smartlead) drives traffic here; the page closes or it doesn't.

## Brand Personality

**Three words: founder-direct, quietly capable, custom-built.**

- **Voice:** First-person founder, warm but unfussy. "Honestly? I built CommandSite because I was tired" is on-tone. "Empower your business with AI-driven solutions" is off-tone, instantly.
- **Tone for Ada (services):** Confident, plainspoken, slightly blue-collar. Talks money directly ($499 vs. $50K CSR). Doesn't apologize for selling.
- **Tone for Grace (churches):** Pastoral, mission-led, money-quiet. Never leads with giving or growth metrics — leads with "more people connected, fewer slipping away." Defuses the AI objection openly: "Some pastors hear 'AI' and stop listening. We get it."
- **Visual personality:** Lived-in, not polished. Real dashboard screenshots over 3D renders. Brand mark over stock illustration. Founder's name on the page. Custom-built means it looks like one person built it for one customer — even at scale.
- **Personification rule:** Ada is named, illustrated, gendered, and given voice. Grace is named and illustrated but framed as "ministry assistant," not "employee" — pastors get a lighter persona on purpose.

## Anti-references

What CommandSite must never look or sound like:

- **Generic AI-startup gloss.** Gradient hero text, glassmorphism cards, "Empower your X with AI," stock 3D blob illustrations, vague "intelligence platform" copy. The 2024-26 SaaS-cream aesthetic. Sierra, 11x, Artisan, Decagon, Lindy all live here visually — we admire the *category strategy* (named AI employees) but reject the *category aesthetic* (interchangeable purple-gradient fintech-coded landing pages).
- **Enterprise SaaS chrome.** ServiceTitan / HubSpot / Salesforce-style: dense feature grids, "Trusted by 10,000+ teams" logo walls, screenshots of menus. Our buyer is one person, not a procurement committee.
- **Church-tech cliché.** Stained glass, doves, beige-and-burgundy, scripture-as-decoration, stock photos of multi-ethnic hands holding each other. Grace's page must read as *competent operations software a pastor would respect*, not as devotional content.
- **Chatbot framing.** "Try our AI assistant" floating bubbles. Conversational UI as the hero. We sell a coworker, not a chat widget.
- **Self-serve onboarding theater.** "Sign up free, get started in 60 seconds." We custom-build per customer; pretending otherwise breaks the promise.

## Design Principles

1. **Name the persona before the platform.** Hero leads with "Meet Ada" / "Meet Grace." CommandSite is named as the builder, second. Buyers form a relationship with a coworker, not a SaaS.
2. **Show the work, don't describe it.** Real dashboard screenshots, real Ada-handles-this scenarios, real call transcripts when we have them. Every abstract claim earns a concrete example next to it.
3. **Founder credibility over brand polish.** A visible solo founder beats an invisible "team." Slight roughness reads as honest; over-polish reads as venture-backed and disposable.
4. **Custom-built means visibly custom.** Per-client themes, per-client copy, per-client screenshots in case studies. The brand surface should feel like one site that knows it's about to be cloned and customized for each buyer — never one-size-fits-all.
5. **Defuse the reflex objection in-band.** Service buyers' reflex: "another AI tool." Church buyers' reflex: "AI feels impersonal." Both reflexes get named on the page and answered, not dodged.

## Accessibility & Inclusion

- **Target:** WCAG 2.1 AA across all marketing surfaces. AAA on body copy contrast where the brand allows.
- **Color contrast:** Brand blue (`#1e40af`) on white passes AA at all body sizes. Sky-200 page wash is decorative only — never a text background.
- **Reduced motion:** Respect `prefers-reduced-motion`. Hero animations and scroll-driven effects must have static fallbacks. No purely-motion-conveyed information.
- **Color independence:** No state communicated by color alone. Status badges pair color with icon or label.
- **Keyboard & screen reader:** All CTAs reachable via tab; visible focus rings (already defined in `main.css`); no aria-hidden on essential illustrations.
- **Audience consideration:** Service-business buyers often read on phones in low-light truck cabs — body type bottoms out at 16px, line lengths cap at 65–75ch, no thin-weight body. Church buyers skew older — same rules, plus avoid pure-white on pure-white card stacks.
