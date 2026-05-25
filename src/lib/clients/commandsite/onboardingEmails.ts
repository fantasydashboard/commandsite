/**
 * Onboarding email templates.
 *
 * Static templates for the customer-facing emails the operator triggers
 * from the Onboarding Drawer:
 *
 *   • discovery_brief     — sent when operator clicks "Send Discovery Brief"
 *   • kickoff_confirmation — sent when operator schedules the kickoff
 *   • shadow_started       — sent when operator starts shadow mode
 *   • live_activated       — sent when operator flips to live
 *
 * Pure functions — no side effects, no DB calls. Render to { subject, body }
 * given a customer + context. The drawer renders the result into a preview
 * modal so the operator can read the email before sending; on confirm,
 * the same rendered content goes to gmail-send.
 *
 * Templates use plain text (Gmail renders fine). Plain text also means we
 * can't paste HTML — links go as bare URLs. That's appropriate for the
 * "Ada/Grace is a coworker" voice.
 *
 * No em dashes (per CLAUDE.md microcopy ban) — use commas, periods,
 * parentheses, or sentence breaks.
 */
import type { Customer } from './customersApi'

export type OnboardingEmailKey =
  | 'discovery_brief'
  | 'kickoff_confirmation'
  | 'shadow_started'
  | 'live_activated'

export interface EmailContent {
  subject: string
  body: string
}

export interface EmailContext {
  /** Public-facing host (e.g., 'https://commandsite.io'). Defaults to current origin in browser. */
  origin?: string
  /** Discovery brief token, required when key === 'discovery_brief'. */
  discoveryToken?: string
  /** Kickoff date, required when key === 'kickoff_confirmation'. */
  kickoffAt?: string
  /** Sender name + sign-off — defaults to "Josh / CommandSite". */
  senderName?: string
}

/** Pick the primary contact's first name for greeting. Falls back to "team". */
function firstName(customer: Customer): string {
  const primary = customer.contacts.find((c) => c.primary) ?? customer.contacts[0]
  if (!primary?.name) return 'team'
  return primary.name.trim().split(/\s+/)[0]
}

function personaName(customer: Customer): string {
  if (customer.persona_name_override) return customer.persona_name_override
  return customer.persona_type === 'grace' ? 'Grace' : 'Ada'
}

function senderSig(ctx: EmailContext): string {
  return ctx.senderName ?? 'Josh\nCommandSite'
}

// ── Templates ───────────────────────────────────────────────────────

function renderDiscoveryBrief(c: Customer, ctx: EmailContext): EmailContent {
  if (!ctx.discoveryToken) throw new Error('discoveryToken required for discovery_brief template')
  const origin = ctx.origin ?? (typeof window !== 'undefined' ? window.location.origin : 'https://commandsite.io')
  const link = `${origin}/onboarding/discovery/${ctx.discoveryToken}`
  const persona = personaName(c)
  const first = firstName(c)

  const subject = `Quick discovery brief so ${persona} can get to work for ${c.org_name}`

  const body = `Hey ${first},

Welcome aboard. Before our kickoff call, I'd love for you to spend ~20 minutes on the discovery brief below. This is how ${persona} learns your voice, your services, and the things you want her to know about your work.

Discovery brief:
${link}

What you'll cover:
1. Your voice and tone (so ${persona} sounds like you, not like a chatbot)
2. The services you offer and your ideal customer
3. What ${persona} should NOT say (competitors, banned phrases, etc.)
4. Which roles you want ${persona} to take first

The more specific you are, the better ${persona} will sound on day one. Don't worry about formatting or sounding polished. Plain language is what we want.

Once you submit, I'll review your answers, then we'll do the kickoff call to walk through anything I want to dig deeper on. From there it's about two weeks until ${persona} is sending real emails on your behalf.

Reply to this email with any questions.

${senderSig(ctx)}`

  return { subject, body }
}

