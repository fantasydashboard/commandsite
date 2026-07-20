<script setup lang="ts">
/**
 * /admin/pco-test — Planning Center API sandbox.
 *
 * Two auth modes:
 *  - Connected church (OAuth): pick a church slug and the pco-proxy resolves
 *    that church's stored OAuth token server-side. No token in the browser.
 *    This is how you verify a church's connection right after it authorizes.
 *  - Personal Access Token: paste an app_id:secret PAT for ad-hoc probing.
 *    Token lives in localStorage only, never in git, never in Supabase.
 *
 * Every API call goes through the pco-proxy Edge Function (PCO doesn't allow
 * CORS for browser-direct calls).
 *
 * Tests cover the data shapes Grace actually needs:
 *  - People (members + visitors)
 *  - Forms (where connect-card submissions live)
 *  - Form Submissions (the visitor intake feed)
 *  - Check-Ins (drives Drift Watch)
 *  - Groups (member context)
 *  - Custom path (paste any endpoint for ad-hoc testing)
 */
import { computed, onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabase'

// ── Auth mode: 'tenant' (connected church OAuth) or 'pat' (pasted token)
type AuthMode = 'tenant' | 'pat'
const AUTH_MODE_KEY = 'pco_test_auth_mode'
const TENANT_STORAGE_KEY = 'pco_test_tenant'
const authMode = ref<AuthMode>('tenant')
const tenant = ref('focal-point-church')

// ── Token: PAT in "app_id:secret" format, persisted in localStorage
const TOKEN_STORAGE_KEY = 'pco_pat_test_only'
const token = ref('')
const showToken = ref(false)

onMounted(() => {
  const savedMode = localStorage.getItem(AUTH_MODE_KEY)
  if (savedMode === 'tenant' || savedMode === 'pat') authMode.value = savedMode
  const savedTenant = localStorage.getItem(TENANT_STORAGE_KEY)
  if (savedTenant) tenant.value = savedTenant
  const saved = localStorage.getItem(TOKEN_STORAGE_KEY)
  if (saved) token.value = saved
})

function setMode(mode: AuthMode) {
  authMode.value = mode
  localStorage.setItem(AUTH_MODE_KEY, mode)
}

function saveTenant() {
  if (tenant.value.trim()) localStorage.setItem(TENANT_STORAGE_KEY, tenant.value.trim())
  else localStorage.removeItem(TENANT_STORAGE_KEY)
}

function saveToken() {
  if (token.value.trim()) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token.value.trim())
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  }
}

const tokenIsValid = computed(() => token.value.includes(':') && token.value.trim().length > 5)
const tenantIsValid = computed(() => /^[a-z0-9][a-z0-9_-]*$/.test(tenant.value.trim()))
// Whether the current mode has enough to fire a call.
const canRun = computed(() => (authMode.value === 'tenant' ? tenantIsValid.value : tokenIsValid.value))

// ── One result per test slot (keyed by test id)
interface TestResult {
  status: number
  statusText: string
  body: string
  parsed: unknown
  ranAt: Date
  durationMs: number
}
const results = ref<Record<string, TestResult>>({})
const loading = ref<Record<string, boolean>>({})
const errors = ref<Record<string, string>>({})

async function runTest(slotId: string, path: string, method = 'GET') {
  if (!canRun.value) {
    errors.value[slotId] = authMode.value === 'tenant'
      ? 'Enter a connected church slug first (e.g. focal-point-church).'
      : 'Enter a PCO Personal Access Token first (format: app_id:secret).'
    return
  }
  loading.value[slotId] = true
  errors.value[slotId] = ''
  const startedAt = Date.now()
  try {
    const body = authMode.value === 'tenant'
      ? { tenant: tenant.value.trim(), path, method }
      : { token: token.value.trim(), path, method }
    const { data, error } = await supabase.functions.invoke('pco-proxy', { body })
    if (error) {
      errors.value[slotId] = error.message || 'Proxy call failed'
      return
    }
    // Tenant mode with no connection returns { error } instead of a PCO shape.
    const maybeErr = (data as { error?: string })?.error
    if (maybeErr) {
      errors.value[slotId] = maybeErr
      return
    }
    const res = data as { status: number; statusText: string; body: string; parsed: unknown }
    results.value[slotId] = {
      status: res.status,
      statusText: res.statusText,
      body: res.body,
      parsed: res.parsed,
      ranAt: new Date(),
      durationMs: Date.now() - startedAt,
    }
  } catch (err) {
    errors.value[slotId] = err instanceof Error ? err.message : 'Unknown error'
  } finally {
    loading.value[slotId] = false
  }
}

// ── Custom path input for ad-hoc testing
const customPath = ref('/people/v2/me')
const customMethod = ref('GET')

