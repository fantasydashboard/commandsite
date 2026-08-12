<script setup lang="ts">
/**
 * Real team management for a live church (Focal Point). Reads the church's actual
 * CommandSite users via the church-user-admin edge function and lets an admin
 * adjust scope, invite, and send a password reset. Gated to real churches by the
 * parent module; the Cornerstone demo keeps its inline sample rendering.
 */
import { onMounted, ref } from 'vue'
import { listTeam, inviteMember, setScope, setCongregation, sendReset, PERMISSION_SCOPES, CONGREGATIONS, type ChurchTeamMember } from '@/lib/clients/church/team'

const props = defineProps<{ tenant: string }>()

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
        <select :value="m.permission_scope ?? 'member'" @change="changeScope(m, ($event.target as HTMLSelectElement).value)"
          class="rounded-md border border-divider bg-surface-raised px-2 py-1 text-xs text-ink">
          <option v-for="s in PERMISSION_SCOPES" :key="s.key" :value="s.key">{{ s.label }}</option>
        </select>
        <select v-if="(m.permission_scope ?? 'member') !== 'full'" :value="m.congregation_scope ?? 'all'" @change="changeCongregation(m, ($event.target as HTMLSelectElement).value)"
          class="rounded-md border border-divider bg-surface-raised px-2 py-1 text-xs text-ink" title="Congregation access">
          <option v-for="c in CONGREGATIONS" :key="c.key" :value="c.key">{{ c.label }}</option>
        </select>
        <button type="button" class="text-xs text-ink-muted hover:text-brand hover:underline" @click="reset(m)">Send reset</button>
      </article>
    </div>
  </section>
</template>
