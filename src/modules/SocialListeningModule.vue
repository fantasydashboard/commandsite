<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Client } from '@/types/database'

const props = defineProps<{ client: Client; config: Record<string, unknown> }>()
const auth = useAuthStore()

type Platform = 'reddit' | 'x' | 'other'
type Kind = 'mention' | 'question' | 'competitor' | 'opportunity'
type Status = 'new' | 'drafted' | 'responded' | 'ignored'

interface Mention {
  id: string
  client_id: string
  platform: Platform
  source_url: string
  author: string | null
  snippet: string
  kind: Kind
  status: Status
  notes: string | null
  draft_reply: string | null
  responded_at: string | null
  response_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ── Composer ────────────────────────────────────────────────────────────
const editingId = ref<string | null>(null)
const platform = ref<Platform>('reddit')
const sourceUrl = ref('')
const author = ref('')
const snippet = ref('')
const kind = ref<Kind>('question')
const notes = ref('')
const draftReply = ref('')
const composerSaving = ref(false)
const composerError = ref<string | null>(null)
const composerNote = ref<string | null>(null)

function resetComposer() {
  editingId.value = null
  platform.value = 'reddit'
  sourceUrl.value = ''
  author.value = ''
  snippet.value = ''
  kind.value = 'question'
  notes.value = ''
  draftReply.value = ''
  composerError.value = null
  composerNote.value = null
}

function loadIntoComposer(m: Mention) {
  editingId.value = m.id
  platform.value = m.platform
  sourceUrl.value = m.source_url
  author.value = m.author ?? ''
  snippet.value = m.snippet
  kind.value = m.kind
  notes.value = m.notes ?? ''
  draftReply.value = m.draft_reply ?? ''
  composerError.value = null
  composerNote.value = null
}

async function saveComposer() {
  composerError.value = null
  if (!sourceUrl.value.trim()) {
    composerError.value = 'Source URL is required.'
    return
  }
  if (!snippet.value.trim()) {
    composerError.value = 'Snippet is required (paste the text of the post).'
    return
  }

  composerSaving.value = true
  try {
    const payload = {
      client_id: props.client.id,
      platform: platform.value,
      source_url: sourceUrl.value.trim(),
      author: author.value.trim() || null,
      snippet: snippet.value,
      kind: kind.value,
      notes: notes.value || null,
      draft_reply: draftReply.value || null,
    }

    if (editingId.value) {
      const { error } = await supabase
        .from('social_mentions')
        .update(payload)
        .eq('id', editingId.value)
      if (error) throw error
      composerNote.value = 'Updated.'
    } else {
      const { error } = await supabase
        .from('social_mentions')
        .insert({ ...payload, created_by: auth.profile?.id ?? null })
      if (error) throw error
      composerNote.value = 'Mention saved.'
      resetComposer()
    }
    await loadMentions()
  } catch (e: any) {
    composerError.value = e?.message ?? 'Save failed.'
  } finally {
    composerSaving.value = false
  }
}

async function setStatus(m: Mention, status: Status) {
  const updates: Partial<Mention> = { status }
  if (status === 'responded' && !m.responded_at) {
    const url = window.prompt('Optional: paste the URL of your response:', '') ?? ''
    updates.responded_at = new Date().toISOString()
    if (url.trim()) updates.response_url = url.trim()
  }
  const { error } = await supabase
    .from('social_mentions')
    .update(updates)
    .eq('id', m.id)
  if (error) {
    composerError.value = error.message
    return
  }
  await loadMentions()
}

async function deleteMention(m: Mention) {
  if (!confirm('Delete this mention?')) return
  const { error } = await supabase.from('social_mentions').delete().eq('id', m.id)
  if (error) {
    composerError.value = error.message
    return
  }
  if (editingId.value === m.id) resetComposer()
  await loadMentions()
}

// ── Inbox ───────────────────────────────────────────────────────────────
const mentions = ref<Mention[]>([])
const loading = ref(false)
const statusFilter = ref<Status | 'all'>('new')
const platformFilter = ref<Platform | 'all'>('all')
const kindFilter = ref<Kind | 'all'>('all')

async function loadMentions() {
  loading.value = true
  const { data, error } = await supabase
    .from('social_mentions')
    .select('*')
    .eq('client_id', props.client.id)
    .order('created_at', { ascending: false })
    .limit(200)
  loading.value = false
  if (error) {
    composerError.value = error.message
    return
  }
  mentions.value = (data ?? []) as Mention[]
}

const filtered = computed(() =>
  mentions.value.filter((m) => {
    if (statusFilter.value !== 'all' && m.status !== statusFilter.value) return false
    if (platformFilter.value !== 'all' && m.platform !== platformFilter.value) return false
    if (kindFilter.value !== 'all' && m.kind !== kindFilter.value) return false
    return true
  }),
)

const counts = computed(() => {
  const c: Record<Status | 'all', number> = {
    all: mentions.value.length,
    new: 0,
    drafted: 0,
    responded: 0,
    ignored: 0,
  }
  for (const m of mentions.value) c[m.status]++
  return c
})

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function statusChip(s: Status): string {
  if (s === 'new') return 'bg-warn/10 text-warn'
  if (s === 'drafted') return 'bg-primary/10 text-primary'
  if (s === 'responded') return 'bg-success/10 text-success'
  return 'bg-ink-muted/15 text-ink-muted'
}

function platformChip(p: Platform): string {
  if (p === 'reddit') return 'bg-[#FF4500]/10 text-[#FF4500]'
  if (p === 'x') return 'bg-ink/10 text-ink'
  return 'bg-ink-muted/15 text-ink-muted'
}

function kindLabel(k: Kind): string {
  if (k === 'question') return '❓ Question'
  if (k === 'mention') return '💬 Mention'
  if (k === 'competitor') return '⚔️ Competitor'
  return '✨ Opportunity'
}

watch(() => props.client.id, loadMentions)
onMounted(loadMentions)
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card">
      <h2 class="text-lg font-semibold text-ink">Social Listening</h2>
      <p class="text-sm text-ink-muted">
        Track Reddit + X posts that mention UFD or ask questions UFD answers.
        Phase 1: paste interesting threads here, draft replies, track follow-through.
        Phase 2 will auto-monitor and surface matches.
      </p>
    </div>

