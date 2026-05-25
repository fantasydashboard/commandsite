<script setup lang="ts">
/**
 * CommandSite — Google Maps research modal for cs_leads.
 *
 * Two-stage flow, driven by a single phase machine:
 *   1. form     — user enters queries + location, clicks "Find prospects"
 *   2. searching — hitting Google Maps via research-leads
 *   3. ada-reading — auto-chained: scoring results via score-leads-ada
 *   4. preview  — scored table; user unchecks anything they don't want
 *
 * Why auto-chain: previously Maps search and Ada review were two separate
 * buttons. They have no meaningful decision point between them — every
 * researched batch gets reviewed, always — so the second click was pure
 * friction. Now it's one action with stage-aware progress.
 *
 * Source on every imported row is 'google_maps'; the Place ID is stored
 * for dedup so re-running an overlapping query doesn't insert the same
 * shop twice (enforced by unique index in 0026).
 */
import { ref, computed, watch } from 'vue'
import type { CsLeadInsert, CsSettings } from '@/types/database'
import { scoreLead } from '@/lib/clients/commandsite/leadsApi'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'
import LoadingBar from '@/components/LoadingBar.vue'
import AssistantMark from '@/components/AssistantMark.vue'

const props = defineProps<{ open: boolean; settings: CsSettings }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'imported', payload: { rows: CsLeadInsert[]; batchLabel: string }): void
}>()

// ── Phase machine
type Phase = 'form' | 'searching' | 'ada-reading' | 'preview'
const phase = ref<Phase>('form')

// ── Form state
const queriesRaw = ref('HVAC contractor\nplumber\nelectrician')
const location = ref('Orlando, FL')
const maxPerQuery = ref(20)
const minRating = ref(4.0)
const error = ref<string | null>(null)

// ── Results state
interface ResearchedLead {
  place_id: string
  company_name: string
  address: string
  phone: string | null
  website: string | null
  google_rating: number | null
  rating_count: number | null
  types: string[]
  open_now: boolean | null
  business_status: string | null
  matched_query: string
}

const results = ref<ResearchedLead[]>([])
const queriesRun = ref<string[]>([])
const apiErrors = ref<string[]>([])
const excluded = ref<Set<string>>(new Set())

// ── Ada review state (Phase 1.5)
interface AdaSignal {
  kind: string
  note: string
}
interface AdaScore {
  score: number
  reasoning: string
  signals: AdaSignal[]
}
const adaScores = ref<Record<string, AdaScore>>({})
const adaError = ref<string | null>(null)
const adaErrors = ref<string[]>([])
const sortBy = ref<'heuristic' | 'ada' | 'rating' | 'review_count'>('heuristic')

// Progress tracking for the multi-stage loading bar
const adaProgress = ref({ completed: 0, total: 0 })

// Reset state when modal opens
watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  error.value = null
  adaError.value = null
  if (results.value.length === 0) phase.value = 'form'
})

const queryCount = computed(() =>
  queriesRaw.value.split('\n').map((q) => q.trim()).filter((q) => q.length > 0).length,
)

// ── Throttling for Anthropic Tier 1 (50k input tokens/min sliding window).
// 10-lead chunks × ~1.8k input tokens = 18k per chunk; 1.5s gap drains the
// sliding window safely under the 45k/min ceiling. ~6 chunks for 54 leads
// = ~2.5 min wall time.
const ADA_CHUNK_SIZE = 10
const INTER_CHUNK_DELAY_MS = 1500

// ── Stage-aware message + hint surfaced in the LoadingBar
const phaseMessage = computed(() => {
  if (phase.value === 'searching') {
    return `Searching Google Maps · ${queryCount.value} ${queryCount.value === 1 ? 'query' : 'queries'}…`
  }
  if (phase.value === 'ada-reading') {
    if (adaProgress.value.total === 0) return 'Ada is starting her review…'
    return `Ada is reading reviews · ${adaProgress.value.completed} of ${adaProgress.value.total}`
  }
  return ''
})

const phaseHint = computed(() => {
  if (phase.value === 'searching') {
    return 'Usually 5-15 seconds, depending on result volume.'
  }
  if (phase.value === 'ada-reading') {
    const total = adaProgress.value.total
    const completed = adaProgress.value.completed
    if (total === 0) return 'Pulling reviews and signals from Google Maps for each business.'
    const remaining = Math.max(0, total - completed)
    const secs = Math.ceil(remaining * 1.5)
    if (remaining === 0) return 'Wrapping up.'
    return `About ${secs}s remaining · scoring against your ICP, flagging chains.`
  }
  return ''
})

