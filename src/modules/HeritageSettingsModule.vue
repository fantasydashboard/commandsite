<script setup lang="ts">
/**
 * Heritage Bath & Kitchen Co. — Settings tab.
 *
 * Post-impeccable-critique rebuild. Answers four real questions a
 * bath/kitchen owner asks of Settings:
 *
 *   1. Is Ada set up correctly? (Setup health at the top)
 *   2. Will Ada sound like me? (Team + voice training)
 *   3. What does Ada do without asking? (Automation rules)
 *   4. What's connected, what's broken? (Integrations health)
 *
 * Plus plan/billing and hours.
 *
 * Format: cards grouped by section. Each card shows CURRENT STATE
 * clearly, with action affordances where edits would happen in
 * production. Demo-real for prospect walkthroughs.
 */
import { computed } from 'vue'
import type { Client } from '@/types/database'
import { businessInfo, businessHours, integrations } from '@/lib/clients/heritage/settings'
import { fmtMoney } from '@/lib/clients/heritage/format'

defineProps<{ client: Client; config: Record<string, unknown> }>()

// ── Setup health ──────────────────────────────────────────────────────
// Real Heritage is fully configured but one optional polish item remains.
// Shows up as warn-tinted at the top so Marc sees what could be tighter.
interface SetupItem {
  id: string
  label: string
  status: 'done' | 'attention' | 'pending'
  note?: string
}

const setupItems: SetupItem[] = [
  { id: 'profile', label: 'Business profile complete', status: 'done' },
  { id: 'team', label: 'Team roster configured', status: 'done' },
  { id: 'voice-marc', label: 'Marc\'s voice profile (12 samples)', status: 'done' },
  { id: 'voice-carmen', label: 'Carmen\'s voice profile (4 samples)', status: 'done' },
  { id: 'integrations', label: 'Critical integrations connected (5 of 6)', status: 'done' },
  { id: 'automation', label: 'Automation rules calibrated', status: 'done' },
  { id: 'hours', label: 'Send window configured', status: 'done' },
  { id: 'voice-tighten', label: 'Add 3 more voice samples from Marc to tighten calibration', status: 'attention', note: 'Ada catches your patterns well at 12 samples. 15+ samples drops draft-edit rate to under 10%.' },
  { id: 'buildertrend', label: 'Buildertrend integration', status: 'pending', note: 'On the roadmap for Q3 — not blocking anything.' },
]

const doneCount = computed(() => setupItems.filter((i) => i.status === 'done').length)
const totalRelevant = computed(() => setupItems.filter((i) => i.status !== 'pending').length)
const configPct = computed(() => Math.round((doneCount.value / totalRelevant.value) * 100))
const attentionItems = computed(() => setupItems.filter((i) => i.status === 'attention'))

// ── Team voice profiles ───────────────────────────────────────────────
interface TeamVoice {
  name: string
  role: string
  startedYear: number
  voiceSamples: number
  voiceStatus: 'calibrated' | 'needs-more' | 'not-applicable'
  voiceNote: string
}

const teamVoice: TeamVoice[] = [
  {
    name: 'Marc Hatcher',
    role: 'Owner / Lead Designer',
    startedYear: 2014,
    voiceSamples: 12,
    voiceStatus: 'calibrated',
    voiceNote: 'Default voice for all outbound. 12 of your historical messages used to calibrate.',
  },
  {
    name: 'Diego Salinas',
    role: 'Lead Craftsman',
    startedYear: 2017,
    voiceSamples: 0,
    voiceStatus: 'not-applicable',
    voiceNote: "Diego doesn't write to customers directly. Ada never drafts as Diego — she just credits him by name in Marc's drafts.",
  },
  {
    name: 'Carmen Royce',
    role: 'Project Coordinator',
    startedYear: 2019,
    voiceSamples: 4,
    voiceStatus: 'calibrated',
    voiceNote: 'Carmen drafts schedule + permit comms in her own voice. 4 samples is enough for the cadence of messages she handles.',
  },
]

