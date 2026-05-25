<script setup lang="ts">
/**
 * CommandSite — CSV import modal for cs_leads.
 *
 * Paste raw CSV text → preview → map columns → import.
 * Auto-detects header row, handles common CSV quirks (quoted fields,
 * embedded commas, BOM). Auto-scores each row against current ICP
 * before insert so leads land already graded.
 */
import { ref, computed, watch } from 'vue'
import type { CsLeadInsert, CsLeadSource, CsSettings } from '@/types/database'
import { scoreLead } from '@/lib/clients/commandsite/leadsApi'

const props = defineProps<{ open: boolean; settings: CsSettings }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'imported', payload: { rows: CsLeadInsert[]; batchLabel: string }): void
}>()

const csvText = ref('')
const sourceTag = ref<CsLeadSource>('manual_csv')
const batchLabel = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)

// Lead-field targets the user can map their CSV columns to.
const TARGETS = [
  { key: 'company_name',  label: 'Company name *', required: true },
  { key: 'contact_name',  label: 'Contact name' },
  { key: 'contact_email', label: 'Email' },
  { key: 'contact_title', label: 'Title' },
  { key: 'contact_phone', label: 'Phone' },
  { key: 'linkedin_url',  label: 'LinkedIn URL' },
  { key: 'company_url',   label: 'Company URL' },
  { key: 'industry',      label: 'Industry' },
  { key: 'city',          label: 'City' },
  { key: 'state',         label: 'State' },
  { key: 'team_size',     label: 'Team size (number)' },
  { key: 'annual_revenue_estimate', label: 'Annual revenue (number)' },
  { key: 'notes',         label: 'Notes' },
  { key: '__skip',        label: '— skip column —' },
] as const

type TargetKey = typeof TARGETS[number]['key']

// Parsed CSV state
const parsedHeaders = ref<string[]>([])
const parsedRows = ref<string[][]>([])
const columnMapping = ref<Record<number, TargetKey>>({})

const sourceOptions: { value: CsLeadSource; label: string }[] = [
  { value: 'manual_csv',     label: 'Manual CSV paste' },
  { value: 'apollo_csv',     label: 'Apollo export' },
  { value: 'linkedin_export',label: 'LinkedIn export' },
  { value: 'reddit_scrape',  label: 'Reddit scrape' },
  { value: 'social_engager', label: 'Social engager' },
  { value: 'referral',       label: 'Referral list' },
  { value: 'other',          label: 'Other' },
]

// ── Tiny CSV parser. Handles quoted fields, embedded commas, embedded
//    quotes (RFC-4180 escape: ""), CRLF or LF line endings.
function parseCsv(text: string): string[][] {
  const cleaned = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').trim()
  if (!cleaned) return []
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i]
    if (inQuotes) {
      if (c === '"') {
        if (cleaned[i + 1] === '"') { field += '"'; i++ }
        else { inQuotes = false }
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { cur.push(field); field = '' }
      else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = '' }
      else field += c
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur) }
  return rows
}

// Guess the right target field for each header name.
function guessTarget(header: string): TargetKey {
  const h = header.toLowerCase().trim()
  if (/(^|[\s_])company([\s_]|$)|account|business/i.test(h) && !/url|website/.test(h)) return 'company_name'
  if (/url|website|domain/i.test(h) && /(company|account|biz)/i.test(h)) return 'company_url'
  if (/(first.*last|full.*name|contact|name)/i.test(h) && !/company|account/.test(h)) return 'contact_name'
  if (/email/i.test(h)) return 'contact_email'
  if (/title|role|position/i.test(h)) return 'contact_title'
  if (/phone|mobile|tel/i.test(h)) return 'contact_phone'
  if (/linkedin/i.test(h)) return 'linkedin_url'
  if (/industry|vertical|sector/i.test(h)) return 'industry'
  if (/(^|[\s_])city([\s_]|$)/i.test(h)) return 'city'
  if (/(^|[\s_])state([\s_]|$)|region|province/i.test(h)) return 'state'
  if (/employees|head.?count|team.?size|size/i.test(h)) return 'team_size'
  if (/revenue|arr|annual/i.test(h)) return 'annual_revenue_estimate'
  if (/notes?|comment/i.test(h)) return 'notes'
  return '__skip'
}

watch(csvText, (text) => {
  const rows = parseCsv(text)
  if (rows.length === 0) {
    parsedHeaders.value = []
    parsedRows.value = []
    columnMapping.value = {}
    return
  }
  parsedHeaders.value = rows[0]
  parsedRows.value = rows.slice(1).filter((r) => r.some((cell) => cell.trim().length > 0))
  // Auto-guess mappings on every paste
  const m: Record<number, TargetKey> = {}
  parsedHeaders.value.forEach((h, i) => { m[i] = guessTarget(h) })
  columnMapping.value = m
})

