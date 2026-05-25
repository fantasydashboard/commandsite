<script setup lang="ts">
/**
 * CommandSite Settings — operational config for running the business.
 * Sections: Team, Plans, Sending Domains, Suppression, Integrations,
 * API Keys + Webhooks, ICP definition.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Client } from '@/types/database'
import {
  teamMembers,
  plans,
  sendingDomains,
  suppressionList,
  integrations,
  apiKeys,
  webhookEndpoints,
  settingsStats,
  DOMAIN_PURPOSE_LABEL,
  SUPPRESSION_REASON_LABEL,
  INTEGRATION_CATEGORY_LABEL,
} from '@/lib/clients/commandsite/settings'
import {
  useSettings,
  webhookSpecs,
  fullWebhookUrl,
  type WebhookEndpointSpec,
} from '@/lib/clients/commandsite/settingsApi'
import CommandSiteSendWindowSettings from '@/components/CommandSiteSendWindowSettings.vue'
import CommandSiteCampaignsSettings from '@/components/CommandSiteCampaignsSettings.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const stats = computed(() => settingsStats())

// ── Live (real DB-backed) settings ────────────────────────────────────
const liveSettings = useSettings()
const live = liveSettings.settings

// Local form state — mirrors `live` for editing without flicker.
// Updates push to Supabase via liveSettings.save()
async function patchLive(patch: Record<string, unknown>) {
  await liveSettings.save(patch)
}

// Helpers for editing string-array fields (chips)
function addToArray(current: string[], value: string): string[] {
  const v = value.trim()
  if (!v || current.includes(v)) return current
  return [...current, v]
}
function removeFromArray(current: string[], value: string): string[] {
  return current.filter((x) => x !== value)
}

// Inline-add inputs for the chip-array fields
const newIndustry = ref('')
const newGeo = ref('')
const newDisqualifier = ref('')
const newDoSay = ref('')
const newDontSay = ref('')
const newSignaturePhrase = ref('')

// ── Gmail OAuth ───────────────────────────────────────────────────────
const gmailConnecting = ref(false)
const gmailError = ref<string | null>(null)
const gmailConnected = computed(() => !!live.value.gmail_refresh_token)
const gmailEmail = computed(() => live.value.gmail_account_email ?? '')
const gmailConnectedAt = computed(() => live.value.gmail_connected_at ?? null)

let gmailPollHandle: ReturnType<typeof setInterval> | null = null

async function connectGmail() {
  gmailConnecting.value = true
  gmailError.value = null
  try {
    const { data, error } = await supabase.functions.invoke('gmail-oauth-start')
    if (error) throw new Error(error.message)
    const url = (data as { auth_url?: string })?.auth_url
    if (!url) throw new Error('No auth_url returned')
    // Open Google consent in a new tab so this page stays put.
    window.open(url, '_blank', 'noopener')
    // Poll cs_settings every 3s while waiting for the callback to write
    // the refresh token. Stops as soon as we see it.
    if (gmailPollHandle) clearInterval(gmailPollHandle)
    gmailPollHandle = setInterval(async () => {
      await liveSettings.load()
      if (live.value.gmail_refresh_token) {
        if (gmailPollHandle) clearInterval(gmailPollHandle)
        gmailPollHandle = null
        gmailConnecting.value = false
      }
    }, 3000)
  } catch (err) {
    gmailError.value = err instanceof Error ? err.message : 'Failed to start OAuth'
    gmailConnecting.value = false
  }
}

async function disconnectGmail() {
  if (!confirm('Disconnect Gmail? Auto-approve will fall back to logging only — emails won\'t deliver until reconnected.')) return
  await patchLive({
    gmail_refresh_token: null,
    gmail_account_email: null,
    gmail_connected_at: null,
  })
  if (gmailPollHandle) {
    clearInterval(gmailPollHandle)
    gmailPollHandle = null
  }
  gmailConnecting.value = false
}

// UFD support email connection moved to UfdRedesignSettingsModule —
// UFD is treated as a client of CommandSite, so its email integration
// lives on its own Settings tab (just like Apex / Cornerstone would).
// CommandSite Settings only manages CommandSite's own Gmail
// (josh@commandsite.io for cold outreach).

onMounted(() => { void liveSettings.load() })
onBeforeUnmount(() => {
  if (gmailPollHandle) clearInterval(gmailPollHandle)
})

function fmtRelative(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// Webhook URL copy state
const copiedWebhook = ref<string | null>(null)
async function copyWebhook(spec: WebhookEndpointSpec) {
  const url = fullWebhookUrl(spec)
  try {
    await navigator.clipboard.writeText(url)
    copiedWebhook.value = spec.label
    setTimeout(() => { copiedWebhook.value = null }, 2000)
  } catch {
    /* clipboard may be unavailable in dev */
  }
}

