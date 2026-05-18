<script setup lang="ts">
/**
 * Josh Personal — Today's meals: plan vs actual (merged view).
 *
 * Replaces the two separate "Today's planned meals" + "Today's food
 * log" sections. For each meal slot (breakfast, lunch, dinner, snacks)
 * shows the planned item, any logged entries, and a status dot.
 *
 * Adherence dot logic:
 *   green   : logged AND cal within ±25% of plan
 *   blue    : logged AND no plan to compare against
 *   yellow  : logged BUT off by more than ±25% of plan
 *   red     : not logged AND past the typical end time for that slot
 *   gray    : not logged AND still upcoming (or no plan and no log)
 */
import { computed, ref } from 'vue'
import type { MealLogEntry } from '@/lib/clients/josh-personal/mealLogApi'

type SlotKey = 'breakfast' | 'lunch' | 'dinner' | 'snacks'
type LogSlotKey = 'breakfast' | 'lunch' | 'dinner' | 'snack'
interface PlannedMeal { name: string; cal: number; protein: number; detail: string; servings?: number }
type PlannedDayMeals = Partial<Record<SlotKey, PlannedMeal>>

export interface LogPlannedPayload {
  description: string
  meal_slot: LogSlotKey
  estimated_cal: number | null
  estimated_protein_g: number | null
}

const props = defineProps<{
  plannedMeals: PlannedDayMeals | null
  loggedMeals: MealLogEntry[]
  showPlanFallbackHint?: boolean
}>()

const emit = defineEmits<{
  (e: 'delete-meal', id: string): void
  (e: 'log-planned', payload: LogPlannedPayload): void
}>()

// Snack-detail parser. Sage typically lists items separated by " + ",
// occasionally commas or middle dots. Single-item details stay as one
// row. Splitting matters because Josh wants to mark each snack as
// eaten on its own, not as one combined entry.
interface SnackItem { name: string; cal: number; protein: number }
function parseSnackItems(planned: PlannedMeal): SnackItem[] {
  const detail = (planned.detail ?? '').trim()
  const parts = detail
    ? detail.split(/\s*[+·,]\s*/g).map((s) => s.trim()).filter(Boolean)
    : []
  const items = parts.length > 0 ? parts : [planned.name]
  const n = Math.max(1, items.length)
  const totalCal = planned.cal ?? 0
  const totalProtein = planned.protein ?? 0
  return items.map((name) => ({
    name,
    cal: Math.round(totalCal / n),
    protein: Math.round((totalProtein / n) * 10) / 10,
  }))
}

// Per-(slot+item) lockout so a misclick can't insert twice. The actual
// persistence + reload happens in the parent; we just gate the button.
const pendingKeys = ref<Set<string>>(new Set())
function keyFor(slot: SlotKey, itemName: string) { return `${slot}::${itemName}` }
function isPending(slot: SlotKey, itemName: string): boolean {
  return pendingKeys.value.has(keyFor(slot, itemName))
}
function logPlanned(slot: SlotKey, item: { name: string; cal: number | null; protein: number | null }) {
  const key = keyFor(slot, item.name)
  if (pendingKeys.value.has(key)) return
  pendingKeys.value.add(key)
  emit('log-planned', {
    description: item.name,
    meal_slot: slot === 'snacks' ? 'snack' : slot,
    estimated_cal: item.cal,
    estimated_protein_g: item.protein,
  })
  // Brief lockout — by the time it clears the parent has reloaded
  // and the new entry shows up in the "Logged" list below.
  setTimeout(() => pendingKeys.value.delete(key), 800)
}

// Typical end-of-window hours used for "missed" detection.
const SLOT_END_HOUR: Record<SlotKey, number> = {
  breakfast: 11,
  lunch: 15,
  dinner: 21,
  snacks: 23,
}

const SLOT_LABEL: Record<SlotKey, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
}

