<script setup lang="ts">
/**
 * Small "Download CSV" affordance for a dashboard section.
 *
 * `sensitive` marks an export that contains people's names. Those are gated to
 * users with full permission scope: a comms-only or finance-scoped user can read
 * a page without being able to pull the congregant list off it. Aggregate
 * exports (counts, months, milestones) carry no PII and stay open to anyone who
 * can see the page.
 */
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const props = withDefaults(
  defineProps<{ label?: string; count?: number | null; sensitive?: boolean }>(),
  { label: 'Download CSV', count: null, sensitive: false },
)
const emit = defineEmits<{ (e: 'export'): void }>()

const auth = useAuthStore()

// Admins always may. Otherwise a sensitive export needs permission_scope 'full'.
// Mirrors the UI-level gating in lib/clients/church/access.ts; server-hard
// enforcement is the same deferred item noted there.
const profile = computed(() => auth.profile as { role?: string; permission_scope?: string } | null)
const allowed = computed(() => {
  if (!props.sensitive) return true
  const p = profile.value
  return p?.role === 'admin' || p?.permission_scope === 'full'
})
</script>

<template>
  <button
    v-if="allowed"
    type="button"
    class="inline-flex items-center gap-1.5 rounded-md border border-divider bg-surface-raised px-2.5 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
    :disabled="count === 0"
    :title="count === 0 ? 'Nothing to export yet' : undefined"
    @click="emit('export')"
  >
    <svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
      <path d="M8 2v8m0 0L5 7m3 3 3-3" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M2.5 11.5v1a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1" stroke-linecap="round" />
    </svg>
    {{ label }}<span v-if="count !== null" class="text-ink-disabled"> ({{ count }})</span>
  </button>
</template>