// ── Ada's automation rules ────────────────────────────────────────────
interface AutomationRule {
  label: string
  value: string
  detail: string
}

const automationRules: AutomationRule[] = [
  {
    label: 'Quote Chaser cadence',
    value: 'Day 1 · 3 · 7 · 14 · 30',
    detail: 'Escalating tone — soft check-in → phased options → graceful close. Each touch awaits your approval.',
  },
  {
    label: 'Approval threshold',
    value: 'Every message requires sign-off',
    detail: 'Manual approval on all outbound. No messages auto-send without you. Can be relaxed per-role once you have 30+ approved sends and trust calibrates.',
  },
  {
    label: 'Send window',
    value: 'Mon-Fri 8am-5pm · Sat by appointment',
    detail: 'Ada queues drafts outside hours; nothing actually sends until your window opens. Sunday is fully off.',
  },
  {
    label: 'Review-ask timing',
    value: '48 hours after final walkthrough',
    detail: 'Day 2 post-completion has the highest review-conversion rate for residential remodel (~38%).',
  },
  {
    label: 'Referral-ask trigger',
    value: '5★ review OR 7+ days post-completion',
    detail: 'Whichever comes first. Marc-approved $500 incentive for both referrer and friend.',
  },
  {
    label: 'Drift detection',
    value: 'Not enabled (no relevant data)',
    detail: 'Member-attendance drift detection is a church-specific role (Grace). For remodelers, Ada watches expansion candidates instead — see Customer Care tab.',
  },
]

// ── Notifications ─────────────────────────────────────────────────────
interface NotificationRoute {
  recipient: string
  channel: string
  events: string[]
}

const notifications: NotificationRoute[] = [
  {
    recipient: 'Marc · cell',
    channel: 'SMS to (813) 555-0100',
    events: ['Emergencies (after-hours inquiry, missed-on-site)', 'Day-of consultation reminders', 'High-value quote replies (>$25K)', 'Daily 7am brief'],
  },
  {
    recipient: 'Carmen · email',
    channel: 'carmen@heritagebathandkitchen.com',
    events: ['Weekly summary (Sunday 6pm)', 'Schedule conflicts', 'Permit-related items'],
  },
  {
    recipient: 'Diego · SMS',
    channel: 'SMS to Diego\'s cell',
    events: ['Same-day schedule changes', 'Crew-affecting weather reshuffles'],
  },
]

// ── Plan & billing ────────────────────────────────────────────────────
const plan = {
  tier: 'Pro',
  monthlyPrice: 89900, // cents — Founding Partner pricing
  status: 'Active',
  isFoundingPartner: true,
  lockedThrough: '2027',
  nextBilling: '2026-06-15',
  paymentMethod: 'Card ending in 4444',
  usageThisPeriod: {
    leadsScored: 47,
    draftsWritten: 142,
    newslettersSent: 1,
    referralAsksSent: 4,
  },
}

// ── Hours grid ────────────────────────────────────────────────────────
const days = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
] as const

// ── Helpers ───────────────────────────────────────────────────────────
function statusBadgeClass(status: string): string {
  if (status === 'done') return 'bg-success/15 text-success'
  if (status === 'attention') return 'bg-warn/15 text-warn'
  if (status === 'pending') return 'bg-ink-muted/15 text-ink-muted'
  if (status === 'calibrated') return 'bg-success/15 text-success'
  if (status === 'needs-more') return 'bg-warn/15 text-warn'
  if (status === 'not-applicable') return 'bg-ink-muted/15 text-ink-muted'
  if (status === 'connected') return 'bg-success/15 text-success'
  return 'bg-ink-muted/15 text-ink-muted'
}

function statusBadgeLabel(status: string): string {
  if (status === 'done') return 'Done'
  if (status === 'attention') return 'Attention'
  if (status === 'pending') return 'Pending'
  if (status === 'calibrated') return 'Calibrated'
  if (status === 'needs-more') return 'Needs more samples'
  if (status === 'not-applicable') return 'N/A'
  return status
}
</script>

