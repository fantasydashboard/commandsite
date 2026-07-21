<script setup lang="ts">
/**
 * Focal Point - Planning Center connection card (Settings > Integrations).
 *
 * The self-service replacement for a shared Personal Access Token. The church
 * approves CommandSite on Planning Center's OWN consent screen; we store an
 * encrypted, per-church token server-side and never see their login. This card
 * shows connection status and drives the OAuth handoff. Gated to churches with
 * a real pull (Focal Point) by the parent, same as DuplicatesSettings.
 */
import { onMounted, onBeforeUnmount, ref, computed } from 'vue'
import { getPcoConnection, startPcoConnect, disconnectPco, type PcoConnectionStatus } from '@/lib/pco/connect'

// `embedded` drops the outer card + eyebrow so this can render as a row inside
// the integrations list (the connection lives with the other integrations, not
// in a separate section below).
const props = defineProps<{ tenant: string; label: string; embedded?: boolean }>()

const status = ref<PcoConnectionStatus | null>(null)
const loading = ref(true)
const working = ref(false)
const error = ref<string | null>(null)
let popup: Window | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

const connected = computed(() => status.value !== null)
const scopeChips = computed(() =>
  (status.value?.scopes ?? '').split(/\s+/).filter(Boolean),
)

function fmtAgo(iso?: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

async function refresh() {
  status.value = await getPcoConnection(props.tenant)
}

async function connect() {
  error.value = null
  working.value = true
  try {
    const { auth_url } = await startPcoConnect(props.tenant, props.label)
    // Open PCO's consent screen in a popup, then poll for the row the callback
    // writes so the card flips to "connected" without a manual reload.
    popup = window.open(auth_url, 'pco-consent', 'width=560,height=720')
    startPolling()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    working.value = false
  }
}

function startPolling() {
  stopPolling()
  let elapsed = 0
  pollTimer = setInterval(async () => {
    elapsed += 3
    await refresh()
    if (status.value || elapsed >= 180 || (popup && popup.closed)) {
      stopPolling()
    }
  }, 3000)
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

async function disconnect() {
  error.value = null
  working.value = true
  try {
    await disconnectPco(props.tenant)
    status.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    working.value = false
  }
}

onMounted(async () => {
  await refresh()
  loading.value = false
})
onBeforeUnmount(stopPolling)
</script>

<template>
  <component :is="embedded ? 'div' : 'section'" :class="embedded ? '' : 'card'">
    <div v-if="!embedded" class="mb-3 flex items-center gap-2">
      <span class="eyebrow">Planning Center</span>
      <span class="text-xs text-ink-muted">The church's own connection, not a shared password</span>
    </div>

    <!-- Connected -->
    <div v-if="connected" class="rounded-md border border-divider bg-surface p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-start gap-3">
          <span class="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-success/15 text-success text-sm font-bold">✓</span>
          <div>
            <div class="text-sm font-semibold text-ink">
              {{ status?.org_name ?? label }} is connected
            </div>
            <div class="text-[12px] text-ink-muted">
              <template v-if="status?.connected_by">Authorized by {{ status.connected_by }} · </template>
              connected {{ fmtAgo(status?.connected_at) }}
              <template v-if="status?.last_refreshed_at"> · token refreshed {{ fmtAgo(status?.last_refreshed_at) }}</template>
            </div>
          </div>
        </div>
        <button
          type="button"
          class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-danger hover:text-danger disabled:opacity-50"
          :disabled="working"
          @click="disconnect"
        >Disconnect</button>
      </div>
      <div v-if="scopeChips.length" class="mt-3 flex flex-wrap items-center gap-1.5">
        <span class="text-[10px] uppercase tracking-wider font-semibold text-ink-disabled">Access granted</span>
        <span
          v-for="s in scopeChips"
          :key="s"
          class="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand"
        >{{ s }}</span>
      </div>
    </div>

    <!-- Not connected -->
    <div v-else-if="!loading" class="rounded-md border border-divider bg-surface p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-start gap-3">
          <span class="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-bold" style="background-color:#2C7BE51a;color:#2C7BE5">PC</span>
          <div class="max-w-md">
            <div class="text-sm font-semibold text-ink">Not connected yet</div>
            <p class="text-[12px] leading-snug text-ink-muted">
              Click connect, approve CommandSite on Planning Center's screen, and Grace can read this church's data on her own. You approve the access; we never see the login, and the connection can be revoked here or in Planning Center anytime.
            </p>
          </div>
        </div>
        <button
          type="button"
          class="rounded-md bg-brand px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          :disabled="working"
          @click="connect"
        >{{ working ? 'Opening…' : 'Connect Planning Center' }}</button>
      </div>
    </div>

    <!-- Loading -->
    <div v-else class="rounded-md border border-divider bg-surface p-4 text-xs text-ink-muted">
      Checking connection…
    </div>

    <p v-if="error" class="mt-2 text-xs text-danger">{{ error }}</p>
  </component>
</template>
