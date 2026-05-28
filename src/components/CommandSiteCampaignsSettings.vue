<script setup lang="ts">
/**
 * Lead-sourcing campaigns panel.
 *
 * Three-column kanban: Pending → Active → Done. Operator queues campaigns
 * in priority order; lead-sourcing-cron picks the lowest-priority pending
 * row, activates it, and pulls until target_count is hit.
 *
 * For now: simple list per status with priority reorder + status flips.
 * Drag-to-reorder is a follow-up — the priority integer is editable inline
 * so the same outcome is reachable.
 */
import { computed, onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import AdaIcon from '@/components/ada/AdaIcon.vue'

interface Campaign {
  id: string
  name: string
  status: 'pending' | 'active' | 'paused' | 'done'
  geo: Record<string, unknown>
  apollo_query: Record<string, unknown>
  target_count: number
  priority: number
  pulled_count: number
  replied_count: number
  notes: string | null
  started_at: string | null
  ended_at: string | null
  // 'ada' (HVAC + home services) or 'grace' (churches). Routes scoring
  // and drafting through the right persona-specific edge functions.
  persona: 'ada' | 'grace'
}

type Persona = 'ada' | 'grace'

const campaigns = ref<Campaign[]>([])
const loading = ref(false)
const message = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)
const showNewForm = ref(false)
// ── Industry preset ───────────────────────────────────────────────────
// Pick an industry → keywords + name auto-fill. Operator types the metro
// (state + cities) themselves — keeps the door open for non-listed metros,
// smaller markets, multi-county targets, etc.

interface IndustryPreset { key: string; label: string; keywords: string; persona: Persona }
const INDUSTRY_PRESETS: IndustryPreset[] = [
  // ── Ada presets (HVAC + home services) ───────────────────────────
  { key: 'hvac',                 label: 'HVAC',                       persona: 'ada',   keywords: 'hvac, hvac contractor, heating and cooling, air conditioning, heat pump, hvac installation' },
  { key: 'plumbing',             label: 'Plumbing',                   persona: 'ada',   keywords: 'plumber, plumbing contractor, drain cleaning, water heater, leak detection, pipe repair' },
  { key: 'electrical-res',       label: 'Electrical (residential)',   persona: 'ada',   keywords: 'electrician, residential electrical, panel upgrade, generator installation' },
  { key: 'electrical-com',       label: 'Electrical (commercial)',    persona: 'ada',   keywords: 'electrical contractor, commercial electrical, EV charger installation' },
  { key: 'roofing',              label: 'Roofing',                    persona: 'ada',   keywords: 'roofer, roofing contractor, roof replacement, roof repair, storm damage, asphalt shingle' },
  { key: 'landscaping',          label: 'Landscaping / Lawn care',    persona: 'ada',   keywords: 'landscaping, lawn care, lawn maintenance, landscape design, lawn mowing, hardscape' },
  { key: 'pest-control',         label: 'Pest control',               persona: 'ada',   keywords: 'pest control, exterminator, termite control, rodent control, mosquito control, bed bug treatment' },
  { key: 'garage-door',          label: 'Garage door',                persona: 'ada',   keywords: 'garage door, garage door repair, garage door installation, garage door opener, garage door spring' },
  { key: 'pool-service',         label: 'Pool (service)',             persona: 'ada',   keywords: 'pool service, pool maintenance, pool cleaning, pool chemical' },
  { key: 'pool-build',           label: 'Pool (build)',               persona: 'ada',   keywords: 'pool builder, pool installation, pool construction, pool design' },
  { key: 'painting-res',         label: 'Painting (residential)',     persona: 'ada',   keywords: 'painter, residential painting, house painter, interior painting' },
  { key: 'painting-com',         label: 'Painting (commercial)',      persona: 'ada',   keywords: 'painting contractor, commercial painting, industrial painting' },
  { key: 'cleaning',             label: 'Residential cleaning',       persona: 'ada',   keywords: 'house cleaning, residential cleaning, maid service, cleaning service, deep cleaning' },

  // ── Grace presets (churches) ─────────────────────────────────────
  // Two-axis decision: theology lane × congregation size. Keywords stay
  // intentionally generic ("church") because Google Places categorizes
  // most by name pattern, not denomination tag. We rely on the
  // score-leads-grace scorer to detect denomination from the name.
  { key: 'church-evangelical',   label: 'Churches — evangelical / non-denominational', persona: 'grace', keywords: 'community church, bible church, non-denominational church, evangelical church' },
  { key: 'church-baptist',       label: 'Churches — Baptist',         persona: 'grace', keywords: 'baptist church, southern baptist church' },
  { key: 'church-methodist',     label: 'Churches — Methodist',       persona: 'grace', keywords: 'methodist church, united methodist church, free methodist' },
  { key: 'church-presbyterian',  label: 'Churches — Presbyterian',    persona: 'grace', keywords: 'presbyterian church, PCA church, EPC church' },
  { key: 'church-pentecostal',   label: 'Churches — Pentecostal / AG',persona: 'grace', keywords: 'pentecostal church, assemblies of god church, foursquare church' },
  { key: 'church-lutheran',      label: 'Churches — Lutheran',        persona: 'grace', keywords: 'lutheran church, ELCA church, LCMS church' },
  { key: 'church-general',       label: 'Churches — general / mixed', persona: 'grace', keywords: 'church, christian church, protestant church' },
]

