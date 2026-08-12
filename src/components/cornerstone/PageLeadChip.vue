<script setup lang="ts">
/**
 * "Page lead" chip: who is accountable for working this page.
 *
 * Sits in the roles strip at the top of each page so it is the first thing read,
 * alongside what Grace does here.
 *
 * UNASSIGNED IS THE HONEST DEFAULT and it renders as a prompt, not an error. No
 * placeholder name is invented: a fake owner reads as real, and the point of
 * this chip is that someone is genuinely accountable. An empty one asks the
 * question every time the page is opened, which is exactly the nudge a church
 * needs while they are deciding.
 *
 * The suggested cadence shows only when unassigned, as guidance. Once a lead is
 * set, their own cadence replaces it, because a church's rhythm is theirs.
 */
import { computed, onMounted, ref, watch } from 'vue'
import {
  getPageLeads,
  SUGGESTED_CADENCE,
  type PageKey,
  type PageLead,
} from '@/lib/clients/church/pageLeads'

const props = defineProps<{ clientId: string; page: PageKey }>()

const lead = ref<PageLead | null>(null)
const loaded = ref(false)

async function load() {
  loaded.value = false
  try {
    const all = await getPageLeads(props.clientId)
    const l = all[props.page]
    lead.value = l && l.name?.trim() ? l : null
  } catch {
    lead.value = null
  }
  loaded.value = true
}
onMounted(load)
watch(() => [props.clientId, props.page], load)

const cadence = computed(() => lead.value?.cadence?.trim() || SUGGESTED_CADENCE[props.page])
</script>

<template>
  <span v-if="loaded" class="inline-flex items-center gap-1.5 text-[11px]">
    <span class="font-semibold uppercase tracking-[0.14em] text-ink-disabled">Page lead</span>
    <template v-if="lead">
      <span class="rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand">{{ lead.name }}</span>
      <span class="text-ink-muted">{{ cadence }}</span>
    </template>
    <template v-else>
      <span class="rounded-full border border-dashed border-warn/50 bg-warn/[0.07] px-2 py-0.5 font-semibold text-warn">
        Unassigned
      </span>
      <span class="text-ink-disabled">suggested: {{ cadence }}</span>
    </template>
  </span>
</template>
