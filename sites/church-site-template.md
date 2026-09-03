# Church site template

The fixed page set every church gets. Theming varies per church; structure does
not. This file is the product boundary: if a church needs something not in here,
the answer is either "no" or "I build the block and every church gets it."
One-off structure per church turns this back into an agency.

## Nav

```
Home · About · Messages · Events · Connect ▾ · [Give]        [Português]
                                    Kids
                                    Youth
                                    Groups
                                    (more, per church)
```

- **Give** is an external link, never a page. Focal Point's goes to Church Center.
  Zero maintenance, no payment surface to inherit.
- **Language** is a nav item, not a corner toggle, for churches that need it.
  Optional per church; absent entirely for monolingual ones.

## Pages

### 1. Home

Ordered for a first-time visitor, and the order is the product. See "Themeable"
below: sections can be hidden but not reordered.

| # | Section | Source |
|---|---|---|
| 1 | Hero: headline, image, **Plan your visit** | Block |
| 2 | Service times, address, translation notes | Block |
| 3 | Most recent sermon | YouTube |
| 4 | Connect: Kids, Youth, Groups | Ministry pages |
| 5 | This week's events | Planning Center |
| 6 | Footer: address, times, contact, socials | Block |

### 2. Plan your visit

Not in the original sketch but it has to exist, because the hero links to it and
it is the highest-converting page on most church sites. Focal Point's current one
is the best page they have.

| Section | Source |
|---|---|
| Hero | Block |
| What to expect: 6 items, rendered **open**, never an accordion | Block |
| Service times and address | Block (shared) |
| Kids check-in and secure pickup | Block |
| What happens when you arrive | Block |

### 3. About

| Section | Source |
|---|---|
| Who they are, their story | Block |
| Core values and mission | Block |
| Staff | Block |
| Last 3 messages | YouTube |
| Closes on Plan your visit | Block (shared) |

Ending on the visit CTA is right: someone who reads the About page is deciding.

### 4. Messages

| | |
|---|---|
| Grid, 9 per page, paginated | YouTube |
| Filter by **series** and by **speaker** | Records, not free text |
| Each card: thumbnail, title, date, speaker, series | YouTube + review queue |

Filters matter more than search. Focal Point's existing archive already does this
and it is genuinely the best thing on their site. Do not regress it.

### 5. Events

| | |
|---|---|
| Upcoming list, dated | Planning Center |
| Filtered to `visible_in_church_center` | Planning Center |
| Recurring internal items excluded | Exclusion rule |

### 6. Ministry pages (Kids, Youth, Groups, and any others)

**One template, many instances.** Otherwise every ministry is bespoke and the
template stops being a template.

| Section | Source |
|---|---|
| Hero: name, image | Block |
| Who it's for, ages or stage | Block |
| When and where it meets | Block |
| Leader name, photo, contact | Block |
| Primary action (register, join a group, contact) | Block |
| Related events for this ministry | Planning Center, tagged |

## Where content comes from

The rule: **never build an editor for anything that already has an upstream
source.** Every church website dies because someone must remember to log into a
second system. Focal Point's Google Form died exactly this way.

| Content | Source | Effort |
|---|---|---|
| Events | Planning Center, already curated with `visible_in_church_center` | None |
| Sermons | YouTube, titled `Title \| Series \| Speaker` | ~10s per sermon |
| Sermon thumbnails | `i.ytimg.com`, free | None |
| Everything else | Blocks with a few fields | Rare |

Sermons need a review step because roughly 40% of a church's YouTube feed is
podcast clips, duplicate livestreams, and promos. Pending → Add or Ignore, with
Ignore sticky. Parser pre-fills from the title convention; a human confirms.

## Themeable, and not

**Themeable per church**, through CSS custom properties on the root, the same
mechanism `clientThemes.ts` already uses for dashboards:

- Colour tokens: `ground`, `ink`, `mute`, `rule`, `accent`, `deep`
- Type pairing, chosen from a curated set, never an arbitrary font field
- Corner radius: sharp `0`, subtle `2px`, soft `12px`
- Logo, photography, all copy
- Sections shown or hidden
- Which ministry pages exist

**Fixed:**

- Page structure and section **order**
- Spacing scale, type scale, component design
- Nav shape

Order is not a style preference, it is the conversion logic. A church allowed to
reorder Home will put its capital campaign above its service times, which is
exactly the mistake Focal Point's current site makes with "The Time Is Now"
sitting in the primary nav ahead of everything a visitor needs.

Hide-yes, reorder-no is the compromise that survives contact with a real pastor.

## Presets

Three, so the choice is a decision rather than a design project.

| Preset | Ground | Type | Radius | Reads as |
|---|---|---|---|---|
| **Sharp** | near-white, one dark section | heavy grotesque | 0 | modern, urban, confident |
| **Warm** | bone, sand | grotesque + serif accent | 12px | multigenerational, family |
| **Bold** | saturated colour blocks | heavy geometric sans | 20px | energetic, close to Focal Point's current identity |

## Deliberately excluded

- Page builder, drag and drop, arbitrary layout
- Per-church custom sections
- Self-hosted video. A 60 minute sermon is 1 to 2GB and streaming bandwidth is
  where hosting costs actually explode. Video stays on YouTube. If a church asks,
  the answer is no.
- Blog. Nobody reads it and someone has to write it.
- A members area. That is Church Center's job and they already have it.
