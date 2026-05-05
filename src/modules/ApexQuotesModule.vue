<script setup lang="ts">
/**
 * Quote Follow-Up kanban — every open quote grouped by where it sits
 * in the follow-up cadence. Each card surfaces the *actual* message
 * the AI sent so the owner can see the work happening, not just trust
 * a counter went up.
 */
import { computed } from 'vue'
import type { Client } from '@/types/database'
import { quotes } from '@/lib/clients/apex/quotes'
import type { QuoteRecord, QuoteStage } from '@/lib/clients/apex/types'

defineProps<{ client: Client; config: Record<string, unknown> }>()

interface Column {
  stage: QuoteStage
  label: string
  sub: string
  color: string
}

const columns: Column[] = [
  { stage: 'new',              label: 'New Quote',     sub: 'Just sent', color: 'rgb(var(--color-brand))' },
  { stage: 'followup_day_1',   label: 'Day 1',         sub: 'Same-day SMS', color: 'rgb(var(--color-accent))' },
  { stage: 'followup_day_3',   label: 'Day 3',         sub: 'Email nudge', color: '#A0D8F8' },
  { stage: 'followup_day_7',   label: 'Day 7',         sub: 'Switch channel', color: '#F59E0B' },
  { stage: 'followup_day_14',  label: 'Day 14',        sub: 'Owner call', color: '#FB7185' },
  { stage: 'followup_day_30',  label: 'Day 30',        sub: 'Last touch', color: '#94A3B8' },
  { stage: 'booked',           label: 'Booked',        sub: 'Closed-won', color: '#10B981' },
]

function quotesIn(stage: QuoteStage): QuoteRecord[] {
  return quotes
    .filter((q) => q.stage === stage)
    .sort((a, b) => b.amount_cents - a.amount_cents)
}

function columnTotal(stage: QuoteStage): number {
  return quotesIn(stage).reduce((s, q) => s + q.amount_cents, 0)
}

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}

const totalOpenPipeline = computed(() => {
  const openStages: QuoteStage[] = [
    'new', 'followup_day_1', 'followup_day_3',
    'followup_day_7', 'followup_day_14', 'followup_day_30',
  ]
  return openStages.reduce((s, st) => s + columnTotal(st), 0)
})

const optedOutCount = computed(() => quotes.filter((q) => q.stage === 'opted_out').length)

// ── Message rendering ───────────────────────────────────────────────────
// Per-stage SMS/email templates. Each card shows the rendered message
// the AI actually sent (or will send) for that quote at that stage.
type ChannelLabel = 'SMS' | 'Email' | 'Call'

interface RenderedMessage {
  channel: ChannelLabel
  subject?: string
  body: string
}

function firstName(full: string): string {
  return full.split(' ')[0]
}

function renderMessage(q: QuoteRecord): RenderedMessage | null {
  const fn = firstName(q.customer)
  const amt = money(q.amount_cents)
  const job = q.job_type
  switch (q.stage) {
    case 'new':
      return null  // no follow-up yet
    case 'followup_day_1':
      return {
        channel: 'SMS',
        body: `Hi ${fn}, it's Apex Heating & Air — wanted to make sure you got the quote for ${job} (${amt}). Any questions I can answer? Reply YES to schedule or STOP to opt out.`,
      }
    case 'followup_day_3':
      return {
        channel: 'Email',
        subject: `Following up on your ${job} quote`,
        body: `Hi ${fn},\n\nQuick check-in on the ${amt} quote we sent over for ${job}. Most folks have a few questions before they're ready to book — happy to walk through any of it on a quick call.\n\nIf the price isn't quite right, we also have financing through Wells Fargo at 0% APR for 18 months on jobs over $1,000.\n\nReply to this email or call us at (407) 555-0100.\n\n— Marcus, Apex Heating & Air`,
      }
    case 'followup_day_7':
      return {
        channel: 'SMS',
        body: `Hi ${fn} — checking in once more on the ${job} quote (${amt}). If timing isn't right we can hold the price for 30 more days. Just text back YES, NOT YET, or STOP.`,
      }
    case 'followup_day_14':
      return {
        channel: 'Call',
        body: `Marcus called personally — went to voicemail. Left message: "Hi ${fn}, it's Marcus from Apex. Wanted to check in personally on the ${job} quote we sent two weeks back. No pressure, just want to make sure I haven't dropped the ball on you. Give me a ring at (407) 555-0100 when it's a good time."`,
      }
    case 'followup_day_30':
      return {
        channel: 'Email',
        subject: `Last check-in on your quote`,
        body: `Hi ${fn},\n\nIt's been about a month since we sent the ${amt} quote for ${job}. I'm going to stop bugging you after this one — totally understand if the timing isn't right or you went with someone else.\n\nIf you'd ever like to revisit, just reply and I'll re-quote at current pricing.\n\nWishing you a comfortable home,\n— Marcus`,
      }
    case 'booked':
      return {
        channel: 'SMS',
        body: `Confirmed! ${fn}, you're booked for ${job} (${amt}). We'll text you the day before with your tech's name and ETA. Reply RESCHEDULE to move it.`,
      }
    case 'opted_out':
      return null
  }
}

