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
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
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
  /** When true, hides the section header (eyebrow + role-count line).
   *  Use when the parent renders its own header above this component. */
  hideHeader?: boolean
  /** When true, hides the default hours-saved hero. Use when the parent
   *  renders its own custom hero (e.g., Heritage uses a revenue-led hero
   *  because remodelers think in revenue, not hours-saved). */
  hideHero?: boolean
  /** Optional role key for visual emphasis. The matching role's card
   *  gets a slightly bolder border + accent ring, signaling "this is
   *  THE killer role for this vertical." Pass the role.key string,
   *  e.g., 'quote_followup' for bath/kitchen remodelers. */
  killerRoleKey?: string
  /** Optional 2+ role keys to promote to hero cards at the top of the
   *  grid (50% width each), with the remaining roles rendered in the
   *  standard 3-col supporting grid below. Use for verticals that have
   *  TWO equal headline products (e.g., Welcome + Drift Watch for
   *  churches). When set, this takes precedence over killerRoleKey
   *  styling for the matching roles. */
  headlineRoleKeys?: string[]
}>()

const assistantName = computed(() => props.assistantName ?? 'Ada')

const emit = defineEmits<{ 'role-click': [role: AdaRole] }>()

const activeRoles = computed(() => props.roles.filter((r) => r.status === 'active'))

// Split roles into headline + supporting when headlineRoleKeys is set.
// Headline roles render in a 2-col hero strip at the top; supporting
// roles render in the standard 3-col grid below. Preserves the input
// ordering within each group.
const headlineRoles = computed(() => {
  if (!props.headlineRoleKeys || props.headlineRoleKeys.length === 0) return []
  const set = new Set(props.headlineRoleKeys)
  return props.roles.filter((r) => set.has(r.key))
})
const supportingRoles = computed(() => {
  if (!props.headlineRoleKeys || props.headlineRoleKeys.length === 0) return props.roles
  const set = new Set(props.headlineRoleKeys)
  return props.roles.filter((r) => !set.has(r.key))
})
const useHeadlineLayout = computed(() => headlineRoles.value.length > 0)

// When headline roles are set, build a "headline products this week"
// line for the hero stat that names each one by its product name +
// its business outcome. Falls back to time-saved fmt when the role
// has no business_outcome_headline set.
const headlineProductLine = computed(() => {
  if (!useHeadlineLayout.value) return ''
  return headlineRoles.value
    .map((r) => {
      const metric = r.business_outcome_headline ?? fmtTimeSaved(minutesForRole(r))
      return `${r.name} ${metric.toLowerCase()}`
    })
    .join(' · ')
})

// Hours-saved is the ROI translation a buyer uses to decide "is this
// worth it?" — but on its own it reads as fabricated marketing math.
// Anchor it to the underlying actions count (observable + verifiable)
// and show BOTH: hours as the hero, actions as the evidence beneath.
// The minutes_saved_per_event values per role are auditable — operator
// can ask "why is a first-time visitor text worth 8 minutes" and we
// have a real answer.

const totalActions = computed(() =>
  activeRoles.value.reduce((sum, r) => sum + r.this_week_count, 0),
)
const totalMinutesSaved = computed(() =>
  activeRoles.value.reduce(
    (sum, r) => sum + r.this_week_count * r.minutes_saved_per_event,
    0,
  ),
)
const totalHoursSaved = computed(() => totalMinutesSaved.value / 60)

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

function formatHours(h: number): string {
  return h >= 10 ? `~${Math.round(h)}` : `~${h.toFixed(1)}`
}

const headlineTarget = computed(() => totalHoursSaved.value)
const displayedHours = ref(0)
const headlineHours = computed(() => formatHours(displayedHours.value))

// ── Count-up animation on the headline number ──────────────────────────────
//
// Triggers once when the headline strip scrolls into view. The eased curve
// matches the ease-out-quart token used elsewhere in the system. Reduced-motion
// users skip the animation and see the final value immediately.
const headlineEl = useTemplateRef<HTMLElement>('headlineEl')
let rafId: number | null = null
let observer: IntersectionObserver | null = null
const hasAnimated = ref(false)

function animateCountUp() {
  if (hasAnimated.value) return
  hasAnimated.value = true

  const target = headlineTarget.value
  // Reduced motion → snap to final value.
  if (
    typeof window === 'undefined'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    displayedHours.value = target
    return
  }

  const duration = 900
  const startTime = performance.now()
  const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4)

  function tick(now: number) {
    const t = Math.min(1, (now - startTime) / duration)
    displayedHours.value = target * easeOutQuart(t)
    if (t < 1) {
      rafId = requestAnimationFrame(tick)
    } else {
      displayedHours.value = target
      rafId = null
    }
  }

  rafId = requestAnimationFrame(tick)
}

watch(headlineEl, (el) => {
  if (!el) return
  if (typeof IntersectionObserver === 'undefined') {
    animateCountUp()
    return
  }
  observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      animateCountUp()
      observer?.disconnect()
      observer = null
    }
  }, { threshold: 0.4 })
  observer.observe(el)
})

onBeforeUnmount(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
  observer?.disconnect()
})
</script>

