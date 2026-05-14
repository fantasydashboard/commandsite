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
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'
import CommandSiteImportLeadsModal from '@/components/CommandSiteImportLeadsModal.vue'
import CommandSiteResearchLeadsModal from '@/components/CommandSiteResearchLeadsModal.vue'
import GraceLiveTicker from '@/components/grace/GraceLiveTicker.vue'
import LoadingBar from '@/components/LoadingBar.vue'
import AssistantMark from '@/components/AssistantMark.vue'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const { leads, loading, error, usingFixture, load, importLeads, archive, disqualify, requeue, promoteToDeal } = useLeads()
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
const researchOpen = ref(false)
const submitMsg = ref<string | null>(null)

// Drafting + approving moved to the Outreach Approval Queue. The
// outreach-auto-draft cron picks up new leads (score ≥ 65, contact
// email present, no existing draft) every 5 minutes and lands drafts
// in the Approval Queue. The Leads page is now sourcing + management
// only — no more in-page draft/approve UI.


// ── Save & enrich pipeline state.
//
// Single phase machine that drives both standalone "Find emails" runs
// and the auto-chained post-import flow ("Save & enrich N leads").
// Multi-stage so the LoadingBar can show what's happening + give Ada
// credit by name during the steps where she's working.
const ENRICH_CHUNK_SIZE = 50

type PipelinePhase = 'idle' | 'saving' | 'enriching' | 'done'
const pipelinePhase = ref<PipelinePhase>('idle')
const pipelineMsg = ref<string | null>(null)
const enrichProgress = ref({ completed: 0, total: 0 })
const savingCount = ref(0)
// Aggregated totals from the most recent enrichment run, used to render
// the success banner once everything settles.
const enrichTotals = ref({
  found: 0,
  not_found: 0,
  errors: 0,
  verified: 0,
  invalid: 0,
  unverifiable: 0,
})

const isPipelineWorking = computed(
  () => pipelinePhase.value === 'saving' || pipelinePhase.value === 'enriching',
)

const pipelineMessage = computed(() => {
  if (pipelinePhase.value === 'saving') {
    return savingCount.value > 0
      ? `Saving ${savingCount.value} ${savingCount.value === 1 ? 'lead' : 'leads'} to your pipeline…`
      : 'Saving to your pipeline…'
  }
  if (pipelinePhase.value === 'enriching') {
    if (enrichProgress.value.total === 0) return 'Ada is starting the email hunt…'
    return `Ada is finding email addresses · ${enrichProgress.value.completed} of ${enrichProgress.value.total}`
  }
  return ''
})

const pipelineHint = computed(() => {
  if (pipelinePhase.value === 'saving') return 'Quick — usually under a second.'
  if (pipelinePhase.value === 'enriching') {
    const remaining = enrichProgress.value.total - enrichProgress.value.completed
    if (remaining <= 0) return 'Wrapping up.'
    return `Visiting each website, extracting public emails, and verifying with NeverBounce.`
  }
  return ''
})

const pipelineStepLabel = computed(() => {
  if (pipelinePhase.value === 'saving') return 'Step 1 of 2'
  if (pipelinePhase.value === 'enriching') return 'Step 2 of 2'
  return ''
})

const showAdaInPipeline = computed(() => pipelinePhase.value === 'enriching')

const enrichableCount = computed(() => {
  return leads.value.filter(
    (l) =>
      !!l.company_url
      && !l.contact_email
      && !(l.tags ?? []).includes('email_not_found')
      && !(l.tags ?? []).includes('email_fetch_error')
      && !(l.tags ?? []).includes('email_invalid')
      && !(l.tags ?? []).includes('email_unverifiable'),
  ).length
})

/**
 * Run enrichment over the given lead IDs (or all eligible if leadIds=null).
 * Updates pipeline phase + progress as it goes. Returns aggregated counts.
 */
