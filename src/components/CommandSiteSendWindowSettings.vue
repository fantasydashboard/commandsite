<script setup lang="ts">
/**
 * Send-window settings panel.
 *
 * Edits cs_settings.outreach_send_window. The data model is intentionally
 * simple: one hour range that applies to all allowed days, a list of which
 * weekdays count, a list of blocked specific dates (holidays), and a hard
 * daily cap. The 7-day grid below is read-only — it visualizes what the
 * settings produce.
 *
 * Mirrors the gate logic in supabase/functions/gmail-send. If you change
 * the shape here, change the SendWindow type there too.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import AdaIcon from '@/components/ada/AdaIcon.vue'

interface SendWindow {
  tz_strategy: 'recipient_local' | 'sender_local' | 'fixed_et'
  weekday_hours: { start: number; end: number }
  allowed_days: string[]
  blocked_dates: string[]
  max_per_day: number
  jitter_minutes: number
  /** 0-100. Reserves this percentage of max_per_day for Touch 2/3.
   *  Cold T1 sends cap at (max_per_day - reserve); follow-ups can use
   *  any of the remaining slots. Default 60. */
  followup_reserve_pct: number
}

const DAY_LABELS: { key: string; label: string; short: string }[] = [
  { key: 'mon', label: 'Monday',    short: 'M' },
  { key: 'tue', label: 'Tuesday',   short: 'T' },
  { key: 'wed', label: 'Wednesday', short: 'W' },
  { key: 'thu', label: 'Thursday',  short: 'T' },
  { key: 'fri', label: 'Friday',    short: 'F' },
  { key: 'sat', label: 'Saturday',  short: 'S' },
  { key: 'sun', label: 'Sunday',    short: 'S' },
]

const window_ = ref<SendWindow | null>(null)
const newBlockedDate = ref('')
const saving = ref(false)
const dirty = ref(false)
const message = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)

async function load() {
  const { data } = await supabase
    .from('cs_settings')
    .select('outreach_send_window')
    .eq('id', 1)
    .maybeSingle()
  const raw = (data as { outreach_send_window?: Partial<SendWindow> } | null)?.outreach_send_window ?? null
  // Backfill the reserve key on legacy rows so the slider always has a value.
  // Migration 0071 patches existing rows, but local dev environments may not
  // have run it yet — this keeps the UI usable either way.
  if (raw && raw.followup_reserve_pct === undefined) raw.followup_reserve_pct = 60
  window_.value = raw as SendWindow | null
  dirty.value = false
}

async function save() {
  if (!window_.value || saving.value) return
  saving.value = true
  message.value = null
  const { error } = await supabase
    .from('cs_settings')
    .update({ outreach_send_window: window_.value } as never)
    .eq('id', 1)
  saving.value = false
  if (error) {
    message.value = { kind: 'err', text: `Save failed: ${error.message}` }
    return
  }
  dirty.value = false
  message.value = { kind: 'ok', text: 'Send window saved. Crons + Sign-off buttons now use the new rules.' }
  setTimeout(() => { if (message.value?.kind === 'ok') message.value = null }, 4000)
}

function toggleDay(key: string) {
  if (!window_.value) return
  const idx = window_.value.allowed_days.indexOf(key)
  if (idx >= 0) {
    window_.value.allowed_days = window_.value.allowed_days.filter((d) => d !== key)
  } else {
    window_.value.allowed_days = [...window_.value.allowed_days, key]
  }
  dirty.value = true
}

function addBlockedDate() {
  if (!window_.value) return
  const d = newBlockedDate.value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return
  if (window_.value.blocked_dates.includes(d)) return
  window_.value.blocked_dates = [...window_.value.blocked_dates, d].sort()
  newBlockedDate.value = ''
  dirty.value = true
}

function removeBlockedDate(d: string) {
  if (!window_.value) return
  window_.value.blocked_dates = window_.value.blocked_dates.filter((x) => x !== d)
  dirty.value = true
}

watch(window_, () => { dirty.value = true }, { deep: true })

onMounted(load)

// ── Grid preview: 7 days × 24 hours, green if "Ada would send here"
const gridHours = computed(() => Array.from({ length: 24 }, (_, h) => h))

