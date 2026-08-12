<script setup lang="ts">
/**
 * Slide-over drawer that shows WHY a person was flagged (the real evidence behind
 * Grace's signal) and lets the user act: dismiss (wrong person / should not be
 * flagged) or snooze the follow-up (traveling, a hard season). Reads the active
 * detail from the careActions store; mounted once per page.
 */
import { computed } from 'vue'
import { useCareActions } from '@/stores/careActions'
import { congregationOf } from '@/lib/clients/focal-point/congregation'
import { activityFor } from '@/lib/clients/focal-point/activity'

const care = useCareActions()
const detail = computed(() => care.activeDetail)

// Congregation + recent real activity behind the flag (serving + kids check-ins).
const congregation = computed(() => (detail.value ? congregationOf(detail.value.name) : null))
const activity = computed(() => (detail.value ? activityFor(detail.value.name) : null))
const recent = computed(() => activity.value?.items ?? [])
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MON[m - 1]} ${d}` + (y && y !== 2026 ? ` '${String(y).slice(2)}` : '')
}
// Brazilian = amber, English morning services = brand, other = neutral, so a
// person switching between the English and Brazilian services reads at a glance.
function serviceClass(s: string): string {
  if (s === 'Brazilian') return 'bg-warn/15 text-warn'
  if (s === '9 AM' || s === '10:30 AM' || s === '12 PM') return 'bg-brand/10 text-brand'
  return 'bg-surface-elevated text-ink-muted'
}
// Serving activity comes from the schedule (team + date, no service tag); family /
// attendance activity comes from check-ins (with a colored service tag). Wording
// follows whichever this is.
const isServingActivity = computed(() => recent.value.length > 0 && recent.value.every((i) => i.tone === 'serving'))
const existing = computed(() => (detail.value ? care.status(detail.value.id) : null))
const dupShared = computed(() => {
  const d = detail.value?.duplicate
  if (!d) return ''
  const parts: string[] = []
  if (d.sharedEmail) parts.push('an email')
  if (d.sharedPhone) parts.push('a phone')
  return parts.length ? ` (they share ${parts.join(' and ')})` : ''
})
// Reconciliation: Grace combined this person's check-ins across their duplicate
// profiles and re-checked the flag. review = the flag may be a false alarm.
const rec = computed(() => detail.value?.duplicate?.reconcile ?? null)
const pcoUrl = (id: string) => `https://people.planningcenteronline.com/people/${id}`

function snooze(weeks: number) {
  if (detail.value) care.snooze(detail.value.id, weeks)
  care.closeDetail()
}
// A hide is scoped to ONE flag (ids are `signal:name`), so the button should
// say which. "Not the right person" read as a global dismissal, which made
// people snooze repeatedly instead, exactly the behaviour it should replace.
const FLAG_WORD: Record<string, string> = {
  burnout: 'over-serving',
  serving: 'stopped serving',
  group: 'group drift',
  family: 'family drift',
}
const flagWord = computed(() => FLAG_WORD[detail.value?.signal ?? ''] ?? 'this')

