<script setup lang="ts">
/**
 * CommandSite Product Usage — feature adoption heatmap, activation
 * funnel, and cross-sell opportunities. Built so retention + expansion
 * work surfaces without hunting customer-by-customer.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import { companies, PLAN_META, type Company } from '@/lib/clients/commandsite/companies'
import {
  features,
  adoptionFor,
  crossSellFlags,
  activationFunnel,
  usageStats,
  ADOPTION_META,
  type AdoptionLevel,
  type Feature,
} from '@/lib/clients/commandsite/usage'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const stats = computed(() => usageStats())
const funnel = computed(() => activationFunnel())
const flags = computed(() => crossSellFlags())

type FlagFilter = 'all' | 'activation' | 'expansion'
const flagFilter = ref<FlagFilter>('all')

const filteredFlags = computed(() => {
  return flags.value.filter((f) => flagFilter.value === 'all' || f.kind === flagFilter.value)
})

// Group features by category for the heatmap header
const featureGroups = computed<{ label: string; features: Feature[] }[]>(() => {
  const groups = new Map<string, Feature[]>()
  for (const f of features) {
    if (!groups.has(f.group)) groups.set(f.group, [])
    groups.get(f.group)!.push(f)
  }
  return Array.from(groups.entries()).map(([label, features]) => ({ label, features }))
})

const visibleCompanies = computed<Company[]>(() => {
  return [...companies]
    .filter((c) => c.stage !== 'churned' && c.stage !== 'trial')
    .sort((a, b) => b.health_score - a.health_score)
})

function levelBg(l: AdoptionLevel): string {
  return ADOPTION_META[l].color
}
function levelText(l: AdoptionLevel): string {
  if (l === 'unused') return ''
  if (l === 'power') return '★'
  if (l === 'active') return '●'
  if (l === 'occasional') return '◐'
  return '○'
}
function levelTextColor(l: AdoptionLevel): string {
  if (l === 'unused' || l === 'set_up') return '#0F172A'
  return '#FFFFFF'
}

function featuresInUseFor(companyId: string): number {
  return features.filter((f) => {
    const l = adoptionFor(companyId, f.key)
    return l === 'active' || l === 'power'
  }).length
}

function pct(v: number): string { return `${(v * 100).toFixed(0)}%` }
function money(cents: number, opts: { compact?: boolean } = {}): string {
  if (cents === 0) return '—'
  if (opts.compact && cents >= 100_000) return '$' + Math.round(cents / 1000) + 'k'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}

const flagsByCompany = computed(() => {
  const map = new Map<string, typeof flags.value>()
  for (const f of filteredFlags.value) {
    if (!map.has(f.company_id)) map.set(f.company_id, [])
    map.get(f.company_id)!.push(f)
  }
  // Sort companies by # of flags
  return Array.from(map.entries())
    .map(([id, flagList]) => {
      const c = companies.find((co) => co.id === id)!
      return { company: c, flags: flagList }
    })
    .sort((a, b) => b.flags.length - a.flags.length)
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Product Usage</h2>
        <p class="text-sm text-ink-muted">
          Feature adoption, activation funnel, and cross-sell opportunities — surfaces retention + expansion work without digging account-by-account.
        </p>
      </div>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Active customers</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.total_active_customers }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">have ≥ 1 feature in active use</div>
      </div>
      <div class="card">
        <div class="kpi-label">Median features in use</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.median_features_in_use }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">of {{ features.length }} available</div>
      </div>
      <div class="card">
        <div class="kpi-label">Habit rate</div>
        <div class="mt-1 text-2xl font-bold tabular-nums" :class="stats.habit_rate >= 0.40 ? 'text-success' : 'text-warn'">
          {{ pct(stats.habit_rate) }}
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">signups → habit users (90d)</div>
      </div>
      <div class="card">
        <div class="kpi-label">Cross-sell opportunity</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ stats.cross_sell_count }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">flags · ~{{ money(stats.cross_sell_arr_potential_cents, { compact: true }) }} ARR upside</div>
      </div>
    </div>

    <!-- Activation funnel -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Activation Funnel</span>
        <span class="chip !py-0.5 !px-2 !text-[10px]">Last 90 Days</span>
        <span class="text-xs text-ink-muted ml-1">{{ funnel[0].count }} signups → {{ funnel[funnel.length - 1].count }} habit users</span>
      </div>
      <div class="space-y-2">
        <div
          v-for="(step, i) in funnel"
          :key="step.stage"
        >
          <div class="flex items-baseline justify-between gap-2 mb-1">
            <div class="min-w-0">
              <span class="text-sm font-semibold text-ink">{{ step.stage }}</span>
              <span class="text-[11px] text-ink-muted ml-2">— {{ step.description }}</span>
            </div>
            <span class="text-xs text-ink-muted tabular-nums whitespace-nowrap">
              {{ step.count }}
              <span class="text-ink-disabled">· {{ pct(step.pct_of_top) }}</span>
            </span>
          </div>
          <div class="h-7 rounded-md bg-surface-elevated/60 overflow-hidden">
            <div
              class="h-full rounded-md transition-[width] duration-300 ease-out-quart"
              :style="{
                width: (step.pct_of_top * 100) + '%',
                backgroundColor: i === 0 ? 'rgb(var(--color-brand))'
                  : i === funnel.length - 1 ? '#10B981'
                  : 'rgb(var(--color-accent))',
              }"
            ></div>
          </div>
          <div
            v-if="i < funnel.length - 1"
            class="text-[10px] text-ink-disabled mt-0.5 text-right"
          >
            ↓ {{ pct(funnel[i + 1].count / step.count) }} continue
            <span v-if="step.count - funnel[i + 1].count > 0" class="text-warn">
              ({{ step.count - funnel[i + 1].count }} drop off)
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- Adoption Heatmap -->
    <section class="card overflow-hidden">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Feature Adoption Heatmap</span>
        <span class="text-xs text-ink-muted">Customer × feature usage</span>
      </div>
      <div class="overflow-x-auto">
        <table class="text-xs border-separate border-spacing-1">
          <thead>
            <tr>
              <th class="px-2 py-1 text-left text-[10px] uppercase tracking-wide font-medium text-ink-muted sticky left-0 bg-surface-raised z-10 min-w-[180px]">Customer</th>
              <th class="px-2 py-1 text-center text-[10px] uppercase tracking-wide font-medium text-ink-muted">Plan</th>
              <th class="px-2 py-1 text-right text-[10px] uppercase tracking-wide font-medium text-ink-muted">Used</th>
              <template v-for="g in featureGroups" :key="g.label">
                <th
                  v-for="(f, i) in g.features"
                  :key="f.key"
                  class="px-1 py-1 text-center text-[9px] font-medium text-ink-disabled w-10"
                  :title="f.label"
                >
                  <div class="flex flex-col items-center gap-0.5">
                    <span v-if="i === 0" class="text-[8px] uppercase tracking-wider text-ink-muted">{{ g.label }}</span>
                    <span v-else class="text-[8px] opacity-0">·</span>
                    <span class="rotate-90 origin-center whitespace-nowrap inline-block py-2">{{ f.label }}</span>
                  </div>
                </th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in visibleCompanies"
              :key="c.id"
              class="hover:bg-surface-elevated/30 transition-colors"
            >
              <td class="px-2 py-1.5 text-xs sticky left-0 bg-surface-raised z-10">
                <div class="font-medium text-ink truncate max-w-[170px]">{{ c.name }}</div>
                <div class="text-[10px] text-ink-disabled truncate max-w-[170px]">{{ c.industry }} · {{ c.team_size }} techs</div>
              </td>
              <td class="px-2 py-1.5 text-center">
                <span
                  class="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-inverse whitespace-nowrap"
                  :style="{ backgroundColor: PLAN_META[c.plan].color }"
                >{{ PLAN_META[c.plan].label }}</span>
              </td>
              <td class="px-2 py-1.5 text-right text-xs text-ink tabular-nums">
                {{ featuresInUseFor(c.id) }}<span class="text-ink-disabled">/{{ features.length }}</span>
              </td>
              <template v-for="g in featureGroups" :key="g.label">
                <td
                  v-for="f in g.features"
                  :key="f.key"
                  class="text-center text-[10px] font-bold rounded w-10 h-7"
                  :style="{
                    backgroundColor: levelBg(adoptionFor(c.id, f.key)),
                    color: levelTextColor(adoptionFor(c.id, f.key)),
                  }"
                  :title="`${c.name} — ${f.label}: ${ADOPTION_META[adoptionFor(c.id, f.key)].label}`"
                >{{ levelText(adoptionFor(c.id, f.key)) }}</td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Heatmap legend -->
      <div class="mt-3 flex flex-wrap items-center gap-3 text-[11px]">
        <span class="font-semibold text-ink-muted">Legend:</span>
        <span
          v-for="(meta, lvl) in ADOPTION_META"
          :key="lvl"
          class="inline-flex items-center gap-1"
        >
          <span class="h-3 w-5 rounded" :style="{ backgroundColor: meta.color }"></span>
          <span class="text-ink-muted">{{ meta.label }}</span>
        </span>
      </div>
    </section>

    <!-- Cross-sell opportunities -->
    <section class="card">
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <div class="flex items-center gap-2">
          <span class="eyebrow">Cross-Sell Opportunities</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">{{ filteredFlags.length }} flags</span>
        </div>
        <div class="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            class="chip"
            :class="flagFilter === 'all' ? 'chip-active' : ''"
            @click="flagFilter = 'all'"
          >All</button>
          <button
            type="button"
            class="chip"
            :class="flagFilter === 'activation' ? 'chip-active' : ''"
            @click="flagFilter = 'activation'"
          >Activation (in tier)</button>
          <button
            type="button"
            class="chip"
            :class="flagFilter === 'expansion' ? 'chip-active' : ''"
            @click="flagFilter = 'expansion'"
          >Expansion (upgrade)</button>
        </div>
      </div>

      <div class="space-y-3">
        <article
          v-for="entry in flagsByCompany"
          :key="entry.company.id"
          class="rounded-card border border-divider p-3"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <div>
              <span class="text-sm font-semibold text-ink">{{ entry.company.name }}</span>
              <span class="text-[11px] text-ink-muted ml-2">· {{ entry.company.industry }} · {{ entry.company.team_size }} techs · {{ PLAN_META[entry.company.plan].label }}</span>
            </div>
            <span class="text-[11px] text-ink-disabled">{{ entry.flags.length }} flag{{ entry.flags.length === 1 ? '' : 's' }}</span>
          </div>
          <ul class="space-y-1.5">
            <li
              v-for="f in entry.flags"
              :key="f.feature_key"
              class="flex items-start gap-2 text-xs"
            >
              <span
                class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap mt-0.5"
                :class="f.kind === 'expansion'
                  ? 'bg-success/15 text-success'
                  : 'bg-brand/10 text-brand'"
              >{{ f.kind === 'expansion' ? '↑ Expansion' : '· Activation' }}</span>
              <div class="min-w-0 flex-1">
                <div class="text-ink">
                  <span class="font-semibold">{{ f.feature_label }}</span>
                  <span v-if="f.arr_uplift_cents" class="ml-1 text-success font-semibold">+{{ money(f.arr_uplift_cents) }}/mo</span>
                </div>
                <div class="text-[11px] text-ink-muted leading-snug">{{ f.message }}</div>
              </div>
              <button
                type="button"
                class="text-[10px] font-semibold text-brand hover:underline whitespace-nowrap"
              >Send pitch →</button>
            </li>
          </ul>
        </article>

        <div v-if="flagsByCompany.length === 0" class="text-center py-6 text-sm text-ink-muted italic">
          Nothing to flag — every customer is using everything they can. Time to ship a new feature.
        </div>
      </div>
    </section>
  </div>
</template>
