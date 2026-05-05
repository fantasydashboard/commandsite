<script setup lang="ts">
/**
 * Apex Settings — business hours, tech roster, AI receptionist config,
 * integrations, and service-area zip codes. Edits are local-only in
 * the demo (no backend persistence yet).
 */
import { computed, reactive, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  businessHours,
  techs,
  aiReceptionist,
  integrations,
  serviceAreaZips,
} from '@/lib/clients/apex/settings'

defineProps<{ client: Client; config: Record<string, unknown> }>()

// Reactive copies so the demo can simulate edits without mutating the
// shared fixture data on hot-reload.
const hours = reactive(businessHours.map((h) => ({ ...h })))
const roster = reactive(techs.map((t) => ({ ...t })))
const ai = reactive({ ...aiReceptionist })
const ints = reactive(integrations.map((i) => ({ ...i })))
const zips = ref<string[]>([...serviceAreaZips])

const dirty = ref(false)
function markDirty() { dirty.value = true }
function saveAll() {
  // Demo-only: pretend to save and clear the dirty flag.
  dirty.value = false
}

const totalConnected = computed(() => ints.filter((i) => i.connected).length)
const techsActive = computed(() => roster.filter((t) => t.active).length)
const onCallNow = computed(() => roster.filter((t) => t.on_call && t.active).map((t) => t.name).join(', ') || '—')

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}

