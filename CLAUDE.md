# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What CommandSite is

A custom dashboard platform sold as **AI employees**, not "AI dashboards." Two named personas under one parent brand:

- **Ada** — AI employee for local service businesses (HVAC, plumbing, electrical, roofing, landscaping). Landing page: `/` → `src/pages/LandingPage.vue`.
- **Grace** — AI ministry assistant for small-to-mid churches. Landing page: `/churches` → `src/pages/ChurchesPage.vue`.

The product underneath is the same dashboard system; the framing changes per buyer. All marketing copy leads with the persona; CommandSite is named as the builder, second.

Strategy and voice live in `PRODUCT.md`; visual system lives in `DESIGN.md` (Stitch format, used by the **impeccable** skill).

## Common commands

```bash
npm run dev          # Vite dev server (default port 5173)
npm run build        # production build
npm run preview      # preview production build locally
npm run typecheck    # vue-tsc --noEmit; run after structural changes
```

There are no test or lint scripts wired up in `package.json` yet. Don't fabricate them.

## Stack

Vue 3 (`<script setup lang="ts">`) + Pinia + Vue Router. Supabase for auth + Postgres + RLS. Tailwind CSS (custom design tokens). Chart.js via vue-chartjs. Vercel deployment via `vercel.json` SPA rewrites.

## Big-picture architecture

### Per-client runtime theming (load-bearing — read before touching color tokens)

Brand and chrome colors are exposed as CSS custom properties (`--color-brand`, `--color-brand-hover`, `--color-brand-active`, `--color-chrome`, `--color-chrome-ink`) defined in `src/assets/main.css` on `:root`. They're stored as **rgb component triples** (no `rgb()` wrapper) so Tailwind's `<alpha-value>` syntax composes them: `bg-brand/20` resolves to `rgb(var(--color-brand) / 0.2)`.

Every dashboard route rewrites those variables on `document.documentElement` per client. The mechanism lives in `src/lib/clientThemes.ts` and is applied by `DashboardLayout`. `themeForClient(slug)` returns a `vars: Record<string, string>` object that's set inline on the root element.

**This means:** components must compose with `bg-brand`, `text-brand`, `border-brand`, etc. (Tailwind utilities that resolve through the CSS vars). A hardcoded hex inside a component breaks the per-client theming system. The same component file ships in client-specific colors without component-level changes.

### Module registry

Dashboard widgets live in `src/modules/`. Each module is a Vue component accepting `{ client, config }` props. Registration in `src/modules/registry.ts` maps a string key to the component. Admins enable modules per client via the admin panel; the dashboard renders only enabled modules.

Adding a module: (1) create `src/modules/MyModule.vue` with `props: { client, config }`, (2) import + register in `registry.ts`, (3) toggle on per client from `/admin`.

Modules are namespaced by intent: `Apex*` for the HVAC demo, `Cornerstone*` for the church demo, `Ufd*` for Ultimate Fantasy Dashboard, `CommandSite*` for the CommandSite-on-CommandSite demo. The naming reflects the demo client, not a hierarchy.

### Auth + role split (Supabase RLS)

Two roles in `public.users.role`: `admin` (sees all clients, lands on `/admin`) and `client` (sees only their own `client_id`, lands on `/dashboard/<slug>`). RLS policies live in `supabase/migrations/0001_init.sql` and subsequent migrations. Adding a user requires both an `auth.users` row (Supabase Auth) AND a matching `public.users` row with a role; see README for the SQL.

### Public demo dashboards

Demo client dashboards (e.g., `/dashboard/apex-heating-and-air`, `/dashboard/cornerstone-community-church`) are publicly accessible and used as landing-page CTAs ("Tour the demo"). They run on fictional seed data. Don't gate them behind auth without checking the routes the landing pages link to.

## Design system (impeccable)

The repo uses the **impeccable** skill (`/impeccable <command>`) for frontend design work. Setup is non-optional: any design task must read `PRODUCT.md` and `DESIGN.md` via `node .claude/skills/impeccable/scripts/load-context.mjs` before writing code.

- `PRODUCT.md` — strategic doc: register, users, brand personality, anti-references, design principles. **Register is `brand`** (marketing surfaces lead).
- `DESIGN.md` — visual system: Stitch-format YAML frontmatter (colors, typography, components) + six fixed sections (Overview, Colors, Typography, Elevation, Components, Do's and Don'ts).
- `.impeccable/design.json` — sidecar with OKLCH tonal ramps, shadow/motion/breakpoint extensions, and full HTML+CSS component snippets that the impeccable live panel renders.