// ── Form submissions test needs a form ID after Forms test runs
const formIdForSubmissions = ref('')

// ── Helpers for the result display
function statusColor(status: number): string {
  if (status === 0) return 'bg-danger/15 text-danger border-danger/30'
  if (status >= 200 && status < 300) return 'bg-success/15 text-success border-success/30'
  if (status >= 400 && status < 500) return 'bg-warn/15 text-warn border-warn/30'
  return 'bg-danger/15 text-danger border-danger/30'
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// JSON:API parsed shape — extract the data array length for a summary line
function summary(result: TestResult): string {
  const parsed = result.parsed as Record<string, unknown> | null | undefined
  if (!parsed) return ''
  const data = parsed?.data
  if (Array.isArray(data)) {
    const meta = parsed?.meta as Record<string, unknown> | undefined
    const total = meta?.total_count
    return `${data.length} item${data.length === 1 ? '' : 's'}${total !== undefined ? ` (of ${total} total)` : ''}`
  }
  if (data && typeof data === 'object') return '1 item'
  return ''
}

// Extract the data array (or wrap single resource) for the table view
function tableRows(result: TestResult): Array<{ id: string; type: string; attrs: Record<string, unknown> }> {
  const parsed = result.parsed as Record<string, unknown> | null | undefined
  if (!parsed) return []
  const data = parsed?.data
  const items = Array.isArray(data) ? data : data ? [data] : []
  return items.map((item) => {
    const obj = item as Record<string, unknown>
    return {
      id: String(obj?.id ?? ''),
      type: String(obj?.type ?? ''),
      attrs: (obj?.attributes as Record<string, unknown>) ?? {},
    }
  })
}

function fmtCell(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value.length > 80 ? value.slice(0, 80) + '…' : value
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 80)
  return String(value)
}

