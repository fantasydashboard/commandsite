<script setup lang="ts">
/**
 * Real-church integrations list. Leads with the LIVE Planning Center connection
 * (the church connects it right here via the embedded PcoConnection), then an
 * aspirational catalog where every other tool shows "Ask about adding" (prefilled
 * email). No fake "connected" states, and no separate "set up below" section.
 */
import { computed } from 'vue'
import { CATALOG, INTEGRATION_GROUPS, askEmailHref, type CatalogItem } from '@/lib/clients/church/integrationsCatalog'
import PcoConnection from '@/components/cornerstone/PcoConnection.vue'

const props = defineProps<{ tenant: string; label: string }>()

const groups = computed(() =>
  INTEGRATION_GROUPS
    .map((g) => ({ ...g, items: CATALOG.filter((c) => c.category === g.key) }))
    .filter((g) => g.items.length),
)

function href(item: CatalogItem) { return askEmailHref(props.label, item) }
</script>

<template>
  <section class="card">
    <div class="mb-3 flex items-center gap-2">
      <span class="eyebrow">Integrations</span>
      <span class="text-xs text-ink-muted">Planning Center is live. Ask us about the rest.</span>
    </div>
    <div class="space-y-4">
      <!-- Source of truth: the real Planning Center connection, connect right here -->
      <div>
        <div class="text-[10px] uppercase tracking-wider font-semibold text-ink-muted mb-2">Source of truth</div>
        <PcoConnection :tenant="tenant" :label="label" embedded />
      </div>

      <!-- Everything else: aspirational, ask about adding -->
      <div v-for="g in groups" :key="g.key">
        <div class="text-[10px] uppercase tracking-wider font-semibold text-ink-muted mb-2">{{ g.label }}</div>
        <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div v-for="i in g.items" :key="i.key" class="flex items-start gap-3 rounded-md border border-divider bg-surface p-3">
            <span class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface-elevated text-ink-disabled text-xs font-bold">·</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-semibold text-ink">{{ i.label }}</span>
                <a :href="href(i)" class="text-xs font-medium text-brand hover:underline">Ask about adding →</a>
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
