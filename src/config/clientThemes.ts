/**
 * Per-client theme overrides.
 *
 * Returns a map of CSS-variable name → value (rgb component triple, no
 * `rgb()` wrapper, so Tailwind's <alpha-value> still composes). The
 * dashboard layout applies these as an inline style on the page wrapper
 * so the override is scoped to that client only — no global CSS leak.
 *
 * Each client also gets an optional wordmark used in place of the
 * CommandSite logo in the top header.
 */

export interface ClientTheme {
  /** Inline CSS-var overrides applied to the dashboard wrapper. */
  vars: Record<string, string>
  /** Display name shown next to the wordmark in the header chrome. */
  wordmark?: {
    text: string
    /** Tailwind font-weight class, default 'font-bold' */
    weight?: string
    /** Tailwind tracking class, default 'tracking-tight' */
    tracking?: string
    /** Subscript / suffix, e.g. "Heating & Air" */
    suffix?: string
  }
}

const CommandSiteDefault: ClientTheme = {
  vars: {},  // empty = use :root defaults
}

/**
 * Apex Heating & Air — keeps the CommandSite blue palette so charts,
 * kanban columns, and accents read consistently across tenants. Only
 * the wordmark is overridden to brand the header.
 */
const ApexTheme: ClientTheme = {
  vars: {},
  wordmark: {
    text: 'Apex',
    suffix: 'Heating & Air',
  },
}

/**
 * UFD Redesign — keeps the CommandSite blue palette so charts read
 * consistently with everything else; only the wordmark is overridden.
 */
const UfdRedesignTheme: ClientTheme = {
  vars: {},
  wordmark: {
    text: 'UFD',
    suffix: 'Ultimate Fantasy Dashboard',
  },
}

/**
 * Cornerstone Community Church — keeps the default blue palette
 * (warm + welcoming feels right for a church too) and overrides
 * the wordmark to brand the header.
 */
const CornerstoneTheme: ClientTheme = {
  vars: {},
  wordmark: {
    text: 'Cornerstone',
    suffix: 'Community Church',
  },
}

/**
 * Josh Personal — sage-green palette to set it apart from the
 * business surfaces (Ada/Grace blue). Calm + wellness vibe;
 * distinct enough Josh knows immediately he's in his personal
 * dashboard, not a customer's.
 *
 * The brand color is the tonal anchor — bg-brand, text-brand,
 * border-brand all flow from this. Chrome stays default so the
 * header doesn't clash with the sage accents.
 */
const JoshPersonalTheme: ClientTheme = {
  vars: {
    '--color-brand': '106 142 95',         // sage green
    '--color-brand-hover': '86 122 75',    // deeper on hover
    '--color-brand-active': '66 102 55',   // pressed
  },
  wordmark: {
    text: 'Josh',
    suffix: 'Personal',
  },
}

export const clientThemes: Record<string, ClientTheme> = {
  'apex-heating-and-air': ApexTheme,
  'ufd-redesign': UfdRedesignTheme,
  'cornerstone-church': CornerstoneTheme,
  'josh-personal': JoshPersonalTheme,
}

export function themeForClient(slug: string | undefined | null): ClientTheme {
  if (!slug) return CommandSiteDefault
  return clientThemes[slug] ?? CommandSiteDefault
}
