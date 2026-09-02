---
name: Focal Point Church
description: Visual system for the Focal Point Church website, documented from the existing live site rather than invented. Warm, saturated, photo-forward, multicultural.
colors:
  amber: "#f9b418"
  teal: "#006973"
  plum: "#8d6a89"
  navy: "#17242a"
  ink: "#0f0f0f"
  stone: "#666b68"
  paper: "#ffffff"
typography:
  display: Metropolis
  body: Metropolis
  scale: 1.333
components:
  - color-block section
  - amber pill button
  - photo card with scrim
  - open fact list
  - live event card
---

# Overview

This system was **documented from the existing focalpointchurch.com, not designed
from scratch.** That is deliberate. The church's visual identity is coherent and
above average for the category, and the case for rebuilding rests on maintenance
and the broken Portuguese layer, not on taste. A rebuild that arrives looking
different has undermined its own argument.

So the rules below describe what is already there, plus the specific corrections
where the current implementation fails its own system.

The feel: warm, saturated, photo-forward, energetic. A room with the lights on
and people in it. Not a brand, not a production.

# Colors

Sampled from the live site's CSS.

| Token | Value | Role |
|---|---|---|
| `amber` | `#f9b418` | Primary action. Filled pills, always with dark text. |
| `teal` | `#006973` | Deep section ground. Latest message, what-to-expect. |
| `plum` | `#8d6a89` | Second section ground. Ministries. Carries a subtle grain. |
| `navy` | `#17242a` | Footer, deepest ground. |
| `ink` | `#0f0f0f` | Body text on light grounds. Near-black, not pure. |
| `stone` | `#666b68` | Secondary text. Warm grey, biased green, never a neutral grey. |
| `paper` | `#ffffff` | Light section ground. |

**Strategy: full palette.** Four named grounds, each used for a whole section, in
rotation. This is not an accent-on-neutral system; the color IS the structure.

**Amber is reserved.** It marks the single action of a section and nothing else.
Never a background, never a heading, never decorative.

# Typography

**Metropolis** throughout, a geometric sans. Display weights are heavy (700–800)
with tight tracking; body is regular with generous leading.

| Role | Treatment |
|---|---|
| Section display | 700–800, tight tracking, `text-wrap: balance` |
| Body | 400, 1.6 leading, capped near 65 characters |
| Eyebrow | 700, uppercase, `0.14em` tracking, small |
| Data | tabular figures wherever times or dates align |

**The script face is retired.** The current site sets its tagline, "Ordinary
People, Becoming Extraordinary Difference Makers," in a thin white script over a
bright photograph. It is the church's actual positioning line and the least
legible text on the site. The words stay; the script does not.

# Elevation

Nearly flat. Depth comes from color blocking, not shadow.

- Sections meet with a **large rounded corner transition** (roughly 40px), where
  one color ground overlaps the next. This is the signature move.
- Cards use rounded corners (16–20px) and no shadow, or the faintest possible.
- Photographs are rounded to match cards.

# Components

**Amber pill button.** Filled `amber`, `ink` text, fully rounded, with a chevron.
The only primary action style.

> The current site has **two** button systems and uses the weak one for its most
> important action. Thin white outlined circles carry "Plan your visit," "Join a
> Ministry Team," and the Portuguese "Plan Your Visit," while the strong amber
> pills carry secondary links. **The circles are retired.** Every primary action
> is an amber pill.

**Photo card with scrim.** Any text over a photograph sits on a gradient scrim
dark enough to clear AA. Without it, ministry card copy lands on faces and
becomes unreadable, which is what happens today.

**Open fact list.** The orientation facts (90 minutes, preferred parking, casual
dress, coffee, kids, translation) render open, as a plain list. Not an accordion.

**Live event card.** Date block, real text title, real text time. Reads from
Planning Center. Carries a small live-source marker.

# Do's and Don'ts

**Do**

- Lead with when, where, and kids, in real text, above everything else.
- Use photographs of the actual congregation.
- Let one saturated color own a whole section.
- Keep Portuguese fully first-class: navigation, buttons, and event titles.
- Set the document `lang` correctly, and mark mixed-language fragments.

**Don't**

- Bake text into an image. Service times currently live inside a 938KB JPEG.
- Put body copy directly on a photograph without a scrim.
- Use an outlined circle for a primary action.
- Collapse the content that converts behind an accordion.
- Expose calendar plugin chrome ("Previous Events", "Subscribe to calendar") on
  a homepage.
- Use stock photography. The one stock image on the site, a laptop on a carpet,
  sits between two photographs of real members and reads as false.
