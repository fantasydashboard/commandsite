<script setup lang="ts">
/**
 * Real team management for a live church (Focal Point). Reads the church's actual
 * CommandSite users via the church-user-admin edge function and lets an admin
 * adjust scope, invite, and send a password reset. Gated to real churches by the
 * parent module; the Cornerstone demo keeps its inline sample rendering.
 */
import { computed, onMounted, ref } from 'vue'
import { listTeam, inviteMember, setScope, setTabs, setCongregation, sendReset, removeMember, PERMISSION_SCOPES, CONGREGATIONS, type ChurchTeamMember } from '@/lib/clients/church/team'
import { useAuthStore } from '@/stores/auth'
// From the leaf module, NOT access.ts: access.ts imports the module registry,
// and TeamSettings is reachable from it, so importing there is a cycle.
import { ASSIGNABLE_TABS, assignableTabsFor } from '@/lib/clients/church/tabs'
import { useDashboardContext } from '@/pages/dashboard/context'

const props = defineProps<{ tenant: string }>()

// Only offer pages this church actually has modules for. Focal Point has no
// giving module, so ticking Giving used to save and then silently do nothing.
// enabledModuleKeys comes from DashboardLayout via provide/inject, which keeps
// this file clear of the module registry and therefore clear of the import
// cycle documented in tabs.ts.
const { enabledModuleKeys } = useDashboardContext()
const tabChoices = computed(() => assignableTabsFor(enabledModuleKeys.value))

