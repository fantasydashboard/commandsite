<script setup lang="ts">
/**
 * Josh Personal — Plan tab.
 *
 * The killer feature: Sage's weekly meal + workout plan, with the
 * Saturday-morning "next week ready" hero, the active concerns that
 * shaped the plan, the 7-day grid (with meals/workouts toggles),
 * Sage's swap rationale, and the auto-generated shopping list.
 */
import { computed, ref } from 'vue'
import type { Client } from '@/types/database'
import AssistantMark from '@/components/AssistantMark.vue'
import {
  NEXT_WEEK_LABEL,
  weeklyPlan,
  weekTotals,
  weekStrategy,
  swaps,
  shoppingList,
  shoppingEstimateUsd,
  activeConcerns,
} from '@/lib/clients/josh-personal/health'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const totals = computed(() => weekTotals())

// View toggle: see all / just meals / just workouts
type ViewMode = 'all' | 'meals' | 'workouts'
const viewMode = ref<ViewMode>('all')

// Expand state for week grid
const expandedDay = ref<string | null>(null)
function toggleDay(day: string) {
  expandedDay.value = expandedDay.value === day ? null : day
}

// Shopping list grouping + check-off
const shoppingByCategory = computed(() => {
  const grouped = new Map<string, typeof shoppingList>()
  for (const item of shoppingList) {
    if (!grouped.has(item.category)) grouped.set(item.category, [])
    grouped.get(item.category)!.push(item)
  }
  return Array.from(grouped.entries()).map(([category, items]) => ({ category, items }))
})

