<script setup lang="ts">
/**
 * CommandSite customer onboarding kanban.
 *
 * One column per stage in ONBOARDING_STAGES. Each card shows the
 * customer, persona icon, days in current stage (color-coded), and
 * advance/revert buttons. Empty columns get a subtle placeholder so
 * the layout doesn't collapse.
 *
 * Stage advance is click-only for now (no drag-and-drop). The
 * advance button on the final stage ('live') flips status to
 * 'active' and fires the welcome email (via activateCustomer).
 */
import { computed } from 'vue'
import {
  type Customer,
  type OnboardingStage,
  ONBOARDING_STAGES,
  STAGE_META,
  daysSince,
} from '@/lib/clients/commandsite/customersApi'

const props = defineProps<{
  customers: Customer[]
  busy?: boolean
}>()

const emit = defineEmits<{
  (e: 'advance', id: string): void
  (e: 'revert', id: string): void
  (e: 'open', id: string): void
}>()

const byStage = computed(() => {
  const map: Record<OnboardingStage, Customer[]> = {
    signed: [], paid: [], discovery: [], provisioned: [], shadow: [], live: [],
  }
  for (const c of props.customers) {
    if (c.status !== 'onboarding' || !c.onboarding_stage) continue
    map[c.onboarding_stage].push(c)
  }
  return map
})

function ageChipClass(stageEnteredAt: string | null): string {
  const d = daysSince(stageEnteredAt)
  if (d >= 7) return 'bg-danger/15 text-danger'
  if (d >= 3) return 'bg-warn/15 text-warn'
  return 'bg-ink-muted/15 text-ink-muted'
}

function ageLabel(stageEnteredAt: string | null): string {
  const d = daysSince(stageEnteredAt)
  if (d === 0) return 'today'
  if (d === 1) return '1 day'
  return `${d} days`
}

function personaIcon(c: Customer): string {
  if (c.persona_type === 'grace') return '⛪'
  if (c.persona_type === 'ada') return '🔧'
  return '✦'
}
</script>

<template>
  <section class="card p-0 overflow-hidden">
    <header class="px-5 py-4 border-b border-divider bg-surface-raised">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-0.5">
        Onboarding pipeline
      </div>
      <h2 class="text-lg font-bold text-ink">From "yes" to live</h2>
      <p class="text-xs text-ink-muted mt-0.5">
        Every signed customer flows through these stages. Click a card to open it · ⟶ advances · ⟵ reverts.
      </p>
    </header>

    <div class="overflow-x-auto">
      <div class="flex gap-3 p-4 min-w-max">
        <div
          v-for="stage in ONBOARDING_STAGES"
          :key="stage"
          class="flex flex-col w-64 flex-shrink-0 rounded-card border border-divider bg-canvas"
        >
          <div class="px-3 py-2 border-b border-divider bg-surface-raised">
            <div class="flex items-center justify-between mb-0.5">
              <span class="text-[10px] font-semibold uppercase tracking-wider text-ink">
                {{ STAGE_META[stage].label }}
              </span>
              <span class="text-[10px] tabular-nums text-ink-muted">
                {{ byStage[stage].length }}
              </span>
            </div>
            <p class="text-[10.5px] text-ink-muted leading-snug">
              {{ STAGE_META[stage].description }}
            </p>
          </div>

          <div class="flex-1 p-2 space-y-2 min-h-[120px]">
            <article
              v-for="customer in byStage[stage]"
              :key="customer.id"
              class="rounded-md border border-divider bg-surface px-3 py-2.5 hover:border-brand/40 hover:shadow-sm transition cursor-pointer"
              @click="emit('open', customer.id)"
            >
              <div class="flex items-start justify-between gap-2 mb-1">
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-semibold text-ink truncate">
                    <span class="mr-1">{{ personaIcon(customer) }}</span>
                    {{ customer.org_name }}
                  </div>
                  <div class="text-[10.5px] text-ink-muted truncate">
                    {{ customer.industry ?? customer.tier }}
                    <template v-if="customer.city">· {{ customer.city }}, {{ customer.state }}</template>
                  </div>
                </div>
                <span
                  class="rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold whitespace-nowrap"
                  :class="ageChipClass(customer.stage_entered_at)"
                  :title="`Entered this stage ${ageLabel(customer.stage_entered_at)} ago`"
                >{{ ageLabel(customer.stage_entered_at) }}</span>
              </div>

              <div class="flex items-center gap-1 mt-2" @click.stop>
                <button
                  type="button"
                  class="rounded text-[10px] font-semibold text-ink-muted hover:text-ink hover:bg-ink-muted/10 px-1.5 py-0.5 disabled:opacity-50"
                  :disabled="stage === 'signed' || busy"
                  title="Move back one stage"
                  @click="emit('revert', customer.id)"
                >⟵ Back</button>
                <button
                  type="button"
                  class="rounded text-[10px] font-semibold text-brand hover:bg-brand/10 px-1.5 py-0.5 disabled:opacity-50"
                  :disabled="busy"
                  :title="stage === 'live' ? 'Activate this customer (fires welcome email)' : 'Move forward one stage'"
                  @click="emit('advance', customer.id)"
                >{{ stage === 'live' ? 'Activate ✓' : 'Advance ⟶' }}</button>
              </div>
            </article>

            <p
              v-if="byStage[stage].length === 0"
              class="text-[10.5px] text-ink-muted italic text-center py-6"
            >
              No one here yet
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