    <!-- Composer -->
    <section class="card space-y-3">
      <div class="flex items-baseline justify-between">
        <div>
          <span class="eyebrow">{{ editingId ? 'Edit mention' : 'Log a mention' }}</span>
          <h3 class="mt-1 text-sm font-semibold text-ink">
            {{ editingId ? 'Editing' : 'Found something interesting?' }}
          </h3>
        </div>
        <button
          v-if="editingId"
          type="button"
          class="btn-ghost text-xs"
          @click="resetComposer"
        >
          Cancel edit
        </button>
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <div>
          <label class="text-xs text-ink-muted block mb-1">Platform</label>
          <select
            v-model="platform"
            class="w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-ink"
          >
            <option value="reddit">Reddit</option>
            <option value="x">X</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label class="text-xs text-ink-muted block mb-1">Kind</label>
          <select
            v-model="kind"
            class="w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-ink"
          >
            <option value="question">Question (UFD answers it)</option>
            <option value="mention">Mention (named UFD)</option>
            <option value="competitor">Competitor talk</option>
            <option value="opportunity">Tangential opportunity</option>
          </select>
        </div>
        <div>
          <label class="text-xs text-ink-muted block mb-1">Author handle (optional)</label>
          <input
            v-model="author"
            type="text"
            placeholder="u/somebody or @handle"
            class="w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-ink"
          />
        </div>
      </div>

      <div>
        <label class="text-xs text-ink-muted block mb-1">Source URL</label>
        <input
          v-model="sourceUrl"
          type="text"
          placeholder="https://reddit.com/r/fantasyfootball/comments/..."
          class="w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-ink"
        />
      </div>

      <div>
        <label class="text-xs text-ink-muted block mb-1">Snippet (paste post/comment text)</label>
        <textarea
          v-model="snippet"
          rows="3"
          placeholder="What did they say?"
          class="w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-ink font-mono"
        ></textarea>
      </div>

      <div>
        <label class="text-xs text-ink-muted block mb-1">Draft reply (optional)</label>
        <textarea
          v-model="draftReply"
          rows="3"
          placeholder="Your planned response — paste manually when you reply."
          class="w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-ink font-mono"
        ></textarea>
      </div>

      <div>
        <label class="text-xs text-ink-muted block mb-1">Internal notes (optional)</label>
        <input
          v-model="notes"
          type="text"
          placeholder="Why this matters, who to loop in, etc."
          class="w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-ink"
        />
      </div>

      <p v-if="composerError" class="text-xs text-danger">{{ composerError }}</p>
      <p v-if="composerNote" class="text-xs text-success">{{ composerNote }}</p>

      <div class="flex items-center justify-end gap-2 border-t border-divider pt-3">
        <button
          type="button"
          class="btn-primary text-xs"
          :disabled="composerSaving"
          @click="saveComposer"
        >
          {{ composerSaving ? 'Saving…' : (editingId ? 'Update' : 'Save mention') }}
        </button>
      </div>
    </section>