function roleLabel(r: string): string {
  if (r === 'lead') return 'Lead'
  if (r === 'apprentice') return 'Apprentice'
  return 'Technician'
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header with sticky save bar -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Settings</h2>
        <p class="text-sm text-ink-muted">
          Business hours, technicians, AI receptionist, integrations, and service area.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="dirty" class="text-xs text-warn">Unsaved changes</span>
        <button
          type="button"
          class="rounded-md bg-brand text-white px-4 py-1.5 text-sm font-semibold disabled:opacity-50 hover:opacity-90"
          :disabled="!dirty"
          @click="saveAll"
        >Save changes</button>
      </div>
    </div>

    <!-- Quick-look strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Techs Active</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ techsActive }}</div>
      </div>
      <div class="card">
        <div class="kpi-label">On-Call Tonight</div>
        <div class="mt-1 text-sm font-semibold text-ink truncate">{{ onCallNow }}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Integrations</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">
          {{ totalConnected }} <span class="text-base text-ink-muted">/ {{ ints.length }}</span>
        </div>
      </div>
      <div class="card">
        <div class="kpi-label">Service ZIPs</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ zips.length }}</div>
      </div>
    </div>

    <!-- Business Hours -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Business Hours</span>
        <span class="text-xs text-ink-muted">After-hours calls route to the AI receptionist</span>
      </div>
      <div class="space-y-1.5">
        <div
          v-for="h in hours"
          :key="h.day"
          class="flex items-center gap-3 rounded-md px-2.5 py-1.5 hover:bg-surface-elevated/30 transition-colors"
        >
          <div class="w-12 text-sm font-medium text-ink">{{ h.day }}</div>
          <label class="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              v-model="h.open"
              class="sr-only peer"
              @change="markDirty"
            />
            <span class="relative h-5 w-9 rounded-full bg-surface-elevated transition-colors peer-checked:bg-brand">
              <span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4"></span>
            </span>
            <span class="ml-2 text-xs" :class="h.open ? 'text-ink' : 'text-ink-disabled'">
              {{ h.open ? 'Open' : 'Closed' }}
            </span>
          </label>
          <div v-if="h.open" class="flex items-center gap-2 ml-auto">
            <input
              type="time"
              v-model="h.start"
              class="rounded-md border border-divider bg-surface px-2 py-1 text-xs text-ink focus:outline-none focus:border-brand"
              @change="markDirty"
            />
            <span class="text-xs text-ink-muted">to</span>
            <input
              type="time"
              v-model="h.end"
              class="rounded-md border border-divider bg-surface px-2 py-1 text-xs text-ink focus:outline-none focus:border-brand"
              @change="markDirty"
            />
          </div>
          <div v-else class="ml-auto text-xs text-ink-disabled italic">After-hours line on</div>
        </div>
      </div>
    </section>

    <!-- Tech Roster -->
    <section class="card">
      <div class="mb-3 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="eyebrow">Technicians</span>
          <span class="chip !py-0.5 !px-2 !text-[10px]">{{ roster.length }} on roster</span>
        </div>
        <button
          type="button"
          class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand"
        >+ Add tech</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
              <th class="px-3 py-2 font-medium">Name</th>
              <th class="px-3 py-2 font-medium">Role</th>
              <th class="px-3 py-2 font-medium">Phone</th>
              <th class="px-3 py-2 font-medium text-center">On-Call</th>
              <th class="px-3 py-2 font-medium text-right">Jobs (mo)</th>
              <th class="px-3 py-2 font-medium text-right">Avg ★</th>
              <th class="px-3 py-2 font-medium text-center">Active</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="t in roster"
              :key="t.id"
              class="border-b border-divider/60 last:border-b-0 hover:bg-surface-elevated/40 transition-colors"
            >
              <td class="px-3 py-2.5 text-sm font-medium text-ink">{{ t.name }}</td>
              <td class="px-3 py-2.5 text-xs text-ink-muted">{{ roleLabel(t.role) }}</td>
              <td class="px-3 py-2.5 text-xs text-ink-muted tabular-nums">{{ t.phone }}</td>
              <td class="px-3 py-2.5 text-center">
                <input
                  type="checkbox"
                  v-model="t.on_call"
                  class="h-4 w-4 accent-brand cursor-pointer"
                  @change="markDirty"
                />
              </td>
              <td class="px-3 py-2.5 text-right text-sm tabular-nums">{{ t.jobs_this_month }}</td>
              <td class="px-3 py-2.5 text-right text-sm tabular-nums">
                <span class="text-amber-400">★</span> {{ t.avg_rating.toFixed(1) }}
              </td>
              <td class="px-3 py-2.5 text-center">
                <input
                  type="checkbox"
                  v-model="t.active"
                  class="h-4 w-4 accent-brand cursor-pointer"
                  @change="markDirty"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- AI Receptionist Config -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">AI Receptionist</span>
        <span class="rounded-full bg-success/15 text-success px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
          Active 24/7
        </span>
      </div>

      <div class="space-y-4">
        <div>
          <label class="kpi-label block mb-1">Opening greeting</label>
          <textarea
            v-model="ai.greeting"
            class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink resize-y min-h-[70px] focus:outline-none focus:border-brand"
            @input="markDirty"
          ></textarea>
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label class="kpi-label block mb-1">After-hours dispatch fee</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">$</span>
              <input
                type="number"
                :value="(ai.after_hours_fee_cents / 100).toFixed(2)"
                @input="(e) => { ai.after_hours_fee_cents = Math.round(Number((e.target as HTMLInputElement).value) * 100); markDirty() }"
                class="w-full rounded-md border border-divider bg-surface pl-7 pr-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                step="0.01"
              />
            </div>
            <div class="mt-1 text-[11px] text-ink-disabled">
              Currently quoted to callers as {{ money(ai.after_hours_fee_cents) }}
            </div>
          </div>

          <div>
            <label class="kpi-label block mb-1">Spam call handling</label>
            <select
              v-model="ai.spam_handling"
              class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
              @change="markDirty"
            >
              <option value="auto_reject">Auto-reject (recommended)</option>
              <option value="route_to_voicemail">Route to voicemail</option>
              <option value="transfer_to_human">Transfer to human</option>
            </select>
          </div>

          <div>
            <label class="kpi-label block mb-1">Transfer to human</label>
            <select
              v-model="ai.transfer_threshold"
              class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
              @change="markDirty"
            >
              <option value="never">Never (AI handles all)</option>
              <option value="hot_leads_only">Hot leads only</option>
              <option value="all_calls">All calls during hours</option>
            </select>
          </div>
        </div>

        <div>
          <label class="kpi-label block mb-1">Voicemail fallback script</label>
          <textarea
            v-model="ai.voicemail_script"
            class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink resize-y min-h-[60px] focus:outline-none focus:border-brand"
            @input="markDirty"
          ></textarea>
        </div>
      </div>
    </section>

    <!-- Integrations -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Integrations</span>
        <span class="text-xs text-ink-muted">{{ totalConnected }} of {{ ints.length }} connected</span>
      </div>
      <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div
          v-for="i in ints"
          :key="i.key"
          class="flex items-start gap-3 rounded-md border border-divider bg-surface p-3"
        >
          <span
            class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
            :class="i.connected ? 'bg-success/15 text-success' : 'bg-surface-elevated text-ink-disabled'"
          >{{ i.connected ? '✓' : '·' }}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-semibold text-ink">{{ i.label }}</span>
              <button
                type="button"
                class="text-xs font-medium hover:underline"
                :class="i.connected ? 'text-ink-muted' : 'text-brand'"
                @click="i.connected = !i.connected; markDirty()"
              >
                {{ i.connected ? 'Disconnect' : 'Connect' }}
              </button>
            </div>
            <div class="text-xs text-ink-muted">{{ i.description }}</div>
            <div v-if="i.status_note" class="mt-1 text-[11px] text-ink-disabled">{{ i.status_note }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Service Area -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Service Area</span>
        <span class="text-xs text-ink-muted">{{ zips.length }} ZIP codes · Greater Orlando + Kissimmee</span>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <span
          v-for="z in zips"
          :key="z"
          class="rounded-full bg-surface-elevated px-2.5 py-1 text-xs font-medium text-ink-muted tabular-nums"
        >{{ z }}</span>
        <button
          type="button"
          class="rounded-full border border-dashed border-divider px-2.5 py-1 text-xs font-medium text-ink-muted hover:border-brand hover:text-brand"
        >+ Add ZIP</button>
      </div>
      <div class="mt-2 text-[11px] text-ink-disabled">
        Calls from outside the service area are politely declined and forwarded to a partner referral list.
      </div>
    </section>
  </div>
</template>