function webhookStatusMeta(s: WebhookEndpointSpec['status']): { label: string; color: string } {
  if (s === 'live') return { label: 'Live', color: '#10B981' }
  return { label: s.replace('_', ' ').replace(/^phase /, 'Phase '), color: '#F59E0B' }
}

// Reactive copies so the demo lets you toggle without mutating fixtures.
const intsLocal = reactive(integrations.map((i) => ({ ...i })))
const dirty = ref(false)
function markDirty() { dirty.value = true }
function saveAll() { dirty.value = false }

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}

function pct(v: number): string { return `${(v * 100).toFixed(1)}%` }

function fmtAgo(iso?: string): string {
  if (!iso) return 'Never'
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function authStatusColor(s: 'verified' | 'pending' | 'failed'): string {
  if (s === 'verified') return '#10B981'
  if (s === 'pending') return '#F59E0B'
  return '#EF4444'
}

function reputationColor(score: number): string {
  if (score >= 90) return '#10B981'
  if (score >= 75) return 'rgb(var(--color-brand))'
  if (score >= 60) return '#F59E0B'
  return '#EF4444'
}

function roleLabel(r: string): string {
  if (r === 'owner') return 'Owner'
  if (r === 'csm') return 'Customer Success'
  if (r === 'engineer') return 'Engineer'
  return 'Support'
}

// Group integrations by category
const intsByCategory = computed(() => {
  const groups = new Map<string, typeof intsLocal>()
  for (const i of intsLocal) {
    if (!groups.has(i.category)) groups.set(i.category, [])
    groups.get(i.category)!.push(i)
  }
  return Array.from(groups.entries())
})
</script>

<template>
  <div class="space-y-4">
    <!-- Header with sticky save bar -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Settings</h2>
        <p class="text-sm text-ink-muted">
          Team, plans, sending domains, integrations, API keys + webhooks, and ICP definition.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="dirty" class="text-xs text-warn">Unsaved changes</span>
        <button
          type="button"
          class="rounded-md bg-brand text-ink-inverse px-4 py-1.5 text-sm font-semibold disabled:opacity-50 hover:opacity-90"
          :disabled="!dirty"
          @click="saveAll"
        >Save changes</button>
      </div>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Team</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.team_active }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">active members</div>
      </div>
      <div class="card">
        <div class="kpi-label">Sending Domains</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">
          {{ stats.domains_healthy }} <span class="text-base text-ink-muted">/ {{ stats.domains_total }}</span>
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">fully verified</div>
      </div>
      <div class="card">
        <div class="kpi-label">Integrations</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">
          {{ stats.integrations_connected }} <span class="text-base text-ink-muted">/ {{ stats.integrations_total }}</span>
        </div>
        <div class="text-[11px] text-ink-disabled mt-0.5">connected</div>
      </div>
      <div class="card">
        <div class="kpi-label">Webhooks</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ stats.webhooks_active }}</div>
        <div class="text-[11px] mt-0.5" :class="stats.webhook_failures_24h > 0 ? 'text-warn font-semibold' : 'text-ink-disabled'">
          {{ stats.webhook_failures_24h }} failures (24h)
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════
         LIVE CONFIG · saved to Supabase, used by automations + AI drafts
         ═══════════════════════════════════════════════════════════════ -->

    <div class="rounded-card border border-success/30 bg-success/5 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="h-2 w-2 rounded-full bg-success animate-pulse"></span>
        <span class="text-sm font-semibold text-ink">Live config</span>
        <span class="text-xs text-ink-muted">— saved to your database, drives every AI draft + automation in the dashboard</span>
      </div>
      <div class="text-[11px] text-ink-disabled">
        <span v-if="liveSettings.saving.value">Saving…</span>
        <span v-else-if="liveSettings.usingDefaults.value" class="text-warn font-semibold">Using defaults — run migration 0022_cs_settings.sql to persist your edits</span>
        <span v-else>Auto-saves on change</span>
      </div>
    </div>

    <!-- Outreach automation: send window + daily cap -->
    <CommandSiteSendWindowSettings />

    <!-- Lead automation: campaigns queue -->
    <CommandSiteCampaignsSettings />

    <!-- Founder profile + public links -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Founder profile + public links</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="kpi-label block mb-1">Founder name</label>
          <input
            type="text"
            :value="live.founder_name ?? ''"
            placeholder="Josh"
            class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
            @change="(e) => patchLive({ founder_name: (e.target as HTMLInputElement).value })"
          />
        </div>
        <div>
          <label class="kpi-label block mb-1">Founder email</label>
          <input
            type="email"
            :value="live.founder_email ?? ''"
            placeholder="josh@commandsite.com"
            class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
            @change="(e) => patchLive({ founder_email: (e.target as HTMLInputElement).value })"
          />
        </div>
        <div>
          <label class="kpi-label block mb-1">Calendly link <span class="text-warn">·</span> <span class="text-[10px] text-ink-muted">used in auto-replies</span></label>
          <input
            type="url"
            :value="live.calendly_link ?? ''"
            placeholder="https://calendly.com/josh-commandsite/30min"
            class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
            @change="(e) => patchLive({ calendly_link: (e.target as HTMLInputElement).value })"
          />
        </div>
        <div>
          <label class="kpi-label block mb-1">Product demo Loom</label>
          <input
            type="url"
            :value="live.product_demo_link ?? ''"
            placeholder="https://www.loom.com/share/..."
            class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
            @change="(e) => patchLive({ product_demo_link: (e.target as HTMLInputElement).value })"
          />
        </div>
        <div class="sm:col-span-2">
          <label class="kpi-label block mb-1">Email signature</label>
          <textarea
            :value="live.email_signature ?? ''"
            placeholder="— Josh&#10;Founder, CommandSite&#10;commandsite.com"
            rows="3"
            class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink resize-y focus:outline-none focus:border-brand"
            @change="(e) => patchLive({ email_signature: (e.target as HTMLTextAreaElement).value })"
          ></textarea>
        </div>
      </div>
    </section>

    <!-- Gmail integration (live) -->
    <section class="card">
      <div class="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-2">
          <span class="eyebrow">Gmail integration</span>
          <span class="text-xs text-ink-muted">— powers direct send from the Approval Queue</span>
        </div>
        <span
          v-if="gmailConnected"
          class="rounded-full bg-success/15 text-success border border-success/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
        >Connected</span>
        <span
          v-else
          class="rounded-full bg-warn/15 text-warn border border-warn/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
        >Not connected</span>
      </div>

      <!-- Connected state -->
      <div v-if="gmailConnected" class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div class="text-sm text-ink">
            Sending as
            <strong class="font-semibold">{{ gmailEmail || 'unknown' }}</strong>
          </div>
          <p class="text-xs text-ink-muted mt-0.5">
            Approve sends directly through Gmail's API — no compose tab.
            <span v-if="gmailConnectedAt">Connected {{ fmtRelative(gmailConnectedAt) }}.</span>
          </p>
        </div>
        <button
          type="button"
          class="rounded-md border border-danger/40 text-danger bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:bg-danger/10"
          @click="disconnectGmail"
        >Disconnect</button>
      </div>

      <!-- Disconnected state -->
      <div v-else class="space-y-3">
        <p class="text-sm text-ink-muted">
          Connect your Gmail account to send approved drafts in one click.
          Without this, Approve opens a Gmail compose tab you have to manually hit Send in.
          Auto-approve mode requires this connection to actually deliver.
        </p>
        <button
          type="button"
          class="rounded-md bg-brand text-ink-inverse px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-[opacity,transform] duration-200 ease-out-quart active:scale-[0.97]"
          :disabled="gmailConnecting"
          @click="connectGmail"
        >
          {{ gmailConnecting ? 'Waiting for Google authorization…' : 'Connect Gmail' }}
        </button>
        <p v-if="gmailConnecting" class="text-xs text-ink-muted">
          Approve in the Google tab that opened. This page will auto-refresh when done.
        </p>
        <p v-if="gmailError" class="text-xs text-danger">{{ gmailError }}</p>
      </div>
    </section>

    <!-- ICP definition (live) -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">ICP definition</span>
        <span class="text-xs text-ink-muted">— drives lead scoring + AI personalization</span>
      </div>
      <div class="space-y-4">
        <div>
          <label class="kpi-label block mb-1">Description</label>
          <textarea
            :value="live.icp_description ?? ''"
            rows="3"
            class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink resize-y focus:outline-none focus:border-brand"
            @change="(e) => patchLive({ icp_description: (e.target as HTMLTextAreaElement).value })"
          ></textarea>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="kpi-label block mb-1">Target industries</label>
            <div class="flex flex-wrap gap-1.5 mb-2">
              <span
                v-for="i in live.icp_industries"
                :key="i"
                class="rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[11px] font-medium inline-flex items-center gap-1"
              >
                {{ i }}
                <button type="button" class="text-brand/60 hover:text-brand" @click="patchLive({ icp_industries: removeFromArray(live.icp_industries, i) })">×</button>
              </span>
            </div>
            <div class="flex gap-2">
              <input
                v-model="newIndustry"
                type="text"
                placeholder="Add industry…"
                class="flex-1 rounded-md border border-divider bg-surface px-2 py-1 text-xs text-ink focus:outline-none focus:border-brand"
                @keydown.enter.prevent="patchLive({ icp_industries: addToArray(live.icp_industries, newIndustry) }); newIndustry = ''"
              />
              <button type="button" class="rounded-md bg-brand/10 text-brand px-2.5 py-1 text-xs font-semibold hover:bg-brand/20" @click="patchLive({ icp_industries: addToArray(live.icp_industries, newIndustry) }); newIndustry = ''">+ Add</button>
            </div>
          </div>
          <div>
            <label class="kpi-label block mb-1">Target geos</label>
            <div class="flex flex-wrap gap-1.5 mb-2">
              <span
                v-for="g in live.icp_geos"
                :key="g"
                class="rounded-full bg-accent/10 text-accent px-2 py-0.5 text-[11px] font-medium inline-flex items-center gap-1"
              >
                {{ g }}
                <button type="button" class="text-accent/60 hover:text-accent" @click="patchLive({ icp_geos: removeFromArray(live.icp_geos, g) })">×</button>
              </span>
            </div>
            <div class="flex gap-2">
              <input
                v-model="newGeo"
                type="text"
                placeholder="Add geo…"
                class="flex-1 rounded-md border border-divider bg-surface px-2 py-1 text-xs text-ink focus:outline-none focus:border-brand"
                @keydown.enter.prevent="patchLive({ icp_geos: addToArray(live.icp_geos, newGeo) }); newGeo = ''"
              />
              <button type="button" class="rounded-md bg-accent/10 text-accent px-2.5 py-1 text-xs font-semibold hover:bg-accent/20" @click="patchLive({ icp_geos: addToArray(live.icp_geos, newGeo) }); newGeo = ''">+ Add</button>
            </div>
          </div>
          <div>
            <label class="kpi-label block mb-1">Team size range</label>
            <div class="flex items-center gap-2 flex-wrap">
              <input
                type="number"
                min="1"
                :value="live.icp_team_size_min ?? 4"
                class="w-20 rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-ink tabular-nums focus:outline-none focus:border-brand"
                @change="(e) => patchLive({ icp_team_size_min: Number((e.target as HTMLInputElement).value) })"
              />
              <span class="text-xs text-ink-muted">to</span>
              <input
                type="number"
                min="1"
                :value="live.icp_team_size_max ?? 25"
                class="w-20 rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-ink tabular-nums focus:outline-none focus:border-brand"
                @change="(e) => patchLive({ icp_team_size_max: Number((e.target as HTMLInputElement).value) })"
              />
              <input
                type="text"
                :value="live.icp_team_size_unit ?? 'techs'"
                placeholder="techs"
                class="w-28 rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-brand"
                @change="(e) => patchLive({ icp_team_size_unit: (e.target as HTMLInputElement).value.trim() || 'people' })"
              />
            </div>
            <div class="mt-1 text-[10px] text-ink-disabled leading-snug">
              Unit label is editable — "techs" for HVAC, "staff" for churches, "stylists" for salons, etc.
            </div>
          </div>
          <div>
            <label class="kpi-label block mb-1">Disqualifiers <span class="text-[10px] text-ink-muted">— auto-skip leads matching these</span></label>
            <ul class="space-y-0.5 mb-2">
              <li
                v-for="d in live.icp_disqualifiers"
                :key="d"
                class="text-[11px] text-ink-muted flex items-start gap-1"
              >
                <span class="text-danger">×</span>
                <span class="flex-1">{{ d }}</span>
                <button type="button" class="text-ink-disabled hover:text-danger" @click="patchLive({ icp_disqualifiers: removeFromArray(live.icp_disqualifiers, d) })">×</button>
              </li>
            </ul>
            <div class="flex gap-2">
              <input
                v-model="newDisqualifier"
                type="text"
                placeholder="Add disqualifier…"
                class="flex-1 rounded-md border border-divider bg-surface px-2 py-1 text-xs text-ink focus:outline-none focus:border-brand"
                @keydown.enter.prevent="patchLive({ icp_disqualifiers: addToArray(live.icp_disqualifiers, newDisqualifier) }); newDisqualifier = ''"
              />
              <button type="button" class="rounded-md bg-danger/10 text-danger px-2.5 py-1 text-xs font-semibold hover:bg-danger/20" @click="patchLive({ icp_disqualifiers: addToArray(live.icp_disqualifiers, newDisqualifier) }); newDisqualifier = ''">+ Add</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- AI brand voice (live) -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">AI brand voice</span>
        <span class="text-xs text-ink-muted">— drives every cold-email reply, social post, and dunning message</span>
      </div>
      <div class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="kpi-label block mb-1">Signature phrases</label>
            <div class="flex flex-wrap gap-1.5 mb-2">
              <span
                v-for="p in live.ai_voice_signature_phrases"
                :key="p"
                class="rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[11px] font-medium inline-flex items-center gap-1"
              >
                {{ p }}
                <button type="button" class="text-brand/60 hover:text-brand" @click="patchLive({ ai_voice_signature_phrases: removeFromArray(live.ai_voice_signature_phrases, p) })">×</button>
              </span>
            </div>
            <div class="flex gap-1">
              <input
                v-model="newSignaturePhrase"
                type="text"
                placeholder="— Josh"
                class="flex-1 rounded-md border border-divider bg-surface px-2 py-1 text-xs text-ink focus:outline-none focus:border-brand"
                @keydown.enter.prevent="patchLive({ ai_voice_signature_phrases: addToArray(live.ai_voice_signature_phrases, newSignaturePhrase) }); newSignaturePhrase = ''"
              />
              <button type="button" class="rounded-md bg-brand/10 text-brand px-2 py-1 text-xs font-semibold hover:bg-brand/20" @click="patchLive({ ai_voice_signature_phrases: addToArray(live.ai_voice_signature_phrases, newSignaturePhrase) }); newSignaturePhrase = ''">+</button>
            </div>
          </div>
          <div>
            <label class="kpi-label block mb-1">Do say</label>
            <div class="flex flex-wrap gap-1.5 mb-2">
              <span
                v-for="p in live.ai_voice_do_say"
                :key="p"
                class="rounded-full bg-success/10 text-success px-2 py-0.5 text-[11px] font-medium inline-flex items-center gap-1"
              >
                ✓ {{ p }}
                <button type="button" class="text-success/60 hover:text-success" @click="patchLive({ ai_voice_do_say: removeFromArray(live.ai_voice_do_say, p) })">×</button>
              </span>
            </div>
            <div class="flex gap-1">
              <input
                v-model="newDoSay"
                type="text"
                placeholder="Genuinely"
                class="flex-1 rounded-md border border-divider bg-surface px-2 py-1 text-xs text-ink focus:outline-none focus:border-brand"
                @keydown.enter.prevent="patchLive({ ai_voice_do_say: addToArray(live.ai_voice_do_say, newDoSay) }); newDoSay = ''"
              />
              <button type="button" class="rounded-md bg-success/10 text-success px-2 py-1 text-xs font-semibold hover:bg-success/20" @click="patchLive({ ai_voice_do_say: addToArray(live.ai_voice_do_say, newDoSay) }); newDoSay = ''">+</button>
            </div>
          </div>
          <div>
            <label class="kpi-label block mb-1">Don't say</label>
            <div class="flex flex-wrap gap-1.5 mb-2">
              <span
                v-for="p in live.ai_voice_dont_say"
                :key="p"
                class="rounded-full bg-danger/10 text-danger px-2 py-0.5 text-[11px] font-medium inline-flex items-center gap-1"
              >
                × {{ p }}
                <button type="button" class="text-danger/60 hover:text-danger" @click="patchLive({ ai_voice_dont_say: removeFromArray(live.ai_voice_dont_say, p) })">×</button>
              </span>
            </div>
            <div class="flex gap-1">
              <input
                v-model="newDontSay"
                type="text"
                placeholder="Synergy"
                class="flex-1 rounded-md border border-divider bg-surface px-2 py-1 text-xs text-ink focus:outline-none focus:border-brand"
                @keydown.enter.prevent="patchLive({ ai_voice_dont_say: addToArray(live.ai_voice_dont_say, newDontSay) }); newDontSay = ''"
              />
              <button type="button" class="rounded-md bg-danger/10 text-danger px-2 py-1 text-xs font-semibold hover:bg-danger/20" @click="patchLive({ ai_voice_dont_say: addToArray(live.ai_voice_dont_say, newDontSay) }); newDontSay = ''">+</button>
            </div>
          </div>
        </div>

        <div>
          <label class="kpi-label block mb-1">Prompt guide <span class="text-[10px] text-ink-muted">— sent to Claude on every draft</span></label>
          <textarea
            :value="live.ai_voice_prompt_guide ?? ''"
            class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink leading-relaxed resize-y min-h-[160px] font-mono text-xs focus:outline-none focus:border-brand"
            @change="(e) => patchLive({ ai_voice_prompt_guide: (e.target as HTMLTextAreaElement).value })"
          ></textarea>
        </div>
      </div>
    </section>

    <!-- Automation thresholds (live) -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Automation thresholds</span>
        <span class="text-xs text-ink-muted">— above these, the system auto-acts. Below, it flags for your eyes.</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label class="kpi-label block mb-1">Reply classifier auto-handle</label>
          <div class="flex items-center gap-3">
            <input
              type="range"
              min="0.5"
              max="1"
              step="0.05"
              :value="live.reply_classifier_auto_threshold"
              class="flex-1 accent-brand"
              @change="(e) => patchLive({ reply_classifier_auto_threshold: Number((e.target as HTMLInputElement).value) })"
            />
            <span class="text-base font-semibold text-brand tabular-nums w-14 text-right">{{ Math.round(live.reply_classifier_auto_threshold * 100) }}%</span>
          </div>
          <p class="mt-1 text-[10px] text-ink-disabled">Negative + OOF + unsubscribe replies are always auto-handled regardless</p>
        </div>
        <div>
          <label class="kpi-label block mb-1">Auto-promote to pipeline</label>
          <div class="flex items-center gap-3">
            <input
              type="range"
              min="0.5"
              max="1"
              step="0.05"
              :value="live.pipeline_promote_threshold"
              class="flex-1 accent-brand"
              @change="(e) => patchLive({ pipeline_promote_threshold: Number((e.target as HTMLInputElement).value) })"
            />
            <span class="text-base font-semibold text-brand tabular-nums w-14 text-right">{{ Math.round(live.pipeline_promote_threshold * 100) }}%</span>
          </div>
          <p class="mt-1 text-[10px] text-ink-disabled">Positive replies above this confidence become deals + auto-send Calendly</p>
        </div>
        <div>
          <label class="kpi-label block mb-1">Social engager → pipeline (ICP fit)</label>
          <div class="flex items-center gap-3">
            <input
              type="range"
              min="50"
              max="100"
              step="5"
              :value="live.social_engager_icp_threshold"
              class="flex-1 accent-brand"
              @change="(e) => patchLive({ social_engager_icp_threshold: Number((e.target as HTMLInputElement).value) })"
            />
            <span class="text-base font-semibold text-brand tabular-nums w-14 text-right">{{ live.social_engager_icp_threshold }}</span>
          </div>
          <p class="mt-1 text-[10px] text-ink-disabled">LinkedIn/X engagers above this ICP fit auto-add to pipeline</p>
        </div>
      </div>
    </section>

    <!-- Webhook URLs (live, for vendor setup) -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Webhook URLs</span>
        <span class="text-xs text-ink-muted">— paste these into the vendor's webhook config. Activate as you wire each phase.</span>
      </div>
      <div class="space-y-2">
        <article
          v-for="spec in webhookSpecs"
          :key="spec.label"
          class="rounded-md border border-divider p-3"
        >
          <div class="flex flex-wrap items-start justify-between gap-3 mb-1.5">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="text-sm font-semibold text-ink">{{ spec.label }}</span>
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-inverse"
                  :style="{ backgroundColor: webhookStatusMeta(spec.status).color }"
                >{{ webhookStatusMeta(spec.status).label }}</span>
              </div>
              <p class="text-xs text-ink-muted leading-snug">{{ spec.description }}</p>
              <p class="text-[10px] text-ink-disabled mt-0.5">📍 In vendor: <span class="font-mono">{{ spec.vendor }}</span></p>
            </div>
          </div>
          <div class="flex items-center gap-2 mt-2">
            <code class="flex-1 font-mono text-[11px] text-ink bg-surface-elevated px-2 py-1.5 rounded truncate">{{ fullWebhookUrl(spec) }}</code>
            <button
              type="button"
              class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90 whitespace-nowrap"
              @click="copyWebhook(spec)"
            >
              {{ copiedWebhook === spec.label ? '✓ Copied' : 'Copy' }}
            </button>
          </div>
        </article>
      </div>
    </section>

    <!-- Visual divider before fixture/preview sections -->
    <div class="flex items-center gap-3 px-2 pt-4">
      <div class="h-px flex-1 bg-divider"></div>
      <span class="text-[10px] uppercase tracking-wider font-semibold text-ink-disabled">Preview · sections below come live in later phases</span>
      <div class="h-px flex-1 bg-divider"></div>
    </div>

    <!-- ── Team ─────────────────────────────────────────────────────── -->
    <section class="card">
      <div class="mb-3 flex items-center justify-between">
        <span class="eyebrow">Team</span>
        <button
          type="button"
          class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand"
        >+ Invite member</button>
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
            <div class="text-sm font-semibold text-ink">{{ m.name }}</div>
            <div class="text-[11px] text-ink-muted">{{ m.email }} · added {{ fmtAgo(m.added_at) }}</div>
          </div>
          <span
            class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            :class="m.role === 'owner' ? 'bg-brand text-ink-inverse' : 'bg-surface-elevated text-ink-muted'"
          >{{ roleLabel(m.role) }}</span>
          <input
            type="checkbox"
            :checked="m.active"
            @change="markDirty"
            class="h-4 w-4 accent-brand cursor-pointer"
            :title="m.active ? 'Active' : 'Disabled'"
          />
        </article>
      </div>
    </section>

    <!-- ── Plans ────────────────────────────────────────────────────── -->
    <section class="card">
      <div class="mb-3 flex items-center justify-between">
        <span class="eyebrow">Plans</span>
        <button
          type="button"
          class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand"
        >+ Add tier</button>
      </div>
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <article
          v-for="p in plans"
          :key="p.key"
          class="rounded-card border border-divider bg-surface p-3"
        >
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-semibold text-ink">{{ p.label }}</h3>
            <input type="checkbox" :checked="p.active" @change="markDirty" class="h-4 w-4 accent-brand cursor-pointer" />
          </div>
          <div class="text-2xl font-bold text-ink tabular-nums">{{ money(p.monthly_price_cents) }}</div>
          <div class="text-[11px] text-ink-disabled mt-0.5">per month · {{ money(p.annual_price_cents) }}/yr annual</div>
          <div class="mt-2 text-[11px] text-ink-muted">
            {{ p.included_seats }} seats · +{{ money(p.overage_per_seat_cents) }}/seat overage
          </div>
          <div class="mt-2 text-[11px] text-success font-semibold">{{ p.customers }} customers</div>
          <ul class="mt-3 space-y-0.5 text-[11px] text-ink-muted">
            <li v-for="f in p.features_included" :key="f" class="flex items-start gap-1">
              <span class="text-success">✓</span>
              <span>{{ f }}</span>
            </li>
          </ul>
        </article>
      </div>
    </section>

    <!-- ── Sending Domains ──────────────────────────────────────────── -->
    <section class="card overflow-hidden">
      <div class="mb-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="eyebrow">Sending Domains</span>
          <span class="text-xs text-ink-muted">SPF / DKIM / DMARC + reputation</span>
        </div>
        <button
          type="button"
          class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand"
        >+ Add domain</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-divider text-left text-[10px] uppercase tracking-wide text-ink-muted">
              <th class="px-3 py-2 font-medium">Domain</th>
              <th class="px-3 py-2 font-medium">Purpose</th>
              <th class="px-3 py-2 font-medium text-center">SPF</th>
              <th class="px-3 py-2 font-medium text-center">DKIM</th>
              <th class="px-3 py-2 font-medium text-center">DMARC</th>
              <th class="px-3 py-2 font-medium text-right">Reputation</th>
              <th class="px-3 py-2 font-medium text-right">Sent (30d)</th>
              <th class="px-3 py-2 font-medium text-right">Bounce</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="d in sendingDomains"
              :key="d.domain"
              class="border-b border-divider/60 last:border-b-0 hover:bg-surface-elevated/40 transition-colors"
            >
              <td class="px-3 py-2.5 text-sm font-mono text-ink">{{ d.domain }}</td>
              <td class="px-3 py-2.5 text-xs text-ink-muted">{{ DOMAIN_PURPOSE_LABEL[d.purpose] }}</td>
              <td class="px-3 py-2.5 text-center">
                <span
                  class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-inverse"
                  :style="{ backgroundColor: authStatusColor(d.spf) }"
                >{{ d.spf }}</span>
              </td>
              <td class="px-3 py-2.5 text-center">
                <span
                  class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-inverse"
                  :style="{ backgroundColor: authStatusColor(d.dkim) }"
                >{{ d.dkim }}</span>
              </td>
              <td class="px-3 py-2.5 text-center">
                <span
                  class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-inverse"
                  :style="{ backgroundColor: authStatusColor(d.dmarc) }"
                >{{ d.dmarc }}</span>
              </td>
              <td class="px-3 py-2.5 text-right text-sm font-semibold tabular-nums" :style="{ color: reputationColor(d.reputation_score) }">
                {{ d.reputation_score }}
              </td>
              <td class="px-3 py-2.5 text-right text-xs text-ink-muted tabular-nums">{{ d.sent_30d.toLocaleString() }}</td>
              <td class="px-3 py-2.5 text-right text-xs tabular-nums" :class="d.bounce_rate >= 0.05 ? 'text-warn' : 'text-ink-muted'">
                {{ pct(d.bounce_rate) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── Suppression list ─────────────────────────────────────────── -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Suppression List</span>
        <span class="chip !py-0.5 !px-2 !text-[10px]">{{ suppressionList.length }} entries</span>
        <button
          type="button"
          class="ml-auto rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand"
        >Export CSV</button>
      </div>
      <div class="space-y-1">
        <div
          v-for="s in suppressionList"
          :key="s.email"
          class="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-surface-elevated/40 transition-colors text-xs"
        >
          <span class="font-mono text-ink flex-1 truncate">{{ s.email }}</span>
          <span class="rounded-full bg-surface-elevated text-ink-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">{{ s.list }}</span>
          <span class="text-ink-muted whitespace-nowrap">{{ SUPPRESSION_REASON_LABEL[s.reason] }}</span>
          <span class="text-ink-disabled w-20 text-right whitespace-nowrap">{{ fmtAgo(s.added_at) }}</span>
        </div>
      </div>
    </section>

    <!-- ── Integrations ─────────────────────────────────────────────── -->
    <section class="card">
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

    <!-- ── API Keys + Webhooks (side by side) ─────────────────────── -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section class="card">
        <div class="mb-3 flex items-center justify-between">
          <span class="eyebrow">API Keys</span>
          <button
            type="button"
            class="rounded-md border border-divider px-2.5 py-1 text-xs font-medium text-ink hover:border-brand hover:text-brand"
          >+ Generate</button>
        </div>
        <div class="space-y-2">
          <article
            v-for="k in apiKeys"
            :key="k.id"
            class="rounded-md border border-divider p-3"
          >
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-sm font-semibold text-ink">{{ k.label }}</span>
              <span
                class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                :class="k.scope === 'admin' ? 'bg-warn/15 text-warn' : k.scope === 'read_write' ? 'bg-brand/15 text-brand' : 'bg-surface-elevated text-ink-muted'"
              >{{ k.scope.replace('_', ' ') }}</span>
            </div>
            <div class="font-mono text-xs text-ink-muted">{{ k.masked_value }}</div>
            <div class="mt-1 text-[10px] text-ink-disabled">
              Created {{ fmtAgo(k.created_at) }} · last used {{ fmtAgo(k.last_used_at) }}
            </div>
          </article>
        </div>
      </section>

      <section class="card">
        <div class="mb-3 flex items-center justify-between">
          <span class="eyebrow">Webhooks</span>
          <button
            type="button"
            class="rounded-md border border-divider px-2.5 py-1 text-xs font-medium text-ink hover:border-brand hover:text-brand"
          >+ Add</button>
        </div>
        <div class="space-y-2">
          <article
            v-for="w in webhookEndpoints"
            :key="w.id"
            class="rounded-md border border-divider p-3"
          >
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-mono text-xs text-ink truncate flex-1">{{ w.url }}</span>
              <span
                class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                :class="w.active ? 'bg-success/15 text-success' : 'bg-surface-elevated text-ink-disabled'"
              >{{ w.active ? 'Active' : 'Paused' }}</span>
            </div>
            <div class="text-[10px] text-ink-muted">
              <span class="font-semibold">Events:</span>
              <span v-for="(ev, i) in w.events" :key="ev" class="font-mono">
                {{ ev }}<span v-if="i < w.events.length - 1">, </span>
              </span>
            </div>
            <div class="mt-1 text-[10px] text-ink-disabled">
              Last delivered {{ fmtAgo(w.last_delivery_at) }}
              <span v-if="w.failure_count_24h > 0" class="text-warn font-semibold">· {{ w.failure_count_24h }} failures (24h)</span>
            </div>
          </article>
        </div>
      </section>
    </div>

  </div>
</template>