<template>
  <div class="space-y-5">
    <header>
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-1">
        Settings
      </div>
      <h2 class="text-xl font-semibold text-ink">Heritage configuration</h2>
      <p class="text-sm text-ink-muted mt-1 max-w-2xl">
        Business profile, team voice training, Ada's automation rules, integrations, and billing — everything that shapes how Ada works for Heritage.
      </p>
    </header>

    <!-- ─── 1. Setup health — top-of-page action callout ─── -->
    <section
      class="card"
      :class="attentionItems.length > 0 ? 'border-warn/30 bg-warn/[0.03]' : 'border-success/30 bg-success/[0.03]'"
    >
      <header class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <div class="text-[10px] font-bold uppercase tracking-wider text-brand mb-1">Setup health</div>
          <h3 class="text-base font-semibold text-ink">
            Heritage is
            <span class="text-success tabular-nums">{{ configPct }}%</span>
            configured
          </h3>
          <p class="text-xs text-ink-muted mt-0.5">
            <strong class="text-ink tabular-nums">{{ doneCount }} of {{ totalRelevant }}</strong> setup items complete · {{ attentionItems.length }} optional polish item{{ attentionItems.length === 1 ? '' : 's' }}
          </p>
        </div>
      </header>

      <ul class="space-y-1.5">
        <li
          v-for="item in setupItems"
          :key="item.id"
          class="flex items-start gap-3 py-1.5 border-b border-divider/40 last:border-0"
        >
          <span
            class="text-[10px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 flex-shrink-0 mt-0.5"
            :class="statusBadgeClass(item.status)"
          >{{ statusBadgeLabel(item.status) }}</span>
          <div class="flex-1 min-w-0">
            <span class="text-[13px] text-ink">{{ item.label }}</span>
            <p v-if="item.note" class="text-[11px] text-ink-muted italic mt-0.5 leading-snug">{{ item.note }}</p>
          </div>
        </li>
      </ul>
    </section>

    <!-- ─── 2. Business profile ─── -->
    <section class="card">
      <header class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <h3 class="text-base font-semibold text-ink">Business profile</h3>
        <button type="button" class="text-xs text-brand font-semibold hover:underline">Edit</button>
      </header>
      <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <dt class="text-[10px] uppercase tracking-wider text-ink-muted">Business name</dt>
          <dd class="text-ink font-semibold mt-0.5">{{ businessInfo.name }}</dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-wider text-ink-muted">Owner</dt>
          <dd class="text-ink font-semibold mt-0.5">{{ businessInfo.ownerName }}</dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-wider text-ink-muted">Founded</dt>
          <dd class="text-ink font-semibold mt-0.5">{{ businessInfo.founded }}</dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-wider text-ink-muted">Phone</dt>
          <dd class="text-ink font-semibold mt-0.5 tabular-nums">{{ businessInfo.phone }}</dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-wider text-ink-muted">Email</dt>
          <dd class="text-ink font-semibold mt-0.5">{{ businessInfo.email }}</dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-wider text-ink-muted">Website</dt>
          <dd class="text-ink font-semibold mt-0.5">{{ businessInfo.website }}</dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="text-[10px] uppercase tracking-wider text-ink-muted">Service area</dt>
          <dd class="text-ink mt-0.5">{{ businessInfo.serviceArea.join(' · ') }}</dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="text-[10px] uppercase tracking-wider text-ink-muted">Licenses</dt>
          <dd class="text-ink mt-0.5">
            <ul class="list-disc pl-5 space-y-0.5">
              <li v-for="l in businessInfo.licenses" :key="l" class="text-[13px]">{{ l }}</li>
            </ul>
          </dd>
        </div>
      </dl>
    </section>

    <!-- ─── 3. Team + voice training ─── -->
    <section class="card">
      <header class="mb-3">
        <h3 class="text-base font-semibold text-ink">Team &amp; voice training</h3>
        <p class="text-xs text-ink-muted mt-0.5">
          Ada drafts in your team's voice — calibrated from samples of how each person actually writes. The more samples, the tighter the drafts.
        </p>
      </header>
      <ul class="space-y-3">
        <li
          v-for="member in teamVoice"
          :key="member.name"
          class="rounded-card border border-divider bg-surface-elevated p-3"
        >
          <div class="flex items-baseline justify-between gap-3 flex-wrap mb-1">
            <div class="flex items-baseline gap-2 flex-wrap">
              <span class="text-sm font-semibold text-ink">{{ member.name }}</span>
              <span class="text-[11px] text-ink-muted">{{ member.role }} · since {{ member.startedYear }}</span>
            </div>
            <span
              class="text-[10px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5"
              :class="statusBadgeClass(member.voiceStatus)"
            >{{ statusBadgeLabel(member.voiceStatus) }}</span>
          </div>
          <p class="text-[12px] text-ink-muted italic leading-snug">{{ member.voiceNote }}</p>
          <div v-if="member.voiceStatus !== 'not-applicable'" class="mt-2 flex items-center gap-3 text-[11px]">
            <span class="text-ink-muted">
              Voice samples: <strong class="text-ink tabular-nums">{{ member.voiceSamples }}</strong>
            </span>
            <button type="button" class="text-brand font-semibold hover:underline">Add samples</button>
            <button type="button" class="text-ink-muted hover:text-ink">Preview voice</button>
          </div>
        </li>
      </ul>
    </section>

    <!-- ─── 4. Ada's behavior — automation rules ─── -->
    <section class="card">
      <header class="mb-3">
        <h3 class="text-base font-semibold text-ink">Ada's behavior</h3>
        <p class="text-xs text-ink-muted mt-0.5">
          What Ada does automatically vs. what waits on your approval. Sane defaults — every outbound message requires your sign-off until you tell her otherwise.
        </p>
      </header>
      <ul class="space-y-2.5">
        <li
          v-for="rule in automationRules"
          :key="rule.label"
          class="flex items-start justify-between gap-4 py-2 border-b border-divider last:border-0"
        >
          <div class="flex-1 min-w-0">
            <div class="text-[13px] font-semibold text-ink">{{ rule.label }}</div>
            <p class="text-[11.5px] text-ink-muted leading-snug mt-0.5">{{ rule.detail }}</p>
          </div>
          <div class="text-right flex-shrink-0 flex items-center gap-3">
            <span class="text-[12.5px] font-semibold text-ink tabular-nums">{{ rule.value }}</span>
            <button type="button" class="text-xs text-brand font-semibold hover:underline">Edit</button>
          </div>
        </li>
      </ul>
    </section>

    <!-- ─── 5. Send window / hours ─── -->
    <section class="card">
      <header class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h3 class="text-base font-semibold text-ink">Send window</h3>
          <p class="text-xs text-ink-muted mt-0.5">
            When Ada actually sends messages to customers. She drafts 24/7; nothing leaves the queue outside these hours.
          </p>
        </div>
        <button type="button" class="text-xs text-brand font-semibold hover:underline">Edit</button>
      </header>
      <div class="grid grid-cols-7 gap-2 mb-3">
        <div
          v-for="day in days"
          :key="day.key"
          class="rounded-md border bg-surface-elevated p-2 text-center"
          :class="businessHours[day.key].open ? 'border-divider' : 'border-divider/40 opacity-50'"
        >
          <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{{ day.label }}</div>
          <div class="text-[11px] text-ink mt-1 tabular-nums">
            <template v-if="businessHours[day.key].open">
              {{ businessHours[day.key].open }} – {{ businessHours[day.key].close }}
            </template>
            <template v-else>
              Closed
            </template>
          </div>
        </div>
      </div>
      <p class="text-[11px] text-ink-muted italic">{{ businessHours.afterHoursCoverage }}</p>
    </section>

    <!-- ─── 6. Integrations health ─── -->
    <section class="card">
      <header class="mb-3">
        <h3 class="text-base font-semibold text-ink">Integrations</h3>
        <p class="text-xs text-ink-muted mt-0.5">
          External services Ada talks to. Last-sync timestamps in production — demo data is illustrative.
        </p>
      </header>
      <ul class="space-y-2">
        <li
          v-for="i in integrations"
          :key="i.name"
          class="flex items-start justify-between gap-3 py-2 border-b border-divider last:border-0"
        >
          <div class="flex-1 min-w-0">
            <div class="text-[13px] font-semibold text-ink">{{ i.name }}</div>
            <p class="text-[11.5px] text-ink-muted leading-snug mt-0.5">{{ i.note }}</p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <span
              class="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5"
              :class="i.status === 'connected' ? 'bg-success/15 text-success' : 'bg-warn/15 text-warn'"
            >{{ i.status }}</span>
            <button type="button" class="text-xs text-brand font-semibold hover:underline">
              {{ i.status === 'connected' ? 'Manage' : 'Connect' }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <!-- ─── 7. Notifications ─── -->
    <section class="card">
      <header class="mb-3">
        <h3 class="text-base font-semibold text-ink">Notifications</h3>
        <p class="text-xs text-ink-muted mt-0.5">
          Who hears what. Marc gets emergencies + daily brief; Carmen gets weekly + scheduling; Diego gets day-of-job changes only.
        </p>
      </header>
      <ul class="space-y-3">
        <li
          v-for="route in notifications"
          :key="route.recipient"
          class="rounded-card border border-divider bg-surface-elevated p-3"
        >
          <div class="flex items-baseline justify-between gap-3 flex-wrap mb-1">
            <span class="text-sm font-semibold text-ink">{{ route.recipient }}</span>
            <span class="text-[11px] text-ink-muted">{{ route.channel }}</span>
          </div>
          <ul class="text-[12px] text-ink-muted leading-relaxed list-disc pl-5">
            <li v-for="event in route.events" :key="event">{{ event }}</li>
          </ul>
        </li>
      </ul>
    </section>

    <!-- ─── 8. Plan & billing ─── -->
    <section class="card border-brand/20 bg-brand/[0.02]">
      <header class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <div class="text-[10px] font-bold uppercase tracking-wider text-brand mb-1">Plan &amp; billing</div>
          <h3 class="text-base font-semibold text-ink">
            Heritage is on
            <span class="text-brand">{{ plan.tier }}</span>
            <span class="text-success font-bold tabular-nums ml-1">{{ fmtMoney(plan.monthlyPrice) }}/mo</span>
          </h3>
          <p
            v-if="plan.isFoundingPartner"
            class="text-[11px] text-ink-muted mt-0.5 flex items-center gap-1.5"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-brand flex-shrink-0" aria-hidden="true"></span>
            Founding Partner pricing locked through {{ plan.lockedThrough }} · setup fee waived
          </p>
        </div>
        <button type="button" class="text-xs text-brand font-semibold hover:underline">Manage billing</button>
      </header>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <div class="rounded-card border border-divider bg-surface-raised p-3">
          <div class="text-[10px] uppercase tracking-wider text-ink-muted">Next billing</div>
          <div class="text-sm font-semibold text-ink mt-1 tabular-nums">{{ plan.nextBilling }}</div>
          <div class="text-[11px] text-ink-muted mt-1">{{ plan.paymentMethod }}</div>
        </div>
        <div class="rounded-card border border-divider bg-surface-raised p-3">
          <div class="text-[10px] uppercase tracking-wider text-ink-muted">Usage this period</div>
          <div class="text-[12px] text-ink mt-1 space-y-0.5">
            <div><strong class="tabular-nums">{{ plan.usageThisPeriod.leadsScored }}</strong> leads scored</div>
            <div><strong class="tabular-nums">{{ plan.usageThisPeriod.draftsWritten }}</strong> drafts written</div>
            <div><strong class="tabular-nums">{{ plan.usageThisPeriod.referralAsksSent }}</strong> referral asks sent</div>
            <div><strong class="tabular-nums">{{ plan.usageThisPeriod.newslettersSent }}</strong> newsletter sent</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
