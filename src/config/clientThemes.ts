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
 * Heritage Bath & Kitchen Co. — bath/kitchen remodeler vertical demo.
 * Keeps Ada's brand blue palette so the visual identity is consistent
 * across all Ada-persona dashboards. Wordmark distinguishes this demo
 * from Apex (HVAC) — both are Ada, different verticals.
 */
const HeritageBathTheme: ClientTheme = {
  vars: {},
  wordmark: {
    text: 'Heritage',
    suffix: 'Bath & Kitchen Co.',
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
 * Focal Point Church (Orlando, FL), Grace customer #1. Inherits the
 * default Grace blue palette (same as Cornerstone) for now. A distinct
 * brand color can be set here later via the rgb-triple CSS vars.
 */
const FocalPointChurchTheme: ClientTheme = {
  vars: {},
  wordmark: {
    text: 'Focal Point',
    suffix: 'Church',
  },
}

/**
 * Josh Personal — fresh teal-green (matches the "ON TRACK" success
 * accent) instead of the original muted hunter green. Brighter,
 * more "alive" feel for a wellness dashboard. Distinct from Ada/Grace
 * blue so Josh knows immediately he's in his personal surface.
 */
const JoshPersonalTheme: ClientTheme = {
  vars: {
    '--color-brand': '14 165 160',         // teal-emerald (#0EA5A0)
    '--color-brand-hover': '12 145 140',   // deeper on hover
    '--color-brand-active': '10 125 120',  // pressed
  },
  wordmark: {
    text: 'Sage',
    suffix: 'Personal',
  },
}

export const clientThemes: Record<string, ClientTheme> = {
  'apex-heating-and-air': ApexTheme,
  'heritage-bath': HeritageBathTheme,
  'ultimate-fantasy-dashboard': UfdRedesignTheme,
  'cornerstone-church': CornerstoneTheme,
  'focal-point-church': FocalPointChurchTheme,
  'josh-personal': JoshPersonalTheme,
}

export function themeForClient(slug: string | undefined | null): ClientTheme {
  if (!slug) return CommandSiteDefault
  return clientThemes[slug] ?? CommandSiteDefault
}
