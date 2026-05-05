<script setup lang="ts">
/**
 * UFD Redesign — Settings.
 * Sections: Team, Plans, Sending Domains, Suppression, Integrations,
 * API Keys + Webhooks, AI Brand Voice (the prompt that drives all the
 * AI-drafted email + reply + post copy).
 */
import { computed, reactive, ref } from 'vue'
import type { Client } from '@/types/database'
import {
  teamMembers,
  plans,
  sendingDomains,
  suppressionList,
  integrations,
  apiKeys,
  webhookEndpoints,
  brandVoice,
  settingsStats,
  DOMAIN_PURPOSE_LABEL,
  SUPPRESSION_REASON_LABEL,
  INTEGRATION_CATEGORY_LABEL,
} from '@/lib/clients/ufd-redesign/settings'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const stats = computed(() => settingsStats())
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
  if (r === 'engineer') return 'Engineer'
  if (r === 'community') return 'Community'
  return 'Support'
}

const intsByCategory = computed(() => {
  const groups = new Map<string, typeof intsLocal>()
  for (const i of intsLocal) {
    if (!groups.has(i.category)) groups.set(i.category, [])
    groups.get(i.category)!.push(i)
  }
  // Stable order: payments → comms → fantasy → social → ai → data → devtools
  const order = ['payments','comms','fantasy','social','ai','data','devtools']
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
          Team, plans, sending domains, integrations, API keys + webhooks, and the AI brand-voice prompt that drives every drafted email + reply.
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
            :class="m.role === 'owner' ? 'bg-brand text-white' : 'bg-surface-elevated text-ink-muted'"
          >{{ roleLabel(m.role) }}</span>
          <input
            type="checkbox"
            :checked="m.active"
            @change="markDirty"
            class="h-4 w-4 accent-brand cursor-pointer"
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
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <article
          v-for="p in plans"
          :key="p.key"
          class="rounded-card border border-divider bg-surface p-3"
        >
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-semibold text-ink">{{ p.label }}</h3>
            <input type="checkbox" :checked="p.active" @change="markDirty" class="h-4 w-4 accent-brand cursor-pointer" />
          </div>
          <div v-if="p.monthly_price_cents > 0" class="text-2xl font-bold text-ink tabular-nums">
            {{ money(p.effective_monthly_cents) }}<span class="text-sm font-normal text-ink-muted">/mo</span>
          </div>
          <div v-else class="text-2xl font-bold text-ink tabular-nums">Free</div>
          <div v-if="p.key === 'annual'" class="text-[11px] text-success mt-0.5 font-semibold">Saves 34% vs Monthly</div>
          <div v-else-if="p.trial_days > 0" class="text-[11px] text-ink-disabled mt-0.5">{{ p.trial_days }}-day trial · no credit card</div>
          <div v-else class="text-[11px] text-ink-disabled mt-0.5">Cancel anytime</div>
          <div class="mt-2 text-[11px] text-success font-semibold">{{ p.customers }} on this plan</div>
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
                <span class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white" :style="{ backgroundColor: authStatusColor(d.spf) }">{{ d.spf }}</span>
              </td>
              <td class="px-3 py-2.5 text-center">
                <span class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white" :style="{ backgroundColor: authStatusColor(d.dkim) }">{{ d.dkim }}</span>
              </td>
              <td class="px-3 py-2.5 text-center">
                <span class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white" :style="{ backgroundColor: authStatusColor(d.dmarc) }">{{ d.dmarc }}</span>
              </td>
              <td class="px-3 py-2.5 text-right text-sm font-semibold tabular-nums" :style="{ color: reputationColor(d.reputation_score) }">{{ d.reputation_score }}</td>
              <td class="px-3 py-2.5 text-right text-xs text-ink-muted tabular-nums">{{ d.sent_30d.toLocaleString() }}</td>
              <td class="px-3 py-2.5 text-right text-xs tabular-nums" :class="d.bounce_rate >= 0.05 ? 'text-warn' : 'text-ink-muted'">{{ pct(d.bounce_rate) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── Suppression ──────────────────────────────────────────────── -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">Suppression List</span>
        <span class="chip !py-0.5 !px-2 !text-[10px]">{{ suppressionList.length }} entries</span>
        <button type="button" class="ml-auto rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand">Export CSV</button>
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

    <!-- ── API Keys + Webhooks ─────────────────────────────────────── -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section class="card">
        <div class="mb-3 flex items-center justify-between">
          <span class="eyebrow">API Keys</span>
          <button type="button" class="rounded-md border border-divider px-2.5 py-1 text-xs font-medium text-ink hover:border-brand hover:text-brand">+ Generate</button>
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
          <button type="button" class="rounded-md border border-divider px-2.5 py-1 text-xs font-medium text-ink hover:border-brand hover:text-brand">+ Add</button>
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

    <!-- ── AI Brand Voice ──────────────────────────────────────────── -->
    <section class="card">
      <div class="mb-3 flex items-center gap-2">
        <span class="eyebrow">AI Brand Voice</span>
        <span class="text-xs text-ink-muted">Drives every AI-drafted email, reply, and post</span>
      </div>
      <div class="space-y-4">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label class="kpi-label block mb-1">Tone</label>
            <ul class="space-y-0.5 text-xs text-ink-muted">
              <li v-for="t in brandVoice.tone" :key="t" class="flex items-start gap-1">
                <span class="text-brand">·</span>
                <span>{{ t }}</span>
              </li>
            </ul>
          </div>
          <div>
            <label class="kpi-label block mb-1">Signature phrases</label>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="p in brandVoice.signature_phrases"
                :key="p"
                class="rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[11px] font-medium"
              >{{ p }}</span>
            </div>
          </div>
          <div>
            <label class="kpi-label block mb-1">Do say</label>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="p in brandVoice.do_say"
                :key="p"
                class="rounded-full bg-success/10 text-success px-2 py-0.5 text-[11px] font-medium"
              >✓ {{ p }}</span>
            </div>
          </div>
          <div>
            <label class="kpi-label block mb-1">Don't say</label>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="p in brandVoice.dont_say"
                :key="p"
                class="rounded-full bg-danger/10 text-danger px-2 py-0.5 text-[11px] font-medium"
              >× {{ p }}</span>
            </div>
          </div>
        </div>

        <div>
          <label class="kpi-label block mb-1">Prompt guide (sent to Claude on every drafting call)</label>
          <textarea
            :value="brandVoice.prompt_guide"
            class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink leading-relaxed resize-y min-h-[180px] font-mono text-xs focus:outline-none focus:border-brand"
            @input="markDirty"
          ></textarea>
          <div class="mt-1 text-[10px] text-ink-disabled">
            Edit + save to update the system prompt for AI drafts across the dashboard. Changes apply to all subsequent generations.
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
