<script setup lang="ts">
/**
 * CommandSite Leads — pre-pipeline prospect list.
 *
 * Where you import scraped/researched leads, see ICP scores, and
 * promote winners into the pipeline. Sits between research (Apollo,
 * LinkedIn, Reddit) and outbound (cold sequences). Everything is
 * already scored against your live cs_settings ICP.
 */
import { computed, ref } from 'vue'
import type { Client, CsLead, CsLeadStatus, CsLeadInsert } from '@/types/database'
import { useLeads } from '@/lib/clients/commandsite/leadsApi'
import { useSettings } from '@/lib/clients/commandsite/settingsApi'
import CommandSiteImportLeadsModal from '@/components/CommandSiteImportLeadsModal.vue'
import CommandSiteAdaActivityStrip from '@/components/CommandSiteAdaActivityStrip.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const { leads, loading, error, usingFixture, importLeads, archive, disqualify, requeue, promoteToDeal } = useLeads()
const settingsApi = useSettings()
const settings = settingsApi.settings

// ── Filters
const statusFilter = ref<CsLeadStatus | 'all'>('all')
const minScore = ref(0)
const search = ref('')

const STATUS_META: Record<CsLeadStatus, { label: string; pillClass: string }> = {
  new:                    { label: 'New',           pillClass: 'bg-brand/10 text-brand' },
  queued:                 { label: 'Queued',        pillClass: 'bg-warn/15 text-warn' },
  contacted:              { label: 'Contacted',     pillClass: 'bg-accent/15 text-accent' },
  replied:                { label: 'Replied',       pillClass: 'bg-success/15 text-success' },
  promoted_to_pipeline:   { label: 'In pipeline',   pillClass: 'bg-success/15 text-success' },
  archived:               { label: 'Archived',      pillClass: 'bg-ink-muted/10 text-ink-muted' },
  disqualified:           { label: 'Disqualified',  pillClass: 'bg-danger/10 text-danger' },
}

const SOURCE_LABEL: Record<string, string> = {
  manual_csv: 'CSV',
  apollo_csv: 'Apollo',
  linkedin_export: 'LinkedIn',
  social_engager: 'Social',
  reddit_scrape: 'Reddit',
  manual_entry: 'Manual',
  referral: 'Referral',
  other: 'Other',
}

const filteredLeads = computed(() => {
  let arr = leads.value
  if (statusFilter.value !== 'all') arr = arr.filter((l) => l.status === statusFilter.value)
  if (minScore.value > 0) arr = arr.filter((l) => (l.icp_score ?? 0) >= minScore.value)
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    arr = arr.filter((l) =>
      l.company_name.toLowerCase().includes(q)
      || (l.contact_name?.toLowerCase().includes(q) ?? false)
      || (l.contact_email?.toLowerCase().includes(q) ?? false)
      || (l.industry?.toLowerCase().includes(q) ?? false),
    )
  }
  return arr.sort((a, b) => (b.icp_score ?? 0) - (a.icp_score ?? 0))
})

// KPI strip
const kpis = computed(() => {
  const all = leads.value
  const newCount = all.filter((l) => l.status === 'new').length
  const queued = all.filter((l) => l.status === 'queued').length
  const inFlight = all.filter((l) => ['contacted', 'replied'].includes(l.status)).length
  const promoted = all.filter((l) => l.status === 'promoted_to_pipeline').length
  const avgScore = all.length > 0 ? Math.round(all.reduce((s, l) => s + (l.icp_score ?? 0), 0) / all.length) : 0
  const highScore = all.filter((l) => (l.icp_score ?? 0) >= 80).length
  return { newCount, queued, inFlight, promoted, avgScore, highScore }
})

// Modal state
const importOpen = ref(false)
const submitMsg = ref<string | null>(null)

async function handleImported({ rows, batchLabel }: { rows: CsLeadInsert[]; batchLabel: string }) {
  submitMsg.value = null
  if (usingFixture.value) {
    submitMsg.value = `Demo mode — would have imported ${rows.length} leads as "${batchLabel}". Run migration 0023_cs_leads.sql to go live.`
    setTimeout(() => { submitMsg.value = null }, 6000)
    return
  }
  const result = await importLeads(rows)
  submitMsg.value = `Imported ${result.inserted} leads as "${batchLabel}". ${result.failed > 0 ? `${result.failed} skipped (likely duplicate emails).` : ''}`
  setTimeout(() => { submitMsg.value = null }, 6000)
}

async function onPromote(lead: CsLead) {
  const ok = window.confirm(`Promote ${lead.company_name} to pipeline as a new deal?`)
  if (!ok) return
  await promoteToDeal(lead.id)
}

function fmtAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / (60 * 1000))
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  return `${d}d ago`
}