const selectedPersona = ref<Persona>('ada')
const selectedIndustry = ref<string>('')

const presetsForPersona = computed(() =>
  INDUSTRY_PRESETS.filter((p) => p.persona === selectedPersona.value),
)

const newCampaign = ref({
  name: '',
  geo_state: '',
  geo_cities: '',
  keywords: '',
  target_count: 100,
  notes: '',
})

function applyIndustryPreset() {
  const p = INDUSTRY_PRESETS.find((x) => x.key === selectedIndustry.value)
  if (!p) return
  newCampaign.value.keywords = p.keywords
  // Auto-name from industry + first city if there is one. Strip the
  // parenthetical refinement: "Electrical (residential)" → "Electrical residential"
  const ind = p.label.replace(/[()]/g, '').replace(/\s+/g, ' ').trim()
  const firstCity = newCampaign.value.geo_cities.split(/[,–—]/)[0]?.trim()
  newCampaign.value.name = firstCity ? `${firstCity} · ${ind}` : ind
}

function onPersonaChange() {
  // Reset the industry pick when persona switches so the dropdown only
  // shows the relevant set. Avoids the surprise of an ada preset staying
  // selected after the operator flipped to grace.
  selectedIndustry.value = ''
  newCampaign.value.keywords = ''
}

async function load() {
  loading.value = true
  const { data, error } = await supabase
    .from('cs_lead_campaigns')
    .select('*')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) {
    message.value = { kind: 'err', text: `Load failed: ${error.message}` }
    loading.value = false
    return
  }
  campaigns.value = (data ?? []) as Campaign[]
  loading.value = false
}

const byStatus = computed(() => {
  return {
    pending: campaigns.value.filter((c) => c.status === 'pending'),
    active:  campaigns.value.filter((c) => c.status === 'active'),
    paused:  campaigns.value.filter((c) => c.status === 'paused'),
    done:    campaigns.value.filter((c) => c.status === 'done'),
  }
})

