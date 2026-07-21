<script setup lang="ts">
/**
 * Focal Point - congregation lens control (All / English / Brazilian). Mounted
 * once in the dashboard chrome (DashboardLayout) so it sits at the top of every
 * page and scopes the whole dashboard. It is PAGE-AWARE: on pages the lens
 * reshapes (Care & Drift families/groups, Insights) it reports the active
 * congregation; on pages it does not (Serving and Front Desk are church-wide,
 * Settings) it says so plainly and points to where the lens does work, so the
 * header never claims a scope the page ignores.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useCongregationLens, type CongregationScope } from '@/stores/congregationLens'

const lens = useCongregationLens()
const route = useRoute()

const options: { key: CongregationScope; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'english', label: 'English' },
  { key: 'brazilian', label: 'Brazilian' },
]
// A congregation-scoped user sees only their own congregation (the lens is locked).
const visibleOptions = computed(() => (lens.locked ? options.filter((o) => o.key === lens.locked) : options))

// Tabs whose PEOPLE lists the lens reshapes. On Serving, the burnout list scopes
// by campus (Brazilian teams vs main) while the Sunday roster stays church-wide;
// the page still counts as a lens page. Today's "Everyone" rollup is a whole-church
// hub, so it is not here.
const LENS_TABS = new Set(['care-drift', 'sundays-comms', 'insights', 'front-desk-guests'])
const TAB_LABEL: Record<string, string> = {
  today: 'Today',
  'care-drift': 'Care & Drift',
  'sundays-comms': 'Serving',
  insights: 'Insights',
  'front-desk-guests': 'Front Desk',
  settings: 'Settings',
  giving: 'Giving',
}

const currentTab = computed(() => (route.params.tab as string) ?? 'today')
const isLensPage = computed(() => LENS_TABS.has(currentTab.value))
const pageLabel = computed(() => TAB_LABEL[currentTab.value] ?? 'This page')
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card border border-divider bg-surface-elevated px-4 py-2.5">
    <div class="flex items-center gap-2.5">
      <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Congregation</span>
      <div class="inline-flex items-center rounded-full border border-divider bg-surface p-0.5" role="group" aria-label="Congregation lens">
        <button
          v-for="opt in visibleOptions"
          :key="opt.key"
          type="button"
          class="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
          :class="lens.scope === opt.key ? 'bg-brand text-ink-inverse' : 'text-ink-muted hover:text-ink'"
          :aria-pressed="lens.scope === opt.key"
          @click="lens.set(opt.key)"
        >{{ opt.label }}</button>
      </div>
    </div>
    <p class="text-[11px] leading-snug text-ink-muted">
      <template v-if="lens.scope === 'all'">Scope the dashboard to one congregation. People lists (care, serving, groups, guests) and Insights follow it; weekend totals and the Sunday roster stay church-wide.</template>
      <template v-else-if="isLensPage">Showing the <span class="font-semibold text-ink">{{ lens.scope }}</span> congregation. Weekend totals and the Sunday roster stay church-wide.</template>
      <template v-else><span class="font-semibold text-ink">{{ pageLabel }}</span> is church-wide. The lens reshapes Care &amp; Drift, Serving, Insights, and Front Desk.</template>
    </p>
  </div>
</template>
