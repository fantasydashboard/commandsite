<script setup lang="ts">
/**
 * Settings - who owns each page.
 *
 * The chips at the top of each page read from here. This is the one screen where
 * a church decides accountability, so it states the reasoning rather than just
 * offering four text boxes: one name per page, not a team, because a queue
 * everyone can see is a queue everyone assumes someone else handled.
 */
import { onMounted, ref } from 'vue'
import {
  getPageLeads, savePageLeads, PAGE_LABEL, SUGGESTED_CADENCE,
  type PageKey, type PageLeads,
} from '@/lib/clients/church/pageLeads'

const props = defineProps<{ clientId: string }>()

const PAGES: PageKey[] = ['front-desk-guests', 'care-drift', 'sundays-comms', 'insights']

const leads = ref<PageLeads>({})
const loading = ref(true)
const saving = ref(false)
const saved = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  try { leads.value = await getPageLeads(props.clientId) } catch { /* falls back to unassigned */ }
  loading.value = false
})

function field(p: PageKey): { name: string; cadence: string } {
  const l = leads.value[p]
  return { name: l?.name ?? '', cadence: l?.cadence ?? '' }
}
function setField(p: PageKey, key: 'name' | 'cadence', v: string) {
  const cur = leads.value[p] ?? { name: '' }
  leads.value = { ...leads.value, [p]: { ...cur, [key]: v } }
  saved.value = false
}

async function save() {
  saving.value = true
  error.value = null
  try {
    // Drop rows with no name so an emptied field genuinely unassigns the page
    // rather than leaving a blank owner that still reads as "set".
    const clean: PageLeads = {}
    for (const p of PAGES) {
      const l = leads.value[p]
      if (l?.name?.trim()) clean[p] = { name: l.name.trim(), cadence: l.cadence?.trim() || undefined }
    }
    await savePageLeads(props.clientId, clean)
    leads.value = clean
    saved.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Page leads</span>
      <span class="text-[11px] text-ink-muted">Shown at the top of each page</span>
    </div>
    <h3 class="mt-1 text-base font-semibold text-ink">One name per page</h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">
      A page everyone watches is a page nobody works: the more people who could act, the more
      each one assumes somebody else did. One name, one day, ten minutes. The same person can
      hold several pages, and leaving one blank is a fine answer while you decide.
    </p>

    <div v-if="!loading" class="mt-5 space-y-3">
      <div
        v-for="p in PAGES"
        :key="p"
        class="grid gap-3 rounded-lg border border-divider bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center"
      >
        <div class="text-sm font-medium text-ink">{{ PAGE_LABEL[p] }}</div>
        <input
          :value="field(p).name"
          type="text"
          placeholder="Nobody yet"
          class="w-full rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-disabled focus:border-brand focus:outline-none"
          @input="setField(p, 'name', ($event.target as HTMLInputElement).value)"
        />
        <input
          :value="field(p).cadence"
          type="text"
          :placeholder="SUGGESTED_CADENCE[p]"
          class="w-full rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-disabled focus:border-brand focus:outline-none"
          @input="setField(p, 'cadence', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          class="rounded-md bg-brand px-4 py-1.5 text-xs font-semibold text-ink-inverse hover:bg-brand-hover disabled:opacity-50"
          :disabled="saving"
          @click="save"
        >{{ saving ? 'Saving…' : 'Save page leads' }}</button>
        <span v-if="saved" class="text-[11px] font-medium text-success">Saved</span>
        <span v-if="error" class="text-[11px] text-danger">{{ error }}</span>
      </div>
    </div>
    <p v-else class="mt-4 text-[11px] text-ink-muted">Loading…</p>

    <p class="mt-4 text-[11px] leading-relaxed text-ink-disabled">
      The cadence is a placeholder suggestion until you set your own. Ministry leaders do not need
      to be named here: serving and group cases route to them by email on Monday without a login.
    </p>
  </section>
</template>