async function createCampaign() {
  if (!newCampaign.value.name.trim()) return
  const geo: Record<string, unknown> = {}
  if (newCampaign.value.geo_state.trim()) geo.state = newCampaign.value.geo_state.trim().toUpperCase()
  if (newCampaign.value.geo_cities.trim()) {
    // Split on comma OR en-dash OR em-dash so "Miami, Fort Lauderdale" AND
    // "Miami–Fort Lauderdale" both produce the right city list.
    geo.cities = newCampaign.value.geo_cities.split(/[,–—]/).map((c) => c.trim()).filter(Boolean)
  }

  const apolloQuery: Record<string, unknown> = {}
  if (newCampaign.value.keywords.trim()) {
    apolloQuery.keyword_tags = newCampaign.value.keywords
      .split(/[,–—]/)
      .map((k) => k.trim())
      .filter(Boolean)
  }

  const { error } = await supabase.from('cs_lead_campaigns').insert({
    name: newCampaign.value.name.trim(),
    geo,
    apollo_query: apolloQuery,
    target_count: newCampaign.value.target_count,
    notes: newCampaign.value.notes.trim() || null,
    priority: 100, // bottom of the queue by default
    status: 'pending',
    persona: selectedPersona.value,
  } as never)
  if (error) {
    message.value = { kind: 'err', text: `Create failed: ${error.message}` }
    return
  }
  newCampaign.value = { name: '', geo_state: '', geo_cities: '', keywords: '', target_count: 100, notes: '' }
  selectedIndustry.value = ''
  selectedPersona.value = 'ada'
  showNewForm.value = false
  message.value = { kind: 'ok', text: 'Campaign created. Lower priority numbers run first.' }
  setTimeout(() => { if (message.value?.kind === 'ok') message.value = null }, 4000)
  await load()
}

async function setStatus(c: Campaign, status: Campaign['status']) {
  const patch: Record<string, unknown> = { status }
  if (status === 'active' && !c.started_at) patch.started_at = new Date().toISOString()
  if (status === 'done')   patch.ended_at = new Date().toISOString()
  const { error } = await supabase.from('cs_lead_campaigns').update(patch as never).eq('id', c.id)
  if (error) {
    message.value = { kind: 'err', text: error.message }
    return
  }
  await load()
}

async function setPriority(c: Campaign, value: number) {
  const { error } = await supabase
    .from('cs_lead_campaigns')
    .update({ priority: value } as never)
    .eq('id', c.id)
  if (error) {
    message.value = { kind: 'err', text: error.message }
    return
  }
  await load()
}

async function deleteCampaign(c: Campaign) {
  if (!window.confirm(`Delete campaign "${c.name}"? This won't delete the leads it sourced.`)) return
  const { error } = await supabase.from('cs_lead_campaigns').delete().eq('id', c.id)
  if (error) {
    message.value = { kind: 'err', text: error.message }
    return
  }
  await load()
}