// ── Preview rows: apply mapping + score
const previewRows = computed(() => {
  return parsedRows.value.slice(0, 10).map((row) => {
    const lead: Partial<CsLeadInsert> & { _score?: number; _reason?: string } = {}
    parsedHeaders.value.forEach((_h, i) => {
      const target = columnMapping.value[i]
      if (target === '__skip') return
      const val = (row[i] ?? '').trim()
      if (!val) return
      if (target === 'team_size' || target === 'annual_revenue_estimate') {
        const n = parseInt(val.replace(/[^0-9]/g, ''), 10)
        if (!isNaN(n)) (lead as Record<string, unknown>)[target] = n
      } else {
        (lead as Record<string, unknown>)[target] = val
      }
    })
    if (lead.company_name) {
      const { score, reason } = scoreLead({
        industry: lead.industry ?? null,
        team_size: lead.team_size ?? null,
        state: lead.state ?? null,
        country: 'US',
      }, props.settings)
      lead._score = score
      lead._reason = reason
    }
    return lead
  })
})

const validRowCount = computed(() => {
  return parsedRows.value.filter((row) => {
    const idx = parsedHeaders.value.findIndex((_h, i) => columnMapping.value[i] === 'company_name')
    if (idx === -1) return false
    return (row[idx] ?? '').trim().length > 0
  }).length
})

const canImport = computed(() => {
  return validRowCount.value > 0
    && Object.values(columnMapping.value).includes('company_name')
})

function close() {
  emit('close')
  setTimeout(() => {
    csvText.value = ''
    parsedHeaders.value = []
    parsedRows.value = []
    columnMapping.value = {}
    error.value = null
    batchLabel.value = ''
  }, 200)
}