function dismiss() {
  if (detail.value) care.dismiss(detail.value.id)
  care.closeDetail()
}
function restore() {
  if (detail.value) care.restore(detail.value.id)
  care.closeDetail()
}
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-200 ease-out"
    enter-from-class="opacity-0" enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-150 ease-in"
    leave-from-class="opacity-100" leave-to-class="opacity-0"
  >
    <div v-if="detail" class="fixed inset-0 z-50 bg-ink/30" @click="care.closeDetail()"></div>
  </Transition>

  <Transition
    enter-active-class="transition-transform duration-250 ease-out-quart"
    enter-from-class="translate-x-full" enter-to-class="translate-x-0"
    leave-active-class="transition-transform duration-200 ease-in"
    leave-from-class="translate-x-0" leave-to-class="translate-x-full"
  >
    <aside
      v-if="detail"
      class="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-surface-raised shadow-2xl"
    >
      <!-- header -->
      <div class="flex items-start justify-between gap-3 border-b border-divider px-5 py-4">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" :class="detail.signalClass">{{ detail.signalLabel }}</span>
            <span
              v-if="congregation"
              class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              :class="congregation === 'brazilian' ? 'bg-warn/15 text-warn' : 'bg-brand/10 text-brand'"
            >{{ congregation === 'brazilian' ? 'Brazilian' : 'English' }}</span>
          </div>
          <h3 class="mt-1.5 text-lg font-semibold text-ink">{{ detail.name }}</h3>
        </div>
        <button class="shrink-0 rounded-md p-1 text-ink-muted hover:bg-surface-elevated hover:text-ink" aria-label="Close" @click="care.closeDetail()">
          <svg viewBox="0 0 20 20" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 5l10 10M15 5L5 15" stroke-linecap="round" /></svg>
        </button>
      </div>

      <!-- body -->
      <div class="flex-1 overflow-y-auto px-5 py-4">
        <p class="text-sm leading-relaxed text-ink">{{ detail.summary }}</p>

        <!-- reconciliation: Grace combined the duplicate profiles and re-checked -->
        <div
          v-if="detail.duplicate"
          class="mt-3 rounded-lg border px-3 py-2.5"
          :class="rec?.verdict === 'review' ? 'border-warn/40 bg-warn/5' : 'border-divider bg-surface-elevated/40'"
        >
          <div class="flex items-center gap-1.5">
            <svg v-if="rec?.verdict === 'review'" viewBox="0 0 16 16" class="h-3.5 w-3.5 text-warn" fill="currentColor"><path d="M8 1.5 15 14H1z" /></svg>
            <svg v-else viewBox="0 0 20 20" class="h-3.5 w-3.5 text-ink-muted" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 10l4 4 8-9" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <span class="text-[12px] font-semibold" :class="rec?.verdict === 'review' ? 'text-warn' : 'text-ink'">
              {{ rec ? (rec.verdict === 'review' ? 'Possible false alarm' : 'Duplicate checked, flag confirmed') : 'Possible duplicate profile' }}
            </span>
          </div>
          <p class="mt-1 text-[12px] leading-relaxed text-ink">
            <template v-if="rec">{{ rec.note }}</template>
            <template v-else>This person may have {{ detail.duplicate.count }} profiles in Planning Center{{ dupShared }}. Their check-ins could be split across them, so this flag may be a false alarm. Verify before reaching out, or merge them in Planning Center.</template>
          </p>
          <p v-if="rec && rec.mergeTargets.length" class="mt-1.5 text-[11px] text-ink-muted">
            {{ rec.mergeTargets.length }} empty profile{{ rec.mergeTargets.length > 1 ? 's' : '' }} to merge away:
            <a
              v-for="(id, i) in rec.mergeTargets"
              :key="id"
              :href="pcoUrl(id)"
              target="_blank"
              rel="noopener"
              class="font-medium text-brand hover:underline"
            >{{ id }}<span v-if="i < rec.mergeTargets.length - 1" class="text-ink-muted">, </span></a>
          </p>
        </div>

        <div class="mt-4">
          <span class="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">Why Grace flagged this</span>
          <dl class="mt-2 divide-y divide-divider/70">
            <div v-for="e in detail.evidence" :key="e.label" class="flex items-baseline justify-between gap-4 py-2">
              <dt class="text-[12px] text-ink-muted">{{ e.label }}</dt>
              <dd class="text-right text-[13px] font-medium text-ink">{{ e.value }}</dd>
            </div>
          </dl>
        </div>

        <!-- recent real activity behind the flag: serving + kids check-ins -->
        <div v-if="recent.length" class="mt-4">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">Recent activity</span>
            <span class="text-[11px] text-ink-muted">last {{ recent.length }} {{ isServingActivity ? 'times served' : 'check-ins' }}</span>
          </div>
          <ul class="mt-2 divide-y divide-divider/60">
            <li v-for="(it, i) in recent" :key="i" class="flex items-center justify-between gap-3 py-1.5">
              <span class="min-w-0 truncate text-[13px] text-ink">
                <template v-if="it.tone === 'kids'">{{ it.label }} checked in at Kids</template>
                <template v-else-if="it.tone === 'serving'">Served {{ it.label }}</template>
                <template v-else>{{ it.label }}</template>
              </span>
              <div class="flex shrink-0 items-center gap-2">
                <span
                  v-if="it.service"
                  class="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                  :class="serviceClass(it.service)"
                >{{ it.service }}</span>
                <span class="w-12 text-right text-[12px] tabular-nums text-ink-muted">{{ fmtDate(it.date) }}</span>
              </div>
            </li>
          </ul>
          <p class="mt-1.5 text-[11px] text-ink-disabled">
            <template v-if="isServingActivity">Confirmed serving shifts by team, live from the Planning Center schedule. A missing check-in does not mean they stopped; the schedule is the record.</template>
            <template v-else>The colored tag is the service they attended: <span class="font-medium text-warn">Brazilian</span> vs the English morning services. Live from Planning Center check-ins.</template>
          </p>
        </div>

        <p v-if="detail.routeTo" class="mt-3 rounded-lg border border-divider bg-surface-elevated/40 px-3 py-2 text-[12px] text-ink-muted">
          Routes to the <span class="font-medium text-ink">{{ detail.routeTo }}</span> leader.
        </p>

        <p v-if="existing" class="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-[12px] text-ink">
          <span v-if="existing.reason === 'dismissed'">Dismissed, hidden from the list.</span>
          <span v-else>Snoozed, hidden until it comes back up.</span>
        </p>
      </div>

      <!-- actions -->
      <div class="border-t border-divider px-5 py-4">
        <template v-if="!existing">
          <div class="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Not the right time?</div>
          <div class="mt-2 flex flex-wrap gap-2">
            <button class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-elevated" @click="snooze(2)">Snooze 2 weeks</button>
            <button class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-elevated" @click="snooze(4)">Snooze 4 weeks</button>
            <button class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/5" @click="dismiss">Never flag for {{ flagWord }}</button>
          </div>
          <p class="mt-2 text-[11px] text-ink-disabled">
            Snooze for someone traveling or in a hard season. Use "never flag" for staff, or
            anyone this signal simply does not apply to, instead of snoozing them over and over.
            It only hides them from {{ flagWord }}; every other signal still watches them, and you
            can undo it in Settings.
          </p>
        </template>
        <template v-else>
          <button class="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-ink-inverse hover:bg-brand-hover" @click="restore">Put back on the list</button>
        </template>
      </div>
    </aside>
  </Transition>
</template>
