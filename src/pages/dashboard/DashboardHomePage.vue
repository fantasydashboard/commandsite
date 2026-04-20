<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { getModule } from '@/modules/registry'
import type { ClientModule } from '@/types/database'
import { useDashboardContext } from './context'

const { client, enabledModuleKeys } = useDashboardContext()

const modules = ref<ClientModule[]>([])
const loadingModules = ref(true)

const activeModules = computed(() =>
  modules.value
    .filter((m) => m.enabled && enabledModuleKeys.value.has(m.module_key))
    .map((m) => ({ record: m, def: getModule(m.module_key) }))
    .filter((m) => m.def !== undefined),
)

async function load() {
  if (!client.value) return
  loadingModules.value = true
  const { data } = await supabase
    .from('client_modules')
    .select('*')
    .eq('client_id', client.value.id)
  modules.value = (data ?? []) as ClientModule[]
  loadingModules.value = false
}

onMounted(load)
</script>

<template>
  <div>
    <div v-if="loadingModules" class="text-sm text-ink-muted">Loading modules…</div>

    <div
      v-else-if="activeModules.length === 0"
      class="card text-center text-ink-muted"
    >
      No modules are enabled for your dashboard yet. Your CommandSite admin
      will configure them shortly.
    </div>

    <div v-else class="grid gap-6 lg:grid-cols-2">
      <section v-for="m in activeModules" :key="m.record.id" class="card">
        <component
          :is="m.def!.component"
          :client="client!"
          :config="m.record.config"
        />
      </section>
    </div>
  </div>
</template>