function isCellActive(dayKey: string, hour: number): boolean {
  if (!window_.value) return false
  if (!window_.value.allowed_days.includes(dayKey)) return false
  return hour >= window_.value.weekday_hours.start && hour < window_.value.weekday_hours.end
}

function fmtHour(h: number): string {
  if (h === 0) return '12a'
  if (h === 12) return '12p'
  if (h < 12) return `${h}a`
  return `${h - 12}p`
}

// ── Reserve split readout
// Computes how the daily cap divides into cold-T1 budget vs follow-up reserve,
// shown live as the operator drags the slider.
const reserveSplit = computed(() => {
  if (!window_.value) return null
  const cap = window_.value.max_per_day
  const pct = Math.max(0, Math.min(100, window_.value.followup_reserve_pct))
  const reserve = Math.floor(cap * pct / 100)
  const cold = Math.max(0, cap - reserve)
  return { cap, pct, reserve, cold }
})
</script>

<template>
  <section class="card">
    <header class="mb-4">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-1">
        Outreach automation
      </div>
      <h3 class="text-base font-semibold text-ink">Send window + daily cap</h3>
      <p class="text-xs text-ink-muted mt-1 leading-relaxed">
        Controls when Ada is allowed to fire outbound sends. Drafts queue up outside these hours
        and ship the next time the window opens. Replies (in-thread) bypass the gate.
      </p>
    </header>

    <div v-if="!window_" class="text-sm text-ink-muted py-4">Loading…</div>

    <div v-else class="space-y-5">
      <!-- Row 1: hours + cap -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label class="block">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Start hour (ET)
          </span>
          <select
            v-model.number="window_.weekday_hours.start"
            class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
          >
            <option v-for="h in gridHours" :key="h" :value="h">{{ fmtHour(h) }} ({{ h }}:00)</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            End hour (ET)
          </span>
          <select
            v-model.number="window_.weekday_hours.end"
            class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
          >
            <option v-for="h in gridHours" :key="h" :value="h">{{ fmtHour(h) }} ({{ h }}:00)</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Daily cap
          </span>
          <input
            v-model.number="window_.max_per_day"
            type="number"
            min="0"
            max="500"
            class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-2 py-1.5 text-sm text-ink tabular-nums focus:border-brand focus:outline-none"
          />
          <p class="text-[10px] text-ink-disabled mt-1">Max emails sent per day. Gmail's hard ceiling is ~500.</p>
        </label>
      </div>

      <!-- Row 1.5: follow-up reserve (priority within the daily cap) -->
      <div>
        <div class="flex items-baseline justify-between mb-1">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Follow-up reserve
          </span>
          <span v-if="reserveSplit" class="text-[10px] text-ink-disabled tabular-nums">
            {{ reserveSplit.pct }}% reserved
          </span>
        </div>
        <p class="text-[11px] text-ink-muted mb-2 leading-relaxed">
          Slots of the daily cap held for Touch 2 + Touch 3 follow-ups. Stops a heavy cold-outreach day
          from squeezing out the follow-up cadence. Cold sends queue past tomorrow once the cold budget fills.
        </p>
        <input
          v-model.number="window_.followup_reserve_pct"
          type="range"
          min="0"
          max="100"
          step="5"
          class="w-full accent-brand"
        />
        <div v-if="reserveSplit" class="mt-2 grid grid-cols-2 gap-2">
          <div class="rounded-card border border-divider bg-surface-raised px-3 py-2">
            <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-disabled mb-0.5">
              Cold (Touch 1)
            </div>
            <div class="text-base font-semibold text-ink tabular-nums">
              {{ reserveSplit.cold }} <span class="text-[11px] font-normal text-ink-muted">/ day</span>
            </div>
          </div>
          <div class="rounded-card border border-brand/30 bg-brand/5 px-3 py-2">
            <div class="text-[10px] font-semibold uppercase tracking-wider text-brand mb-0.5">
              Follow-ups (Touch 2/3)
            </div>
            <div class="text-base font-semibold text-ink tabular-nums">
              {{ reserveSplit.reserve }}<span class="text-ink-muted">+</span>
              <span class="text-[11px] font-normal text-ink-muted">reserved</span>
            </div>
          </div>
        </div>
        <p class="text-[10px] text-ink-disabled mt-2 italic">
          Follow-ups can also use unspent cold slots, but cold sends can never use reserved follow-up slots.
        </p>
      </div>

      <!-- Row 2: day toggles -->
      <div>
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
          Allowed days
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="d in DAY_LABELS"
            :key="d.key"
            type="button"
            class="rounded-md border px-3 py-1.5 text-xs font-semibold transition-[background-color,border-color,transform] duration-150 ease-out-quart active:scale-[0.97]"
            :class="window_.allowed_days.includes(d.key)
              ? 'border-brand bg-brand/10 text-brand'
              : 'border-divider bg-surface-raised text-ink-muted hover:border-divider-bright'"
            @click="toggleDay(d.key)"
          >{{ d.label }}</button>
        </div>
      </div>

      <!-- Row 3: blocked dates -->
      <div>
        <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
          Blocked dates
        </div>
        <p class="text-[11px] text-ink-muted mb-2">
          Specific dates to skip (US federal holidays, your team's PTO, etc.). Format: YYYY-MM-DD.
        </p>
        <div class="flex items-center gap-2">
          <input
            v-model="newBlockedDate"
            type="date"
            class="rounded-md border border-divider bg-surface-raised px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
            @keyup.enter="addBlockedDate"
          />
          <button
            type="button"
            class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-[opacity,transform] duration-150 ease-out-quart active:scale-[0.97]"
            @click="addBlockedDate"
          >Add</button>
        </div>
        <div v-if="window_.blocked_dates.length > 0" class="mt-2 flex flex-wrap gap-1.5">
          <span
            v-for="d in window_.blocked_dates"
            :key="d"
            class="inline-flex items-center gap-1.5 rounded-full bg-warn/15 text-warn px-2 py-0.5 text-[11px] font-medium tabular-nums"
          >
            {{ d }}
            <button
              type="button"
              class="hover:opacity-70"
              aria-label="Remove blocked date"
              @click="removeBlockedDate(d)"
            >×</button>
          </span>
        </div>
        <p v-else class="text-[11px] text-ink-disabled mt-2 italic">
          No blocked dates. Sends will fire on every allowed weekday.
        </p>
      </div>

      <!-- Row 4: read-only grid preview -->
      <div>
        <div class="flex items-baseline justify-between mb-2">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Week preview
          </span>
          <span class="text-[10px] text-ink-disabled">Green = sends fire · gray = blocked</span>
        </div>
        <div class="rounded-card border border-divider bg-surface-raised p-3 overflow-x-auto">
          <div class="grid grid-cols-[40px_repeat(24,minmax(14px,1fr))] gap-px text-[9px] text-ink-disabled tabular-nums">
            <div></div>
            <div v-for="h in gridHours" :key="`h-${h}`" class="text-center">{{ h % 3 === 0 ? fmtHour(h) : '' }}</div>
            <template v-for="d in DAY_LABELS" :key="d.key">
              <div class="font-semibold text-ink-muted self-center">{{ d.short }}</div>
              <div
                v-for="h in gridHours"
                :key="`${d.key}-${h}`"
                class="h-4 rounded-sm"
                :class="isCellActive(d.key, h) ? 'bg-success/70' : 'bg-divider/40'"
                :title="`${d.label} · ${fmtHour(h)} · ${isCellActive(d.key, h) ? 'allowed' : 'blocked'}`"
              ></div>
            </template>
          </div>
        </div>
      </div>

      <!-- Save bar -->
      <div class="flex items-center justify-between gap-3 pt-2 border-t border-divider">
        <div>
          <p
            v-if="message"
            class="text-xs"
            :class="message.kind === 'ok' ? 'text-success' : 'text-danger'"
          >{{ message.text }}</p>
          <p v-else-if="dirty" class="text-xs text-ink-muted italic">Unsaved changes</p>
        </div>
        <button
          type="button"
          class="rounded-md bg-brand text-ink-inverse px-4 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-[opacity,transform] duration-150 ease-out-quart active:scale-[0.97] inline-flex items-center gap-1.5"
          :disabled="!dirty || saving"
          @click="save"
        >
          <AdaIcon v-if="!saving" name="check-circle" class="h-3.5 w-3.5" />
          {{ saving ? 'Saving…' : 'Save changes' }}
        </button>
      </div>
    </div>
  </section>
</template>
