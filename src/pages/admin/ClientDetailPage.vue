<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { moduleRegistry } from '@/modules/registry'
import type { Client, ClientModule } from '@/types/database'

const props = defineProps<{ id: string }>()

const client = ref<Client | null>(null)
const modules = ref<ClientModule[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const saving = ref<string | null>(null)

async function load() {
  loading.value = true
  const [{ data: c, error: e1 }, { data: m, error: e2 }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', props.id).maybeSingle(),
    supabase.from('client_modules').select('*').eq('client_id', props.id),
  ])
  if (e1) error.value = e1.message
  if (e2) error.value = e2.message
  client.value = c as Client | null
  modules.value = (m ?? []) as ClientModule[]
  loading.value = false
}

function isEnabled(key: string) {
  return modules.value.find((m) => m.module_key === key)?.enabled ?? false
}

async function toggleModule(key: string) {
  saving.value = key
  error.value = null
  const existing = modules.value.find((m) => m.module_key === key)

  if (existing) {
    const { error: err } = await supabase
      .from('client_modules')
      .update({ enabled: !existing.enabled })
      .eq('id', existing.id)
    if (err) error.value = err.message
    else existing.enabled = !existing.enabled
  } else {
    const { data, error: err } = await supabase
      .from('client_modules')
      .insert({ client_id: props.id, module_key: key, enabled: true })
      .select()
      .single()
    if (err) error.value = err.message
    else if (data) modules.value.push(data as ClientModule)
  }
  saving.value = null
}

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
        <a
          :href="`/dashboard/${client.slug}`"
          target="_blank"
          class="btn-secondary"
        >
          View dashboard ↗
        </a>
      </div>

      <p v-if="error" class="text-sm text-danger mt-4">{{ error }}</p>

      <section class="mt-8">
        <h2 class="text-lg font-semibold text-ink mb-4">Modules</h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <div
            v-for="mod in moduleRegistry"
            :key="mod.key"
            class="card flex items-start justify-between gap-4"
          >
            <div>
              <div class="font-medium text-ink">{{ mod.label }}</div>
              <div class="text-sm text-ink-muted mt-1">{{ mod.description }}</div>
            </div>
            <button
              class="text-xs font-medium rounded-full px-3 py-1.5 shrink-0 transition-colors"
              :class="isEnabled(mod.key)
                ? 'bg-brand text-ink hover:bg-brand-hover'
                : 'bg-surface-elevated text-ink-muted border border-divider hover:border-divider-bright'"
              :disabled="saving === mod.key"
              @click="toggleModule(mod.key)"
            >
              {{ saving === mod.key ? '…' : isEnabled(mod.key) ? 'Enabled' : 'Disabled' }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