const members = ref<ChurchTeamMember[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

// The starting password for the member just created. Held until dismissed
// because it is shown exactly once: we never store it, and it cannot be
// recovered afterwards, only reset.
const justInvited = ref<{ email: string; password: string } | null>(null)
const copied = ref(false)
async function copyPassword() {
  if (!justInvited.value) return
  try {
    await navigator.clipboard.writeText(justInvited.value.password)
    copied.value = true
  } catch { /* clipboard blocked; the value is on screen to read */ }
}

/**
 * Which pages a member sees. Scope bundles could not express "over Front Desk
 * but not Care & Drift", which is exactly how churches divide these, so pages
 * are ticked individually.
 *
 * permission_scope still exists and still matters: it is the TRUST level, and it
 * governs settings writes at the RLS level and exports containing congregant
 * names. Page access and trust are different questions, and bundling them is
 * what made the old list rigid.
 *
 * An empty selection clears back to the scope bundle rather than leaving someone
 * with no pages at all.
 */
function tabsOf(m: ChurchTeamMember): string[] {
  return m.allowed_tabs ?? []
}
function hasTab(m: ChurchTeamMember, key: string): boolean {
  const t = tabsOf(m)
  // No explicit list yet: show what the bundle currently grants, so ticking the
  // first box does not silently take pages away.
  return t.length ? t.includes(key) : bundleTabs(m).includes(key)
}
function bundleTabs(m: ChurchTeamMember): string[] {
  return SCOPE_FALLBACK[m.permission_scope ?? 'member'] ?? SCOPE_FALLBACK.member
}
const SCOPE_FALLBACK: Record<string, string[]> = {
  full: ASSIGNABLE_TABS.map((t) => t.key),
  pastoral_care: ['front-desk-guests', 'care-drift'],
  finance: ['insights', 'giving'],
  comms_only: ['sundays-comms'],
  volunteers: ['sundays-comms'],
  member: [],
}

async function toggleTab(m: ChurchTeamMember, key: string) {
  const current = tabsOf(m).length ? tabsOf(m) : bundleTabs(m)
  const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
  const prev = m.allowed_tabs
  m.allowed_tabs = next
  try {
    await setTabs(props.tenant, m.id, next)
  } catch (e) {
    m.allowed_tabs = prev
    error.value = e instanceof Error ? e.message : String(e)
  }
}

// Removal deletes a login, so it asks first. Two clicks, not a dialog: a modal
// here would be more ceremony than the action deserves, but one click would be
// too few for something irreversible.
const auth = useAuthStore()
const confirmRemove = ref<string | null>(null)

function isSelf(m: ChurchTeamMember): boolean {
  return m.id === (auth.profile as { id?: string } | null)?.id
}

async function doRemove(m: ChurchTeamMember) {
  working.value = true; error.value = null
  try {
    const res = await removeMember(props.tenant, m.id)
    confirmRemove.value = null
    flash(res?.warning ? res.warning : `Removed ${m.full_name || m.email}`)
    await refresh()
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { working.value = false }
}

const showInvite = ref(false)
const inviteEmail = ref('')
const inviteName = ref('')
const inviteScope = ref('member')
const inviteCongregation = ref('all')
const working = ref(false)

async function refresh() {
  loading.value = true; error.value = null
  try { members.value = await listTeam(props.tenant) }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { loading.value = false }
}

async function changeScope(m: ChurchTeamMember, scope: string) {
  const prev = m.permission_scope
  m.permission_scope = scope
  // Church admins see everything; keep congregation consistent locally.
  if (scope === 'full') m.congregation_scope = 'all'
  try { await setScope(props.tenant, m.id, scope); flash(`Updated ${m.email}`) }
  catch (e) { m.permission_scope = prev; error.value = e instanceof Error ? e.message : String(e) }
}

async function changeCongregation(m: ChurchTeamMember, congregation: string) {
  const prev = m.congregation_scope
  m.congregation_scope = congregation
  try { await setCongregation(props.tenant, m.id, congregation); flash(`Updated ${m.email}`) }
  catch (e) { m.congregation_scope = prev; error.value = e instanceof Error ? e.message : String(e) }
}

async function submitInvite() {
  working.value = true; error.value = null
  try {
    const email = inviteEmail.value.trim()
    const password = await inviteMember(props.tenant, email, inviteName.value.trim(), inviteScope.value, inviteCongregation.value)
    justInvited.value = { email, password }
    copied.value = false
    inviteEmail.value = ''; inviteName.value = ''; inviteScope.value = 'member'; inviteCongregation.value = 'all'
    showInvite.value = false
    await refresh()
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { working.value = false }
}

async function reset(m: ChurchTeamMember) {
  error.value = null
  try {
    await sendReset(m.email)
    flash(`Set-password email sent to ${m.email}`)
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}

function flash(msg: string) { notice.value = msg; setTimeout(() => { notice.value = null }, 4000) }
function initials(m: ChurchTeamMember) {
  return (m.full_name || m.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('')
}

onMounted(refresh)
</script>

<template>
  <section class="card">
    <div class="mb-3 flex items-center justify-between">
      <span class="eyebrow">Team + Permissions</span>
      <button type="button" class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink hover:border-brand hover:text-brand" @click="showInvite = !showInvite">+ Invite</button>
    </div>

    <p v-if="notice" class="mb-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">{{ notice }}</p>

    <!-- Shown once. The account works with this immediately, so onboarding no
         longer depends on a recovery email arriving before it expires. -->
    <div v-if="justInvited" class="mb-3 rounded-md border border-brand/30 bg-brand/[0.05] px-3 py-3">
      <div class="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Account created</div>
      <p class="mt-1 text-xs text-ink-muted">
        Give <span class="font-semibold text-ink">{{ justInvited.email }}</span> this starting
        password. It does not expire, and they can change it after signing in. You will not be
        able to see it again.
      </p>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <code class="rounded border border-divider bg-surface-raised px-2.5 py-1 text-sm font-semibold tracking-wide text-ink">{{ justInvited.password }}</code>
        <button
          type="button"
          class="rounded-md border border-divider px-2.5 py-1 text-[11px] font-medium text-ink-muted hover:border-brand hover:text-brand"
          @click="copyPassword"
        >{{ copied ? 'Copied' : 'Copy' }}</button>
        <button
          type="button"
          class="text-[11px] font-medium text-ink-muted hover:text-ink"
          @click="justInvited = null"
        >Done</button>
      </div>
      <p class="mt-2 text-[11px] text-ink-disabled">
        A set-password email was also sent as a second way in, but it is not required.
      </p>
    </div>
    <p v-if="error" class="mb-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">{{ error }}</p>

    <div v-if="showInvite" class="mb-3 rounded-md border border-divider p-3 space-y-2">
      <div class="flex flex-wrap gap-2">
        <input v-model="inviteEmail" type="email" placeholder="email@church.org" class="flex-1 min-w-[200px] rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
        <input v-model="inviteName" type="text" placeholder="Full name" class="flex-1 min-w-[160px] rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
        <select v-model="inviteScope" class="rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-sm">
          <option v-for="s in PERMISSION_SCOPES" :key="s.key" :value="s.key">{{ s.label }}</option>
        </select>
        <select v-if="inviteScope !== 'full'" v-model="inviteCongregation" class="rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-sm" title="Which congregation this person can access">
          <option v-for="c in CONGREGATIONS" :key="c.key" :value="c.key">{{ c.label }}</option>
        </select>
        <button type="button" class="rounded-md bg-brand text-white px-4 py-1.5 text-sm font-semibold disabled:opacity-50 hover:opacity-90" :disabled="working || !inviteEmail" @click="submitInvite">{{ working ? 'Sending...' : 'Send invite' }}</button>
      </div>
      <p class="text-[11px] text-ink-disabled">Creates their login and emails them a link to set their password. New members join scoped to this church. Full access sees every congregation; narrower roles can be scoped to one.</p>
    </div>

    <div v-if="loading" class="rounded-md border border-divider p-4 text-xs text-ink-muted">Loading team...</div>
    <div v-else-if="!members.length && !error" class="rounded-md border border-divider p-4 text-sm text-ink-muted">No team members yet. Use Invite to add your first staff login.</div>
    <div v-else class="space-y-2">
      <article v-for="m in members" :key="m.id" class="flex flex-wrap items-center gap-3 rounded-md border border-divider p-3">
        <div class="flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 text-brand text-sm font-bold">{{ initials(m) }}</div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-semibold text-ink">{{ m.full_name || m.email }}</div>
          <div class="text-[11px] text-ink-muted">{{ m.email }}</div>
        </div>
        <!-- Pages, ticked individually. Today is always on and is not listed:
             it only ever shows the actions routed to that person. -->
        <div class="flex flex-wrap items-center gap-1.5">
          <label
            v-for="t in tabChoices"
            :key="t.key"
            class="inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors"
            :class="hasTab(m, t.key)
              ? 'border-brand/40 bg-brand/10 text-brand'
              : 'border-divider bg-surface text-ink-disabled hover:border-ink-muted'"
          >
            <input type="checkbox" class="sr-only" :checked="hasTab(m, t.key)" @change="toggleTab(m, t.key)" />
            {{ t.label }}
          </label>
        </div>
        <select :value="m.permission_scope ?? 'member'" @change="changeScope(m, ($event.target as HTMLSelectElement).value)"
          class="rounded-md border border-divider bg-surface-raised px-2 py-1 text-xs text-ink" title="Trust level: governs Settings and exports containing names">
          <option v-for="s in PERMISSION_SCOPES" :key="s.key" :value="s.key">{{ s.label }}</option>
        </select>
        <select v-if="(m.permission_scope ?? 'member') !== 'full'" :value="m.congregation_scope ?? 'all'" @change="changeCongregation(m, ($event.target as HTMLSelectElement).value)"
          class="rounded-md border border-divider bg-surface-raised px-2 py-1 text-xs text-ink" title="Congregation access">
          <option v-for="c in CONGREGATIONS" :key="c.key" :value="c.key">{{ c.label }}</option>
        </select>
        <button type="button" class="text-xs text-ink-muted hover:text-brand hover:underline" @click="reset(m)">Send reset</button>
        <!-- Hidden for your own row: removing yourself would lock the church out
             of the only screen that can create accounts. -->
        <template v-if="!isSelf(m)">
          <button
            v-if="confirmRemove !== m.id"
            type="button"
            class="text-xs text-ink-disabled hover:text-danger hover:underline"
            @click="confirmRemove = m.id"
          >Remove</button>
          <span v-else class="inline-flex items-center gap-2">
            <button
              type="button"
              class="rounded-md bg-danger px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
              :disabled="working"
              @click="doRemove(m)"
            >Remove access</button>
            <button type="button" class="text-[11px] text-ink-muted hover:text-ink" @click="confirmRemove = null">Cancel</button>
          </span>
        </template>
      </article>
    </div>
  </section>
</template>
