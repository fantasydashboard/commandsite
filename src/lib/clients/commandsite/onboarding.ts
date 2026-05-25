/**
 * Customer-onboarding checklist + SLA definitions.
 *
 * Single source of truth for "what has to happen in this stage" and
 * "what's the target time to complete it." The Kanban + Today page +
 * Onboarding drawer all read from here.
 *
 * Each task is a derived state — it reads from cs_customers columns
 * rather than being stored as its own row. That keeps the database
 * model simple and lets the operator see at a glance: "this stage is
 * 3/5 done." Adding a new task means adding a row here + (if needed)
 * a backing column to cs_customers.
 *
 * Task statuses:
 *   • done       — the backing column says it happened (timestamp present)
 *   • blocking   — the task is required to advance the stage, not yet done
 *   • optional   — nice-to-have, doesn't block advancement
 *
 * SLAs are wall-clock days from stage_entered_at. When a stage exceeds
 * its SLA, the kanban card turns yellow at SLA-2 and red at SLA. The
 * Today page surfaces customers in any breached stage as a sign-off prompt.
 */
import type { Customer, OnboardingStage } from './customersApi'

export type TaskStatus = 'done' | 'blocking' | 'optional'

export interface OnboardingTask {
  key: string
  label: string
  description: string
  /** True if the operator has to click something to mark this done.
   *  False if it gets set automatically by a webhook or trigger. */
  manual: boolean
  /** If true, the stage cannot advance until this task is done. */
  required: boolean
  /** Derive the task's current status from the customer row. */
  status: (c: Customer) => TaskStatus
  /** Pull the "done at" timestamp so the UI can show "marked 2d ago." */
  doneAt: (c: Customer) => string | null
  /** Optional CTA label (button text) for the manual action. */
  actionLabel?: string
}

export interface StageDefinition {
  stage: OnboardingStage
  /** Target days from stage_entered_at to complete + advance. */
  slaDays: number
  /** Plain-English description shown in the drawer header. */
  goal: string
  tasks: OnboardingTask[]
}

// ── Task helpers ─────────────────────────────────────────────────────

/** Mark done iff the timestamp field is non-null. */
function timestampTask(field: keyof Customer): (c: Customer) => TaskStatus {
  return (c) => (c[field] != null ? 'done' : 'blocking')
}

function timestampValue(field: keyof Customer): (c: Customer) => string | null {
  return (c) => (c[field] as string | null) ?? null
}

// ── Per-stage definitions ────────────────────────────────────────────

export const STAGE_DEFINITIONS: StageDefinition[] = [
  {
    stage: 'signed',
    slaDays: 5,
    goal: 'Convert the verbal yes into a signed contract + scheduled kickoff.',
    tasks: [
      {
        key: 'welcome_sent',
        label: 'Welcome email sent',
        description: 'The deal-won-handoff function fires this automatically when a deal closes. Manually fireable for seeded test customers.',
        manual: true,
        required: false,
        actionLabel: 'Send welcome email',
        status: timestampTask('welcome_sent_at'),
        doneAt: timestampValue('welcome_sent_at'),
      },
      {
        key: 'contract_sent',
        label: 'Contract sent to customer',
        description: 'Upload the contract PDF or paste the e-sign link, mark sent.',
        manual: true,
        required: true,
        actionLabel: 'Mark contract sent',
        status: (c) => {
          if (c.contract_status === 'sent' || c.contract_status === 'signed') return 'done'
          return 'blocking'
        },
        doneAt: timestampValue('contract_sent_at'),
      },
      {
        key: 'contract_signed',
        label: 'Contract signed by customer',
        description: 'Customer countersigned. Triggers the invoice-send prompt next.',
        manual: true,
        required: true,
        actionLabel: 'Mark contract signed',
        status: (c) => (c.contract_status === 'signed' ? 'done' : 'blocking'),
        doneAt: timestampValue('contract_signed_at'),
      },
      {
        key: 'kickoff_scheduled',
        label: 'Kickoff call scheduled',
        description: 'Pick a 45-min window with the customer to walk through their setup.',
        manual: true,
        required: false,
        actionLabel: 'Schedule kickoff',
        status: timestampTask('kickoff_call_scheduled_at'),
        doneAt: timestampValue('kickoff_call_scheduled_at'),
      },
    ],
  },

  {
    stage: 'paid',
    slaDays: 7,
    goal: 'Payment in hand; discovery + kickoff in motion.',
    tasks: [
      {
        key: 'payment_received',
        label: 'First payment received',
        description: 'Stripe webhook will flip this automatically once wired. Until then, mark manually after invoicing.',
        manual: true,
        required: true,
        actionLabel: 'Mark payment received',
        status: timestampTask('payment_received_at'),
        doneAt: timestampValue('payment_received_at'),
      },
      {
        key: 'discovery_brief_sent',
        label: 'Discovery brief sent to customer',
        description: 'Generates a unique URL and emails the customer the link. They fill it out async.',
        manual: true,
        required: true,
        actionLabel: 'Send discovery brief',
        status: timestampTask('discovery_brief_sent_at'),
        doneAt: timestampValue('discovery_brief_sent_at'),
      },
      {
        key: 'kickoff_completed',
        label: 'Kickoff call completed',
        description: '45-min walkthrough with the customer. Mark complete after.',
        manual: true,
        required: false,
        actionLabel: 'Mark kickoff complete',
        status: timestampTask('kickoff_call_completed_at'),
        doneAt: timestampValue('kickoff_call_completed_at'),
      },
    ],
  },

  {
    stage: 'discovery',
    slaDays: 5,
    goal: 'Voice + ICP + role priorities captured. Ready to build their tenant.',
    tasks: [
      {
        key: 'discovery_returned',
        label: 'Discovery brief returned',
        description: 'Customer completed and submitted the discovery form. Auto-set when they hit submit.',
        manual: false,
        required: true,
        status: timestampTask('discovery_brief_returned_at'),
        doneAt: timestampValue('discovery_brief_returned_at'),
      },
      {
        key: 'voice_profile',
        label: 'Voice profile built',
        description: 'Distill discovery answers + sample emails into Ada/Grace voice prompt.',
        manual: true,
        required: true,
        actionLabel: 'Mark voice profile done',
        status: timestampTask('voice_profile_built_at'),
        doneAt: timestampValue('voice_profile_built_at'),
      },
    ],
  },

  {
    stage: 'provisioned',
    slaDays: 5,
    goal: 'Tenant exists. Theme, modules, OAuth wired. Ready for shadow.',
    tasks: [
      {
        key: 'tenant_provisioned',
        label: 'Tenant slug + theme + modules provisioned',
        description: 'Created their client config, added theme, enabled the right modules per discovery.',
        manual: true,
        required: true,
        actionLabel: 'Mark tenant provisioned',
        status: timestampTask('tenant_provisioned_at'),
        doneAt: timestampValue('tenant_provisioned_at'),
      },
    ],
  },

  {
    stage: 'shadow',
    slaDays: 14,
    goal: 'Ada/Grace drafts only. Customer reviews + approves enough to trust live mode.',
    tasks: [
      {
        key: 'shadow_started',
        label: 'Shadow mode started',
        description: 'Drafts are being generated; nothing is sending automatically yet.',
        manual: true,
        required: true,
        actionLabel: 'Start shadow mode',
        status: timestampTask('shadow_started_at'),
        doneAt: timestampValue('shadow_started_at'),
      },
      {
        key: 'drafts_threshold',
        label: '10+ drafts approved by customer',
        description: 'Customer signed off on at least 10 drafts during shadow. Required to advance to live.',
        manual: false,
        required: true,
        status: (c) => (c.shadow_drafts_approved_count >= 10 ? 'done' : 'blocking'),
        // No timestamp for this; it ticks up via approvals.
        doneAt: () => null,
      },
    ],
  },

  {
    stage: 'live',
    slaDays: 7,
    goal: 'Auto-sends are firing. Verify a clean week before activating.',
    tasks: [
      {
        key: 'live_started',
        label: 'Live mode started',
        description: 'Flipped auto-approve on. Real sends going out under SLA monitoring.',
        manual: true,
        required: true,
        actionLabel: 'Start live mode',
        status: timestampTask('live_started_at'),
        doneAt: timestampValue('live_started_at'),
      },
    ],
  },
]

