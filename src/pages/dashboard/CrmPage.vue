<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Contact, Pipeline, Stage } from '@/types/database'
import { useDashboardContext } from './context'
import ContactDetailDrawer from './ContactDetailDrawer.vue'

const { client, enabledModuleKeys } = useDashboardContext()
const auth = useAuthStore()

const pipeline = ref<Pipeline | null>(null)
const stages = ref<Stage[]>([])
const contacts = ref<Contact[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const showCreate = ref(false)
const submitting = ref(false)
const stageFilter = ref<string>('all')
const selectedContactId = ref<string | null>(null)

const selectedContact = computed(() =>
  selectedContactId.value
    ? contacts.value.find((c) => c.id === selectedContactId.value) ?? null
    : null,
)

function onContactUpdated(updated: Contact) {
  const idx = contacts.value.findIndex((c) => c.id === updated.id)
  if (idx !== -1) contacts.value[idx] = updated
}

function onContactDeleted(id: string) {
  contacts.value = contacts.value.filter((c) => c.id !== id)
  selectedContactId.value = null
}

const form = ref({
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  company: '',
  stage_id: '' as string,
})

const stagesById = computed(() => {
  const m = new Map<string, Stage>()
  stages.value.forEach((s) => m.set(s.id, s))
  return m
})

const visibleContacts = computed(() => {
  if (stageFilter.value === 'all') return contacts.value
  if (stageFilter.value === 'none') return contacts.value.filter((c) => !c.stage_id)
  return contacts.value.filter((c) => c.stage_id === stageFilter.value)
})

const stageCounts = computed(() => {
  const counts = new Map<string, number>()
  let unstaged = 0
  contacts.value.forEach((c) => {
    if (!c.stage_id) unstaged++
    else counts.set(c.stage_id, (counts.get(c.stage_id) ?? 0) + 1)
  })
  return { counts, unstaged }
})

const DEFAULT_STAGES = [
  { name: 'New',       position: 0, color: '#93A4C1' },
  { name: 'Contacted', position: 1, color: '#2E9FE0' },
  { name: 'Qualified', position: 2, color: '#4CCCE8' },
  { name: 'Won',       position: 3, color: '#2ED3B7', is_won: true },
  { name: 'Lost',      position: 4, color: '#E85D75', is_lost: true },
]

// Ensures both a pipeline AND its default stages exist — self-healing if
// either was created without the other (e.g. stage insert failed silently
// on a previous visit, or the pipeline was added manually via SQL).
async function ensurePipelineAndStages(clientId: string): Promise<Pipeline | null> {
  let pipeline: Pipeline | null = null

  const { data: existing, error: e1 } = await supabase
    .from('pipelines')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (e1) {
    error.value = e1.message
    return null
  }
  pipeline = existing as Pipeline | null

  if (!pipeline) {
    const { data: created, error: e2 } = await supabase
      .from('pipelines')
      .insert({ client_id: clientId, name: 'Sales', is_default: true })
      .select()
      .single()
    if (e2 || !created) {
      error.value = e2?.message ?? 'Failed to create pipeline'
      return null
    }
    pipeline = created as Pipeline
  }

  // Separately verify stages exist; seed if missing.
  const { count, error: eCount } = await supabase
    .from('stages')
    .select('id', { count: 'exact', head: true })
    .eq('pipeline_id', pipeline.id)
  if (eCount) {
    error.value = eCount.message
    return pipeline
  }

  if (!count || count === 0) {
    const { error: eSeed } = await supabase
      .from('stages')
      .insert(DEFAULT_STAGES.map((s) => ({ ...s, pipeline_id: pipeline!.id })))
    if (eSeed) error.value = eSeed.message
  }

  return pipeline
}

async function load() {
  if (!client.value) return
  loading.value = true
  error.value = null

  const p = await ensurePipelineAndStages(client.value.id)
  pipeline.value = p
  if (!p) {
    loading.value = false
    return
  }

  const [{ data: s, error: eS }, { data: c, error: eC }] = await Promise.all([
    supabase.from('stages').select('*').eq('pipeline_id', p.id).order('position'),
    supabase.from('contacts').select('*').eq('client_id', client.value.id)
      .order('created_at', { ascending: false }),
  ])
  if (eS) error.value = eS.message
  if (eC) error.value = eC.message
  stages.value = (s ?? []) as Stage[]
  contacts.value = (c ?? []) as Contact[]

  if (!form.value.stage_id && stages.value.length > 0) {
    form.value.stage_id = stages.value[0].id
  }
  loading.value = false
}

async function onCreate() {
  if (!client.value || !pipeline.value) return
  submitting.value = true
  error.value = null

  const payload = {
    client_id: client.value.id,
    pipeline_id: pipeline.value.id,
    stage_id: form.value.stage_id || null,
    first_name: form.value.first_name || null,
    last_name: form.value.last_name || null,
    email: form.value.email || null,
    phone: form.value.phone || null,
    company: form.value.company || null,
    source: 'manual',
  }

  const { data, error: err } = await supabase
    .from('contacts')
    .insert(payload)
    .select()
    .single()

  submitting.value = false
  if (err || !data) {
    error.value = err?.message ?? 'Failed to create contact'
    return
  }

  const contact = data as Contact
  contacts.value.unshift(contact)

  supabase.from('contact_events').insert({
    client_id: client.value.id,
    contact_id: contact.id,
    event_type: 'contact_created',
    actor_type: auth.isAdmin ? 'admin' : 'client_user',
    actor_id: auth.profile?.id ?? null,
    payload: { source: 'manual' },
  }).then(({ error: logErr }) => {
    if (logErr) console.warn('contact_events log failed:', logErr.message)
  })

  showCreate.value = false
  form.value = {
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    company: '',
    stage_id: stages.value[0]?.id ?? '',
  }
}

function fullName(c: Contact) {
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
  return name || c.email || c.phone || '(unnamed)'
}

function stageLabel(c: Contact) {
  if (!c.stage_id) return '—'
  return stagesById.value.get(c.stage_id)?.name ?? '—'
}

function stageColor(c: Contact) {
  if (!c.stage_id) return '#365FAD'
  return stagesById.value.get(c.stage_id)?.color ?? '#365FAD'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

onMounted(load)
watch(() => client.value?.id, load)
</script>

<template>
  <div v-if="!enabledModuleKeys.has('crm')" class="card text-center text-ink-muted">
    The CRM module isn't enabled for this workspace.
  </div>

  <div v-else>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-semibold text-ink">CRM</h1>
        <p class="text-sm text-ink-muted">
          {{ contacts.length }} contact<span v-if="contacts.length !== 1">s</span>
        </p>
      </div>
      <button class="btn-primary" @click="showCreate = !showCreate">
        {{ showCreate ? 'Cancel' : 'New contact' }}
      </button>
    </div>

    <p v-if="error" class="text-sm text-danger mb-4">{{ error }}</p>

    <div v-if="loading" class="text-sm text-ink-muted">Loading…</div>

    <template v-else>
      <div class="flex flex-wrap gap-2 mb-4">
        <button
          class="chip transition-colors"
          :class="stageFilter === 'all' ? 'chip-active' : 'hover:border-divider-bright'"
          @click="stageFilter = 'all'"
        >
          All <span class="text-ink-disabled">{{ contacts.length }}</span>
        </button>
        <button
          v-for="s in stages"
          :key="s.id"
          class="chip transition-colors"
          :class="stageFilter === s.id ? 'chip-active' : 'hover:border-divider-bright'"
          @click="stageFilter = s.id"
        >
          <span
            class="inline-block w-2 h-2 rounded-full"
            :style="{ background: s.color ?? '#365FAD' }"
          />
          {{ s.name }}
          <span class="text-ink-disabled">{{ stageCounts.counts.get(s.id) ?? 0 }}</span>
        </button>
        <button
          v-if="stageCounts.unstaged > 0"
          class="chip transition-colors"
          :class="stageFilter === 'none' ? 'chip-active' : 'hover:border-divider-bright'"
          @click="stageFilter = 'none'"
        >
          No stage <span class="text-ink-disabled">{{ stageCounts.unstaged }}</span>
        </button>
      </div>

      <div v-if="showCreate" class="card mb-6">
        <h2 class="text-lg font-semibold mb-4 text-ink">New contact</h2>
        <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="onCreate">
          <div>
            <label class="block text-sm font-medium text-ink mb-1">First name</label>
            <input v-model="form.first_name" class="input" />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink mb-1">Last name</label>
            <input v-model="form.last_name" class="input" />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink mb-1">Email</label>
            <input v-model="form.email" type="email" class="input" />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink mb-1">Phone</label>
            <input v-model="form.phone" class="input" placeholder="+14075551234" />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink mb-1">Company</label>
            <input v-model="form.company" class="input" />
          </div>
          <div>
            <label class="block text-sm font-medium text-ink mb-1">Stage</label>
            <select v-model="form.stage_id" class="input">
              <option value="">(none)</option>
              <option v-for="s in stages" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>
          <div class="sm:col-span-2 flex justify-end">
            <button type="submit" class="btn-primary" :disabled="submitting">
              {{ submitting ? 'Saving…' : 'Save contact' }}
            </button>
          </div>
        </form>
      </div>

      <div v-if="visibleContacts.length === 0" class="card text-center text-ink-muted">
        <template v-if="contacts.length === 0">
          No contacts yet. Click <span class="font-medium text-ink">New contact</span> to add your first one.
        </template>
        <template v-else>No contacts match this filter.</template>
      </div>

      <div v-else class="card p-0 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-surface-elevated text-left text-ink-muted">
            <tr>
              <th class="px-6 py-3 font-medium">Name</th>
              <th class="px-6 py-3 font-medium">Email</th>
              <th class="px-6 py-3 font-medium">Phone</th>
              <th class="px-6 py-3 font-medium">Company</th>
              <th class="px-6 py-3 font-medium">Stage</th>
              <th class="px-6 py-3 font-medium">Added</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-divider">
            <tr
              v-for="c in visibleContacts"
              :key="c.id"
              class="hover:bg-surface-elevated/50 cursor-pointer transition-colors"
              @click="selectedContactId = c.id"
            >
              <td class="px-6 py-3 font-medium text-ink">{{ fullName(c) }}</td>
              <td class="px-6 py-3 text-ink-muted">{{ c.email ?? '—' }}</td>
              <td class="px-6 py-3 text-ink-muted">{{ c.phone ?? '—' }}</td>
              <td class="px-6 py-3 text-ink-muted">{{ c.company ?? '—' }}</td>
              <td class="px-6 py-3">
                <span class="inline-flex items-center gap-2 rounded-full bg-surface-elevated px-2.5 py-1 text-xs font-medium text-ink">
                  <span class="inline-block w-2 h-2 rounded-full" :style="{ background: stageColor(c) }" />
                  {{ stageLabel(c) }}
                </span>
              </td>
              <td class="px-6 py-3 text-ink-muted">{{ formatDate(c.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <ContactDetailDrawer
      v-if="selectedContact && client"
      :contact="selectedContact"
      :client-id="client.id"
      :stages="stages"
      @update="onContactUpdated"
      @deleted="onContactDeleted"
      @close="selectedContactId = null"
    />
  </div>
</template>
