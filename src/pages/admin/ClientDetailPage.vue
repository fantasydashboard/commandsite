<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { moduleRegistry, getModule } from '@/modules/registry'
import { modulesForClient } from '@/config/clients'
import type { Client } from '@/types/database'

const props = defineProps<{ id: string }>()

const client = ref<Client | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  const { data, error: err } = await supabase
    .from('clients')
    .select('*')
    .eq('id', props.id)
    .maybeSingle()
  if (err) error.value = err.message
  client.value = data as Client | null
  loading.value = false
}

// Module enablement is defined in src/config/clients.ts — this page only
// renders it. Edit the config file in the repo to add/remove modules.
const configuredModules = computed(() => {
  if (!client.value) return []
  return modulesForClient(client.value.slug).map((m) => ({
    key: m.key,
    def: getModule(m.key),
  }))
})

const configuredKeys = computed(
  () => new Set(configuredModules.value.map((m) => m.key)),
)

onMounted(load)
</script>

<template>
  <div>
    <RouterLink to="/admin" class="text-sm text-ink-muted hover:text-ink transition-colors">
      ← All clients
    </RouterLink>

    <div v-if="loading" class="text-sm text-ink-muted mt-6">Loading…</div>

    <div v-else-if="!client" class="text-sm text-danger mt-6">Client not found.</div>

    <div v-else class="mt-4">
      <div class="flex items-baseline justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-ink">{{ client.name }}</h1>
          <p class="text-sm text-ink-muted">
            /{{ client.slug }} · {{ client.tier }} · ${{ client.monthly_rate.toFixed(2) }}/mo
          </p>
        </div>
        <RouterLink
          :to="`/dashboard/${client.slug}`"
          class="btn-secondary"
        >
          View dashboard ↗
        </RouterLink>
      </div>

      <p v-if="error" class="text-sm text-danger mt-4">{{ error }}</p>

      <section class="mt-8">
        <div class="mb-4 flex items-baseline justify-between">
          <h2 class="text-lg font-semibold text-ink">Modules</h2>
          <span class="text-xs text-ink-muted">
            Configured in <code class="font-mono">src/config/clients.ts</code>
          </span>
        </div>

        <div
          v-if="configuredModules.length === 0"
          class="card-flat border border-divider text-sm text-ink-muted"
        >
          No modules configured for <code class="font-mono">{{ client.slug }}</code>.
        </div>

        <div v-else class="grid gap-4 sm:grid-cols-2 mb-8">
          <div
            v-for="mod in configuredModules"
            :key="mod.key"
            class="card flex items-start justify-between gap-4"
          >
            <div>
              <div class="font-medium text-ink">
                {{ mod.def?.label ?? mod.key }}
              </div>
              <div class="text-sm text-ink-muted mt-1">
                {{ mod.def?.description ?? 'Not found in module registry.' }}
              </div>
            </div>
            <span class="chip chip-active shrink-0">Enabled</span>
          </div>
        </div>

        <details class="text-sm text-ink-muted">
          <summary class="cursor-pointer hover:text-ink">
            Available modules ({{ moduleRegistry.length - configuredModules.length }} not in use)
          </summary>
          <ul class="mt-3 space-y-1 pl-4 text-xs">
            <li
              v-for="mod in moduleRegistry.filter((m) => !configuredKeys.has(m.key))"
              :key="mod.key"
            >
              <code class="font-mono">{{ mod.key }}</code> — {{ mod.label }}
            </li>
          </ul>
        </details>
      </section>
    </div>
  </div>
</template>