const stepLabel = computed(() => {
  if (phase.value === 'searching') return 'Step 1 of 2'
  if (phase.value === 'ada-reading') return 'Step 2 of 2'
  return ''
})

// ── Master "Find prospects" action: chains search → Ada review.
async function runFindProspects() {
  if (phase.value !== 'form') return
  error.value = null
  adaError.value = null
  apiErrors.value = []
  adaErrors.value = []
  results.value = []
  adaScores.value = {}
  excluded.value = new Set()
  adaProgress.value = { completed: 0, total: 0 }

  // Pre-validate
  const queries = queriesRaw.value
    .split('\n')
    .map((q) => q.trim())
    .filter((q) => q.length > 0)

  if (queries.length === 0) {
    error.value = 'Add at least one query (one per line).'
    return
  }
  if (queries.length > 10) {
    error.value = 'Max 10 queries per run. Trim the list and re-run.'
    return
  }
  if (!location.value.trim()) {
    error.value = 'Location is required.'
    return
  }

  // Stage 1: search
  phase.value = 'searching'
  const searchOk = await runSearch(queries)
  if (!searchOk) {
    phase.value = 'form'
    return
  }
  if (results.value.length === 0) {
    phase.value = 'form'
    error.value = 'No results returned. Try broader queries or a wider location.'
    return
  }

  // Stage 2: Ada review (auto-chained)
  phase.value = 'ada-reading'
  await runAdaReview()
  // Even if Ada partially failed, drop into preview so the user can see
  // the scored ones + retry from the preview-stage button.
  phase.value = 'preview'
}

async function runSearch(queries: string[]): Promise<boolean> {
  try {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) {
      error.value = 'Not signed in. Refresh the page and try again.'
      return false
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/research-leads`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'authorization': `Bearer ${session.access_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        queries,
        location: location.value.trim(),
        max_per_query: maxPerQuery.value,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      error.value = body?.error ?? `Research failed (${res.status})`
      return false
    }

    const data = await res.json()
    results.value = Array.isArray(data.results) ? data.results : []
    queriesRun.value = Array.isArray(data.queries_run) ? data.queries_run : []
    apiErrors.value = Array.isArray(data.errors) ? data.errors : []
    return true
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    return false
  }
}