// ── Derived helpers ──────────────────────────────────────────────────

export function stageDefinition(stage: OnboardingStage): StageDefinition {
  const def = STAGE_DEFINITIONS.find((s) => s.stage === stage)
  if (!def) throw new Error(`Unknown stage: ${stage}`)
  return def
}

export interface StageProgress {
  stage: OnboardingStage
  done: number
  total: number
  blockers: OnboardingTask[]
  slaDays: number
  daysInStage: number
  /** SLA status: ok (under SLA), warning (within 2 days of SLA), breach (past SLA). */
  slaStatus: 'ok' | 'warning' | 'breach'
}

export function computeProgress(customer: Customer): StageProgress | null {
  if (!customer.onboarding_stage) return null
  const def = stageDefinition(customer.onboarding_stage)
  const required = def.tasks.filter((t) => t.required)
  const done = required.filter((t) => t.status(customer) === 'done').length
  const blockers = required.filter((t) => t.status(customer) !== 'done')

  const daysInStage = customer.stage_entered_at
    ? Math.max(0, Math.floor((Date.now() - new Date(customer.stage_entered_at).getTime()) / 86_400_000))
    : 0

  let slaStatus: StageProgress['slaStatus']
  if (daysInStage >= def.slaDays) slaStatus = 'breach'
  else if (daysInStage >= def.slaDays - 2) slaStatus = 'warning'
  else slaStatus = 'ok'

  return {
    stage: customer.onboarding_stage,
    done,
    total: required.length,
    blockers,
    slaDays: def.slaDays,
    daysInStage,
    slaStatus,
  }
}

/** Customer needs operator action if any required task in their current
 *  stage is blocking AND that task is manual (operator can do something
 *  about it — vs. waiting on the customer). Used to populate the Today
 *  page "sign-offs" section. */
export function needsSignoff(customer: Customer): OnboardingTask[] {
  if (!customer.onboarding_stage) return []
  const def = stageDefinition(customer.onboarding_stage)
  return def.tasks.filter((t) => t.required && t.manual && t.status(customer) !== 'done')
}

/** Can this customer be advanced to the next stage? Returns either
 *  { ok: true } or { ok: false, blockers: [...] } so the UI can disable
 *  the Advance button + show why. */
export function canAdvance(customer: Customer): { ok: true } | { ok: false; blockers: OnboardingTask[] } {
  const progress = computeProgress(customer)
  if (!progress) return { ok: true }
  if (progress.blockers.length === 0) return { ok: true }
  return { ok: false, blockers: progress.blockers }
}
