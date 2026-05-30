// CommandSite · Calendly link resolver (shared)
// ---------------------------------------------------------------------------
// One source of truth for "which discovery-call booking link does this
// prospect get." The reply drafters (classify-manual-reply, draft-reply)
// and any other function that proposes a meeting resolve the link here
// instead of hardcoding it, so a wrong link never goes out in an email.
//
// Model (matches the cs_settings columns):
//   - church / ministry  → cs_settings.calendly_link_grace  (Grace)
//   - everything else     → cs_settings.calendly_link        (Ada)
//
// Only one Ada vertical runs at a time during validation, so calendly_link
// holds that vertical's link. Switching niche = update calendly_link, no
// code change. The hardcoded fallbacks only apply when the settings row is
// empty; the Ada fallback is the current active vertical (bath/kitchen) so
// the right link still goes out even before settings are filled in.

export interface CalendlyLinkSettings {
  calendly_link?: string | null
  calendly_link_grace?: string | null
}

// Active Ada vertical fallback (bath/kitchen). Update if the active vertical
// changes and cs_settings.calendly_link hasn't been set yet.
const FALLBACK_ADA = 'https://calendly.com/josh-commandsite/bath-kitchen-walkthrough'
const FALLBACK_CHURCH = 'https://calendly.com/josh-commandsite/30-min-discovery-church-walkthrough'

export function calendlyLinkForIndustry(
  industry: string | null | undefined,
  settings: CalendlyLinkSettings | null | undefined,
): string {
  const i = (industry ?? '').toLowerCase()
  const s = settings ?? {}

  if (i.includes('church') || i.includes('ministry')) {
    return s.calendly_link_grace || s.calendly_link || FALLBACK_CHURCH
  }
  return s.calendly_link || FALLBACK_ADA
}
