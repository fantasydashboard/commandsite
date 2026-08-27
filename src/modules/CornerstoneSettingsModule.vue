<script setup lang="ts">
/**
 * Cornerstone Settings.
 * Team + roles, service times, integrations (ChMS / giving / comms /
 * social / tech-AV / AI), and privacy / role-gating.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  ROLE_LABEL,
  PERMISSION_LABEL,
  SERVICE_TYPE_LABEL,
  INTEGRATION_CATEGORY_LABEL,
} from '@/lib/clients/cornerstone/settings'
import { churchDataset } from '@/lib/clients/church/dataset'
import { loadCareData } from '@/lib/clients/church/careDataLoader'
import { LIVE_CHURCHES } from '@/lib/clients/church/liveChurches'
import DuplicatesSettings from '@/components/cornerstone/DuplicatesSettings.vue'
import TeamSettings from '@/components/cornerstone/TeamSettings.vue'
import IntegrationsCatalog from '@/components/cornerstone/IntegrationsCatalog.vue'
import PrivacySettings from '@/components/cornerstone/PrivacySettings.vue'
import HiddenFlagsSettings from '@/components/cornerstone/HiddenFlagsSettings.vue'
import PageLeadsSettings from '@/components/cornerstone/PageLeadsSettings.vue'
import SignatureSettings from '@/components/cornerstone/SignatureSettings.vue'
import RefreshNowButton from '@/components/cornerstone/RefreshNowButton.vue'

const props = defineProps<{ client: Client; config: Record<string, unknown> }>()

// The possible-duplicates review list and the real Planning Center connection
// run on Focal Point's live data; the Cornerstone demo has no equivalent, so
// both are gated by slug.
const showDuplicates = props.client.slug === 'focal-point-church'
// Churches with a live Planning Center OAuth connection surface. Add a slug
// to LIVE_CHURCHES (src/lib/clients/church/liveChurches.ts) when a new church
// onboards; the public Cornerstone demo stays excluded.
const showPcoConnect = LIVE_CHURCHES.includes(props.client.slug)
// showPcoConnect (LIVE_CHURCHES) already marks a real church. Reuse it to
// branch every section between real behavior and the Cornerstone demo's sample data.
const isRealChurch = showPcoConnect

// Client-varying data resolved by slug. Names preserved so the rest of the
// module and its template are unchanged. Types + *_LABEL stay shared above.
const data = churchDataset(props.client.slug)
const teamMembers = data.settings.team
const serviceTimes = data.settings.serviceTimes
const integrations = data.settings.integrations
const privacySettings = data.settings.privacy
const settingsStats = data.settings.stats

const stats = computed(() => settingsStats())
const intsLocal = reactive(integrations.map((i) => ({ ...i })))
const privacyLocal = reactive(privacySettings.map((p) => ({ ...p })))
const dirty = ref(false)
function markDirty() { dirty.value = true }
function saveAll() { dirty.value = false }

function fmtAgo(iso?: string): string {
  if (!iso) return 'Never'
  const ms = Date.now() - new Date(iso).getTime()
  const day = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (day === 0) return 'today'
  if (day < 30) return `${day}d ago`
  if (day < 365) return `${Math.floor(day / 30)}mo ago`
  return `${(day / 365).toFixed(1)}yr ago`
}

onMounted(() => {
  if (LIVE_CHURCHES.includes(props.client?.slug)) loadCareData(props.client.slug)
})

const intsByCategory = computed(() => {
  const groups = new Map<string, typeof intsLocal>()
  for (const i of intsLocal) {
    if (!groups.has(i.category)) groups.set(i.category, [])
    groups.get(i.category)!.push(i)
  }
  const order = ['chms', 'giving', 'comms', 'social', 'tech_av', 'productivity', 'ai']
  return Array.from(groups.entries()).sort(
    ([a], [b]) => order.indexOf(a) - order.indexOf(b),
  )
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Settings</h2>
        <p class="text-sm text-ink-muted">
          Team + roles, service times, integrations, and privacy rules. Senior-pastor-only sections marked with 🔒.
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

    <!-- Live data sync: real churches only, sits above the KPI/team sections. -->
    <div v-if="isRealChurch" class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <span class="eyebrow">Live data sync</span>
        <p class="text-xs text-ink-muted mt-0.5">Pull the latest from Planning Center on demand instead of waiting for the scheduled sync.</p>
      </div>
      <RefreshNowButton :slug="client.slug" />
    </div>

    <!-- KPI strip -->
    <div v-if="!isRealChurch" class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Team</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.team_active }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">active members</div>
      </div>
      <div class="card">
        <div class="kpi-label">Service times</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.services_active }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">active per week</div>
      </div>
      <div class="card">
        <div class="kpi-label">Integrations</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">
          {{ stats.integrations_connected }} <span class="text-base text-ink-muted">/ {{ stats.integrations_total }}</span>
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">connected</div>
      </div>
      <div class="card">
        <div class="kpi-label">Privacy rules</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">
          {{ stats.privacy_enabled }} <span class="text-base text-ink-muted">/ {{ stats.privacy_total }}</span>
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">enforced</div>
      </div>
    </div>

    <!-- Team: real for live churches, sample for the demo -->
    <TeamSettings v-if="isRealChurch" :tenant="client.slug" />
    <section v-else class="card">
      <div class="mb-3 flex items-center justify-between">
        <span class="eyebrow">Team + Permissions</span>
        <button type="button" class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand">+ Invite</button>
      </div>
      <div class="space-y-2">
        <article
          v-for="m in teamMembers"
          :key="m.id"
          class="flex items-center gap-3 rounded-md border border-divider p-3"
        >
          <div class="flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 text-brand text-sm font-bold">
            {{ m.name.split(' ').map((n) => n[0]).join('') }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex flex-wrap items-baseline gap-x-2">
              <span class="text-sm font-semibold text-ink">{{ m.name }}</span>
              <span class="text-[11px] text-ink-muted">· {{ m.email }}</span>
            </div>
            <div class="text-[11px] text-ink-disabled">added {{ fmtAgo(m.added_at) }}</div>
          </div>
          <span
            class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            :class="m.role === 'senior_pastor' ? 'bg-brand text-white' : 'bg-surface-elevated text-ink-muted'"
          >{{ ROLE_LABEL[m.role] }}</span>
          <span
            class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
            :class="m.permission_scope === 'full'
              ? 'bg-brand/15 text-brand'
              : m.permission_scope === 'finance'
              ? 'bg-warn/15 text-warn'
              : 'bg-surface-elevated text-ink-muted'"
          >{{ PERMISSION_LABEL[m.permission_scope] }}</span>
          <input type="checkbox" :checked="m.active" @change="markDirty" class="h-4 w-4 accent-brand cursor-pointer" />
        </article>
      </div>
    </section>

    <!-- Service times: demo only (sample data, not wired). Hidden for real churches. -->
    <section v-if="!isRealChurch" class="card">
      <div class="mb-3 flex items-center justify-between">
        <span class="eyebrow">Service Times</span>
        <button type="button" class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand">+ Add service</button>
      </div>
      <div class="space-y-2">
        <article
          v-for="s in serviceTimes"
          :key="s.id"
          class="grid grid-cols-1 sm:grid-cols-5 gap-3 rounded-md border border-divider p-3 items-center"
        >
          <div>
            <div class="text-sm font-semibold text-ink">{{ s.day }}</div>
            <div class="text-[11px] text-ink-muted">{{ s.time }}</div>
          </div>
          <div>
            <span class="rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">{{ SERVICE_TYPE_LABEL[s.service_type] }}</span>
          </div>
          <div class="text-xs text-ink-muted">📍 {{ s.location }}</div>
          <div class="text-xs text-ink-muted">~{{ s.expected_attendance }} expected</div>
          <div class="flex justify-end items-center gap-2">
            <input type="checkbox" :checked="s.active" @change="markDirty" class="h-4 w-4 accent-brand cursor-pointer" />
            <span class="text-[10px] text-ink-disabled">{{ s.active ? 'Active' : 'Paused' }}</span>
          </div>
        </article>
      </div>
    </section>

    <!-- Integrations: aspirational catalog for live churches, sample grid for the demo -->
    <IntegrationsCatalog v-if="isRealChurch" :tenant="client.slug" :label="client.name" />
    <section v-else class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Integrations</span>
        <span class="text-xs text-ink-muted">{{ stats.integrations_connected }} of {{ stats.integrations_total }} connected</span>
      </div>
      <div class="space-y-4">
        <div
          v-for="[cat, items] in intsByCategory"
          :key="cat"
        >
          <div class="text-[10px] uppercase tracking-wider font-semibold text-ink-muted mb-2">
            {{ INTEGRATION_CATEGORY_LABEL[cat as keyof typeof INTEGRATION_CATEGORY_LABEL] }}
          </div>
          <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div
              v-for="i in items"
              :key="i.key"
              class="flex items-start gap-3 rounded-md border border-divider bg-surface p-3"
            >
              <span
                class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
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
                  >{{ i.connected ? 'Disconnect' : 'Connect' }}</button>
                </div>
                <div class="text-xs text-ink-muted">{{ i.description }}</div>
                <div v-if="i.status_note" class="mt-1 text-[11px] text-ink-disabled">{{ i.status_note }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Possible duplicates (Focal Point real data only) -->
    <DuplicatesSettings v-if="showDuplicates" />

    <!-- Privacy: real (persisted + enforced) for live churches, sample for the demo -->
    <PrivacySettings v-if="isRealChurch" :client-id="client.id" />
    <section v-else class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">🔒 Privacy + Role-Gating</span>
        <span class="text-xs text-ink-muted">What different staff roles can and cannot see</span>
      </div>
      <div class="space-y-2">
        <article
          v-for="p in privacyLocal"
          :key="p.key"
          class="flex items-start gap-3 rounded-md border border-divider p-3"
        >
          <label class="inline-flex items-center cursor-pointer flex-shrink-0 mt-0.5">
            <input type="checkbox" v-model="p.enabled" class="sr-only peer" @change="markDirty" />
            <span class="relative h-5 w-9 rounded-full bg-surface-elevated transition-colors peer-checked:bg-brand">
              <span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4"></span>
            </span>
          </label>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-ink">{{ p.label }}</div>
            <div class="text-[11px] text-ink-muted leading-snug">{{ p.description }}</div>
          </div>
        </article>
      </div>
    </section>

    <!-- Review surface for per-flag hides. Must sit AFTER the privacy
         v-if / v-else pair: Vue requires v-else to be immediately adjacent to
         its v-if, and inserting anything between them silently breaks the
         branch. Grouped with privacy because both answer "what is Grace allowed
         to act on". -->
    <HiddenFlagsSettings v-if="isRealChurch" />
    <PageLeadsSettings v-if="isRealChurch" :client-id="client.id" />
    <SignatureSettings v-if="isRealChurch" :client-id="client.id" />
  </div>
</template>