const shoppingChecked = ref<Set<string>>(new Set())
function toggleItem(name: string) {
  const next = new Set(shoppingChecked.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  shoppingChecked.value = next
}
</script>

<template>
  <div class="space-y-5">
    <!-- ── HERO: Next week's plan ready for review ──────────────────── -->
    <section class="rounded-card border-2 border-brand/40 bg-brand/5 overflow-hidden">
      <div class="px-5 py-4 border-b border-brand/20 bg-brand/10">
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div class="flex items-start gap-3">
            <AssistantMark class="h-6 w-6 text-brand mt-0.5" />
            <div>
              <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-1">
                Next week's plan ready
              </div>
              <h3 class="text-lg font-bold text-ink">{{ NEXT_WEEK_LABEL }}</h3>
              <p class="text-xs text-ink-muted mt-0.5">
                Sage drafted this 18 minutes ago. Review + edit before you head to the store.
              </p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button class="rounded-md border border-brand/40 text-brand bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:bg-brand/10">
              Regenerate meals
            </button>
            <button class="rounded-md border border-brand/40 text-brand bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:bg-brand/10">
              Regenerate workouts
            </button>
            <button class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90">
              Approve · generate shopping list
            </button>
          </div>
        </div>
      </div>
      <div class="px-5 py-4 grid gap-4 sm:grid-cols-4">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Avg daily cal</div>
          <div class="text-xl font-bold text-ink tabular-nums">{{ totals.avgCal.toLocaleString() }}</div>
          <div class="text-[11px] text-ink-muted">{{ totals.deficitVsMaintain }} deficit</div>
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Avg protein</div>
          <div class="text-xl font-bold text-ink tabular-nums">{{ totals.avgProtein }}g</div>
          <div class="text-[11px] text-ink-muted">target 185g</div>
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Workouts</div>
          <div class="text-xl font-bold text-ink tabular-nums">{{ totals.workoutDays }} of 7</div>
          <div class="text-[11px] text-ink-muted">push/pull/legs/full</div>
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Shopping list</div>
          <div class="text-xl font-bold text-ink tabular-nums">{{ shoppingList.length }} items</div>
          <div class="text-[11px] text-ink-muted">~${{ shoppingEstimateUsd }} estimated</div>
        </div>
      </div>
      <div class="px-5 pb-4">
        <div class="rounded-card bg-surface-raised border border-brand/15 p-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-brand mb-1">
            Sage's strategy this week
          </div>
          <p class="text-sm text-ink leading-relaxed">{{ weekStrategy }}</p>
        </div>
      </div>
    </section>

    <!-- ── Active concerns (drives the plan) ───────────────────────── -->
    <section class="card p-0 overflow-hidden border-warn/30">
      <header class="flex items-center justify-between gap-3 px-4 py-3 bg-warn/10 border-b border-warn/20">
        <div class="flex items-center gap-2">
          <span class="text-base">⚠️</span>
          <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-warn">
            Active concerns · driving this week's plan
          </span>
        </div>
        <span class="text-[11px] text-ink-muted">From your last blood work</span>
      </header>
      <ul class="divide-y divide-divider">
        <li v-for="c in activeConcerns" :key="c.label" class="px-4 py-3 flex items-start gap-3">
          <span class="inline-flex items-center rounded-full bg-warn/15 text-warn px-2 py-0.5 text-[11px] font-bold tabular-nums shrink-0">
            {{ c.value }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold text-ink">{{ c.label }} <span class="text-ink-muted font-normal text-xs">· target {{ c.target }}</span></div>
            <div class="text-[12px] text-ink-muted mt-0.5">
              <strong class="text-ink">Sage's constraint:</strong> {{ c.constraint }}
            </div>
          </div>
        </li>
      </ul>
    </section>

    <!-- ── View toggle + week grid ─────────────────────────────────── -->
    <section class="card p-0 overflow-hidden">
      <header class="flex items-start justify-between gap-3 px-4 py-3 border-b border-divider bg-surface-elevated">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">This week's plan</div>
          <div class="font-semibold text-ink mt-0.5">{{ NEXT_WEEK_LABEL }}</div>
          <div class="text-[11px] text-ink-muted mt-0.5">Click any day to expand. Today highlighted.</div>
        </div>
        <div class="inline-flex rounded-md border border-divider overflow-hidden text-xs">
          <button
            type="button"
            class="px-3 py-1.5 font-semibold transition-colors"
            :class="viewMode === 'all' ? 'bg-brand text-white' : 'bg-surface text-ink hover:bg-canvas/50'"
            @click="viewMode = 'all'"
          >All</button>
          <button
            type="button"
            class="px-3 py-1.5 font-semibold border-l border-divider transition-colors"
            :class="viewMode === 'meals' ? 'bg-brand text-white' : 'bg-surface text-ink hover:bg-canvas/50'"
            @click="viewMode = 'meals'"
          >Meals only</button>
          <button
            type="button"
            class="px-3 py-1.5 font-semibold border-l border-divider transition-colors"
            :class="viewMode === 'workouts' ? 'bg-brand text-white' : 'bg-surface text-ink hover:bg-canvas/50'"
            @click="viewMode = 'workouts'"
          >Workouts only</button>
        </div>
      </header>
      <div class="overflow-x-auto">
        <table class="w-full text-xs min-w-[800px]">
          <thead class="bg-canvas text-[10px] font-semibold text-ink-muted uppercase tracking-wide">
            <tr>
              <th class="px-3 py-2 text-left w-20">Day</th>
              <th v-if="viewMode !== 'meals'" class="px-3 py-2 text-left">Workout</th>
              <th v-if="viewMode !== 'workouts'" class="px-3 py-2 text-left">Breakfast</th>
              <th v-if="viewMode !== 'workouts'" class="px-3 py-2 text-left">Lunch</th>
              <th v-if="viewMode !== 'workouts'" class="px-3 py-2 text-left">Dinner</th>
              <th v-if="viewMode !== 'workouts'" class="px-3 py-2 text-left">Snacks</th>
              <th v-if="viewMode !== 'workouts'" class="px-3 py-2 text-right w-20">Cal · P</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-divider">
            <template v-for="d in weeklyPlan" :key="d.day">
              <tr
                class="cursor-pointer hover:bg-canvas/50"
                :class="d.isToday ? 'bg-brand/5' : ''"
                @click="toggleDay(d.day)"
              >
                <td class="px-3 py-2 font-semibold text-ink">
                  {{ d.day }}
                  <div class="text-[10px] font-normal text-ink-muted">{{ d.date }}</div>
                  <span v-if="d.isToday" class="inline-block mt-1 rounded-full bg-brand text-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">today</span>
                </td>
                <td v-if="viewMode !== 'meals'" class="px-3 py-2">
                  <div v-if="d.workout">
                    <span class="inline-flex items-center rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[10px] font-semibold">
                      {{ d.workout }}
                    </span>
                    <div v-if="viewMode === 'workouts' && d.workoutDetail" class="text-[11px] text-ink-muted mt-1">{{ d.workoutDetail }}</div>
                  </div>
                  <span v-else class="text-ink-disabled text-[10px] uppercase tracking-wider">Rest</span>
                </td>
                <td v-if="viewMode !== 'workouts'" class="px-3 py-2 text-ink truncate max-w-[160px]" :title="d.meals.breakfast.name">{{ d.meals.breakfast.name }}</td>
                <td v-if="viewMode !== 'workouts'" class="px-3 py-2 text-ink truncate max-w-[160px]" :title="d.meals.lunch.name">{{ d.meals.lunch.name }}</td>
                <td v-if="viewMode !== 'workouts'" class="px-3 py-2 text-ink truncate max-w-[160px]" :title="d.meals.dinner.name">{{ d.meals.dinner.name }}</td>
                <td v-if="viewMode !== 'workouts'" class="px-3 py-2 text-ink-muted truncate max-w-[140px]" :title="d.meals.snacks.name">{{ d.meals.snacks.name }}</td>
                <td v-if="viewMode !== 'workouts'" class="px-3 py-2 text-right tabular-nums text-ink">
                  {{ d.totalCal }}
                  <div class="text-[10px] text-ink-muted">{{ d.totalProtein }}g p</div>
                </td>
              </tr>
              <tr v-if="expandedDay === d.day" :class="d.isToday ? 'bg-brand/5' : 'bg-canvas/40'">
                <td :colspan="viewMode === 'meals' ? 6 : viewMode === 'workouts' ? 2 : 7" class="px-4 py-3 text-xs text-ink-muted">
                  <!-- Workout detail (in all + workouts modes) -->
                  <div v-if="viewMode !== 'meals' && d.workoutExercises && d.workoutExercises.length > 0" class="mb-3">
                    <div class="text-[10px] font-semibold uppercase tracking-wider text-brand mb-2">Workout exercises</div>
                    <ul class="space-y-1">
                      <li v-for="ex in d.workoutExercises" :key="ex.name" class="flex items-center justify-between gap-2">
                        <div>
                          <span class="text-ink font-semibold">{{ ex.name }}</span>
                          <span v-if="ex.notes" class="text-ink-muted ml-2">· {{ ex.notes }}</span>
                        </div>
                        <span class="font-mono text-ink-muted text-[11px] shrink-0">{{ ex.sets }} @ {{ ex.load }}</span>
                      </li>
                    </ul>
                  </div>
                  <!-- Meal detail (in all + meals modes) -->
                  <div v-if="viewMode !== 'workouts'">
                    <div class="text-[10px] font-semibold uppercase tracking-wider text-brand mb-2">Meal detail</div>
                    <div class="grid sm:grid-cols-2 gap-3">
                      <div v-for="(meal, slot) in d.meals" :key="slot">
                        <div class="text-[10px] uppercase tracking-wider text-ink-muted mb-0.5">{{ slot }}</div>
                        <div class="text-ink font-semibold">{{ meal.name }}</div>
                        <div class="text-ink-muted text-[12px] leading-snug">{{ meal.detail }}</div>
                        <div class="text-[10px] text-ink-disabled mt-0.5">{{ meal.cal }} cal · {{ meal.protein }}g protein</div>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── Sage's swaps this week ──────────────────────────────────── -->
    <section v-if="viewMode !== 'workouts'" class="card p-0 overflow-hidden border-brand/20">
      <header class="flex items-center gap-2 px-4 py-3 border-b border-brand/15 bg-brand/5">
        <AssistantMark class="h-4 w-4 text-brand" />
        <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
          Sage's swaps this week · because of your active concerns
        </span>
      </header>
      <ul class="divide-y divide-divider">
        <li v-for="(s, i) in swaps" :key="i" class="px-4 py-3">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div class="min-w-0 flex-1">
              <div class="text-[11px] font-semibold uppercase tracking-wider text-brand mb-0.5">{{ s.day }}</div>
              <div class="text-sm text-ink font-semibold">{{ s.change }}</div>
            </div>
            <div class="text-[11px] text-ink-muted italic shrink-0 max-w-[280px] text-right">
              {{ s.why }}
            </div>
          </div>
        </li>
      </ul>
    </section>

    <!-- ── Shopping list ───────────────────────────────────────────── -->
    <section v-if="viewMode !== 'workouts'" class="card p-0 overflow-hidden">
      <header class="flex items-start justify-between gap-3 px-4 py-3 border-b border-divider bg-surface-elevated">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Shopping list</div>
          <div class="font-semibold text-ink mt-0.5">{{ shoppingList.length }} items · ~${{ shoppingEstimateUsd }} estimated</div>
          <div class="text-[11px] text-ink-muted mt-0.5">Auto-generated from this week's plan. Check off as you shop.</div>
        </div>
        <div class="flex items-center gap-2">
          <button class="rounded-md border border-divider text-ink bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:border-brand">
            Send to Notes
          </button>
          <button class="rounded-md border border-divider text-ink bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:border-brand">
            Email me
          </button>
        </div>
      </header>
      <div class="grid gap-4 md:grid-cols-2 px-4 py-4">
        <div v-for="group in shoppingByCategory" :key="group.category">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">{{ group.category }}</div>
          <ul class="space-y-1.5">
            <li
              v-for="item in group.items"
              :key="item.name"
              class="flex items-center gap-2 text-sm cursor-pointer"
              :class="shoppingChecked.has(item.name) ? 'text-ink-disabled line-through' : 'text-ink'"
              @click="toggleItem(item.name)"
            >
              <input
                type="checkbox"
                :checked="shoppingChecked.has(item.name)"
                class="h-3.5 w-3.5 rounded border-divider"
                @click.stop="toggleItem(item.name)"
              />
              <span class="flex-1">{{ item.name }}</span>
              <span class="text-[11px] text-ink-muted">{{ item.qty }}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>
