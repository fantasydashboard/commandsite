<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Contact, ContactEvent, ContactNote, Stage } from '@/types/database'

const props = defineProps<{
  contact: Contact
  clientId: string
  stages: Stage[]
}>()

const emit = defineEmits<{
  update: [contact: Contact]
  deleted: [id: string]
  close: []
}>()

const auth = useAuthStore()

// Editable form state starts as a shallow copy of the contact.
const form = ref({ ...props.contact })
const original = ref({ ...props.contact })

const saving = ref(false)
const deleting = ref(false)
const error = ref<string | null>(null)

const notes = ref<ContactNote[]>([])
const events = ref<ContactEvent[]>([])
const loadingHistory = ref(true)

const newNote = ref('')
const addingNote = ref(false)

const dirty = computed(() => {
  const keys: (keyof Contact)[] = [
    'first_name',
    'last_name',
    'email',
    'phone',
    'company',
    'title',
    'stage_id',
    'source',
  ]
  return keys.some((k) => form.value[k] !== original.value[k])
})

const stagesById = computed(() => {
  const m = new Map<string, Stage>()
  props.stages.forEach((s) => m.set(s.id, s))
  return m
})

// ---------------------------------------------------------------------------
// Load history (notes + events)
// ---------------------------------------------------------------------------
async function loadHistory() {
  loadingHistory.value = true
  const [{ data: n }, { data: e }] = await Promise.all([
    supabase
      .from('contact_notes')
      .select('*')
      .eq('contact_id', props.contact.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('contact_events')
      .select('*')
      .eq('contact_id', props.contact.id)
      .order('occurred_at', { ascending: false }),
  ])
  notes.value = (n ?? []) as ContactNote[]
  events.value = (e ?? []) as ContactEvent[]
  loadingHistory.value = false
}

// ---------------------------------------------------------------------------
// Event logging helper
// ---------------------------------------------------------------------------
async function logEvent(type: string, payload: Record<string, unknown> = {}) {
  const { data, error: err } = await supabase
    .from('contact_events')
    .insert({
      client_id: props.clientId,
      contact_id: props.contact.id,
      event_type: type,
      actor_type: auth.isAdmin ? 'admin' : 'client_user',
      actor_id: auth.profile?.id ?? null,
      payload,
    })
    .select()
    .single()
  if (err) {
    console.warn('logEvent failed:', err.message)
    return
  }
  if (data) events.value.unshift(data as ContactEvent)
}

// ---------------------------------------------------------------------------
// Save contact
// ---------------------------------------------------------------------------
async function onSave() {
  saving.value = true
  error.value = null

  const stageChanged = form.value.stage_id !== original.value.stage_id
  const otherKeys = [
    'first_name',
    'last_name',
    'email',
    'phone',
    'company',
    'title',
    'source',
  ] as const
  const otherChanges: Record<string, { from: unknown; to: unknown }> = {}
  for (const k of otherKeys) {
    if (form.value[k] !== original.value[k]) {
      otherChanges[k] = { from: original.value[k], to: form.value[k] }
    }
  }

  const patch = {
    first_name: form.value.first_name,
    last_name: form.value.last_name,
    email: form.value.email,
    phone: form.value.phone,
    company: form.value.company,
    title: form.value.title,
    source: form.value.source,
    stage_id: form.value.stage_id,
  }

  const { data, error: err } = await supabase
    .from('contacts')
    .update(patch)
    .eq('id', props.contact.id)
    .select()
    .single()

  saving.value = false
  if (err || !data) {
    error.value = err?.message ?? 'Failed to save'
    return
  }

  const updated = data as Contact
  original.value = { ...updated }
  form.value = { ...updated }
  emit('update', updated)

  if (stageChanged) {
    await logEvent('stage_changed', {
      from: original.value.stage_id ?? null,
      to: updated.stage_id ?? null,
      from_name: stagesById.value.get(original.value.stage_id ?? '')?.name ?? null,
      to_name: stagesById.value.get(updated.stage_id ?? '')?.name ?? null,
    })
  }
  if (Object.keys(otherChanges).length > 0) {
    await logEvent('field_updated', { changes: otherChanges })
  }
}

// ---------------------------------------------------------------------------
// Add note
// ---------------------------------------------------------------------------
async function onAddNote() {
  const body = newNote.value.trim()
  if (!body) return
  addingNote.value = true
  error.value = null

  const { data, error: err } = await supabase
    .from('contact_notes')
    .insert({
      client_id: props.clientId,
      contact_id: props.contact.id,
      author_id: auth.profile?.id ?? null,
      body,
    })
    .select()
    .single()

  addingNote.value = false
  if (err || !data) {
    error.value = err?.message ?? 'Failed to save note'
    return
  }

  notes.value.unshift(data as ContactNote)
  newNote.value = ''
  await logEvent('note_added', {
    note_id: (data as ContactNote).id,
    preview: body.slice(0, 100),
  })
}

async function onDeleteNote(id: string) {
  const { error: err } = await supabase.from('contact_notes').delete().eq('id', id)
  if (err) {
    error.value = err.message
    return
  }
  notes.value = notes.value.filter((n) => n.id !== id)
}

// ---------------------------------------------------------------------------
// Delete contact
// ---------------------------------------------------------------------------
async function onDelete() {
  if (!confirm('Delete this contact? This cannot be undone.')) return
  deleting.value = true
  error.value = null
  const { error: err } = await supabase
    .from('contacts')
    .delete()
    .eq('id', props.contact.id)
  deleting.value = false
  if (err) {
    error.value = err.message
    return
  }
  emit('deleted', props.contact.id)
  emit('close')
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------
const fullName = computed(() => {
  const n = [form.value.first_name, form.value.last_name].filter(Boolean).join(' ')
  return n || form.value.email || form.value.phone || '(unnamed)'
})

function relativeTime(iso: string): string {
  const diffSec = (Date.now() - new Date(iso).getTime()) / 1000
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function eventDotClass(type: string): string {
  const map: Record<string, string> = {
    contact_created: 'bg-success',
    stage_changed: 'bg-brand',
    field_updated: 'bg-warning',
    note_added: 'bg-brand-cyan',
    email_sent: 'bg-brand',
    sms_sent: 'bg-brand',
  }
  return map[type] ?? 'bg-ink-muted'
}

function eventLabel(e: ContactEvent): string {
  const p = e.payload ?? {}
  switch (e.event_type) {
    case 'contact_created':
      return 'Contact added'
    case 'stage_changed': {
      const from = (p.from_name as string | null) ?? '(none)'
      const to = (p.to_name as string | null) ?? '(none)'
      return `Moved ${from} → ${to}`
    }
    case 'field_updated': {
      const changes = (p.changes as Record<string, unknown>) ?? {}
      const keys = Object.keys(changes)
      if (keys.length === 0) return 'Updated'
      if (keys.length === 1) return `Updated ${keys[0].replace(/_/g, ' ')}`
      return `Updated ${keys.length} fields`
    }
    case 'note_added': {
      const preview = (p.preview as string | undefined) ?? ''
      return preview ? `Note: ${preview}` : 'Added a note'
    }
    default:
      return e.event_type.replace(/_/g, ' ')
  }
}

// ---------------------------------------------------------------------------
// Close on Escape
// ---------------------------------------------------------------------------
function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close')
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  loadHistory()
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// If the parent swaps the contact prop, reset the form and reload history.
watch(
  () => props.contact.id,
  () => {
    form.value = { ...props.contact }
    original.value = { ...props.contact }
    loadHistory()
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer-backdrop">
      <div
        class="fixed inset-0 bg-ink/40 z-40"
        aria-hidden="true"
        @click="emit('close')"
      />
    </Transition>
    <Transition name="drawer-panel">
      <aside
        class="fixed right-0 top-0 h-screen w-full sm:max-w-xl bg-surface shadow-raised z-50 flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        <!-- Header -->
        <div class="flex items-start justify-between gap-4 px-6 py-5 border-b border-divider bg-surface-raised">
          <div class="min-w-0">
            <h2 class="text-xl font-semibold text-ink truncate">{{ fullName }}</h2>
            <p v-if="form.email" class="text-sm text-ink-muted truncate">
              {{ form.email }}
            </p>
          </div>
          <button
            class="btn-ghost !px-3 !py-1.5 shrink-0"
            aria-label="Close"
            @click="emit('close')"
          >
            <span class="text-lg leading-none">×</span>
          </button>
        </div>

        <!-- Scrollable body -->
        <div class="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          <p v-if="error" class="text-sm text-danger">{{ error }}</p>

          <!-- Details -->
          <section>
            <h3 class="eyebrow mb-3">Details</h3>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-ink-muted mb-1">First name</label>
                <input v-model="form.first_name" class="input" />
              </div>
              <div>
                <label class="block text-xs font-medium text-ink-muted mb-1">Last name</label>
                <input v-model="form.last_name" class="input" />
              </div>
              <div class="col-span-2">
                <label class="block text-xs font-medium text-ink-muted mb-1">Email</label>
                <input v-model="form.email" type="email" class="input" />
              </div>
              <div>
                <label class="block text-xs font-medium text-ink-muted mb-1">Phone</label>
                <input v-model="form.phone" class="input" />
              </div>
              <div>
                <label class="block text-xs font-medium text-ink-muted mb-1">Stage</label>
                <select v-model="form.stage_id" class="input">
                  <option :value="null">(none)</option>
                  <option v-for="s in stages" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-ink-muted mb-1">Company</label>
                <input v-model="form.company" class="input" />
              </div>
              <div>
                <label class="block text-xs font-medium text-ink-muted mb-1">Title</label>
                <input v-model="form.title" class="input" />
              </div>
              <div class="col-span-2">
                <label class="block text-xs font-medium text-ink-muted mb-1">Source</label>
                <input v-model="form.source" class="input" placeholder="manual, website, referral…" />
              </div>
            </div>
            <div v-if="dirty" class="mt-4 flex gap-2">
              <button class="btn-primary" :disabled="saving" @click="onSave">
                {{ saving ? 'Saving…' : 'Save changes' }}
              </button>
              <button
                class="btn-ghost"
                :disabled="saving"
                @click="form = { ...original }"
              >
                Discard
              </button>
            </div>
          </section>

          <!-- Notes -->
          <section>
            <h3 class="eyebrow mb-3">Notes</h3>
            <div class="space-y-2">
              <textarea
                v-model="newNote"
                rows="3"
                class="input"
                placeholder="Add a note…"
              />
              <div class="flex justify-end">
                <button
                  class="btn-primary"
                  :disabled="!newNote.trim() || addingNote"
                  @click="onAddNote"
                >
                  {{ addingNote ? 'Saving…' : 'Add note' }}
                </button>
              </div>
            </div>

            <div v-if="loadingHistory" class="text-sm text-ink-muted mt-4">Loading…</div>

            <div v-else-if="notes.length === 0" class="text-sm text-ink-muted mt-4">
              No notes yet.
            </div>

            <div v-else class="mt-4 space-y-3">
              <div
                v-for="n in notes"
                :key="n.id"
                class="rounded-lg bg-surface-raised p-3 group relative"
              >
                <p class="text-sm text-ink whitespace-pre-wrap">{{ n.body }}</p>
                <div class="flex items-center justify-between mt-2">
                  <span class="text-xs text-ink-muted">{{ relativeTime(n.created_at) }}</span>
                  <button
                    class="text-xs text-ink-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                    @click="onDeleteNote(n.id)"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- Timeline -->
          <section>
            <h3 class="eyebrow mb-3">Timeline</h3>
            <div v-if="loadingHistory" class="text-sm text-ink-muted">Loading…</div>
            <div v-else-if="events.length === 0" class="text-sm text-ink-muted">
              No activity yet.
            </div>
            <ol v-else class="space-y-3">
              <li v-for="e in events" :key="e.id" class="flex gap-3 items-start">
                <span
                  class="inline-block w-2 h-2 rounded-full mt-1.5 shrink-0"
                  :class="eventDotClass(e.event_type)"
                />
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-ink truncate">{{ eventLabel(e) }}</p>
                  <p class="text-xs text-ink-muted">{{ relativeTime(e.occurred_at) }}</p>
                </div>
              </li>
            </ol>
          </section>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-divider bg-surface-raised">
          <button
            class="btn-danger"
            :disabled="deleting"
            @click="onDelete"
          >
            {{ deleting ? 'Deleting…' : 'Delete contact' }}
          </button>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-backdrop-enter-from,
.drawer-backdrop-leave-to {
  opacity: 0;
}
.drawer-backdrop-enter-active,
.drawer-backdrop-leave-active {
  transition: opacity 0.2s ease;
}

.drawer-panel-enter-from,
.drawer-panel-leave-to {
  transform: translateX(100%);
}
.drawer-panel-enter-active,
.drawer-panel-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