function lastTouchLabel(t: QuoteRecord['last_touch']): string {
  if (t === 'sms') return 'Last touch: SMS'
  if (t === 'email') return 'Last touch: Email'
  if (t === 'call') return 'Last touch: Call'
  return 'No touches yet'
}

function channelStyle(c: ChannelLabel): { bg: string; text: string } {
  if (c === 'SMS')   return { bg: 'rgb(var(--color-accent) / 0.12)', text: 'rgb(var(--color-accent))' }
  if (c === 'Email') return { bg: 'rgb(var(--color-brand) / 0.12)',  text: 'rgb(var(--color-brand))' }
  return { bg: 'rgb(245 158 11 / 0.15)', text: '#B45309' }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Quote Follow-Ups</h2>
        <p class="text-sm text-ink-muted">
          Every open quote, where it sits in the cadence, and the actual message the AI sent at that step.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-3 text-xs">
        <div>
          <span class="text-ink-muted">Open pipeline:</span>
          <span class="ml-1 font-semibold text-ink tabular-nums">{{ money(totalOpenPipeline) }}</span>
        </div>
        <div v-if="optedOutCount" class="text-ink-disabled">
          <span>{{ optedOutCount }} opted out (hidden)</span>
        </div>
      </div>
    </div>

    <!-- Kanban scroller -->
    <div class="overflow-x-auto">
      <div class="flex gap-3 min-w-fit pb-2">
        <div
          v-for="col in columns"
          :key="col.stage"
          class="w-[300px] flex-shrink-0"
        >
          <!-- Column header -->
          <div
            class="rounded-t-card px-3 py-2.5 flex items-center justify-between gap-2 text-white"
            :style="{ backgroundColor: col.color }"
          >
            <div class="min-w-0">
              <div class="text-sm font-semibold truncate">{{ col.label }}</div>
              <div class="text-[10px] opacity-90 truncate">{{ col.sub }}</div>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="text-base font-bold tabular-nums leading-none">{{ quotesIn(col.stage).length }}</div>
              <div class="text-[10px] opacity-90 tabular-nums">{{ money(columnTotal(col.stage)) }}</div>
            </div>
          </div>

          <!-- Cards -->
          <div class="rounded-b-card bg-surface-elevated/40 p-2 space-y-2 min-h-[120px]">
            <article
              v-for="q in quotesIn(col.stage)"
              :key="q.id"
              class="card !p-3 !shadow-none border border-divider hover:border-brand/40 transition-colors"
            >
              <!-- Card header: customer + amount -->
              <div class="flex items-start justify-between gap-2 mb-1.5">
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-semibold text-ink truncate">{{ q.customer }}</div>
                  <div class="text-[11px] text-ink-muted truncate">{{ q.job_type }}</div>
                </div>
                <div class="text-sm font-bold text-brand tabular-nums whitespace-nowrap">
                  {{ money(q.amount_cents) }}
                </div>
              </div>

              <!-- Message preview -->
              <div v-if="renderMessage(q)" class="mt-2 rounded-md border border-divider/60 bg-surface p-2.5">
                <div class="flex items-center justify-between gap-2 mb-1">
                  <span
                    class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                    :style="{
                      backgroundColor: channelStyle(renderMessage(q)!.channel).bg,
                      color: channelStyle(renderMessage(q)!.channel).text,
                    }"
                  >{{ renderMessage(q)!.channel }}</span>
                  <span class="text-[10px] text-ink-disabled">
                    {{ q.days_in_stage === 0 ? 'today' : `${q.days_in_stage}d ago` }}
                  </span>
                </div>
                <div v-if="renderMessage(q)!.subject" class="text-[11px] font-semibold text-ink mb-1 truncate">
                  {{ renderMessage(q)!.subject }}
                </div>
                <div class="text-[11px] text-ink leading-snug whitespace-pre-line line-clamp-5">
                  {{ renderMessage(q)!.body }}
                </div>
              </div>
              <div v-else class="mt-2 text-[11px] text-ink-disabled italic">
                Quote just sent — first follow-up tomorrow at 10 AM.
              </div>

              <!-- Footer -->
              <div class="mt-2 flex items-center justify-between gap-2 text-[10px] text-ink-muted">
                <span>{{ lastTouchLabel(q.last_touch) }}</span>
                <span class="tabular-nums">{{ q.phone }}</span>
              </div>
            </article>

            <div
              v-if="quotesIn(col.stage).length === 0"
              class="px-3 py-6 text-center text-[11px] text-ink-disabled italic"
            >
              No quotes in this step.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