async function runEnrichmentOver(
  leadIds: string[] | null,
): Promise<{ found: number; not_found: number; errors: number; verified: number; invalid: number; unverifiable: number }> {
  const totals = { found: 0, not_found: 0, errors: 0, verified: 0, invalid: 0, unverifiable: 0 }

  // Resolve the eligible set
  const eligible: string[] = leadIds
    ? leadIds.slice()
    : leads.value
        .filter(
          (l) =>
            !!l.company_url
            && !l.contact_email
            && !(l.tags ?? []).includes('email_not_found')
            && !(l.tags ?? []).includes('email_fetch_error')
            && !(l.tags ?? []).includes('email_invalid')
            && !(l.tags ?? []).includes('email_unverifiable'),
        )
        .map((l) => l.id)

  if (eligible.length === 0) return totals

  pipelinePhase.value = 'enriching'
  enrichProgress.value = { completed: 0, total: eligible.length }

  const session = (await supabase.auth.getSession()).data.session
  if (!session) {
    pipelineMsg.value = 'Not signed in. Refresh and try again.'
    return totals
  }

  for (let i = 0; i < eligible.length; i += ENRICH_CHUNK_SIZE) {
    const chunk = eligible.slice(i, i + ENRICH_CHUNK_SIZE)
    const res = await fetch(`${SUPABASE_URL}/functions/v1/enrich-lead-emails`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'authorization': `Bearer ${session.access_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ lead_ids: chunk }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      pipelineMsg.value = `Chunk ${Math.floor(i / ENRICH_CHUNK_SIZE) + 1} failed (${res.status}): ${detail.slice(0, 200)}`
      break
    }
    const data = await res.json()
    const counts = data?.counts ?? {}
    totals.found += counts.found ?? 0
    totals.not_found += counts.not_found ?? 0
    totals.errors += counts.errors ?? 0
    totals.verified += counts.verified ?? 0
    totals.invalid += counts.invalid ?? 0
    totals.unverifiable += counts.unverifiable ?? 0
    enrichProgress.value = {
      completed: Math.min(i + chunk.length, eligible.length),
      total: eligible.length,
    }
  }

  return totals
}

/** Standalone manual "Find emails" button on the table header. */
async function runEnrichEmails() {
  if (isPipelineWorking.value) return
  if (usingFixture.value) {
    pipelineMsg.value = 'Demo mode — connect to a real cs_leads table to enrich emails.'
    setTimeout(() => { pipelineMsg.value = null }, 5000)
    return
  }
  if (enrichableCount.value === 0) {
    pipelineMsg.value = 'No leads need enrichment right now.'
    setTimeout(() => { pipelineMsg.value = null }, 4000)
    return
  }

  pipelineMsg.value = null
  try {
    const totals = await runEnrichmentOver(null)
    enrichTotals.value = totals
    const verifiedNote = totals.verified > 0 ? `${totals.verified} verified deliverable` : 'none verified'
    const invalidNote = totals.invalid > 0 ? `, ${totals.invalid} invalid (dropped)` : ''
    const catchAllNote = totals.unverifiable > 0 ? `, ${totals.unverifiable} catch-all (skipped)` : ''
    pipelineMsg.value = `Ada found ${totals.found} email${totals.found === 1 ? '' : 's'} · ${verifiedNote}${invalidNote}${catchAllNote}.`
    setTimeout(() => { pipelineMsg.value = null }, 12_000)
    await load()
  } catch (err) {
    pipelineMsg.value = err instanceof Error ? err.message : String(err)
  } finally {
    pipelinePhase.value = 'idle'
  }
}

async function handleImported({ rows, batchLabel }: { rows: CsLeadInsert[]; batchLabel: string }) {
  pipelineMsg.value = null
  submitMsg.value = null

  if (usingFixture.value) {
    submitMsg.value = `Demo mode — would have imported ${rows.length} leads as "${batchLabel}". Run migration 0023_cs_leads.sql to go live.`
    setTimeout(() => { submitMsg.value = null }, 6000)
    return
  }

  // Stage 1: save to DB
  pipelinePhase.value = 'saving'
  savingCount.value = rows.length
  const result = await importLeads(rows)

  if (result.inserted === 0) {
    pipelinePhase.value = 'idle'
    submitMsg.value = `No leads imported. ${result.failed > 0 ? `${result.failed} skipped (likely duplicate place IDs).` : ''}`
    setTimeout(() => { submitMsg.value = null }, 8000)
    return
  }

  // Stage 2: auto-enrich the just-imported set
  try {
    const totals = await runEnrichmentOver(result.insertedIds)
    enrichTotals.value = totals
    const dupePart = result.failed > 0 ? ` ${result.failed} skipped as duplicates.` : ''
    const verifiedPart =
      totals.verified > 0
        ? `Ada verified ${totals.verified} deliverable email${totals.verified === 1 ? '' : 's'}.`
        : totals.found > 0
          ? `Ada found ${totals.found} email${totals.found === 1 ? '' : 's'} (none passed verification).`
          : 'No public emails found on the imported sites.'
    const invalidPart =
      totals.invalid + totals.unverifiable > 0
        ? ` (${totals.invalid + totals.unverifiable} couldn't be verified — kept as leads but skipped for outreach.)`
        : ''
    submitMsg.value = `Imported ${result.inserted} ${result.inserted === 1 ? 'lead' : 'leads'} as "${batchLabel}".${dupePart} ${verifiedPart}${invalidPart}`
    setTimeout(() => { submitMsg.value = null }, 14_000)
    await load()
  } catch (err) {
    submitMsg.value = `Imported ${result.inserted} leads but enrichment failed: ${err instanceof Error ? err.message : String(err)}`
  } finally {
    pipelinePhase.value = 'idle'
    savingCount.value = 0
  }
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

// ── Live ticker ─────────────────────────────────────────────────────
const tickerSeed = computed(() => {
  const events: { icon: string; text: string; ageSec: number }[] = []
  const now = Date.now()
  // Recent leads (using created_at)
  for (const l of leads.value.slice(0, 6)) {
    if (!l.created_at) continue
    const ageSec = Math.floor((now - new Date(l.created_at).getTime()) / 1000)
    const co = l.company_name ?? 'lead'
    if (l.icp_score && l.icp_score >= 80) {
      events.push({ icon: '🎯', text: `Lead added — ${co} (ICP ${l.icp_score})`, ageSec })
    } else if (l.draft_cold_email_at) {
      events.push({ icon: '📝', text: `Draft generated — ${co}`, ageSec })
    } else {
      events.push({ icon: '📋', text: `Lead added — ${co}`, ageSec })
    }
  }
  if (events.length === 0) {
    return [{ icon: '⚙️', text: 'Lead engine ready — pull from Apollo / paste manually / research via Google Maps', ageSec: 0 }]
  }
  return events.sort((a, b) => a.ageSec - b.ageSec).slice(0, 5)
})

const tickerPool = [
  { icon: '🎯', text: 'Lead scored ICP 80+ — flagged for drafting' },
  { icon: '📝', text: 'Cold-email draft generated — Ada used review excerpts' },
  { icon: '✉️', text: 'Email enrichment succeeded — verified deliverable' },
  { icon: '📋', text: 'New lead added from Apollo CSV import' },
  { icon: '🔍', text: 'Google Maps research swept — 12 candidates surfaced' },
  { icon: '⚠️', text: 'Lead disqualified — outside ICP after enrichment' },
]

const leadsTicker = ref<InstanceType<typeof GraceLiveTicker> | null>(null)
</script>

<template>
  <div class="space-y-4">
    <GraceLiveTicker
      ref="leadsTicker"
      :seed="tickerSeed"
      :pool="tickerPool"
      subtitle="Lead activity — pulls, scores, drafts, enrichment events"
    />

    <!-- Header -->
    <div class="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h2 class="text-xl font-semibold text-ink">Leads</h2>
        <p class="text-xs text-ink-muted mt-0.5">
          Pre-pipeline prospects — imported from Apollo, LinkedIn, Reddit, or pasted manually. Auto-scored against your ICP.
        </p>
      </div>

      <!-- Workflow handoff: where do drafts/sending happen? -->
      <div class="hidden md:flex items-center gap-2 rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-[11px] text-ink">
        <span class="text-base leading-none">→</span>
        <div>
          <div class="font-semibold text-brand">Drafts auto-land in Outreach</div>
          <div class="text-ink-muted">
            Any new scored lead with an email gets a Touch 1 draft within ~5 minutes (auto-draft cron).
            Review &amp; approve in the Outreach Approval Queue.
          </div>
        </div>
        <RouterLink
          :to="{ name: 'dashboard.tab', params: { slug: 'commandsite', tab: 'outreach' } }"
          class="rounded-md bg-brand text-white px-2.5 py-1 text-[11px] font-semibold hover:opacity-90 whitespace-nowrap"
        >Open Outreach →</RouterLink>
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
          v-if="!usingFixture && enrichableCount > 0"
          type="button"
          class="rounded-md bg-surface-raised border border-divider text-ink px-3 py-1.5 text-sm font-semibold hover:border-brand disabled:opacity-50 inline-flex items-center gap-1.5"
          :disabled="isPipelineWorking"
          :title="`Visit each lead's website, extract any publicly-listed email, then verify with NeverBounce`"
          @click="runEnrichEmails"
        >
          <span v-if="isPipelineWorking" class="inline-flex items-center gap-1">
            <AssistantMark class="h-3.5 w-3.5 text-brand" />
            Ada is working…
          </span>
          <span v-else>🔎 Find emails ({{ enrichableCount }})</span>
        </button>
        <button
          type="button"
          class="rounded-md bg-surface-raised border border-brand text-brand px-3 py-1.5 text-sm font-semibold hover:bg-brand/5"
          @click="researchOpen = true"
        >🔍 Research</button>
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
    <div v-if="pipelineMsg" class="rounded-md bg-brand/10 text-brand px-3 py-2 text-sm">
      {{ pipelineMsg }}
    </div>
    <div
      v-if="isPipelineWorking"
      class="card p-4 border-brand/20 bg-brand/[0.02] space-y-3"
    >
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <AssistantMark
            v-if="showAdaInPipeline"
            class="h-5 w-5 text-brand"
          />
          <div
            v-else
            class="h-5 w-5 rounded-full bg-brand/15 grid place-items-center text-brand text-[10px] font-bold"
            aria-hidden="true"
          >💾</div>
          <span class="text-xs font-semibold text-ink">
            {{ showAdaInPipeline ? 'Ada is on it' : 'Saving' }}
          </span>
        </div>
        <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
          {{ pipelineStepLabel }}
        </span>
      </div>
      <LoadingBar :message="pipelineMessage" :hint="pipelineHint" />
      <div class="flex items-center gap-1.5 pt-1">
        <span
          class="h-1 w-6 rounded-full"
          :class="pipelinePhase === 'saving' ? 'bg-brand' : 'bg-success'"
          aria-label="Save stage"
        />
        <span
          class="h-1 w-6 rounded-full"
          :class="pipelinePhase === 'enriching' ? 'bg-brand' : 'bg-brand/15'"
          aria-label="Enrich stage"
        />
        <span class="text-[10px] text-ink-muted ml-1">
          {{ pipelinePhase === 'saving' ? 'Save → Find emails' : 'Save ✓ → Find emails' }}
        </span>
      </div>
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
      <div v-else class="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          class="rounded-md bg-brand text-white px-4 py-2 text-sm font-semibold hover:opacity-90"
          @click="researchOpen = true"
        >🔍 Research from Maps</button>
        <button
          type="button"
          class="rounded-md bg-surface-raised border border-divider text-ink px-4 py-2 text-sm font-semibold hover:border-brand"
          @click="importOpen = true"
        >Or import a CSV</button>
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

    <!-- Google Maps research modal -->
    <CommandSiteResearchLeadsModal
      :open="researchOpen"
      :settings="settings"
      @close="researchOpen = false"
      @imported="handleImported"
    />

  </div>
</template>