function scoreClass(score: number | null): string {
  if (score == null) return 'bg-ink-muted/10 text-ink-muted'
  if (score >= 80) return 'bg-success/15 text-success'
  if (score >= 60) return 'bg-warn/15 text-warn'
  return 'bg-danger/15 text-danger'
}
</script>

<template>
  <div class="space-y-4">
    <CommandSiteAdaActivityStrip
      tab-key="leads"
      summary="Ada pulls leads from Apollo (or whatever source you wire up), scores each against your ICP from cs_settings, and queues the high-scorers for personalized outreach."
      :activity="[
        { icon: '📥', label: '47 leads added this week', detail: 'from Apollo + 1 manual CSV import', ago: 'rolling' },
        { icon: '🎯', label: '12 above 80% ICP score', detail: 'queued for outreach — highest fit first', ago: 'this week' },
        { icon: '⚡', label: 'Promoted 3 leads to pipeline', detail: 'auto-created cs_deals rows for top scorers', ago: 'this week' },
      ]"
    />

    <!-- Header -->
    <div class="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h2 class="text-xl font-semibold text-ink">Leads</h2>
        <p class="text-xs text-ink-muted mt-0.5">
          Pre-pipeline prospects — imported from Apollo, LinkedIn, Reddit, or pasted manually. Auto-scored against your ICP.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span
          v-if="usingFixture"
          class="inline-flex items-center gap-1 rounded-full bg-warn/15 text-warn px-2 py-0.5 text-[11px] font-semibold"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-warn"></span>
          Demo data · run migration 0023 to go live
        </span>
        <span
          v-else
          class="inline-flex items-center gap-1 rounded-full bg-success/15 text-success px-2 py-0.5 text-[11px] font-semibold"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
          Live · {{ leads.length }} leads
        </span>
        <button
          type="button"
          class="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-semibold hover:opacity-90"
          @click="importOpen = true"
        >+ Import CSV</button>
      </div>
    </div>

    <!-- Status banners -->
    <div v-if="error && !usingFixture" class="rounded-md bg-danger/10 text-danger px-3 py-2 text-sm">
      {{ error }}
    </div>
    <div v-if="submitMsg" class="rounded-md bg-success/10 text-success px-3 py-2 text-sm">
      {{ submitMsg }}
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      <div class="card p-3"><div class="kpi-label">New</div><div class="text-xl font-semibold tabular-nums">{{ kpis.newCount }}</div></div>
      <div class="card p-3"><div class="kpi-label">Queued</div><div class="text-xl font-semibold tabular-nums">{{ kpis.queued }}</div></div>
      <div class="card p-3"><div class="kpi-label">In flight</div><div class="text-xl font-semibold tabular-nums">{{ kpis.inFlight }}</div></div>
      <div class="card p-3"><div class="kpi-label">Promoted</div><div class="text-xl font-semibold tabular-nums">{{ kpis.promoted }}</div></div>
      <div class="card p-3"><div class="kpi-label">High-score (≥80)</div><div class="text-xl font-semibold tabular-nums text-success">{{ kpis.highScore }}</div></div>
      <div class="card p-3"><div class="kpi-label">Avg ICP score</div><div class="text-xl font-semibold tabular-nums">{{ kpis.avgScore }}</div></div>
    </div>

    <!-- Filters -->
    <div class="card p-3">
      <div class="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          class="chip"
          :class="statusFilter === 'all' ? 'chip-active' : ''"
          @click="statusFilter = 'all'"
        >All ({{ leads.length }})</button>
        <button
          v-for="(meta, status) in STATUS_META"
          :key="status"
          type="button"
          class="chip"
          :class="statusFilter === status ? 'chip-active' : ''"
          @click="statusFilter = status as CsLeadStatus"
        >{{ meta.label }} ({{ leads.filter((l) => l.status === status).length }})</button>
        <div class="ml-auto flex items-center gap-3">
          <div class="flex items-center gap-2">
            <span class="text-[11px] text-ink-muted">Min score</span>
            <input
              v-model.number="minScore"
              type="range" min="0" max="100" step="5"
              class="w-28"
            />
            <span class="text-xs font-semibold tabular-nums w-8">{{ minScore }}</span>
          </div>
          <input
            v-model="search"
            type="text"
            placeholder="Search company, contact, industry…"
            class="rounded-md border border-divider bg-surface px-3 py-1.5 text-sm text-ink w-64 focus:outline-none focus:border-brand"
          />
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!loading && filteredLeads.length === 0" class="card p-8 text-center">
      <p class="text-sm text-ink-muted mb-3">No leads match your filters.</p>
      <button
        v-if="statusFilter !== 'all' || minScore > 0 || search"
        type="button"
        class="text-xs text-brand font-semibold hover:underline"
        @click="statusFilter = 'all'; minScore = 0; search = ''"
      >Clear filters</button>
      <div v-else>
        <button
          type="button"
          class="rounded-md bg-brand text-white px-4 py-2 text-sm font-semibold hover:opacity-90"
          @click="importOpen = true"
        >Import your first CSV</button>
      </div>
    </div>

    <!-- Leads table -->
    <div v-else class="card overflow-hidden p-0">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-canvas text-[10px] font-medium text-ink-muted uppercase tracking-wide">
            <tr>
              <th class="px-3 py-2 text-left w-16">Score</th>
              <th class="px-3 py-2 text-left">Company / Contact</th>
              <th class="px-3 py-2 text-left">Industry</th>
              <th class="px-3 py-2 text-left">Geo</th>
              <th class="px-3 py-2 text-left">Size</th>
              <th class="px-3 py-2 text-left">Source</th>
              <th class="px-3 py-2 text-left">Status</th>
              <th class="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-divider">
            <tr v-for="lead in filteredLeads" :key="lead.id" class="hover:bg-canvas/50">
              <td class="px-3 py-2 align-top">
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                  :class="scoreClass(lead.icp_score)"
                  :title="lead.icp_score_reason ?? ''"
                >{{ lead.icp_score ?? '—' }}</span>
              </td>
              <td class="px-3 py-2 align-top">
                <div class="text-ink font-medium">{{ lead.company_name }}</div>
                <div class="text-[11px] text-ink-muted">
                  <span v-if="lead.contact_name">{{ lead.contact_name }}</span>
                  <span v-if="lead.contact_title"> · {{ lead.contact_title }}</span>
                </div>
                <div v-if="lead.contact_email" class="text-[11px] text-ink-disabled font-mono">{{ lead.contact_email }}</div>
              </td>
              <td class="px-3 py-2 align-top text-xs text-ink-muted">{{ lead.industry || '—' }}</td>
              <td class="px-3 py-2 align-top text-xs text-ink-muted">{{ [lead.city, lead.state].filter(Boolean).join(', ') || '—' }}</td>
              <td class="px-3 py-2 align-top text-xs text-ink-muted tabular-nums">{{ lead.team_size ?? '—' }}</td>
              <td class="px-3 py-2 align-top">
                <span class="inline-flex items-center rounded bg-ink-muted/10 text-ink-muted px-1.5 py-0.5 text-[10px] font-medium">{{ SOURCE_LABEL[lead.source] || lead.source }}</span>
                <div class="text-[10px] text-ink-disabled mt-0.5">{{ fmtAge(lead.created_at) }}</div>
              </td>
              <td class="px-3 py-2 align-top">
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  :class="STATUS_META[lead.status].pillClass"
                >{{ STATUS_META[lead.status].label }}</span>
              </td>
              <td class="px-3 py-2 align-top text-right">
                <div class="inline-flex flex-wrap gap-1 justify-end">
                  <button
                    v-if="lead.status !== 'promoted_to_pipeline' && lead.status !== 'disqualified'"
                    type="button"
                    class="rounded bg-brand text-white px-2 py-0.5 text-[11px] font-semibold hover:opacity-90"
                    @click="onPromote(lead)"
                    title="Create a deal in the pipeline from this lead"
                  >→ Pipeline</button>
                  <button
                    v-if="lead.status !== 'archived' && lead.status !== 'disqualified' && lead.status !== 'promoted_to_pipeline'"
                    type="button"
                    class="rounded bg-ink-muted/10 text-ink-muted px-2 py-0.5 text-[11px] font-medium hover:bg-ink-muted/20"
                    @click="archive(lead.id)"
                    title="Save for later"
                  >Archive</button>
                  <button
                    v-if="lead.status !== 'disqualified' && lead.status !== 'promoted_to_pipeline'"
                    type="button"
                    class="rounded bg-danger/10 text-danger px-2 py-0.5 text-[11px] font-medium hover:bg-danger/20"
                    @click="disqualify(lead.id)"
                    title="Auto-skip in future"
                  >×</button>
                  <button
                    v-if="lead.status === 'archived' || lead.status === 'disqualified'"
                    type="button"
                    class="rounded bg-warn/10 text-warn px-2 py-0.5 text-[11px] font-medium hover:bg-warn/20"
                    @click="requeue(lead.id)"
                    title="Move back to New"
                  >Requeue</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="border-t border-divider bg-canvas px-3 py-2 text-[11px] text-ink-muted">
        Showing {{ filteredLeads.length }} of {{ leads.length }} leads · sorted by score
      </div>
    </div>

    <!-- Import modal -->
    <CommandSiteImportLeadsModal
      :open="importOpen"
      :settings="settings"
      @close="importOpen = false"
      @imported="handleImported"
    />
  </div>
</template>