async function runAdaReview() {
  const placeIds = visibleResults.value.map((r) => r.place_id)
  if (placeIds.length === 0) return

  adaError.value = null
  adaErrors.value = []
  adaProgress.value = { completed: 0, total: placeIds.length }

  try {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) {
      adaError.value = 'Not signed in. Refresh the page.'
      return
    }

    const aggregateErrors: string[] = []
    const aggregateScored: Record<string, AdaScore> = {}

    // Sequential chunks: keeps Anthropic burst pressure low and lets the
    // UI update progressively as each chunk lands.
    for (let i = 0; i < placeIds.length; i += ADA_CHUNK_SIZE) {
      const chunk = placeIds.slice(i, i + ADA_CHUNK_SIZE)
      const res = await fetch(`${SUPABASE_URL}/functions/v1/score-leads-ada`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'authorization': `Bearer ${session.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          place_ids: chunk,
          location_label: location.value.trim(),
        }),
      })

      if (!res.ok) {
        let detail = ''
        try { detail = (await res.json())?.error ?? '' } catch { /* ignore */ }
        aggregateErrors.push(
          `Chunk ${Math.floor(i / ADA_CHUNK_SIZE) + 1} failed (${res.status})${detail ? ': ' + detail : ''}`,
        )
        adaProgress.value = {
          completed: Math.min(i + chunk.length, placeIds.length),
          total: placeIds.length,
        }
        continue
      }

      const data = await res.json()
      const scored = (data?.scored ?? {}) as Record<string, AdaScore>
      Object.assign(aggregateScored, scored)
      adaScores.value = { ...adaScores.value, ...scored }
      if (Array.isArray(data?.errors)) aggregateErrors.push(...data.errors)
      adaProgress.value = {
        completed: Math.min(i + chunk.length, placeIds.length),
        total: placeIds.length,
      }

      if (i + ADA_CHUNK_SIZE < placeIds.length) {
        await new Promise((r) => setTimeout(r, INTER_CHUNK_DELAY_MS))
      }
    }

    if (aggregateErrors.length > 0) adaErrors.value = aggregateErrors

    // Auto-uncheck low-scored leads (< 40)
    const next = new Set(excluded.value)
    for (const [pid, score] of Object.entries(aggregateScored)) {
      if (score.score < 40) next.add(pid)
    }
    excluded.value = next

    if (Object.keys(aggregateScored).length > 0) sortBy.value = 'ada'
    else if (aggregateErrors.length > 0 && !adaError.value) {
      adaError.value = aggregateErrors[0]
    }
  } catch (err) {
    adaError.value = err instanceof Error ? err.message : String(err)
  }
}

const adaReviewedCount = computed(() => Object.keys(adaScores.value).length)
const hasAdaScores = computed(() => adaReviewedCount.value > 0)

// "Re-review with Ada" button on the preview stage — for retrying
// failed chunks without a fresh Maps search.
const rerunningAda = ref(false)
async function rerunAdaOnly() {
  if (rerunningAda.value) return
  rerunningAda.value = true
  try {
    await runAdaReview()
  } finally {
    rerunningAda.value = false
  }
}

// ── Score every result against current ICP for the preview
const scoredResults = computed(() => {
  return results.value.map((r) => {
    const inferredIndustry = inferIndustry(r.matched_query, r.types)
    const { score, reason } = scoreLead(
      {
        industry: inferredIndustry,
        team_size: null,
        state: extractState(r.address),
        country: 'US',
      },
      props.settings,
    )
    return { ...r, icp_score: score, icp_score_reason: reason, inferredIndustry }
  })
})

// Apply user-controlled rating filter, then sort by selected dimension
const visibleResults = computed(() => {
  const filtered = scoredResults.value.filter(
    (r) => (r.google_rating ?? 0) >= minRating.value,
  )
  const sorter = sortBy.value
  return [...filtered].sort((a, b) => {
    if (sorter === 'ada') {
      const aScore = adaScores.value[a.place_id]?.score ?? -1
      const bScore = adaScores.value[b.place_id]?.score ?? -1
      if (aScore !== bScore) return bScore - aScore
      return (b.icp_score ?? 0) - (a.icp_score ?? 0)
    }
    if (sorter === 'rating') return (b.google_rating ?? 0) - (a.google_rating ?? 0)
    if (sorter === 'review_count') return (b.rating_count ?? 0) - (a.rating_count ?? 0)
    return (b.icp_score ?? 0) - (a.icp_score ?? 0)
  })
})

const stats = computed(() => {
  const total = visibleResults.value.length
  const willImport = visibleResults.value.filter((r) => !excluded.value.has(r.place_id)).length
  const withWebsite = visibleResults.value.filter((r) => r.website).length
  const withPhone = visibleResults.value.filter((r) => r.phone).length
  const avgScore = total > 0
    ? Math.round(visibleResults.value.reduce((s, r) => s + (r.icp_score ?? 0), 0) / total)
    : 0
  return { total, willImport, withWebsite, withPhone, avgScore }
})

// ── Helpers
function inferIndustry(query: string, types: string[]): string {
  const q = query.toLowerCase()
  if (q.includes('hvac') || types.includes('hvac_contractor')) return 'HVAC'
  if (q.includes('plumb') || types.includes('plumber')) return 'Plumbing'
  if (q.includes('electric') || types.includes('electrician')) return 'Electrical'
  if (q.includes('roof') || types.includes('roofing_contractor')) return 'Roofing'
  if (q.includes('lawn') || q.includes('landscap')) return 'Landscaping'
  if (q.includes('pool')) return 'Pool service'
  if (q.includes('pest')) return 'Pest control'
  return query.charAt(0).toUpperCase() + query.slice(1)
}

function extractState(address: string): string | null {
  const m = address.match(/,\s*([A-Z]{2})\s+\d{5}/)
  return m ? m[1] : null
}

function extractCity(address: string): string | null {
  const parts = address.split(',').map((p) => p.trim())
  return parts.length >= 3 ? parts[parts.length - 3] : null
}

function toggleExclude(placeId: string) {
  const next = new Set(excluded.value)
  if (next.has(placeId)) next.delete(placeId)
  else next.add(placeId)
  excluded.value = next
}

function excludeAllWithoutWebsite() {
  const next = new Set(excluded.value)
  for (const r of visibleResults.value) {
    if (!r.website) next.add(r.place_id)
  }
  excluded.value = next
}

// ── Build CsLeadInsert rows from the approved set
function buildInsertRows(): CsLeadInsert[] {
  return visibleResults.value
    .filter((r) => !excluded.value.has(r.place_id))
    .map((r) => {
      const ada = adaScores.value[r.place_id]
      const finalScore = ada ? ada.score : r.icp_score
      const finalReason = ada ? `Ada: ${ada.reasoning}` : r.icp_score_reason

      const noteLines = [
        r.address ? `Address: ${r.address}` : null,
        r.google_rating != null
          ? `Google: ${r.google_rating.toFixed(1)}★${r.rating_count ? ` (${r.rating_count})` : ''}`
          : null,
        r.business_status && r.business_status !== 'OPERATIONAL'
          ? `Status: ${r.business_status}`
          : null,
      ].filter(Boolean) as string[]

      if (ada && ada.signals.length > 0) {
        noteLines.push(
          `Ada signals: ${ada.signals.map((s) => `${s.kind} (${s.note})`).join(' · ')}`,
        )
      }

      const tags = ['google_maps', r.inferredIndustry.toLowerCase()]
      if (ada) {
        tags.push('ada_reviewed')
        for (const s of ada.signals) tags.push(s.kind)
      }

      return {
        source: 'google_maps' as const,
        company_name: r.company_name,
        contact_phone: r.phone,
        company_url: r.website,
        industry: r.inferredIndustry,
        city: extractCity(r.address),
        state: extractState(r.address),
        country: 'US',
        icp_score: finalScore,
        icp_score_reason: finalReason,
        notes: noteLines.join(' · '),
        tags,
        google_maps_place_id: r.place_id,
        google_maps_enriched_at: new Date().toISOString(),
      }
    })
}

function confirmImport() {
  const rows = buildInsertRows()
  if (rows.length === 0) {
    error.value = 'No leads selected.'
    return
  }
  const label = `Maps research · ${queriesRun.value.length} ${
    queriesRun.value.length === 1 ? 'query' : 'queries'
  } · ${new Date().toLocaleString()}`
  emit('imported', { rows, batchLabel: label })
  // Reset for next time
  results.value = []
  excluded.value = new Set()
  phase.value = 'form'
  emit('close')
}

function backToForm() {
  phase.value = 'form'
}

function close() {
  if (phase.value === 'searching' || phase.value === 'ada-reading') return
  emit('close')
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const isWorking = computed(() => phase.value === 'searching' || phase.value === 'ada-reading')
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-ink/60"
        @click.self="close"
      >
        <div
          class="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-card bg-surface-raised shadow-2xl overflow-hidden"
          role="dialog"
          aria-modal="true"
        >
          <!-- ── Header ──────────────────────────────────────────────── -->
          <div class="flex items-start justify-between gap-4 border-b border-divider px-6 py-4">
            <div>
              <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-1">
                Lead research
              </div>
              <h2 class="text-lg font-semibold text-ink">
                {{ phase === 'preview'
                    ? `Preview · ${stats.total} results`
                    : 'Find prospects' }}
              </h2>
              <p v-if="phase === 'preview'" class="text-xs text-ink-muted mt-0.5">
                Uncheck rows you don't want before saving. Approved rows get email-enriched automatically.
              </p>
              <p v-else-if="phase === 'form'" class="text-xs text-ink-muted mt-0.5">
                Ada will search Google Maps and read reviews to score each business against your ICP.
              </p>
            </div>
            <button
              type="button"
              class="text-ink-muted hover:text-ink text-2xl leading-none p-1 -mr-2 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Close"
              :disabled="isWorking"
              @click="close"
            >×</button>
          </div>

          <!-- ── Body ────────────────────────────────────────────────── -->
          <div class="flex-1 overflow-y-auto px-6 py-5">
            <!-- ── Form / working stage ──────────────────────────────────────── -->
            <div v-if="phase !== 'preview'" class="space-y-5">
              <fieldset :disabled="isWorking" class="space-y-5 disabled:opacity-60">
                <div>
                  <label class="block text-xs font-semibold text-ink mb-1.5">
                    Search queries <span class="text-ink-muted font-normal">(one per line)</span>
                  </label>
                  <textarea
                    v-model="queriesRaw"
                    rows="5"
                    class="input font-mono text-xs"
                    placeholder="HVAC contractor&#10;plumber&#10;electrician"
                  />
                  <p class="mt-1 text-xs text-ink-muted">
                    Each line becomes one Google Maps query, joined with the location below. Up to 10 queries per run.
                  </p>
                </div>

                <div class="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Location</label>
                    <input
                      v-model="location"
                      type="text"
                      class="input"
                      placeholder="Orlando, FL"
                    />
                    <p class="mt-1 text-xs text-ink-muted">
                      City + state, or zip code. Maps returns results within Google's typical search radius.
                    </p>
                  </div>

                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Max per query</label>
                    <input
                      v-model.number="maxPerQuery"
                      type="number"
                      min="1"
                      max="20"
                      class="input"
                    />
                    <p class="mt-1 text-xs text-ink-muted">
                      Max 20 (Google's per-page limit). Three queries × 20 = up to 60 results per run.
                    </p>
                  </div>
                </div>

                <div class="rounded-card bg-surface-elevated border border-divider p-4">
                  <p class="text-xs text-ink-muted leading-relaxed">
                    <strong class="text-ink font-semibold">What happens:</strong>
                    Search runs first (5-15s), then Ada reads each business's reviews and scores them against your ICP (~1.5s per result). You'll land on a preview where you can uncheck anything before saving.
                  </p>
                </div>
              </fieldset>

              <!-- ── Multi-stage progress: search → Ada review ──────────────── -->
              <div
                v-if="isWorking"
                class="rounded-card border border-brand/20 bg-brand/5 p-4 space-y-3"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <AssistantMark
                      v-if="phase === 'ada-reading'"
                      class="h-5 w-5 text-brand transition-opacity"
                    />
                    <div
                      v-else
                      class="h-5 w-5 rounded-full bg-brand/20 grid place-items-center text-brand text-[10px] font-bold"
                      aria-hidden="true"
                    >🔍</div>
                    <span class="text-xs font-semibold text-ink">
                      {{ phase === 'ada-reading' ? 'Ada is on it' : 'Searching' }}
                    </span>
                  </div>
                  <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    {{ stepLabel }}
                  </span>
                </div>
                <LoadingBar :message="phaseMessage" :hint="phaseHint" />
                <!-- Mini step indicator: one dot per stage, current is filled -->
                <div class="flex items-center gap-1.5 pt-1">
                  <span
                    class="h-1 w-6 rounded-full"
                    :class="phase === 'searching' ? 'bg-brand' : 'bg-success'"
                    aria-label="Search stage"
                  />
                  <span
                    class="h-1 w-6 rounded-full"
                    :class="
                      phase === 'ada-reading' ? 'bg-brand'
                      : 'bg-brand/15'
                    "
                    aria-label="Ada review stage"
                  />
                  <span class="text-[10px] text-ink-muted ml-1">
                    {{ phase === 'searching' ? 'Maps → Ada' : 'Maps ✓ → Ada' }}
                  </span>
                </div>
              </div>

              <p v-if="error" class="text-sm text-danger">{{ error }}</p>
            </div>

            <!-- ── Preview stage ─────────────────────────────────── -->
            <div v-else>
              <!-- Stats strip -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div class="rounded-card bg-surface-elevated px-3 py-2">
                  <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Will save</div>
                  <div class="text-xl font-bold text-ink leading-tight">{{ stats.willImport }}</div>
                </div>
                <div class="rounded-card bg-surface-elevated px-3 py-2">
                  <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Avg ICP</div>
                  <div class="text-xl font-bold text-ink leading-tight">{{ stats.avgScore }}</div>
                </div>
                <div class="rounded-card bg-surface-elevated px-3 py-2">
                  <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">With website</div>
                  <div class="text-xl font-bold text-ink leading-tight">{{ stats.withWebsite }}</div>
                </div>
                <div class="rounded-card bg-surface-elevated px-3 py-2">
                  <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">With phone</div>
                  <div class="text-xl font-bold text-ink leading-tight">{{ stats.withPhone }}</div>
                </div>
              </div>

              <!-- Filter / sort / re-run row -->
              <div class="flex flex-wrap items-center gap-3 mb-3 text-xs">
                <label class="flex items-center gap-2 text-ink-muted">
                  Min rating:
                  <select v-model.number="minRating" class="rounded-md border border-divider bg-surface px-2 py-1 text-xs">
                    <option :value="0">Any</option>
                    <option :value="3.0">3.0+</option>
                    <option :value="3.5">3.5+</option>
                    <option :value="4.0">4.0+</option>
                    <option :value="4.5">4.5+</option>
                  </select>
                </label>
                <label class="flex items-center gap-2 text-ink-muted">
                  Sort:
                  <select v-model="sortBy" class="rounded-md border border-divider bg-surface px-2 py-1 text-xs">
                    <option value="heuristic">ICP score</option>
                    <option value="ada" :disabled="!hasAdaScores">Ada score{{ hasAdaScores ? '' : ' (no review yet)' }}</option>
                    <option value="rating">Google rating</option>
                    <option value="review_count">Review count</option>
                  </select>
                </label>
                <button
                  type="button"
                  class="text-xs font-medium text-brand hover:underline"
                  @click="excludeAllWithoutWebsite"
                >
                  Exclude all without website
                </button>
                <span class="ml-auto flex items-center gap-2">
                  <span v-if="hasAdaScores" class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-success">
                    <AssistantMark class="h-3 w-3 text-success" />
                    Ada reviewed {{ adaReviewedCount }}
                  </span>
                  <button
                    type="button"
                    class="rounded-md border border-brand/40 text-brand bg-brand/5 px-3 py-1.5 text-xs font-semibold hover:bg-brand/10 disabled:opacity-50 inline-flex items-center gap-1.5"
                    :disabled="rerunningAda || stats.total === 0"
                    @click="rerunAdaOnly"
                  >
                    <AssistantMark class="h-3.5 w-3.5 text-brand" />
                    <span v-if="rerunningAda">Ada thinking…</span>
                    <span v-else>{{ hasAdaScores ? 'Re-review with Ada' : 'Run Ada review' }}</span>
                  </button>
                </span>
              </div>

              <!-- Inline progress for re-run from preview -->
              <div v-if="rerunningAda" class="mb-3 rounded-card border border-brand/20 bg-brand/5 p-3">
                <div class="flex items-center gap-2 mb-2">
                  <AssistantMark class="h-4 w-4 text-brand" />
                  <span class="text-xs font-semibold text-ink">Ada is on it</span>
                </div>
                <LoadingBar
                  :message="adaProgress.total > 0
                    ? `Ada is reading reviews · ${adaProgress.completed} of ${adaProgress.total}`
                    : 'Ada is starting her review…'"
                  hint="Don't close this modal."
                />
              </div>

              <p v-if="adaError" class="mb-3 text-xs text-danger bg-danger/10 border border-danger/30 rounded-card p-3">
                {{ adaError }}
              </p>
              <p v-if="adaErrors.length > 0" class="mb-3 text-xs text-warn bg-warn/10 border border-warn/30 rounded-card p-3">
                <strong>Some leads couldn't be reviewed:</strong>
                <span v-for="(err, i) in adaErrors" :key="i" class="block">· {{ err }}</span>
              </p>

              <p v-if="apiErrors.length > 0" class="mb-3 text-xs text-warn bg-warn/10 border border-warn/30 rounded-card p-3">
                <strong>Some queries had issues:</strong>
                <span v-for="(err, i) in apiErrors" :key="i" class="block">· {{ err }}</span>
              </p>

              <!-- Results table -->
              <div class="overflow-hidden rounded-card border border-divider">
                <table class="w-full text-xs">
                  <thead class="bg-surface-elevated text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    <tr>
                      <th class="w-8 px-3 py-2"></th>
                      <th class="text-left px-3 py-2">Company</th>
                      <th class="text-left px-3 py-2">Industry</th>
                      <th class="text-left px-3 py-2">Rating</th>
                      <th v-if="hasAdaScores" class="text-left px-3 py-2 bg-brand/5 text-brand">Ada</th>
                      <th v-if="hasAdaScores" class="text-left px-3 py-2 bg-brand/5 text-brand">Why</th>
                      <th class="text-left px-3 py-2">ICP</th>
                      <th class="text-left px-3 py-2">Web</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="r in visibleResults"
                      :key="r.place_id"
                      class="border-t border-divider"
                      :class="excluded.has(r.place_id) ? 'opacity-40' : ''"
                    >
                      <td class="px-3 py-2">
                        <input
                          type="checkbox"
                          :checked="!excluded.has(r.place_id)"
                          @change="toggleExclude(r.place_id)"
                          class="h-3.5 w-3.5 rounded border-divider"
                        />
                      </td>
                      <td class="px-3 py-2">
                        <div class="font-semibold text-ink">{{ r.company_name }}</div>
                        <div class="text-ink-muted text-[11px]">{{ r.address || '—' }}</div>
                      </td>
                      <td class="px-3 py-2">
                        <span class="inline-flex items-center rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[10px] font-semibold">
                          {{ r.inferredIndustry }}
                        </span>
                      </td>
                      <td class="px-3 py-2 text-ink">
                        <span v-if="r.google_rating != null">
                          {{ r.google_rating.toFixed(1) }}★
                          <span v-if="r.rating_count" class="text-ink-muted">({{ r.rating_count }})</span>
                        </span>
                        <span v-else class="text-ink-disabled">—</span>
                      </td>
                      <td v-if="hasAdaScores" class="px-3 py-2 bg-brand/5">
                        <span
                          v-if="adaScores[r.place_id]"
                          class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
                          :class="adaScores[r.place_id].score >= 80 ? 'bg-success/15 text-success' : adaScores[r.place_id].score >= 60 ? 'bg-brand/15 text-brand' : adaScores[r.place_id].score >= 40 ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger'"
                        >
                          {{ adaScores[r.place_id].score }}
                        </span>
                        <span v-else class="text-ink-disabled text-[10px]">—</span>
                      </td>
                      <td v-if="hasAdaScores" class="px-3 py-2 bg-brand/5 max-w-[300px]">
                        <span v-if="adaScores[r.place_id]" class="text-[11px] text-ink-muted leading-tight" :title="adaScores[r.place_id].reasoning">
                          {{ adaScores[r.place_id].reasoning }}
                        </span>
                        <span v-else class="text-ink-disabled text-[10px]">—</span>
                      </td>
                      <td class="px-3 py-2">
                        <span
                          class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
                          :class="(r.icp_score ?? 0) >= 80 ? 'bg-success/15 text-success' : (r.icp_score ?? 0) >= 60 ? 'bg-brand/15 text-brand' : 'bg-ink-muted/15 text-ink-muted'"
                        >
                          {{ r.icp_score ?? 0 }}
                        </span>
                      </td>
                      <td class="px-3 py-2">
                        <a
                          v-if="r.website"
                          :href="r.website"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-brand hover:underline truncate inline-block max-w-[120px]"
                        >{{ hostname(r.website) }}</a>
                        <span v-else class="text-ink-disabled">—</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p v-if="error" class="mt-3 text-sm text-danger">{{ error }}</p>
            </div>
          </div>

          <!-- ── Footer ──────────────────────────────────────────────── -->
          <div class="flex items-center justify-between gap-3 border-t border-divider px-6 py-4 bg-surface-elevated">
            <button
              v-if="phase === 'preview'"
              type="button"
              class="btn-ghost !px-3 !text-xs"
              @click="backToForm"
            >← New search</button>
            <span v-else></span>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="btn-secondary !text-sm"
                :disabled="isWorking"
                @click="close"
              >Cancel</button>
              <button
                v-if="phase !== 'preview'"
                type="button"
                class="btn-primary !text-sm inline-flex items-center gap-1.5"
                :disabled="isWorking"
                @click="runFindProspects"
              >
                <span v-if="phase === 'searching'">Searching…</span>
                <span v-else-if="phase === 'ada-reading'" class="inline-flex items-center gap-1">
                  <AssistantMark class="h-3.5 w-3.5 text-ink-inverse" />
                  Ada is reviewing…
                </span>
                <span v-else>Find prospects</span>
              </button>
              <button
                v-else
                type="button"
                class="btn-primary !text-sm"
                :disabled="stats.willImport === 0"
                @click="confirmImport"
              >Save &amp; enrich {{ stats.willImport }} {{ stats.willImport === 1 ? 'lead' : 'leads' }}</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
