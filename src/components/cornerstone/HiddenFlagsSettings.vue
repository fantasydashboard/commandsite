<script setup lang="ts">
/**
 * Settings - "People you have hidden from a flag".
 *
 * Hides were previously write-only: you could dismiss someone from the drawer
 * and then had no way to see it or undo it. That makes the action feel risky, so
 * people snooze repeatedly instead, which is the behaviour "never flag" is meant
 * to replace. This is the review surface that makes the permanent choice safe.
 *
 * A hide is scoped to ONE signal, because ids are `signal:name` (flags.ts
 * flagId). Someone hidden from over-serving is still watched by family drift,
 * group drift and serving-lapse. The list groups by signal so that is visible
 * rather than something you have to know.
 */
import { computed } from 'vue'
import { useCareActions } from '@/stores/careActions'

const care = useCareActions()

const SIGNAL_LABEL: Record<string, string> = {
  burnout: 'Over-serving',
  serving: 'Stopped serving',
  group: 'Group drift',
  family: 'Family drift',
  other: 'Other',
}
const SIGNAL_CLASS: Record<string, string> = {
  burnout: 'bg-danger/12 text-danger',
  serving: 'bg-accent/15 text-accent',
  group: 'bg-brand/12 text-brand',
  family: 'bg-warn/15 text-warn',
  other: 'bg-ink-muted/10 text-ink-muted',
}

const rows = computed(() => care.allHidden())

const groups = computed(() => {
  const by = new Map<string, ReturnType<typeof care.allHidden>>()
  for (const r of rows.value) {
    const list = by.get(r.signal) ?? []
    list.push(r)
    by.set(r.signal, list)
  }
  return [...by.entries()].map(([signal, items]) => ({ signal, items }))
})

const dismissedCount = computed(() => rows.value.filter((r) => r.reason === 'dismissed').length)
const snoozedCount = computed(() => rows.value.filter((r) => r.reason === 'snoozed').length)

function when(ts: number): string {
  const days = Math.round((Date.now() - ts) / 864e5)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return `${Math.round(days / 30)} months ago`
}
function until(ts?: number): string {
  if (!ts) return ''
  const days = Math.ceil((ts - Date.now()) / 864e5)
  return days <= 0 ? 'expiring' : `${days} more days`
}
// Family ids strip "The ... family"; put it back so the row reads like the board.
function display(signal: string, name: string): string {
  return signal === 'family' ? `The ${name} family` : name
}
</script>

<template>
  <section class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Hidden from a flag</span>
      <span v-if="rows.length" class="text-[11px] text-ink-muted">
        {{ dismissedCount }} permanent · {{ snoozedCount }} snoozed
      </span>
    </div>

    <h3 class="mt-1 text-base font-semibold text-ink">
      <template v-if="rows.length">{{ rows.length }} people you have hidden</template>
      <template v-else>Nobody is hidden</template>
    </h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">
      Hiding is per signal, not per person. Someone hidden from over-serving is still watched
      by family drift, group drift and serving lapses. Use it for staff, or anyone a signal
      genuinely does not apply to, rather than snoozing them again every few weeks.
    </p>

    <div v-if="rows.length" class="mt-5 space-y-5">
      <div v-for="g in groups" :key="g.signal">
        <div class="mb-2 flex items-center gap-2">
          <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" :class="SIGNAL_CLASS[g.signal] ?? SIGNAL_CLASS.other">
            {{ SIGNAL_LABEL[g.signal] ?? g.signal }}
          </span>
          <span class="text-[11px] text-ink-muted">{{ g.items.length }}</span>
        </div>
        <ul class="divide-y divide-divider border-t border-divider">
          <li v-for="r in g.items" :key="r.id" class="flex flex-wrap items-center gap-3 py-2.5">
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium text-ink">{{ display(r.signal, r.name) }}</div>
              <div class="text-[11px] text-ink-muted">
                <template v-if="r.reason === 'dismissed'">Never flag · set {{ when(r.at) }}</template>
                <template v-else>Snoozed {{ when(r.at) }} · {{ until(r.until) }}</template>
                <template v-if="r.note"> · {{ r.note }}</template>
              </div>
            </div>
            <button
              type="button"
              class="shrink-0 rounded-md border border-divider px-2.5 py-1 text-[11px] font-medium text-ink-muted hover:border-brand hover:text-brand"
              @click="care.restore(r.id)"
            >Start flagging again</button>
          </li>
        </ul>
      </div>
    </div>

    <p v-else class="mt-4 text-[11px] text-ink-disabled">
      When you hide someone from a signal, they will appear here so you can change your mind.
    </p>

    <p class="mt-4 text-[11px] leading-relaxed text-ink-disabled">
      Saved in this browser for now, so hides do not follow you to another device or apply to
      other staff. They move server-side with the rest of the case state.
    </p>
  </section>
</template>