function logSlotToPlanSlot(s: MealLogEntry['meal_slot']): SlotKey | null {
  if (s === 'breakfast' || s === 'lunch' || s === 'dinner') return s
  if (s === 'snack') return 'snacks'
  return null
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

interface SlotRow {
  slot: SlotKey
  label: string
  planned: PlannedMeal | null
  logged: MealLogEntry[]
  loggedCal: number
  loggedProtein: number
  dot: { color: 'green' | 'blue' | 'yellow' | 'red' | 'gray'; label: string }
}

const rows = computed<SlotRow[]>(() => {
  const now = new Date()
  const hour = now.getHours()
  const planned = props.plannedMeals ?? {}
  // Group logs by their mapped slot
  const byPlanSlot: Record<SlotKey, MealLogEntry[]> = { breakfast: [], lunch: [], dinner: [], snacks: [] }
  for (const m of props.loggedMeals) {
    const s = logSlotToPlanSlot(m.meal_slot)
    if (s) byPlanSlot[s].push(m)
    else byPlanSlot.snacks.push(m)  // unslotted entries pool into snacks
  }
  const slots: SlotKey[] = ['breakfast', 'lunch', 'dinner', 'snacks']
  return slots.map((slot) => {
    const p = planned[slot] ?? null
    const logs = byPlanSlot[slot]
    const loggedCal = logs.reduce((s, m) => s + (m.estimated_cal ?? 0), 0)
    const loggedProtein = logs.reduce((s, m) => s + (m.estimated_protein_g ?? 0), 0)
    let dot: SlotRow['dot']
    if (logs.length > 0) {
      if (p) {
        const ratio = loggedCal / Math.max(1, p.cal)
        if (ratio >= 0.75 && ratio <= 1.25) {
          dot = { color: 'green', label: 'On plan' }
        } else {
          dot = { color: 'yellow', label: ratio < 0.75 ? 'Logged under plan' : 'Logged over plan' }
        }
      } else {
        dot = { color: 'blue', label: 'Logged' }
      }
    } else {
      if (hour >= SLOT_END_HOUR[slot]) {
        dot = { color: 'red', label: 'Missed' }
      } else {
        dot = { color: 'gray', label: 'Upcoming' }
      }
    }
    return { slot, label: SLOT_LABEL[slot], planned: p, logged: logs, loggedCal, loggedProtein, dot }
  })
})

function dotClass(color: SlotRow['dot']['color']): string {
  switch (color) {
    case 'green':  return 'bg-success'
    case 'blue':   return 'bg-brand'
    case 'yellow': return 'bg-warn'
    case 'red':    return 'bg-danger'
    case 'gray':   return 'bg-divider'
  }
}
</script>

<template>
  <section class="card p-0 overflow-hidden">
    <header class="flex items-start justify-between gap-3 px-4 py-3 border-b border-divider bg-surface-elevated">
      <div>
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Today · plan vs actual</div>
        <div class="text-[11px] text-ink-muted mt-0.5">
          Plan from this week's plan · log via Ask Sage chat or the camera snap on each row.
        </div>
      </div>
    </header>

    <ul class="divide-y divide-divider">
      <li v-for="row in rows" :key="row.slot" class="px-4 py-3">
        <div class="flex items-start gap-3">
          <span
            class="h-2 w-2 rounded-full mt-2 shrink-0"
            :class="dotClass(row.dot.color)"
            :title="row.dot.label"
          />
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline justify-between gap-2">
              <span class="text-sm font-semibold text-ink">{{ row.label }}</span>
              <span class="text-[10px] text-ink-muted">{{ row.dot.label }}</span>
            </div>

            <!-- Planned -->
            <div v-if="row.planned" class="mt-1">
              <div class="text-[10px] uppercase tracking-wider text-ink-muted">Planned</div>

              <!-- Snacks: split detail into per-item rows so each can
                   be marked as eaten on its own. -->
              <template v-if="row.slot === 'snacks'">
                <div class="text-sm text-ink">{{ row.planned.name }}</div>
                <ul class="mt-1.5 space-y-1">
                  <li
                    v-for="item in parseSnackItems(row.planned)"
                    :key="item.name"
                    class="flex items-center justify-between gap-2"
                  >
                    <div class="min-w-0 flex-1">
                      <div class="text-[12px] text-ink leading-snug">{{ item.name }}</div>
                      <div class="text-[10px] text-ink-disabled tabular-nums">
                        ~{{ item.cal }} cal · {{ item.protein }}g p
                      </div>
                    </div>
                    <button
                      type="button"
                      class="text-[11px] font-semibold text-brand border border-brand/30 rounded-md px-2 py-1 hover:bg-brand/5 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                      :disabled="isPending(row.slot, item.name)"
                      @click="logPlanned(row.slot, item)"
                    >{{ isPending(row.slot, item.name) ? '✓ Logged' : 'Mark eaten' }}</button>
                  </li>
                </ul>
                <div class="text-[10px] text-ink-disabled tabular-nums mt-1">
                  Total: {{ row.planned.cal }} cal · {{ row.planned.protein }}g protein
                </div>
              </template>

              <!-- Breakfast/lunch/dinner: one row, one button. -->
              <template v-else>
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <div class="text-sm text-ink">{{ row.planned.name }}</div>
                    <div class="text-[11px] text-ink-muted leading-snug">{{ row.planned.detail }}</div>
                    <div class="text-[10px] text-ink-disabled tabular-nums mt-0.5">
                      {{ row.planned.cal }} cal · {{ row.planned.protein }}g protein
                      <span v-if="row.planned.servings && row.planned.servings > 1" class="ml-1">· serves {{ row.planned.servings }}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="text-[11px] font-semibold text-brand border border-brand/30 rounded-md px-2 py-1 hover:bg-brand/5 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    :disabled="isPending(row.slot, row.planned.name)"
                    @click="logPlanned(row.slot, { name: row.planned.name, cal: row.planned.cal, protein: row.planned.protein })"
                  >{{ isPending(row.slot, row.planned.name) ? '✓ Logged' : 'Mark eaten' }}</button>
                </div>
              </template>
            </div>
            <div v-else-if="showPlanFallbackHint" class="mt-1 text-[11px] text-ink-disabled italic">
              No plan for {{ row.label.toLowerCase() }} this week
            </div>

            <!-- Actual logs -->
            <div v-if="row.logged.length > 0" class="mt-2">
              <div class="text-[10px] uppercase tracking-wider text-ink-muted">
                Logged · {{ row.loggedCal }} cal · {{ Math.round(row.loggedProtein) }}g p
                <span v-if="row.planned" class="ml-1">vs {{ row.planned.cal }} cal planned</span>
              </div>
              <ul class="space-y-1 mt-1">
                <li v-for="m in row.logged" :key="m.id" class="text-[12px] text-ink leading-snug group flex items-start justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <span class="text-ink-disabled mr-1 tabular-nums text-[10px]">{{ fmtTime(m.logged_at) }}</span>
                    {{ m.description }}
                    <span v-if="m.estimated_cal" class="text-ink-disabled tabular-nums ml-1 text-[10px]">({{ m.estimated_cal }} cal · {{ Math.round(m.estimated_protein_g ?? 0) }}g p)</span>
                  </div>
                  <button
                    type="button"
                    class="text-[10px] text-danger opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    @click="emit('delete-meal', m.id)"
                  >Delete</button>
                </li>
              </ul>
            </div>
            <div v-else class="mt-1 text-[11px] text-ink-disabled italic">
              <template v-if="row.dot.color === 'red'">Not logged for {{ row.label.toLowerCase() }} today.</template>
              <template v-else>Nothing logged yet.</template>
            </div>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
