# Product

Context for the **Focal Point Church website**, not for CommandSite. The repo root
`PRODUCT.md` describes CommandSite's own marketing surfaces (Ada and Grace, buyers
evaluating an AI employee, founder-direct voice). Designing a church website
against that doc produces confident, wrong work: a church homepage must not sound
like a founder selling software.

Load with `IMPECCABLE_CONTEXT_DIR=sites/focal-point-church`.

## Register

brand

Design is the deliverable here, not a tool serving one. Every surface is a
first impression for someone deciding whether to walk into a building full of
strangers.

## Users

**Ashley, first-time visitor. The one the site is for.**
New to the south Orlando area, or has been meaning to try church for months.
Reading on her phone on a Saturday night, or in a parked car on Sunday morning.
She wants three facts in under thirty seconds: when, where, and what happens to
my kids. Everything else on the page competes with those three. She will not
call the office, will not fill out a form, and will not click through four pages.
If she cannot picture walking in, she does not come.

**Mariana, Portuguese-speaking newcomer. Roughly a third of the church.**
Brazilian, often recently arrived in Florida. The 6pm Sunday service is in
Portuguese with English translation on wireless earpieces. She is deciding
whether this is a real Brazilian congregation or an English church with a
translated page. Her English may be fine, or it may not be; either way, being
addressed in Portuguese is the difference between a service she attends and a
service she is accommodated at. She has a named pastor: Vinny Costa, Associate
and Brazilian Ministry Pastor.

**Diane, existing member. Third priority, and cheap to serve.**
Looking up one thing: a sermon she missed, an event date, the giving link. She
already knows the church. She needs speed, not persuasion, and she should never
be the reason the first-time visitor's path gets cluttered.

Explicitly NOT a user: the volunteer or staff member doing church admin. That
work lives in Planning Center and Church Center, not on the public site.

## Product Purpose

Get a first-time guest through the doors and to the Starting Point table.

Success is measurable, which is unusual for a church website: first-time guests
enter a Starting Point workflow in Planning Center, and CommandSite already reads
that pipeline. The site's contribution can be counted rather than asserted.

1. Ashley learns when, where, and what happens to her kids without hunting.
2. Mariana sees a congregation that speaks to her, not one that translates for her.
3. Both arrive already knowing what the room will be like.

Anti-success: the site is accurate but stale, and a real public event (a grief
support group, a family night) is happening this week with no trace of it online.

## Brand Personality

**Three words: warm, unpretentious, genuinely multicultural.**

Taken from the church's own language, not invented for them.

- **Voice:** plain, welcoming, a little informal. "Come as you are" is on-tone.
  "A casual, come-as-you-are environment, so relax, be yourself, and feel at
  home" is their own copy and it is exactly right. Corporate uplift is off-tone
  instantly, and so is the polished megachurch register.
- **Load-bearing language, do not touch:** *Difference Makers*, *ordinary people*,
  *Starting Point*. These are the church's own terms and carry real meaning
  internally.
- **Their best sentence, currently buried on the Portuguese page:**
  "ENCONTRE AQUI A SUA FAMÍLIA NA AMÉRICA." Find your family here in America.
  It does emotional work no English headline on the site comes close to.
- **Multicultural is a fact, not a claim.** English at 9, 10:30, and 12 with
  Spanish translation at 10:30. Portuguese at 6pm with English translation.
  The site should look like a place where that is normal.
- **Visual personality:** photographs of the actual congregation, saturated
  color blocking, bold friendly geometric type. Energetic, not moody.

## Anti-references

- **Megachurch cinematic.** Dark moody hero, condensed all-caps, drone footage,
  a "brand" rather than a church.
- **Corporate SaaS.** The live risk, because CommandSite's own product doc pulls
  that direction. A church is not a startup and its pastor is not a founder.
- **Traditional denominational.** Serif, cream, stained glass, hushed. Wrong church.
- **Stock photography of strangers.** The current site has one: a MacBook on a
  carpet in the "Online" card, sitting between two photographs of real members.
  It is the only dishonest image on the page.
- **AI-generated sameness.** Identical card grids, gradient text, an icon plus
  heading plus paragraph repeated four times.

## Strategic Design Principles

1. **When, where, kids. In that order, above everything.** Every other decision
   loses to these three.
2. **Never bake text into an image.** Service times inside a JPEG cannot be read
   by a screen reader, indexed by Google, or changed without a designer. One rule
   fixes accessibility, search, and maintenance at once. The current site has
   service times in a 938KB JPEG.
3. **Portuguese is a first-class locale, not a translated page.** Correct `lang`
   attribute, Portuguese navigation and calls to action, Portuguese event titles.
   A page that declares itself English while containing Portuguese makes the
   browser offer to translate it, which is what happens today.
4. **Content that converts is never behind an accordion.** Preferred parking,
   90-minute services, casual dress, kids check-in. The current site has all of
   it, correct and well written, collapsed behind eight closed rows.
5. **Anything with a date comes from Planning Center.** The church already
   maintains a `visible_in_church_center` flag on 2,800+ events. Retyping events
   into the website is how the website goes stale, and it already has.
6. **The design is an asset. Preserve it.** Their palette, type, and section
   rhythm are good and above average for the category. The problems are
   maintenance-layer, not taste. Any rebuild that arrives looking different has
   lost the argument it was making.

## Accessibility

- **Bilingual PT/EN with correct `lang`** on the document and on any mixed-language
  fragment. Non-negotiable; it is the headline defect today.
- **WCAG AA contrast.** The current site fails in three specific places: the
  script tagline over the hero photograph, ministry card text sitting directly on
  faces, and text baked into flyer JPEGs.
- **Real text, never text inside images.** See principle 2.
- **Mobile first.** The first-time visitor is on a phone on a Saturday night.
- **Multigenerational.** A congregation of roughly a thousand with plenty of
  members over sixty. No small type, no low-contrast grey on grey.
- **Spanish is deliberately not a third locale.** In-service translation is a
  fact to state, not a language to maintain. Adding it would mean a third copy of
  every page that nobody keeps current.
