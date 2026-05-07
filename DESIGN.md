---
name: CommandSite
description: AI employees, custom-built per business. Ada for service trades, Grace for churches.
colors:
  brand: "#1e40af"
  brand-hover: "#1d4ed8"
  brand-active: "#1e3a8a"
  accent: "#0ea5e9"
  accent-hover: "#0284c7"
  chrome: "#0a1628"
  chrome-ink: "#f1f5f9"
  surface: "#f4f7fb"
  surface-raised: "#ffffff"
  surface-elevated: "#f1f5f9"
  divider: "#e2e8f0"
  divider-bright: "#cbd5e1"
  ink: "#0f172a"
  ink-inverse: "#f1f5f9"
  ink-muted: "#64748b"
  ink-disabled: "#94a3b8"
  ink-data: "#475569"
  success: "#0ea5a0"
  warning: "#d97706"
  danger: "#dc2626"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3.75rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.18em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  card: "14px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  2xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.ink-inverse}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
    textColor: "{colors.ink-inverse}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink-inverse}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  button-dark:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.chrome-ink}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
  card:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.card}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
---

# Design System: CommandSite

## 1. Overview

**Creative North Star: "The Quiet Coworker"**

CommandSite's interface is a coworker who already knows the job. Calm presence, dense with real work, never theatrical. Ada and Grace are sold as named coworkers, not chat widgets, and the interface that introduces and surrounds them carries that posture: low-drama, capable, slightly lived-in. A visitor should leave thinking "she's already on my team," not "another AI tool."

The system rejects the 2024 to 2026 SaaS-cream aesthetic that has flooded the AI-employee category. No purple-to-magenta hero gradients, no glassmorphism cards used decoratively, no 3D blob mascots. It also rejects the opposite reflex (the editorial-typographic Klim-influenced lane), because Cormorant italics on a service-trades landing page are a costume, not a voice. The work shows up as work: real dashboard screenshots over illustrations, the founder's name on the page, a brand mark over stock art.

