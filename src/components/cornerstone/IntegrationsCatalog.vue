<script setup lang="ts">
/**
 * Real-church integrations catalog. Planning Center is the one live integration
 * (state from the OAuth connection); every other tool is aspirational and shows
 * "Ask about adding" (prefilled email). No fake "connected" states.
 */
import { computed, onMounted, ref } from 'vue'
import { CATALOG, INTEGRATION_GROUPS, askEmailHref, type CatalogItem } from '@/lib/clients/church/integrationsCatalog'
import { getPcoConnection } from '@/lib/pco/connect'

const props = defineProps<{ tenant: string; label: string }>()
const pcoConnected = ref(false)

const groups = computed(() =>
  INTEGRATION_GROUPS
    .map((g) => ({ ...g, items: CATALOG.filter((c) => c.category === g.key) }))
    .filter((g) => g.items.length),
)

onMounted(async () => { pcoConnected.value = !!(await getPcoConnection(props.tenant)) })
function href(item: CatalogItem) { return askEmailHref(props.label, item) }
</script>

<template>
  <section class="card">
    <div class="mb-3 flex items-center gap-2">
      <span class="eyebrow">Integrations</span>
      <span class="text-xs text-ink-muted">Planning Center is live. Ask us about the rest.</span>
    </div>
    <div class="space-y-4">
      <div v-for="g in groups" :key="g.key">
        <div class="text-[10px] uppercase tracking-wider font-semibold text-ink-muted mb-2">{{ g.label }}</div>
        <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div v-for="i in g.items" :key="i.key" class="flex items-start gap-3 rounded-md border border-divider bg-surface p-3">
            <span class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
              :class="i.live && pcoConnected ? 'bg-success/15 text-success' : 'bg-surface-elevated text-ink-disabled'">{{ i.live && pcoConnected ? '✓' : '·' }}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-semibold text-ink">{{ i.label }}</span>
                <a v-if="i.live" href="#planning-center" class="text-xs font-medium hover:underline"
                  :class="pcoConnected ? 'text-success' : 'text-brand'">{{ pcoConnected ? 'Connected' : 'Set up below' }}</a>
                <a v-else :href="href(i)" class="text-xs font-medium text-brand hover:underline">Ask about adding →</a>
              </div>
              <div class="text-xs text-ink-muted">{{ i.description }}</div>
              <div v-if="i.note" class="mt-1 text-[11px] text-ink-disabled">{{ i.note }}</div>
            </div>
          </div>
        </div>
      </div>
      <p class="text-[11px] text-ink-disabled">Grace is powered by Anthropic Claude.</p>
    </div>
  </section>
</template>