<template>
  <section :class="props.hideHeader && props.hideHero ? '' : 'card overflow-hidden'">
    <header
      v-if="!props.hideHeader"
      class="mb-4 flex items-baseline justify-between flex-wrap gap-2"
    >
      <div class="flex items-baseline gap-2">
        <span class="eyebrow">{{ assistantName }} at Work</span>
        <span class="text-xs text-ink-muted">This week</span>
      </div>
      <span class="text-[11px] text-ink-disabled">
        {{ activeRoles.length }} of {{ roles.length }} roles active · click any to drill in
      </span>
    </header>

    <!-- Headline strip: hours saved as the ROI hero + actions count
         as the supporting evidence the math isn't fabricated.
         Hidden when parent provides its own hero via hideHero prop. -->
    <div
      v-if="!props.hideHero"
      ref="headlineEl"
      class="rounded-card bg-brand text-ink-inverse px-5 py-4 mb-4 flex flex-wrap items-center justify-between gap-x-8 gap-y-2"
    >
      <div>
        <div class="flex items-baseline gap-1.5">
          <span class="text-4xl font-bold tabular-nums leading-none">{{ headlineHours }}</span>
          <span class="text-base font-semibold opacity-90">hours saved</span>
        </div>
        <div class="text-xs uppercase tracking-wide opacity-80 mt-1.5 tabular-nums">
          across {{ totalActions }} actions {{ assistantName }} handled{{ ownerName ? ` for ${ownerName}` : '' }} this week
        </div>
        <div
          v-if="headlineProductLine"
          class="text-xs opacity-90 mt-1.5 font-medium"
        >
          {{ headlineProductLine }}
        </div>
      </div>
      <div class="text-right">
        <div class="text-lg font-semibold leading-tight tabular-nums">
          {{ activeRoles.length }} of {{ roles.length }}
        </div>
        <div class="text-xs uppercase tracking-wide opacity-80 mt-1">
          roles active
        </div>
      </div>
    </div>

    <!-- Headline strip (when headlineRoleKeys is set): two hero cards
         at 50% width each, visually heavier than the supporting roles
         below. Used for verticals with two equal headline products
         (e.g., Welcome + Drift Watch for churches). -->
    <div
      v-if="useHeadlineLayout"
      class="mb-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5"
    >
      <button
        v-for="(role, i) in headlineRoles"
        :key="role.key"
        type="button"
        class="role-tile-enter text-left rounded-card border-2 border-brand bg-brand/[0.04] p-5 hover:bg-brand/[0.08] hover:shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-quart focus:outline-none focus:ring-2 focus:ring-brand/40 active:scale-[0.99]"
        :style="{ animationDelay: `${i * 30}ms` }"
        @click="emit('role-click', role)"
      >
        <div class="mb-2.5 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">Headline role</span>
          </div>
        </div>
        <div class="mb-2 flex items-baseline gap-2">
          <AdaIcon :name="role.icon" class="h-5 w-5 text-brand flex-shrink-0" />
          <span class="font-bold text-ink text-lg">{{ role.name }}</span>
        </div>
        <template v-if="role.business_outcome_headline">
          <div class="text-3xl font-bold text-brand tabular-nums leading-none">
            {{ role.business_outcome_headline }}
          </div>
          <div class="text-[11px] uppercase tracking-wide text-ink-muted mt-1">
            {{ role.business_outcome_label ?? 'this week' }}
          </div>
        </template>
        <template v-else>
          <div class="text-3xl font-bold text-brand tabular-nums leading-none">
            {{ fmtTimeSaved(minutesForRole(role)) }}
          </div>
          <div class="text-[11px] uppercase tracking-wide text-ink-muted mt-1">
            saved this week
          </div>
        </template>
        <div class="text-xs text-ink-muted leading-snug mt-3">
          {{ role.this_week_snippet }}
        </div>
      </button>
    </div>

    <!-- Role grid. Killer role (when killerRoleKey is provided) spans
         2 columns on lg+ so the visually-prominent slot matches its
         business-priority role for the vertical. When useHeadlineLayout
         is true, this grid renders only the supporting roles AND uses
         a 4-col layout so 8 supporting roles fit perfectly (4+4)
         without a trailing empty slot. -->
    <div
      class="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
      :class="useHeadlineLayout ? 'lg:grid-cols-4' : 'lg:grid-cols-3'"
    >
      <button
        v-for="(role, i) in supportingRoles"
        :key="role.key"
        type="button"
        class="role-tile-enter text-left rounded-card border bg-surface-raised p-3.5 hover:bg-brand/5 hover:shadow-sm transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out-quart focus:outline-none focus:ring-2 focus:ring-brand/40 active:scale-[0.98]"
        :class="[
          role.status !== 'active' ? 'opacity-60' : '',
          props.killerRoleKey === role.key
            ? 'border-brand border-2 hover:border-brand sm:col-span-2 lg:col-span-2 bg-brand/[0.03]'
            : 'border-divider hover:border-brand',
        ]"
        :style="{ animationDelay: `${i * 30}ms` }"
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

        <!-- Headline number (active) or readiness state (other).
             When role has business_outcome_headline, that takes priority
             over the time-saved framing — used for "killer roles" of a
             vertical so the most important role leads with the metric
             the owner actually thinks in (revenue, jobs closed). -->
        <div class="mb-2">
          <template v-if="role.status === 'active'">
            <template v-if="role.business_outcome_headline">
              <div class="text-2xl font-bold text-brand tabular-nums leading-none">
                {{ role.business_outcome_headline }}
              </div>
              <div class="text-[10px] uppercase tracking-wide text-ink-muted mt-0.5">
                {{ role.business_outcome_label ?? 'this week' }}
              </div>
            </template>
            <template v-else>
              <div class="text-xl font-bold text-brand tabular-nums leading-none">
                {{ fmtTimeSaved(minutesForRole(role)) }}
              </div>
              <div class="text-[10px] uppercase tracking-wide text-ink-muted mt-0.5">
                saved this week
              </div>
            </template>
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
