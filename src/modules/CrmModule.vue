<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '@/lib/supabase'
import type { Client, Contact, Stage } from '@/types/database'

const props = defineProps<{ client: Client; config: Record<string, unknown> }>()

const contacts = ref<Contact[]>([])
const stages = ref<Stage[]>([])
const loading = ref(true)

async function load() {
  loading.value = true
  const { data: pipeline } = await supabase
    .from('pipelines')
    .select('id')
    .eq('client_id', props.client.id)
    .limit(1)
    .maybeSingle()

  const [{ data: c }, { data: s }] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, stage_id')
      .eq('client_id', props.client.id),
    pipeline
      ? supabase
          .from('stages')
          .select('*')
          .eq('pipeline_id', pipeline.id)
          .order('position')
      : Promise.resolve({ data: [] as Stage[] }),
  ])
  contacts.value = (c ?? []) as Contact[]
  stages.value = (s ?? []) as Stage[]
  loading.value = false
}

const stageBreakdown = computed(() => {
  const byStage = new Map<string, number>()
  contacts.value.forEach((c) => {
    if (c.stage_id) byStage.set(c.stage_id, (byStage.get(c.stage_id) ?? 0) + 1)
  })
  return stages.value
    .filter((s) => !s.is_lost)
    .map((s) => ({ stage: s, count: byStage.get(s.id) ?? 0 }))
})

const openCount = computed(() =>
  contacts.value.filter((c) => {
    if (!c.stage_id) return true
    const stage = stages.value.find((s) => s.id === c.stage_id)
    return stage && !stage.is_won && !stage.is_lost
  }).length,
)

onMounted(load)
</script>

<template>
  <div>
    <div class="flex items-baseline justify-between mb-4">
      <h3 class="text-lg font-semibold text-ink">CRM</h3>
      <RouterLink
        :to="`/dashboard/${client.slug}/crm`"
        class="text-sm link"
      >
        Open CRM →
      </RouterLink>
    </div>

    <div v-if="loading" class="text-sm text-ink-muted">Loading…</div>

    <template v-else>
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div class="text-xs text-ink-muted">Total contacts</div>
          <div class="text-2xl font-semibold text-ink">{{ contacts.length }}</div>
        </div>
        <div>
          <div class="text-xs text-ink-muted">Open</div>
          <div class="text-2xl font-semibold text-ink">{{ openCount }}</div>
        </div>
      </div>

      <div v-if="stageBreakdown.length > 0" class="space-y-1.5">
        <div
          v-for="row in stageBreakdown"
          :key="row.stage.id"
          class="flex items-center justify-between text-sm"
        >
          <span class="inline-flex items-center gap-2 text-ink-muted">
            <span
              class="inline-block w-2 h-2 rounded-full"
              :style="{ background: row.stage.color ?? '#365FAD' }"
            />
            {{ row.stage.name }}
          </span>
          <span class="text-ink font-medium">{{ row.count }}</span>
        </div>
      </div>

      <p v-else class="text-sm text-ink-muted">
        Open the CRM to set up your pipeline.
      </p>
    </template>
  </div>
</template>