**Key Characteristics:**
- One committed deep blue (#1e40af) as identity. The accent sky blue (#0ea5e9) is a highlighter, used sparingly.
- Pure system sans (Tailwind default stack). No custom fonts. The voice carries through hierarchy and tracking, not through typeface novelty.
- Pill buttons, 14px card radius, generous internal padding. Friendly without being cute.
- Flat by default. The card shadow is an edge tint, not a real lift; real lift only appears on hover.
- Per-client themes: every dashboard rewrites brand and chrome CSS variables on the document root, so the same components ship in client-specific colors without component-level changes.
- High contrast for outdoor and mobile reading. Service buyers read on phones in low-light truck cabs. Body type bottoms out at 16px.

## 2. Colors

A Committed strategy. The deep blue carries identity across roughly 30 to 50 percent of any brand surface (CTAs, eyebrows, brand-tinted chips, the wordmark, the hero "Ada at work" stack). The sky blue is a highlighter, never a co-equal. Neutrals are tinted slate, not pure greys.

### Primary
- **Builder's Blue** (`#1e40af`, `oklch(35% 0.18 264)`): The deep, capable workshop blue. Sourced from the CommandSite icon's gradient base. Used on every primary CTA, every brand mark surface, every chip background tint, the focus ring, the eyebrow text. Its saturation is the point; do not desaturate it for "polish."
- **Builder's Blue Hover** (`#1d4ed8`): One step lighter. Hover state for primary buttons.
- **Builder's Blue Active** (`#1e3a8a`): One step deeper. Active/pressed state.

### Secondary
- **Signal Sky** (`#0ea5e9`, `oklch(72% 0.16 230)`): The bright, clear accent. Used like a highlighter on a printed plan: status pills, link underlines on chrome, occasional KPI accent stripes when the brand blue is already saturating the surface. Never paired with Builder's Blue on the same component (the gradient combo reads as generic AI-startup gloss).

### Tertiary
- **Chrome** (`#0a1628`): The deep navy used for the sticky header on landing pages and the dashboard top bar. Reads as nighttime field, not corporate boardroom. Always paired with `chrome-ink` (#f1f5f9) for legibility.

### Neutral
- **Page Wash** (`#f4f7fb` plus a `sky-200` radial overlay at 45% opacity): The body surface. The radial wash starts near the top center, fades to the base wash by 70% scroll height, never repeats. Cards float on this; raw text never does.
- **Surface Raised** (`#ffffff`): Cards, inputs, dialog interiors. Sits 1 layer above the page wash. The shipped value is pure white; future visual refreshes should tint to `#fcfdfe` (chroma ~0.005 toward brand hue) to align with the system slop test.
- **Surface Elevated** (`#f1f5f9`): The hover surface for ghost buttons and the hover lift behind nested table rows. One step warmer than the page wash.
- **Divider** (`#e2e8f0`): Default 1px borders on cards, inputs, table rows. **Divider Bright** (`#cbd5e1`) is the hover state for those borders.
- **Ink** (`#0f172a`): All body text. **Ink Muted** (`#64748b`): Secondary copy, captions, KPI hints. **Ink Disabled** (`#94a3b8`): Form placeholders, disabled states. **Ink Data** (`#475569`): Numerical content in tables, where slightly lighter than body reads as more rhythmic.
- **Ink Inverse** (`#f1f5f9`): On chrome surfaces and primary buttons.

### Status
- **Success** (`#0ea5a0`): Job-done states, confirmation. Always paired with an icon or label, never color-only.
- **Warning** (`#d97706`): Non-blocking attention. Same pairing rule.
- **Danger** (`#dc2626`): Destructive confirmations, error states. Same pairing rule.

### Named Rules

**The Highlighter Rule.** Signal Sky (#0ea5e9) covers no more than 10% of any given screen. It marks; it does not fill. If a surface looks "sky-blue tinted," reduce sky usage until Builder's Blue carries the identity.

**The No-Gradient Rule.** Builder's Blue and Signal Sky are never blended into a gradient on a primary surface. The category aesthetic we reject is exactly that gradient. Solid color blocks only. The single permitted exception is the chrome header's hairline gradient (`linear-gradient(180deg, chrome 0%, chrome+8%brand 100%)`), which warms the dark bar imperceptibly and is invisible at glance.

**The Per-Client Override Rule.** Every dashboard rewrites `--color-brand`, `--color-brand-hover`, `--color-brand-active`, `--color-chrome`, `--color-chrome-ink` on `document.documentElement`. Components must compose with `rgb(var(--color-brand) / <alpha>)` so the override flows through automatically. A hardcoded hex inside a component is a bug.

## 3. Typography

**Display Font:** Tailwind's default sans stack (`ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`).
**Body Font:** Same stack.
**Label/Mono Font:** None distinct. Labels are the same stack at smaller sizes with letter-spacing.

**Character:** A single system stack carrying everything. The reflex would be a custom display serif for the hero and a tech-coded mono for labels; both reflexes are rejected. The voice is in scale and tracking, not in typeface novelty. System fonts also load instantly on the truck-cab mobile reads that matter most.

### Hierarchy

- **Display** (font-weight 600, `clamp(2.25rem, 5vw, 3.75rem)`, line-height 1.05, letter-spacing -0.01em): Hero headlines on landing pages only. The tight 1.05 line-height is deliberate; "Meet Ada / your AI employee." reads as one name with a role, not as two stacked sentences.
- **Headline** (font-weight 600, 1.875rem / 30px, line-height 1.15, letter-spacing -0.01em): Section headers on landing pages, dialog titles in product, page-level h2.
- **Title** (font-weight 600, 1.25rem / 20px, line-height 1.3): Card headings, KPI big values, module titles.
- **Body** (font-weight 400, 1rem / 16px, line-height 1.6): Default paragraph and prose. **Body line length caps at 65 to 75ch.** Wrapped containers must enforce this with `max-width`, never with arbitrary widths.
- **Body Small** (font-weight 400, 0.875rem / 14px, line-height 1.5): Secondary copy, table cells, button labels.
- **Caption** (font-weight 400, 0.75rem / 12px, line-height 1.4): KPI hints, table metadata, helper text under inputs.
- **Eyebrow Label** (font-weight 600, 0.625rem / 10px, line-height 1.2, letter-spacing 0.18em, uppercase): Brand-colored label that sits above hero headlines and section headers. The wide tracking is the signature.

### Named Rules

**The Eyebrow Rule.** Every major hero or section block opens with a brand-colored uppercase eyebrow label at 10px / 0.18em tracking, before the headline. This is the closest thing to a brand "watermark" in the typographic system. It carries the brand color into long scrolls without saturating them.

**The No-Display-Serif Rule.** No custom display serif on any CommandSite surface. Reflex pairings (Cormorant + Inter, Fraunces + DM Sans, Playfair + anything) are training-data defaults and create monoculture. The voice is system-sans plus committed weight contrast.

**The 1.6 Body Rule.** Body line-height stays at 1.6 even when surrounding container is small. Cramped body reads as "spec sheet"; we are selling a coworker, not a procurement form.

## 4. Elevation

Flat by default with subtle ambient lift. Surfaces sit at one of three layers (page wash, surface raised, surface elevated) and shadows do almost no work at rest. The card shadow is functionally an edge tint that defines the card boundary against the page wash; on hover it transitions into a real ambient lift, signaling interactivity. Ghost buttons and chips have no shadow at all. Modals use the raised shadow alone, no scrim blur.

### Shadow Vocabulary

- **Card (rest)** (`box-shadow: 0 1px 3px 0 rgb(15 23 42 / 0.04), 0 1px 2px -1px rgb(15 23 42 / 0.04), 0 0 0 1px rgb(15 23 42 / 0.025)`): The default card edge. Three stacked layers do the work: a tiny ambient drop, a tighter contact shadow, and a 1px slate ring that replaces a literal border. Tailwind alias: `shadow-card`.
- **Raised (hover, interactive)** (`box-shadow: 0 12px 28px -8px rgb(15 23 42 / 0.10), 0 4px 8px -4px rgb(15 23 42 / 0.05)`): A clear ambient lift. Used on hover for `card-interactive`, on the hero "Ada at work" stack at rest, on dialog surfaces. Tailwind alias: `shadow-raised`.
- **Button** (`box-shadow: 0 1px 2px 0 rgb(15 23 42 / 0.05)`): The faintest possible drop on solid buttons. Visible on the brand and accent color buttons against the page wash, invisible on the dark chrome bar. Tailwind: `shadow-sm`.

### Named Rules

**The Edge-Tint Rule.** The default card shadow is not a shadow; it is an edge. It exists so cards on the page wash do not float without anchor. If a card needs more shadow at rest, it is the wrong layer (it should be `shadow-raised`, not deeper card shadow).

**The Glass-Once Rule.** Backdrop blur is permitted exactly once in the system: the sticky chrome header on landing pages uses `bg-chrome/95 backdrop-blur` so the page content scrolling behind it is felt, not seen. Anywhere else, blur is the absolute ban.

## 5. Components

### Buttons

Pill-shaped, friendly without being cartoon, six variants total. Every button uses the same base (`inline-flex`, `gap-2`, `rounded-full`, `px-5 py-2.5`, `text-sm font-medium`, `transition-all`, focus-ring at 2px offset by 2px).

- **Shape:** Full pill (`border-radius: 9999px`).
- **Padding:** 10px vertical, 20px horizontal. Roomier than the SaaS default `px-4 py-2`. The roominess is the warmth.
- **Primary** (`btn-primary`): Builder's Blue background, ink-inverse text, micro shadow. Hover transitions to Builder's Blue Hover (#1d4ed8). Active to Builder's Blue Active (#1e3a8a). The default CTA on landing pages and product.
- **Accent** (`btn-accent`): Signal Sky background. Used sparingly, for "tour the demo" style secondary CTAs where Builder's Blue would compete with the hero CTA.
- **Secondary** (`btn-secondary`): Surface-raised background, ink text, divider border. Hover lifts the border to divider-bright and the background to surface-elevated. Used for "See how it works" alongside a primary CTA.
- **Dark** (`btn-dark`): Chrome background, chrome-ink text. Used inside dark-chrome footer sections and on the `Hire Ada` CTA inside the dark chrome nav bar.
- **Ghost** (`btn-ghost`): Transparent background, ink-muted text. Used for tertiary actions, breadcrumb-style links inside the product. Hover surfaces ink and surface-elevated background.
- **Danger** (`btn-danger`): Danger background, ink-inverse text. Destructive confirmations only.

**Focus:** Every button shows a 2px brand ring at 2px offset against the surface (`focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface focus:ring-brand`). Identical pattern across all variants for keyboard predictability.

### Chips and Pills

The signature non-button decoration. Two main forms:

- **Eyebrow Label** (the brand-colored label above headlines): Builder's Blue at 10% opacity background, Builder's Blue text, 4px / 10px padding, full pill, 10px font-size, 0.18em letter-spacing, uppercase. The system's most repeated decorative element.
- **Status Pill** (inside the product, for "open / closed / overdue" states): Same shape as eyebrow label, but uses a status color (success, warning, danger, ink-muted) at 10% background and full color text. Always paired with a leading dot or icon for color-independent legibility.

### Cards / Containers

- **Corner Style:** 14px radius (`rounded-card`). Specifically not 8px (too utilitarian) or 16px (too consumer-app). 14px reads as workplace.
- **Background:** Surface-raised (#ffffff), almost always.
- **Shadow Strategy:** `shadow-card` at rest. `shadow-raised` on hover for interactive cards (uses `card-interactive` alias).
- **Border:** Embedded in the card shadow as a 1px ring (`0 0 0 1px rgb(15 23 42 / 0.025)`). Cards do not stack a literal border on top of the shadow.
- **Internal Padding:** `p-6` (24px) is the default. `p-5` (20px) for denser cards. `p-4` (16px) for compact dashboard tiles.
- **Nested cards are forbidden.** A card inside a card is always a layout failure; use surface-elevated rows or dividers instead.

### Inputs / Fields

- **Style:** 1px divider border, surface-raised background, 8px radius (smaller than card on purpose: inputs are denser than cards). Padding 10px / 16px.
- **Placeholder:** Ink-disabled (#94a3b8).
- **Focus:** Border shifts to Builder's Blue, plus a 3px Builder's Blue ring at 20% opacity. The combination reads as "this field is awake," not as "this field is alarmed."
- **Error:** Border shifts to danger, hint text in danger color below the input.
- **Disabled:** 50% opacity, no pointer events, ink-disabled placeholder.

### Navigation

- **Landing-page chrome (sticky top bar):** `bg-chrome/95 backdrop-blur` (the only permitted glass), 16px / 32px padding, max-width 1152px centered. Wordmark left, nav links center or right, primary CTA pinned right.
- **Nav links:** Chrome-ink at 80% opacity, 14px font, transition to full chrome-ink on hover. No underlines, no dot indicators, no animated underbars.
- **Dashboard top bar:** Same chrome color but with an imperceptible vertical gradient (`linear-gradient(180deg, chrome 0%, chrome+8%brand 100%)`) to warm the dark bar. Pill-shaped tab nav for primary modules. Active tab gets `text-chrome-ink bg-chrome-ink/10 font-medium`.
- **Dashboard subtab nav:** Below primary tabs when a module has subviews. Uses 11px uppercase wide-tracked labels, separated by spacing, no pill background.

### KPI Card (signature)

The dashboard tile that does the most work in the product. Worth its own entry because it carries the visual identity per-client.

- **Shape:** 14px radius, surface-raised, `shadow-card`, 16px / 20px padding.
- **Top accent stripe:** A 3px full-width bar at the top edge, colored by the per-client theme's primary or a passed-in `accentColor` prop. **This is a top stripe, not a side stripe** (which is in the absolute bans). The top stripe doubles as a brand watermark across an entire dashboard's KPI grid.
- **Label:** 11px uppercase, ink-muted, 0.08em tracking. Sits 16px from the top edge.
- **Value:** 28 to 36px (`leading-none`, font-weight 700, letter-spacing -0.01em), ink color. Sits 6px below the label.
- **Hint / delta:** 12px ink-muted, sits 8px below the value. Delta arrows use success / warning color, no color-only signaling.

### Hero "Ada at Work" Card (signature)

The landing-page hero illustration is a stacked trio of cards showing Ada in action (an inbound call queued, a quote sent, a review request triggered). Distinctive enough to document as its own component.

- **Layout:** Three cards stacked with progressive `translate-x` offsets (0, 8px, 24px) so the rear cards peek out. Each card 14px radius, surface-raised, 1px divider border, `shadow-raised`, 16px padding.
- **Internal:** Left-side icon badge (28x28px, full pill, Builder's Blue 10% background, Builder's Blue glyph). Center: title + meta. Right: success-colored checkmark or status indicator.
- **Behavior:** Static at rest. No motion. The depth is structural, not animated.

## 6. Do's and Don'ts

The visual carry-through of PRODUCT.md's strategic line. If a Don't here doesn't trace back to an anti-reference in PRODUCT.md, it should not be here.

### Do:

- **Do** lead every hero and major section with a Builder's Blue eyebrow label at 10px / 0.18em uppercase tracking. The eyebrow is the system's signature.
- **Do** use Builder's Blue (#1e40af) for primary identity and CTAs, covering 30 to 50 percent of brand surfaces. Commitment to one saturated color is the strategy.
- **Do** keep Signal Sky (#0ea5e9) under 10 percent of any screen. It marks, it never fills.
- **Do** use real dashboard screenshots for "show the work" moments. Screenshots over illustrations on every services-page hero.
- **Do** show the Ada brand mark (`/src/assets/ada-mark.png`) wherever Ada is named. The mark plus the name is the persona.
- **Do** keep body type at 16px minimum and cap line length at 65 to 75ch. Service buyers read on phones in low-light truck cabs.
- **Do** compose components with `rgb(var(--color-brand) / <alpha>)` so per-client theme overrides flow through. Hardcoded hex inside components breaks the per-client theming system.
- **Do** pair every status color with an icon or label. Color-only status communication fails for color-blind users and prints poorly.
- **Do** use 14px card radius (`rounded-card`) for surface containers. Specifically not 8px, not 16px.

### Don't:

- **Don't** add purple-to-magenta gradients, glassmorphism cards used decoratively, "Empower your X with AI" copy, or stock 3D blob illustrations. These are the 2024 to 2026 SaaS-cream aesthetic, the exact category we reject.
- **Don't** import Cormorant, Fraunces, Playfair, Recoleta, Crimson, Newsreader, or any reflex display serif. Same for Inter, DM Sans, Plus Jakarta, Outfit, Space Grotesk, IBM Plex. These are training-data defaults; we use the system stack on purpose.
- **Don't** introduce a side-stripe border (`border-left` or `border-right` greater than 1px as a colored accent). The KPI card's 3px top stripe is the only permitted directional accent stripe; left and right stripes are forbidden.
- **Don't** use gradient text (`background-clip: text` over a linear gradient). Solid colors only. Emphasis through weight and size.
- **Don't** use backdrop blur except on the sticky landing-page chrome header. Anywhere else, blur is decorative glassmorphism, banned.
- **Don't** nest cards inside cards. If grouping is needed, use surface-elevated rows, dividers, or section headings.
- **Don't** replicate the SaaS hero-metric template (giant gradient number, micro label, three supporting stats). The KPI card is the alternative.
- **Don't** use icon-plus-heading-plus-text identical card grids as a section pattern. Vary card sizes; vary internal compositions; or use a different pattern entirely.
- **Don't** pitch Grace's church surface with stained glass, doves, scripture-as-decoration, or stock photos of multi-ethnic hands holding each other. Grace is competent operations software a pastor would respect, not devotional content.
- **Don't** float a "Try our AI assistant" chat bubble in the corner. We sell a named coworker, not a chat widget.
- **Don't** offer self-serve "sign up free, get started in 60 seconds" framing. We custom-build per customer; pretending otherwise breaks the promise.
- **Don't** use #000 or #fff as raw values in new code. The `surface-raised` token currently resolves to `#ffffff` for legacy reasons; future visual refreshes should migrate to `#fcfdfe`. Ink is `#0f172a` (slate-tinted), never pure black.
- **Don't** animate CSS layout properties (height, width, padding, margin, top/left). Use transforms and opacity. For collapsing sections, transition `grid-template-rows`.
- **Don't** use em dashes in UI labels, button text, microcopy, or short marketing chrome (eyebrows, status pills, nav, page metadata). Em dashes are permitted in long-form prose (founder notes, pain headlines, FAQ answers, body paragraphs) where the founder voice depends on them. The ban exists to keep designer flourishes out of UI; it does not exist to gut the writing.
