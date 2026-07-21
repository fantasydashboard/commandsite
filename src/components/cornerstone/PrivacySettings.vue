<script setup lang="ts">
/**
 * Real per-church privacy / role-gating for a live church. Loads the persisted
 * config from church_settings and saves each toggle immediately. These toggles
 * are what the dashboard enforces (UI-level) to gate sensitive categories per
 * scope. The Cornerstone demo keeps its sample toggles inline.
 */
import { onMounted, ref } from 'vue'
import { CHURCH_PRIVACY, getPrivacy, savePrivacy, defaultPrivacy, type PrivacyConfig } from '@/lib/clients/church/privacy'

const props = defineProps<{ clientId: string }>()

const config = ref<PrivacyConfig>(defaultPrivacy())
const loading = ref(true)
const error = ref<string | null>(null)
const savedFlash = ref(false)

onMounted(async () => {
  try { config.value = await getPrivacy(props.clientId) }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { loading.value = false }
})

async function toggle(key: string) {
  const next = { ...config.value, [key]: !config.value[key] }
  config.value = next
  error.value = null
  try {
    await savePrivacy(props.clientId, next)
    savedFlash.value = true
    setTimeout(() => { savedFlash.value = false }, 2000)
  } catch (e) {
    config.value = { ...config.value, [key]: !next[key] } // revert
    error.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <section class="card">
    <div class="mb-3 flex items-center gap-2">
      <span class="eyebrow">🔒 Privacy + Role-Gating</span>
      <span class="text-xs text-ink-muted">What different staff roles can and cannot see</span>
      <span v-if="savedFlash" class="text-[11px] text-success">Saved</span>
    </div>
    <p v-if="error" class="mb-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">{{ error }}</p>
    <div v-if="loading" class="rounded-md border border-divider p-4 text-xs text-ink-muted">Loading...</div>
    <div v-else class="space-y-2">
      <article v-for="t in CHURCH_PRIVACY" :key="t.key" class="flex items-start gap-3 rounded-md border border-divider p-3">
        <label class="inline-flex items-center cursor-pointer flex-shrink-0 mt-0.5">
          <input type="checkbox" :checked="config[t.key]" class="sr-only peer" @change="toggle(t.key)" />
          <span class="relative h-5 w-9 rounded-full bg-surface-elevated transition-colors peer-checked:bg-brand">
            <span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4"></span>
          </span>
        </label>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-semibold text-ink">{{ t.label }}</div>
          <div class="text-[11px] text-ink-muted leading-snug">{{ t.description }}</div>
        </div>
      </article>
    </div>
  </section>
</template>
