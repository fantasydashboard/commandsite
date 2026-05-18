<script setup lang="ts">
/**
 * Ada at Work — the canonical "what is she doing for me this week" surface.
 *
 * Shows each role as a card with:
 *  - time saved this week (count × per-event minutes — the per-card headline)
 *  - the role's qualitative this-week snippet
 * Plus an aggregated headline strip showing total hours / working-days saved.
 *
 * Click any role card → routes to that role's tab via @role-click.
 * Configured / setup-needed roles render muted and are excluded from the
 * aggregated total — only active roles count toward saved-hours claim.
 */
import { computed } from 'vue'
import type { EmployeeRole } from '@/lib/types/employeeRole'
import { ROLE_STATUS_META } from '@/lib/types/employeeRole'
import AdaIcon from './AdaIcon.vue'

// Kept for back-compat — existing Apex callers import `AdaRole`.
type AdaRole = EmployeeRole

const props = defineProps<{
  roles: AdaRole[]
  ownerName?: string
  /** Display name of the assistant (Ada / Grace / etc.). Drives the
   *  eyebrow + headline copy. Defaults to "Ada" for back-compat. */
  assistantName?: string
}>()

const assistantName = computed(() => props.assistantName ?? 'Ada')

const emit = defineEmits<{ 'role-click': [role: AdaRole] }>()

const activeRoles = computed(() => props.roles.filter((r) => r.status === 'active'))

const totalMinutesSaved = computed(() =>
  activeRoles.value.reduce(
    (sum, r) => sum + r.this_week_count * r.minutes_saved_per_event,
    0,
  ),
)
const totalHoursSaved = computed(() => totalMinutesSaved.value / 60)
const workingDaysSaved = computed(() => totalHoursSaved.value / 8)

function minutesForRole(role: AdaRole): number {
  return role.this_week_count * role.minutes_saved_per_event
}

function fmtTimeSaved(mins: number): string {
  if (mins < 60) return `~${mins}m`
  const hours = Math.floor(mins / 60)
  const remaining = mins % 60
  if (remaining === 0) return `~${hours}h`
  return `~${hours}h ${remaining}m`
}

const headlineHours = computed(() => {
  const h = totalHoursSaved.value
  return h >= 10 ? `~${Math.round(h)}` : `~${h.toFixed(1)}`
})

const daysPhrase = computed(() => {
  const d = workingDaysSaved.value
  if (d < 1) return 'most of a working day'
  return `~${d.toFixed(1)} working days`
})
</script>

<template>
  <section class="card overflow-hidden">
    <header class="mb-4 flex items-baseline justify-between flex-wrap gap-2">
      <div class="flex items-baseline gap-2">
        <span class="eyebrow">{{ assistantName }} at Work</span>
        <span class="text-xs text-ink-muted">This week</span>
      </div>
      <span class="text-[11px] text-ink-disabled">
        {{ activeRoles.length }} of {{ roles.length }} roles active · click any to drill in
      </span>
    </header>

    <!-- Headline strip: aggregated hours saved -->
    <div
      class="rounded-card bg-brand text-ink-inverse px-5 py-4 mb-4 flex flex-wrap items-center justify-between gap-x-8 gap-y-2"
    >
      <div>
        <div class="flex items-baseline gap-1.5">
          <span class="text-4xl font-bold tabular-nums leading-none">{{ headlineHours }}</span>
          <span class="text-base font-semibold opacity-90">hours</span>
        </div>
        <div class="text-xs uppercase tracking-wide opacity-80 mt-1.5">
          {{ assistantName }} saved {{ ownerName ?? 'you' }} this week
        </div>
      </div>
      <div class="text-right">
        <div class="text-lg font-semibold leading-tight">≈ {{ daysPhrase }}</div>
        <div class="text-xs uppercase tracking-wide opacity-80 mt-1">of work she handled</div>
      </div>
    </div>

    <!-- Role grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      <button
        v-for="role in roles"
        :key="role.key"
        type="button"
        class="text-left rounded-card border border-divider bg-surface-raised p-3.5 hover:border-brand hover:bg-brand/5 hover:shadow-sm transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out-quart focus:outline-none focus:ring-2 focus:ring-brand/40 active:scale-[0.98]"
        :class="role.status !== 'active' ? 'opacity-60' : ''"
        @click="emit('role-click', role)"
      >
        <!-- Header row: icon + name + status -->
        <div class="mb-2.5 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <AdaIcon :name="role.icon" class="h-4 w-4 text-brand flex-shrink-0" />
            <span class="font-semibold text-ink text-sm truncate">{{ role.name }}</span>
          </div>
          <span
            v-if="role.status !== 'active'"
            class="rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider flex-shrink-0"
            :class="ROLE_STATUS_META[role.status].pillClass"
          >{{ ROLE_STATUS_META[role.status].label }}</span>
        </div>

        <!-- Time saved (active) or readiness state (other) -->
        <div class="mb-2">
          <template v-if="role.status === 'active'">
            <div class="text-xl font-bold text-brand tabular-nums leading-none">
              {{ fmtTimeSaved(minutesForRole(role)) }}
            </div>
            <div class="text-[10px] uppercase tracking-wide text-ink-muted mt-0.5">
              saved this week
            </div>
          </template>
          <template v-else>
            <div class="text-sm font-semibold text-ink-muted leading-none">
              Ready to turn on
            </div>
            <div class="text-[10px] uppercase tracking-wide text-ink-disabled mt-0.5">
              Configure to activate
            </div>
          </template>
        </div>

        <!-- Snippet — the qualitative proof -->
        <div class="text-[11px] text-ink-muted leading-snug line-clamp-2">
          {{ role.this_week_snippet }}
        </div>
      </button>
    </div>
  </section>
</template>