// Test definitions — one card per Grace use case
const tests = [
  {
    id: 'connection',
    title: 'Connection check',
    desc: 'GET /people/v2/me — confirms the token works and shows which account it belongs to.',
    path: '/people/v2/me',
  },
  {
    id: 'people-recent',
    title: 'Recent people',
    desc: 'Last 10 people created. Mix of members + visitors. Confirms read access to People.',
    path: '/people/v2/people?per_page=10&order=-created_at',
  },
  {
    id: 'forms',
    title: 'Forms',
    desc: 'All forms in the account. Find the connect-card form ID for the next test.',
    path: '/people/v2/forms?per_page=25',
  },
  {
    id: 'checkins',
    title: 'Recent check-ins',
    desc: 'Last 10 check-in events. Drives Drift Watch (which families haven\'t attended in 3+ Sundays).',
    path: '/check-ins/v2/check_ins?per_page=10&order=-created_at',
  },
  {
    id: 'groups',
    title: 'Groups',
    desc: 'All groups. Used for member context (small group, ministry team, etc.).',
    path: '/groups/v2/groups?per_page=25',
  },
]
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-6 space-y-6">
    <header>
      <h1 class="text-2xl font-semibold text-ink tracking-tight">Planning Center · test sandbox</h1>
      <p class="text-sm text-ink-muted mt-1 max-w-3xl">
        Fire test calls against the PCO API to verify the integration shape Grace will use. Run as a connected church (its OAuth token, resolved server-side) or paste a Personal Access Token for ad-hoc probing.
      </p>
    </header>

    <!-- ── Auth mode ──────────────────────────────────────────────── -->
    <section class="card">
      <div class="mb-3">
        <span class="eyebrow">Auth mode</span>
      </div>
      <div class="inline-flex rounded-md border border-divider overflow-hidden mb-4">
        <button
          type="button"
          class="px-3 py-1.5 text-xs font-medium transition-colors"
          :class="authMode === 'tenant' ? 'bg-brand text-white' : 'bg-surface-raised text-ink-muted hover:text-ink'"
          @click="setMode('tenant')"
        >
          Connected church
        </button>
        <button
          type="button"
          class="px-3 py-1.5 text-xs font-medium transition-colors border-l border-divider"
          :class="authMode === 'pat' ? 'bg-brand text-white' : 'bg-surface-raised text-ink-muted hover:text-ink'"
          @click="setMode('pat')"
        >
          Personal Access Token
        </button>
      </div>

      <!-- Tenant (OAuth) mode -->
      <div v-if="authMode === 'tenant'">
        <p class="text-xs text-ink-muted mb-2">
          The church's slug (its dashboard URL segment). The proxy loads that church's stored OAuth token, refreshing it if needed. Nothing sensitive touches the browser. Connect a church first from its dashboard Settings.
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <input
            v-model="tenant"
            type="text"
            placeholder="focal-point-church"
            class="flex-1 min-w-[300px] rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            @change="saveTenant"
            @blur="saveTenant"
          />
          <span
            v-if="tenantIsValid"
            class="text-[11px] text-success bg-success/10 px-2 py-1 rounded-full font-medium"
          >
            Slug looks valid
          </span>
          <span
            v-else-if="tenant"
            class="text-[11px] text-warn bg-warn/10 px-2 py-1 rounded-full font-medium"
          >
            Use a lowercase slug like focal-point-church
          </span>
        </div>
      </div>

      <!-- PAT mode -->
      <div v-else>
        <p class="text-xs text-ink-muted mb-2">
          Format: <code class="font-mono text-[11px] bg-surface-elevated px-1.5 py-0.5 rounded">app_id:secret</code>. Create one at
          <a href="https://api.planningcenteronline.com/oauth/applications" target="_blank" class="text-brand hover:underline">api.planningcenteronline.com/oauth/applications</a> → "Personal Access Tokens" tab. Lives in your browser only, never in Supabase, never in git.
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <input
            v-model="token"
            :type="showToken ? 'text' : 'password'"
            placeholder="app_id:secret"
            class="flex-1 min-w-[300px] rounded-md border border-divider bg-surface-raised px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            @change="saveToken"
            @blur="saveToken"
          />
          <button
            type="button"
            class="text-xs text-ink-muted hover:text-ink px-2 py-1"
            @click="showToken = !showToken"
          >
            {{ showToken ? 'Hide' : 'Show' }}
          </button>
          <button
            type="button"
            class="text-xs text-danger hover:underline px-2 py-1"
            @click="token = ''; saveToken()"
          >
            Clear
          </button>
          <span
            v-if="tokenIsValid"
            class="text-[11px] text-success bg-success/10 px-2 py-1 rounded-full font-medium"
          >
            Looks valid
          </span>
          <span
            v-else-if="token"
            class="text-[11px] text-warn bg-warn/10 px-2 py-1 rounded-full font-medium"
          >
            Missing colon — should be app_id:secret
          </span>
        </div>
      </div>
    </section>

    <!-- ── Standard tests ─────────────────────────────────────────── -->
    <section
      v-for="test in tests"
      :key="test.id"
      class="card"
    >
      <div class="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div class="flex-1 min-w-0">
          <h2 class="text-base font-semibold text-ink">{{ test.title }}</h2>
          <p class="text-xs text-ink-muted mt-0.5">{{ test.desc }}</p>
          <code class="text-[11px] font-mono text-ink-muted block mt-1.5 break-all">GET {{ test.path }}</code>
        </div>
        <button
          type="button"
          class="btn-primary text-xs whitespace-nowrap"
          :disabled="loading[test.id] || !canRun"
          @click="runTest(test.id, test.path)"
        >
          {{ loading[test.id] ? 'Running…' : 'Run' }}
        </button>
      </div>

      <!-- Error -->
      <p v-if="errors[test.id]" class="rounded-card border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger mt-2">
        {{ errors[test.id] }}
      </p>

      <!-- Result -->
      <div v-if="results[test.id]" class="mt-3 space-y-3">
        <!-- Status line -->
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span
            class="rounded-full px-2 py-0.5 font-semibold border"
            :class="statusColor(results[test.id].status)"
          >
            {{ results[test.id].status }} {{ results[test.id].statusText }}
          </span>
          <span class="text-ink-muted">{{ fmtDuration(results[test.id].durationMs) }}</span>
          <span v-if="summary(results[test.id])" class="text-ink-muted">· {{ summary(results[test.id]) }}</span>
        </div>

        <!-- Parsed table (top 10 rows of data array) -->
        <div v-if="tableRows(results[test.id]).length" class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="border-b border-divider">
                <th class="text-left py-1.5 pr-3 text-[10px] uppercase tracking-wide text-ink-muted font-semibold">id</th>
                <th class="text-left py-1.5 pr-3 text-[10px] uppercase tracking-wide text-ink-muted font-semibold">type</th>
                <th class="text-left py-1.5 text-[10px] uppercase tracking-wide text-ink-muted font-semibold">attributes (first 4)</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in tableRows(results[test.id]).slice(0, 10)"
                :key="row.id + row.type"
                class="border-b border-divider/40 hover:bg-surface-elevated/40"
              >
                <td class="py-1.5 pr-3 font-mono text-[11px] text-ink-muted">{{ row.id }}</td>
                <td class="py-1.5 pr-3 text-ink">{{ row.type }}</td>
                <td class="py-1.5">
                  <div class="space-y-0.5">
                    <div
                      v-for="(value, key) in Object.fromEntries(Object.entries(row.attrs).slice(0, 4))"
                      :key="key"
                      class="text-[11px]"
                    >
                      <span class="text-ink-muted">{{ key }}:</span>
                      <span class="text-ink ml-1 font-mono">{{ fmtCell(value) }}</span>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Raw JSON -->
        <details class="text-xs">
          <summary class="cursor-pointer text-ink-muted hover:text-ink select-none">Raw JSON ({{ results[test.id].body.length }} bytes)</summary>
          <pre class="mt-2 max-h-96 overflow-auto bg-surface-elevated rounded-card border border-divider p-3 text-[11px] font-mono whitespace-pre-wrap break-all">{{ results[test.id].body }}</pre>
        </details>
      </div>
    </section>

    <!-- ── Form submissions: chained test (needs form ID from previous test) ── -->
    <section class="card">
      <div class="mb-3">
        <h2 class="text-base font-semibold text-ink">Form submissions</h2>
        <p class="text-xs text-ink-muted mt-0.5">
          Enter a form ID from the "Forms" test above to see submissions on it. This is where Grace reads new visitor connect cards.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <label class="text-xs text-ink-muted">Form ID:</label>
        <input
          v-model="formIdForSubmissions"
          type="text"
          placeholder="e.g. 12345"
          class="rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <button
          type="button"
          class="btn-primary text-xs"
          :disabled="loading['form-submissions'] || !canRun || !formIdForSubmissions"
          @click="runTest('form-submissions', `/people/v2/forms/${formIdForSubmissions}/form_submissions?per_page=10&order=-created_at`)"
        >
          {{ loading['form-submissions'] ? 'Running…' : 'Run' }}
        </button>
      </div>
      <p v-if="errors['form-submissions']" class="rounded-card border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
        {{ errors['form-submissions'] }}
      </p>
      <div v-if="results['form-submissions']" class="mt-3 space-y-3">
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="rounded-full px-2 py-0.5 font-semibold border" :class="statusColor(results['form-submissions'].status)">
            {{ results['form-submissions'].status }} {{ results['form-submissions'].statusText }}
          </span>
          <span class="text-ink-muted">{{ fmtDuration(results['form-submissions'].durationMs) }}</span>
          <span v-if="summary(results['form-submissions'])" class="text-ink-muted">· {{ summary(results['form-submissions']) }}</span>
        </div>
        <details class="text-xs">
          <summary class="cursor-pointer text-ink-muted hover:text-ink select-none">Raw JSON ({{ results['form-submissions'].body.length }} bytes)</summary>
          <pre class="mt-2 max-h-96 overflow-auto bg-surface-elevated rounded-card border border-divider p-3 text-[11px] font-mono whitespace-pre-wrap break-all">{{ results['form-submissions'].body }}</pre>
        </details>
      </div>
    </section>

    <!-- ── Custom request box ─────────────────────────────────────── -->
    <section class="card">
      <div class="mb-3">
        <h2 class="text-base font-semibold text-ink">Custom request</h2>
        <p class="text-xs text-ink-muted mt-0.5">
          Paste any PCO API path for ad-hoc testing. Full reference at
          <a href="https://developer.planning.center/docs/" target="_blank" class="text-brand hover:underline">developer.planning.center/docs</a>.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <select
          v-model="customMethod"
          class="rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        >
          <option>GET</option>
          <option>POST</option>
          <option>PATCH</option>
          <option>DELETE</option>
        </select>
        <input
          v-model="customPath"
          type="text"
          placeholder="/people/v2/me"
          class="flex-1 min-w-[300px] rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <button
          type="button"
          class="btn-primary text-xs"
          :disabled="loading['custom'] || !canRun || !customPath"
          @click="runTest('custom', customPath, customMethod)"
        >
          {{ loading['custom'] ? 'Running…' : 'Run' }}
        </button>
      </div>
      <p v-if="errors['custom']" class="rounded-card border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
        {{ errors['custom'] }}
      </p>
      <div v-if="results['custom']" class="mt-3 space-y-3">
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="rounded-full px-2 py-0.5 font-semibold border" :class="statusColor(results['custom'].status)">
            {{ results['custom'].status }} {{ results['custom'].statusText }}
          </span>
          <span class="text-ink-muted">{{ fmtDuration(results['custom'].durationMs) }}</span>
          <span v-if="summary(results['custom'])" class="text-ink-muted">· {{ summary(results['custom']) }}</span>
        </div>
        <pre class="mt-2 max-h-96 overflow-auto bg-surface-elevated rounded-card border border-divider p-3 text-[11px] font-mono whitespace-pre-wrap break-all">{{ results['custom'].body }}</pre>
      </div>
    </section>
  </div>
</template>
