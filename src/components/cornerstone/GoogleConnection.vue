<script setup lang="ts">
/**
 * Focal Point - Google (Gmail) connection card (Settings > Integrations).
 *
 * The self-service OAuth flow that lets Grace send email as the church's own
 * Google address(es). The church approves CommandSite on Google's OWN consent
 * screen; we store an encrypted, per-church token server-side and never see
 * their login. This card lists every connected sending address and drives
 * the OAuth handoff for adding more. Send-only: Grace can send mail, never
 * read the inbox.
 */
import { onMounted, onBeforeUnmount, ref, computed } from 'vue'
import { getGoogleConnections, startGoogleConnect, disconnectGoogle, type GoogleConnectionStatus } from '@/lib/google/connect'

// `embedded` drops the outer card + eyebrow so this can render as a row inside
// the integrations list (the connection lives with the other integrations, not
// in a separate section below).
const props = defineProps<{ tenant: string; label: string; embedded?: boolean }>()

const connections = ref<GoogleConnectionStatus[]>([])
const loading = ref(true)
const working = ref(false)
const error = ref<string | null>(null)
let popup: Window | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

const connected = computed(() => connections.value.length > 0)

function scopeChips(scopes?: string | null): string[] {
  return (scopes ?? '').split(/\s+/).filter(Boolean)
}

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
  connections.value = await getGoogleConnections(props.tenant)
}

async function connect() {
  error.value = null
  working.value = true
  try {
    const before = connections.value.length
    const { auth_url } = await startGoogleConnect(props.tenant, props.label)
    // Open Google's consent screen in a popup, then poll for the row the callback
    // writes so the card flips to "connected" (or gains a row, for "connect
    // another") without a manual reload.
    popup = window.open(auth_url, 'google-consent', 'width=560,height=720')
    startPolling(before)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    working.value = false
  }
}

function startPolling(before: number) {
  stopPolling()
  let elapsed = 0
  pollTimer = setInterval(async () => {
    elapsed += 3
    await refresh()
    if (connections.value.length > before || elapsed >= 180 || (popup && popup.closed)) {
      stopPolling()
    }
  }, 3000)
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

async function disconnect(email: string) {
  error.value = null
  working.value = true
  try {
    await disconnectGoogle(props.tenant, email)
    await refresh()
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
      <span class="eyebrow">Google (Gmail)</span>
      <span class="text-xs text-ink-muted">Send email as the church's own address</span>
    </div>

    <!-- Connected: one row per sending address -->
    <div v-if="connected" class="space-y-2">
      <div
        v-for="(conn, i) in connections"
        :key="conn.connected_email ?? i"
        class="rounded-md border border-divider bg-surface p-4"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex items-start gap-3">
            <span class="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-success/15 text-success text-sm font-bold">✓</span>
            <div>
              <div class="flex items-center gap-2 text-sm font-semibold text-ink">
                Sending as {{ conn.connected_email }}
                <span
                  v-if="conn.is_default"
                  class="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand"
                >Default</span>
              </div>
              <div class="text-[12px] text-ink-muted">
                <template v-if="conn.connected_by">Authorized by {{ conn.connected_by }} · </template>
                connected {{ fmtAgo(conn.connected_at) }}
                <template v-if="conn.last_refreshed_at"> · token refreshed {{ fmtAgo(conn.last_refreshed_at) }}</template>
              </div>
            </div>
          </div>
          <button
            type="button"
            class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-danger hover:text-danger disabled:opacity-50"
            :disabled="working"
            @click="disconnect(conn.connected_email as string)"
          >Disconnect</button>
        </div>
        <div v-if="conn.is_default && scopeChips(conn.scopes).length" class="mt-3 flex flex-wrap items-center gap-1.5">
          <span class="text-[10px] uppercase tracking-wider font-semibold text-ink-disabled">Access granted</span>
          <span
            v-for="s in scopeChips(conn.scopes)"
            :key="s"
            class="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand"
          >{{ s }}</span>
        </div>
      </div>

      <button
        type="button"
        class="w-full rounded-md border border-dashed border-divider px-4 py-2 text-xs font-semibold text-ink-muted hover:border-brand hover:text-brand disabled:opacity-50"
        :disabled="working"
        @click="connect"
      >{{ working ? 'Opening…' : '+ Connect another Google account' }}</button>
    </div>

    <!-- Not connected -->
    <div v-else-if="!loading" class="rounded-md border border-divider bg-surface p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-start gap-3">
          <span class="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-divider bg-surface-elevated text-[11px] font-bold" style="color:#4285F4">G</span>
          <div class="max-w-md">
            <div class="text-sm font-semibold text-ink">Not connected yet</div>
            <p class="text-[12px] leading-snug text-ink-muted">
              Connect the church's Google account so Grace can send email as your address. You approve the access on Google's screen; we never see the login and Grace can only send, never read your inbox.
            </p>
          </div>
        </div>
        <button
          type="button"
          class="rounded-md bg-brand px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          :disabled="working"
          @click="connect"
        >{{ working ? 'Opening…' : 'Connect Google' }}</button>
      </div>
    </div>

    <!-- Loading -->
    <div v-else class="rounded-md border border-divider bg-surface p-4 text-xs text-ink-muted">
      Checking connection…
    </div>

    <p v-if="error" class="mt-2 text-xs text-danger">{{ error }}</p>
  </component>
</template>