When in doubt about a visual choice, run `/impeccable critique <target>` for a heuristic-scored review.

## Agent architecture (load-bearing — read before building Ada/Grace's brain)

"Agent" means different things in 2026. CommandSite's stance is deliberate and should be preserved as features get built.

**Where Ada and Grace fit:** Tier 2.5 hybrid.
- **Tier 2 (engineered workflows + LLM judgment) for recurring product mechanics.** The 7-day quote follow-up cadence, the 2-hour-post-job review request, the dormant-customer reactivation campaign, the daily report — these are scheduled jobs whose *shape* is fixed. The LLM is a step inside each workflow, handling the soft parts: drafting the SMS in the customer's voice, classifying a reply, deciding whether to escalate to the owner's phone.
- **Tier 3 (real agent loop) for the chat surface and ad-hoc reasoning.** "Ask Ada anything" / "Ask Grace anything" should be built with the Anthropic Claude Agent SDK: tools, loop, memory across the conversation, multi-step reasoning ("who haven't I followed up with this week?"). Same for unusual-reply escalation handling.

**Why this split:** Service-business owners want *predictability* over autonomy. "Every quote gets followed up at day 1, 3, 7" is more valuable than "Ada decides when to follow up." Tier 3/4 autonomy applied to recurring mechanics makes the product worse for this buyer, not smarter.

**Architecture rules to follow:**
- **Recurring product mechanics run as scheduled jobs** (Supabase `pg_cron` / Edge Functions, or Vercel Cron). Never as autonomous agent loops. The cron is the contract with the buyer.
- **The LLM fills in soft parts within engineered workflows.** It is a *step* in the workflow, not the orchestrator of the workflow.
- **The chat surface is where the agent loop lives.** Tools (read CRM, draft SMS, check Ada's own outbox, book calendar), looping, scoped memory. This is the moment the product feels like a coworker.
- **"She remembers your business" is RAG with care, not Tier 4 autonomy.** Vector store over per-client business context (services, pricing, history). Careful retrieval. Memory failures should surface as wrong answers, not missing actions.
- **The marketing word "employee" does emotional work, not technical work.** The buyer gets a mental model they can evaluate (cost vs. CSR, hours, PTO). The codebase doesn't need to be a Tier 4 autonomous worker for "AI employee" to be honest framing — it needs to deliver outcomes (calls answered, quotes chased, reviews collected).

**What this rules out:**
- Promoting a cron job to "the agent decides when to act" (worse product, worse debugging, less trust).
- A single mega-loop where Ada picks her own tasks each morning (no SLA on the deliverable cadence; the buyer was sold predictability).
- Claiming Tier 4 autonomy in the architecture itself. The marketing surface can use "employee" framing; the codebase shouldn't pretend to be more autonomous than it is.

**Practical implication for `/impeccable`, `/loop`, `/schedule` skills:** the Claude Code `/schedule` and `/loop` skills run *Claude Code agents* on a cron locally. They are NOT the production scheduler. Production scheduled mechanics belong in Supabase / Vercel, not in Claude Code routines.

## Voice and copy conventions (from PRODUCT.md)

- Lead every brand-surface section with a Builder's Blue eyebrow at `text-[10px] font-semibold uppercase tracking-[0.18em] text-brand`. This is the system's signature.
- Em dashes are permitted in long-form prose (founder notes, pain headlines, FAQ). Banned in UI labels, button text, microcopy, and short marketing chrome.
- Don't use #000 or #fff in new code. `surface-raised` currently resolves to `#ffffff` for legacy reasons; future visual refreshes should migrate.
- Status colors (success, warning, danger) must always pair with an icon or label. Color-only signaling fails for color-blind users.

## Sharp edges to know

- **`bg-canvas`** is not a defined Tailwind token. If you see it, it's a bug (silently no-ops). Fall through to body wash or use `bg-surface-elevated`.
- **`.eyebrow`** class in `main.css` uses `text-ink-muted`, which is correct for product/dashboard surfaces but NOT the brand-register signature. Brand-register eyebrows are hand-rolled with the full Tailwind utility chain above.
- **Pre-existing typecheck noise** in `src/modules/` (Supabase generic typing on `.insert()` / `.update()` calls, some unused `Kpi` imports). Don't conflate with errors you've introduced; filter typecheck output by file.
- **CTA URLs on landing pages** are placeholder Calendly URLs; swap before launch (search for `calendly.com/josh-commandsite`).