function submit() {
  if (!canImport.value || submitting.value) return
  submitting.value = true
  error.value = null
  const batchId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `batch-${Date.now()}`
  const label = batchLabel.value.trim() || `${sourceOptions.find((s) => s.value === sourceTag.value)?.label ?? 'Import'} · ${new Date().toISOString().slice(0, 10)}`
  const rows: CsLeadInsert[] = []
  for (const row of parsedRows.value) {
    const lead: Partial<CsLeadInsert> = {
      source: sourceTag.value,
      imported_batch_id: batchId,
      imported_batch_label: label,
      status: 'new',
    }
    parsedHeaders.value.forEach((_h, i) => {
      const target = columnMapping.value[i]
      if (target === '__skip') return
      const val = (row[i] ?? '').trim()
      if (!val) return
      if (target === 'team_size' || target === 'annual_revenue_estimate') {
        const n = parseInt(val.replace(/[^0-9]/g, ''), 10)
        if (!isNaN(n)) (lead as Record<string, unknown>)[target] = n
      } else {
        (lead as Record<string, unknown>)[target] = val
      }
    })
    if (!lead.company_name) continue
    // Score it now
    const { score, reason } = scoreLead({
      industry: lead.industry ?? null,
      team_size: lead.team_size ?? null,
      state: lead.state ?? null,
      country: 'US',
    }, props.settings)
    lead.icp_score = score
    lead.icp_score_reason = reason
    rows.push(lead as CsLeadInsert)
  }
  emit('imported', { rows, batchLabel: label })
  submitting.value = false
  close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="props.open"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-ink/60 p-4"
        @click.self="close"
      >
        <div class="w-full max-w-4xl rounded-card bg-surface shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
          <!-- Header -->
          <div class="flex items-start justify-between gap-3 border-b border-divider px-5 py-4">
            <div>
              <h3 class="text-lg font-semibold text-ink">Import leads from CSV</h3>
              <p class="text-xs text-ink-muted mt-0.5">
                Paste rows from Apollo, LinkedIn, a Google Sheet, or anywhere else. We'll auto-detect columns + score against your ICP. Empty rows skipped.
              </p>
            </div>
            <button type="button" class="text-ink-muted hover:text-ink text-2xl leading-none p-1 -mr-1" @click="close" aria-label="Close">×</button>
          </div>

          <!-- Body -->
          <div class="overflow-y-auto px-5 py-4 flex-1 space-y-4">
            <!-- Source + batch label -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="kpi-label block mb-1">Source</label>
                <select
                  v-model="sourceTag"
                  class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                >
                  <option v-for="s in sourceOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
                </select>
              </div>
              <div>
                <label class="kpi-label block mb-1">Batch label <span class="text-[10px] text-ink-disabled">(optional)</span></label>
                <input
                  v-model="batchLabel"
                  type="text"
                  placeholder="HVAC Sun Belt Q2"
                  class="w-full rounded-md border border-divider bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>
            </div>

            <!-- CSV paste area -->
            <div>
              <label class="kpi-label block mb-1">Paste CSV (with header row)</label>
              <textarea
                v-model="csvText"
                rows="6"
                placeholder="company,contact,email,title,industry,city,state,employees&#10;Pinnacle Heating,Travis Reeves,travis@pinnacle-air.com,Owner,HVAC,Austin,TX,8&#10;Sunshine Plumbing,Maria Castillo,maria@sunshineplumbing.co,GM,Plumbing,Orlando,FL,12"
                class="w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-xs text-ink font-mono resize-y focus:outline-none focus:border-brand"
              ></textarea>
            </div>

            <!-- Column mapping -->
            <div v-if="parsedHeaders.length > 0">
              <div class="flex items-baseline justify-between mb-2">
                <label class="kpi-label">Column mapping</label>
                <span class="text-[11px] text-ink-muted">{{ parsedRows.length }} rows detected · {{ validRowCount }} mappable</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <div v-for="(h, i) in parsedHeaders" :key="i" class="flex flex-col gap-1">
                  <span class="text-[10px] font-medium text-ink-muted uppercase tracking-wide truncate">{{ h || `Column ${i+1}` }}</span>
                  <select
                    v-model="columnMapping[i]"
                    class="w-full rounded-md border border-divider bg-surface px-2 py-1 text-xs text-ink focus:outline-none focus:border-brand"
                  >
                    <option v-for="t in TARGETS" :key="t.key" :value="t.key">{{ t.label }}</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Preview with scores -->
            <div v-if="previewRows.length > 0">
              <div class="flex items-baseline justify-between mb-2">
                <label class="kpi-label">Preview (first 10) with ICP scoring</label>
                <span class="text-[11px] text-ink-muted">Scored against current cs_settings</span>
              </div>
              <div class="overflow-x-auto rounded-md border border-divider">
                <table class="w-full text-xs">
                  <thead class="bg-surface-elevated text-[10px] font-medium text-ink-muted uppercase tracking-wide">
                    <tr>
                      <th class="px-2 py-1.5 text-left">Score</th>
                      <th class="px-2 py-1.5 text-left">Company</th>
                      <th class="px-2 py-1.5 text-left">Contact</th>
                      <th class="px-2 py-1.5 text-left">Industry</th>
                      <th class="px-2 py-1.5 text-left">Geo</th>
                      <th class="px-2 py-1.5 text-left">Size</th>
                      <th class="px-2 py-1.5 text-left">Why</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-divider">
                    <tr v-for="(row, i) in previewRows" :key="i" class="bg-surface">
                      <td class="px-2 py-1.5 tabular-nums">
                        <span
                          class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          :class="(row._score ?? 0) >= 80 ? 'bg-success/15 text-success' : (row._score ?? 0) >= 60 ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger'"
                        >{{ row._score ?? '—' }}</span>
                      </td>
                      <td class="px-2 py-1.5 text-ink font-medium truncate max-w-[160px]">{{ row.company_name || '—' }}</td>
                      <td class="px-2 py-1.5 text-ink-muted truncate max-w-[140px]">{{ row.contact_name || '—' }}</td>
                      <td class="px-2 py-1.5 text-ink-muted">{{ row.industry || '—' }}</td>
                      <td class="px-2 py-1.5 text-ink-muted">{{ [row.city, row.state].filter(Boolean).join(', ') || '—' }}</td>
                      <td class="px-2 py-1.5 text-ink-muted tabular-nums">{{ row.team_size ?? '—' }}</td>
                      <td class="px-2 py-1.5 text-[10px] text-ink-disabled">{{ row._reason }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-if="parsedRows.length > 10" class="text-[11px] text-ink-disabled mt-1">…and {{ parsedRows.length - 10 }} more rows</p>
            </div>

            <p v-if="error" class="text-sm text-danger">{{ error }}</p>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between gap-2 border-t border-divider px-5 py-3 bg-surface">
            <div class="text-xs text-ink-muted">
              <span v-if="canImport"><strong>{{ validRowCount }}</strong> leads will be imported + scored</span>
              <span v-else>Map at least the Company column to enable import</span>
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted hover:text-ink"
                @click="close"
              >Cancel</button>
              <button
                type="button"
                class="rounded-md bg-brand text-ink-inverse px-4 py-1.5 text-sm font-semibold disabled:opacity-50 hover:opacity-90"
                :disabled="!canImport || submitting"
                @click="submit"
              >{{ submitting ? 'Importing…' : `Import ${validRowCount} leads` }}</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 120ms ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