    <!-- Inbox -->
    <section class="card space-y-3">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span class="eyebrow">Inbox</span>
          <h3 class="mt-1 text-sm font-semibold text-ink">Mentions</h3>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select
            v-model="platformFilter"
            class="rounded-md border border-divider bg-surface px-2 py-1 text-xs text-ink"
          >
            <option value="all">All platforms</option>
            <option value="reddit">Reddit</option>
            <option value="x">X</option>
            <option value="other">Other</option>
          </select>
          <select
            v-model="kindFilter"
            class="rounded-md border border-divider bg-surface px-2 py-1 text-xs text-ink"
          >
            <option value="all">All kinds</option>
            <option value="question">Questions</option>
            <option value="mention">Mentions</option>
            <option value="competitor">Competitors</option>
            <option value="opportunity">Opportunities</option>
          </select>
          <div class="flex rounded-md border border-divider overflow-hidden text-xs">
            <button
              v-for="s in (['all','new','drafted','responded','ignored'] as const)"
              :key="s"
              type="button"
              :class="['px-3 py-1', statusFilter === s ? 'bg-primary/10 text-primary font-medium' : 'text-ink-muted hover:bg-surface-elevated']"
              @click="statusFilter = s"
            >
              {{ s[0].toUpperCase() + s.slice(1) }} <span class="text-ink-disabled">({{ counts[s] }})</span>
            </button>
          </div>
          <button class="btn-ghost text-xs" :disabled="loading" @click="loadMentions">
            {{ loading ? '…' : 'Refresh' }}
          </button>
        </div>
      </div>

      <div v-if="filtered.length === 0" class="rounded bg-surface-elevated/40 px-3 py-3 text-sm text-ink-muted">
        No mentions match the filter.
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="m in filtered"
          :key="m.id"
          class="rounded border border-divider px-3 py-3 space-y-2 hover:bg-surface-elevated/40 transition-colors"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div class="flex items-baseline gap-2 flex-wrap">
              <span :class="['rounded-full px-2 py-0.5 text-[10px] font-medium uppercase', platformChip(m.platform)]">
                {{ m.platform }}
              </span>
              <span :class="['rounded-full px-2 py-0.5 text-[10px] font-medium uppercase', statusChip(m.status)]">
                {{ m.status }}
              </span>
              <span class="text-[11px] text-ink-muted">{{ kindLabel(m.kind) }}</span>
              <span v-if="m.author" class="text-[11px] font-mono text-ink-muted">{{ m.author }}</span>
              <span class="text-[11px] text-ink-disabled">· {{ fmtDate(m.created_at) }}</span>
            </div>
            <div class="flex items-center gap-1">
              <a
                :href="m.source_url"
                target="_blank"
                rel="noopener"
                class="text-[11px] text-primary hover:underline px-2 py-1"
              >
                Source →
              </a>
              <a
                v-if="m.response_url"
                :href="m.response_url"
                target="_blank"
                rel="noopener"
                class="text-[11px] text-success hover:underline px-2 py-1"
              >
                My reply →
              </a>
              <button
                type="button"
                class="btn-ghost text-[11px]"
                @click="loadIntoComposer(m)"
              >
                Edit
              </button>
              <select
                :value="m.status"
                class="rounded-md border border-divider bg-surface px-2 py-1 text-[11px] text-ink"
                @change="setStatus(m, ($event.target as HTMLSelectElement).value as Status)"
              >
                <option value="new">New</option>
                <option value="drafted">Drafted</option>
                <option value="responded">Responded</option>
                <option value="ignored">Ignored</option>
              </select>
              <button
                type="button"
                class="text-[11px] text-danger hover:underline px-2 py-1"
                @click="deleteMention(m)"
              >
                Delete
              </button>
            </div>
          </div>
          <div class="text-xs text-ink whitespace-pre-wrap">{{ m.snippet }}</div>
          <div v-if="m.draft_reply" class="rounded border-l-2 border-primary/40 pl-3 py-1 text-xs text-ink-muted">
            <div class="text-[10px] font-semibold uppercase tracking-wide text-primary mb-1">Draft reply</div>
            <div class="whitespace-pre-wrap font-mono">{{ m.draft_reply }}</div>
          </div>
          <div v-if="m.notes" class="text-[11px] text-ink-disabled italic">notes: {{ m.notes }}</div>
        </div>
      </div>
    </section>
  </div>
</template>