function renderKickoffConfirmation(c: Customer, ctx: EmailContext): EmailContent {
  if (!ctx.kickoffAt) throw new Error('kickoffAt required for kickoff_confirmation template')
  const persona = personaName(c)
  const first = firstName(c)
  const when = new Date(ctx.kickoffAt)
  const dateLabel = when.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
  const timeLabel = when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  const subject = `Confirmed: kickoff call for ${c.org_name} on ${dateLabel}`

  const body = `Hey ${first},

Confirming our kickoff call for ${c.org_name}:

When: ${dateLabel} at ${timeLabel}
Length: ~45 minutes
Where: I'll send a Zoom link the morning of.

Here's what we'll cover:

1. Walk through your discovery brief together so I know I read it the way you meant it.
2. Demo of your dashboard with ${persona}'s named roles enabled. You'll see what she's set up to do.
3. Connect Gmail (so ${persona} can send on your behalf) and any other integrations you need from day one.
4. Agree on the shadow-mode review cadence for the first two weeks. Daily at first, then weekly.

If you haven't filled out the discovery brief yet, please do that before the call. Otherwise we'll spend the time on that instead of on the fun stuff.

See you ${dateLabel.split(',')[0]}.

${senderSig(ctx)}`

  return { subject, body }
}

function renderShadowStarted(c: Customer, ctx: EmailContext): EmailContent {
  const persona = personaName(c)
  const first = firstName(c)

  const subject = `${persona} is drafting for ${c.org_name}. Review starts today.`

  const body = `Hey ${first},

${persona} just started drafting for ${c.org_name}. She's in shadow mode for the next two weeks, which means:

She drafts every email she'd normally send, but nothing fires until you approve it.
You review the drafts (daily at first) and tell her what's working and what to change.
We tune her voice and her judgment in real time based on what you flag.

Your dashboard:
${ctx.origin ?? (typeof window !== 'undefined' ? window.location.origin : 'https://commandsite.io')}/dashboard/${c.slug}

The first batch of drafts is waiting. Spend 15 minutes today walking through them with me, then we'll set a daily review window that fits your schedule for the next two weeks.

After shadow, ${persona} goes live (auto-sends within the guardrails we set). You can always flip back to shadow if you want her sleeping on a particular thing.

Reply with a good time for the first review.

${senderSig(ctx)}`

  return { subject, body }
}

function renderLiveActivated(c: Customer, ctx: EmailContext): EmailContent {
  const persona = personaName(c)
  const first = firstName(c)

  const subject = `${persona} is live for ${c.org_name}`

  const body = `Hey ${first},

${persona} just went live for ${c.org_name}. Real sends, real replies, no more "are you sure?" prompts on every draft.

What that means:
${persona} fires emails within the guardrails we set (send window, daily cap, paused-on-reply).
You'll see everything in the Conversations tab on your dashboard. Outbound on the left, inbound on the right.
If someone replies, ${persona} pauses the sequence so you can respond personally.

Your dashboard:
${ctx.origin ?? (typeof window !== 'undefined' ? window.location.origin : 'https://commandsite.io')}/dashboard/${c.slug}

For the first week, I'll check in daily. After that we move to weekly. Any time you want to look over her shoulder, the dashboard is honest about what she's doing and why.

Congratulations on getting her hired.

${senderSig(ctx)}`

  return { subject, body }
}

// ── Public API ──────────────────────────────────────────────────────

const RENDERERS: Record<OnboardingEmailKey, (c: Customer, ctx: EmailContext) => EmailContent> = {
  discovery_brief: renderDiscoveryBrief,
  kickoff_confirmation: renderKickoffConfirmation,
  shadow_started: renderShadowStarted,
  live_activated: renderLiveActivated,
}

export function renderEmail(
  key: OnboardingEmailKey,
  customer: Customer,
  context: EmailContext = {},
): EmailContent {
  return RENDERERS[key](customer, context)
}

export const EMAIL_LABELS: Record<OnboardingEmailKey, string> = {
  discovery_brief: 'Discovery brief invite',
  kickoff_confirmation: 'Kickoff call confirmation',
  shadow_started: 'Shadow mode started',
  live_activated: 'Live activation announcement',
}