function geoSummary(g: Record<string, unknown>): string {
  if (!g) return '—'
  const state = typeof g.state === 'string' ? g.state : ''
  const cities = Array.isArray((g as { cities?: string[] }).cities) ? (g as { cities: string[] }).cities : []
  if (cities.length > 0 && state) return `${cities.join(', ')}, ${state}`
  if (cities.length > 0) return cities.join(', ')
  if (state) return state
  return 'No geo set'
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

onMounted(load)
</script>

<template>
  <section class="card">
    <header class="mb-4 flex items-start justify-between gap-3 flex-wrap">
      <div>
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-1">
          Lead automation
        </div>
        <h3 class="text-base font-semibold text-ink">Lead-sourcing campaigns</h3>
        <p class="text-xs text-ink-muted mt-1 leading-relaxed max-w-2xl">
          Queue geos + ICP filters. The lead-sourcing-cron picks the lowest-priority pending
          campaign, pulls until target_count is hit, then activates the next one. One active
          at a time.
        </p>
      </div>
      <button
        type="button"
        class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-[opacity,transform] duration-150 ease-out-quart active:scale-[0.97] inline-flex items-center gap-1.5"
        @click="showNewForm = !showNewForm"
      >
        <AdaIcon name="referral_hunter" class="h-3.5 w-3.5" />
        {{ showNewForm ? 'Cancel' : 'New campaign' }}
      </button>
    </header>

    <!-- New campaign form -->
    <div v-if="showNewForm" class="rounded-card border border-brand/30 bg-brand/5 p-4 mb-4 space-y-3">
      <!-- Persona toggle — drives the scoring + drafting brain that gets
           used downstream. Ada for home services, Grace for churches. -->
      <div>
        <span class="text-[10px] font-semibold uppercase tracking-wider text-brand">
          Persona <span class="text-danger">*</span>
        </span>
        <div class="mt-1 flex gap-2">
          <label
            class="flex-1 cursor-pointer rounded-md border px-3 py-2 transition-colors"
            :class="selectedPersona === 'ada'
              ? 'border-brand bg-brand/10 text-ink'
              : 'border-divider bg-surface-raised text-ink-muted hover:border-divider-bright'"
          >
            <input
              v-model="selectedPersona"
              type="radio"
              value="ada"
              class="sr-only"
              @change="onPersonaChange"
            />
            <span class="block text-sm font-semibold">Ada</span>
            <span class="block text-[11px] mt-0.5 leading-snug">Home services (HVAC, plumbing, roofing, etc.)</span>
          </label>
          <label
            class="flex-1 cursor-pointer rounded-md border px-3 py-2 transition-colors"
            :class="selectedPersona === 'grace'
              ? 'border-brand bg-brand/10 text-ink'
              : 'border-divider bg-surface-raised text-ink-muted hover:border-divider-bright'"
          >
            <input
              v-model="selectedPersona"
              type="radio"
              value="grace"
              class="sr-only"
              @change="onPersonaChange"
            />
            <span class="block text-sm font-semibold">Grace</span>
            <span class="block text-[11px] mt-0.5 leading-snug">Churches (200 to 1,500 weekly attendance)</span>
          </label>
        </div>
      </div>

      <!-- Industry preset — auto-fills keywords + name. Metro is free-text below. -->
      <label class="block">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-brand">
          Industry preset <span class="text-danger">*</span>
        </span>
        <select
          v-model="selectedIndustry"
          class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
          @change="applyIndustryPreset"
        >
          <option value="">— Pick an industry —</option>
          <option v-for="p in presetsForPersona" :key="p.key" :value="p.key">
            {{ p.label }}
          </option>
        </select>
        <p class="text-[11px] text-ink-muted italic mt-1 leading-snug">
          Auto-fills keywords + name. Edit anything below as needed.
        </p>
      </label>

      <!-- Auto-filled fields — still editable as overrides -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label class="block">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Name</span>
          <input
            v-model="newCampaign.name"
            type="text"
            placeholder="Tampa · HVAC"
            class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
          />
        </label>
        <label class="block">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Target count</span>
          <input
            v-model.number="newCampaign.target_count"
            type="number"
            min="1"
            max="2000"
            class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-2 py-1.5 text-sm text-ink tabular-nums focus:border-brand focus:outline-none"
          />
        </label>
        <label class="block">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">State</span>
          <input
            v-model="newCampaign.geo_state"
            type="text"
            maxlength="2"
            placeholder="FL"
            class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-2 py-1.5 text-sm text-ink uppercase focus:border-brand focus:outline-none"
          />
        </label>
        <label class="block">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Cities (comma-separated)</span>
          <input
            v-model="newCampaign.geo_cities"
            type="text"
            placeholder="Tampa, St. Petersburg, Clearwater"
            class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
          />
        </label>
      </div>
      <label class="block">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
          Keywords <span class="text-danger">*</span>
        </span>
        <input
          v-model="newCampaign.keywords"
          type="text"
          placeholder="Auto-fills from the industry preset above"
          class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
        />
        <p class="text-[10px] text-ink-disabled mt-1 leading-snug">
          What Apollo matches against. Override the preset if you want tighter or wider.
        </p>
      </label>
      <label class="block">
        <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Notes</span>
        <textarea
          v-model="newCampaign.notes"
          rows="2"
          placeholder="Why this slice? What signal are you betting on?"
          class="mt-1 w-full rounded-md border border-divider bg-surface-raised px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none resize-y"
        />
      </label>
      <div class="flex items-center justify-end gap-2">
        <button
          type="button"
          class="text-xs text-ink-muted hover:text-ink"
          @click="showNewForm = false"
        >Cancel</button>
        <button
          type="button"
          class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-[opacity,transform] duration-150 ease-out-quart active:scale-[0.97]"
          :disabled="!newCampaign.name.trim() || !newCampaign.keywords.trim()"
          @click="createCampaign"
        >Create</button>
      </div>
    </div>

    <!-- Status message -->
    <p
      v-if="message"
      class="text-xs mb-3"
      :class="message.kind === 'ok' ? 'text-success' : 'text-danger'"
    >{{ message.text }}</p>

    <!-- Three-column kanban -->
    <div v-if="!loading" class="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <!-- Pending -->
      <div>
        <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2">
          Pending ({{ byStatus.pending.length }})
        </div>
        <div v-if="byStatus.pending.length === 0" class="text-[11px] text-ink-disabled italic py-3">
          Empty. Queue some campaigns to keep Ada busy.
        </div>
        <div v-else class="space-y-2">
          <article
            v-for="c in byStatus.pending"
            :key="c.id"
            class="rounded-card border border-divider bg-surface-raised p-3"
          >
            <div class="flex items-baseline justify-between gap-2 mb-1">
              <div class="flex items-baseline gap-1.5 min-w-0">
                <h4 class="text-sm font-semibold text-ink truncate">{{ c.name }}</h4>
                <span
                  class="text-[9px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 flex-shrink-0"
                  :class="c.persona === 'grace' ? 'bg-accent/20 text-accent' : 'bg-brand/15 text-brand'"
                >{{ c.persona }}</span>
              </div>
              <input
                v-model.number="c.priority"
                type="number"
                class="w-12 rounded border border-divider bg-surface px-1 py-0.5 text-[10px] text-ink tabular-nums focus:border-brand focus:outline-none"
                :title="'Priority — lower runs first'"
                @change="setPriority(c, c.priority)"
              />
            </div>
            <p class="text-[11px] text-ink-muted">{{ geoSummary(c.geo) }} · target {{ c.target_count }}</p>
            <p v-if="c.notes" class="text-[11px] text-ink-disabled italic mt-1 line-clamp-2">{{ c.notes }}</p>
            <div class="flex items-center gap-1.5 mt-2">
              <button
                type="button"
                class="rounded text-[10px] text-brand hover:underline"
                @click="setStatus(c, 'active')"
              >Activate now</button>
              <span class="text-ink-disabled">·</span>
              <button
                type="button"
                class="rounded text-[10px] text-ink-muted hover:text-danger"
                @click="deleteCampaign(c)"
              >Delete</button>
            </div>
          </article>
        </div>
      </div>

      <!-- Active -->
      <div>
        <div class="text-[10px] font-bold uppercase tracking-wider text-brand mb-2">
          Active ({{ byStatus.active.length }})
        </div>
        <div v-if="byStatus.active.length === 0" class="text-[11px] text-ink-disabled italic py-3">
          Nothing running. The cron will activate the top pending one on its next tick.
        </div>
        <div v-else class="space-y-2">
          <article
            v-for="c in byStatus.active"
            :key="c.id"
            class="rounded-card border-2 border-brand/40 bg-brand/5 p-3"
          >
            <div class="flex items-baseline justify-between gap-2 mb-1">
              <div class="flex items-baseline gap-1.5 min-w-0">
                <h4 class="text-sm font-semibold text-ink truncate">{{ c.name }}</h4>
                <span
                  class="text-[9px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 flex-shrink-0"
                  :class="c.persona === 'grace' ? 'bg-accent/20 text-accent' : 'bg-brand/15 text-brand'"
                >{{ c.persona }}</span>
              </div>
              <span class="text-[10px] font-bold text-brand tabular-nums">
                {{ c.pulled_count }}/{{ c.target_count }}
              </span>
            </div>
            <p class="text-[11px] text-ink-muted">{{ geoSummary(c.geo) }}</p>
            <div class="mt-2 h-1.5 w-full rounded-full bg-divider/40 overflow-hidden">
              <div
                class="h-full bg-brand transition-[width] duration-500 ease-out-quart"
                :style="{ width: `${Math.min(100, (c.pulled_count / c.target_count) * 100)}%` }"
              ></div>
            </div>
            <p class="text-[11px] text-ink-muted mt-2">
              <span v-if="c.started_at">Started {{ fmtDate(c.started_at) }}</span>
            </p>
            <div class="flex items-center gap-1.5 mt-2">
              <button
                type="button"
                class="rounded text-[10px] text-ink-muted hover:text-warn"
                @click="setStatus(c, 'paused')"
              >Pause</button>
              <span class="text-ink-disabled">·</span>
              <button
                type="button"
                class="rounded text-[10px] text-ink-muted hover:text-danger"
                @click="setStatus(c, 'done')"
              >Mark done</button>
            </div>
          </article>
        </div>
      </div>

      <!-- Done / Paused -->
      <div>
        <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2">
          Done ({{ byStatus.done.length }}) · Paused ({{ byStatus.paused.length }})
        </div>
        <div
          v-if="byStatus.done.length === 0 && byStatus.paused.length === 0"
          class="text-[11px] text-ink-disabled italic py-3"
        >
          No completed campaigns yet.
        </div>
        <div v-else class="space-y-2">
          <article
            v-for="c in [...byStatus.paused, ...byStatus.done]"
            :key="c.id"
            class="rounded-card border border-divider bg-surface-raised p-3 opacity-70"
          >
            <div class="flex items-baseline justify-between gap-2 mb-1">
              <div class="flex items-baseline gap-1.5 min-w-0">
                <h4 class="text-sm font-semibold text-ink truncate">{{ c.name }}</h4>
                <span
                  class="text-[9px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 flex-shrink-0"
                  :class="c.persona === 'grace' ? 'bg-accent/20 text-accent' : 'bg-brand/15 text-brand'"
                >{{ c.persona }}</span>
              </div>
              <span
                class="text-[9px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5"
                :class="c.status === 'done' ? 'bg-success/15 text-success' : 'bg-warn/15 text-warn'"
              >{{ c.status }}</span>
            </div>
            <p class="text-[11px] text-ink-muted">
              {{ geoSummary(c.geo) }} ·
              {{ c.pulled_count }}/{{ c.target_count }} pulled
              <template v-if="c.replied_count > 0">· {{ c.replied_count }} replied</template>
            </p>
            <p class="text-[11px] text-ink-disabled mt-1">
              <span v-if="c.ended_at">Ended {{ fmtDate(c.ended_at) }}</span>
              <span v-else-if="c.started_at">Started {{ fmtDate(c.started_at) }}</span>
            </p>
            <div class="flex items-center gap-1.5 mt-2">
              <button
                v-if="c.status === 'paused'"
                type="button"
                class="rounded text-[10px] text-brand hover:underline"
                @click="setStatus(c, 'pending')"
              >Re-queue</button>
              <button
                v-else
                type="button"
                class="rounded text-[10px] text-brand hover:underline"
                @click="setStatus(c, 'pending')"
              >Run again</button>
              <span class="text-ink-disabled">·</span>
              <button
                type="button"
                class="rounded text-[10px] text-ink-muted hover:text-danger"
                @click="deleteCampaign(c)"
              >Delete</button>
            </div>
          </article>
        </div>
      </div>
    </div>

    <div v-else class="text-xs text-ink-muted py-4">Loading…</div>
  </section>
</template>
