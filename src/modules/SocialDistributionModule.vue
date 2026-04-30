<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Client } from '@/types/database'

const props = defineProps<{ client: Client; config: Record<string, unknown> }>()
const auth = useAuthStore()

type Platform = 'reddit' | 'x'
type Status = 'draft' | 'scheduled' | 'published' | 'failed'

interface SocialPost {
  id: string
  client_id: string
  platform: Platform
  title: string | null
  body: string
  subreddit: string | null
  card_url: string | null
  status: Status
  scheduled_for: string | null
  published_at: string | null
  external_id: string | null
  external_url: string | null
  error_message: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ── Composer state ──────────────────────────────────────────────────────
const editingId = ref<string | null>(null)
const platform = ref<Platform>('x')
const title = ref('')
const body = ref('')
const subreddit = ref('')
const cardUrl = ref('')
const scheduleEnabled = ref(false)
const scheduledFor = ref('') // datetime-local string
const composerSaving = ref(false)
const composerError = ref<string | null>(null)
const composerNote = ref<string | null>(null)

const isReddit = computed(() => platform.value === 'reddit')
const xCharCount = computed(() => body.value.length)
const xTooLong = computed(() => platform.value === 'x' && xCharCount.value > 280)

function resetComposer() {
  editingId.value = null
  platform.value = 'x'
  title.value = ''
  body.value = ''
  subreddit.value = ''
  cardUrl.value = ''
  scheduleEnabled.value = false
  scheduledFor.value = ''
  composerError.value = null
  composerNote.value = null
}

function loadIntoComposer(p: SocialPost) {
  editingId.value = p.id
  platform.value = p.platform
  title.value = p.title ?? ''
  body.value = p.body
  subreddit.value = p.subreddit ?? ''
  cardUrl.value = p.card_url ?? ''
  scheduleEnabled.value = p.scheduled_for !== null
  // datetime-local wants 'YYYY-MM-DDTHH:MM' (no seconds, no Z)
  scheduledFor.value = p.scheduled_for
    ? new Date(p.scheduled_for).toISOString().slice(0, 16)
    : ''
  composerError.value = null
  composerNote.value = null
}

async function saveComposer(targetStatus: 'draft' | 'scheduled') {
  composerError.value = null
  if (!body.value.trim()) {
    composerError.value = 'Body is required.'
    return
  }
  if (isReddit.value && !title.value.trim()) {
    composerError.value = 'Reddit posts require a title.'
    return
  }
  if (isReddit.value && !subreddit.value.trim()) {
    composerError.value = 'Reddit posts require a subreddit.'
    return
  }
  if (xTooLong.value) {
    composerError.value = `X posts must be 280 chars or fewer (currently ${xCharCount.value}).`
    return
  }
  if (targetStatus === 'scheduled' && !scheduledFor.value) {
    composerError.value = 'Pick a schedule time.'
    return
  }

  composerSaving.value = true
  try {
    const payload: Partial<SocialPost> = {
      client_id: props.client.id,
      platform: platform.value,
      title: isReddit.value ? title.value.trim() : null,
      body: body.value,
      subreddit: isReddit.value ? subreddit.value.trim().replace(/^r\//, '') : null,
      card_url: cardUrl.value.trim() || null,
      status: targetStatus,
      scheduled_for: targetStatus === 'scheduled'
        ? new Date(scheduledFor.value).toISOString()
        : null,
    }

    if (editingId.value) {
      const { error } = await supabase
        .from('social_posts')
        .update(payload)
        .eq('id', editingId.value)
      if (error) throw error
      composerNote.value = 'Updated.'
    } else {
      const { error } = await supabase
        .from('social_posts')
        .insert({ ...payload, created_by: auth.profile?.id ?? null })
      if (error) throw error
      composerNote.value = targetStatus === 'scheduled' ? 'Scheduled.' : 'Saved as draft.'
      resetComposer()
    }
    await loadPosts()
  } catch (e: any) {
    composerError.value = e?.message ?? 'Save failed.'
  } finally {
    composerSaving.value = false
  }
}

// ── Manual publish helper ───────────────────────────────────────────────
// Phase 1 doesn't post via API. Instead: copy body to clipboard, open
// the platform's submit page in a new tab, user pastes + submits, then
// returns to mark the post as published.
function platformComposeUrl(p: SocialPost): string {
  if (p.platform === 'reddit') {
    const sub = p.subreddit ?? ''
    const t = encodeURIComponent(p.title ?? '')
    const text = encodeURIComponent(p.body)
    return `https://www.reddit.com/r/${sub}/submit?title=${t}&text=${text}`
  }
  // X
  const text = encodeURIComponent(p.body)
  return `https://x.com/intent/tweet?text=${text}`
}

async function copyAndOpen(p: SocialPost) {
  try {
    await navigator.clipboard.writeText(p.body)
  } catch {
    // Some browsers block clipboard without recent user gesture; the open
    // step will still work, user can copy manually from the composer.
  }
  window.open(platformComposeUrl(p), '_blank', 'noopener')
}

async function markPublished(p: SocialPost) {
  const url = window.prompt('Optional: paste the URL of the published post:', p.external_url ?? '') ?? ''
  const { error } = await supabase
    .from('social_posts')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      external_url: url.trim() || null,
    })
    .eq('id', p.id)
  if (error) {
    composerError.value = error.message
    return
  }
  await loadPosts()
}

async function deletePost(p: SocialPost) {
  if (!confirm(`Delete this ${p.platform} post?`)) return
  const { error } = await supabase.from('social_posts').delete().eq('id', p.id)
  if (error) {
    composerError.value = error.message
    return
  }
  if (editingId.value === p.id) resetComposer()
  await loadPosts()
}

// ── Queue ───────────────────────────────────────────────────────────────
const posts = ref<SocialPost[]>([])
const queueLoading = ref(false)
const queueFilter = ref<Status | 'all'>('all')
const platformFilter = ref<Platform | 'all'>('all')

async function loadPosts() {
  queueLoading.value = true
  const { data, error } = await supabase
    .from('social_posts')
    .select('*')
    .eq('client_id', props.client.id)
    .order('scheduled_for', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200)
  queueLoading.value = false
  if (error) {
    composerError.value = error.message
    return
  }
  posts.value = (data ?? []) as SocialPost[]
}

const filteredPosts = computed(() =>
  posts.value.filter((p) => {
    if (queueFilter.value !== 'all' && p.status !== queueFilter.value) return false
    if (platformFilter.value !== 'all' && p.platform !== platformFilter.value) return false
    return true
  }),
)

const counts = computed(() => {
  const c: Record<Status | 'all', number> = {
    all: posts.value.length,
    draft: 0,
    scheduled: 0,
    published: 0,
    failed: 0,
  }
  for (const p of posts.value) c[p.status]++
  return c
})

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function statusChip(s: Status): string {
  if (s === 'draft') return 'bg-ink-muted/15 text-ink-muted'
  if (s === 'scheduled') return 'bg-warn/10 text-warn'
  if (s === 'published') return 'bg-success/10 text-success'
  return 'bg-danger/10 text-danger'
}

function platformChip(p: Platform): string {
  if (p === 'reddit') return 'bg-[#FF4500]/10 text-[#FF4500]'
  return 'bg-ink/10 text-ink'
}

watch(() => props.client.id, loadPosts)
onMounted(loadPosts)
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card">
      <h2 class="text-lg font-semibold text-ink">Social Distribution</h2>
      <p class="text-sm text-ink-muted">
        Compose, schedule, and queue posts for Reddit + X. Phase 1: manual publish (Copy → Open → Mark published). API auto-posting comes in phases 2 + 3.
      </p>
    </div>

    <!-- Composer -->
    <section class="card space-y-3">
      <div class="flex items-baseline justify-between">
        <div>
          <span class="eyebrow">Compose</span>
          <h3 class="mt-1 text-sm font-semibold text-ink">
            {{ editingId ? 'Editing post' : 'New post' }}
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

      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="text-xs text-ink-muted block mb-1">Platform</label>
          <select
            v-model="platform"
            class="w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-ink"
          >
            <option value="x">X (Twitter)</option>
            <option value="reddit">Reddit</option>
          </select>
        </div>
        <div v-if="isReddit">
          <label class="text-xs text-ink-muted block mb-1">Subreddit (no r/)</label>
          <input
            v-model="subreddit"
            type="text"
            placeholder="fantasyfootball"
            class="w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-ink"
          />
        </div>
      </div>

      <div v-if="isReddit">
        <label class="text-xs text-ink-muted block mb-1">Title</label>
        <input
          v-model="title"
          type="text"
          placeholder="Power Rankings — Week 12"
          class="w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-ink"
        />
      </div>

      <div>
        <div class="flex items-baseline justify-between mb-1">
          <label class="text-xs text-ink-muted">Body{{ isReddit ? ' (markdown)' : '' }}</label>
          <span
            v-if="!isReddit"
            :class="['text-[11px] font-mono', xTooLong ? 'text-danger font-semibold' : 'text-ink-disabled']"
          >
            {{ xCharCount }} / 280
          </span>
        </div>
        <textarea
          v-model="body"
          :rows="isReddit ? 8 : 4"
          :placeholder="isReddit ? 'Body in markdown — links, lists, etc.' : 'What do you want to post?'"
          class="w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-ink font-mono"
        ></textarea>
      </div>

      <div>
        <label class="text-xs text-ink-muted block mb-1">Card URL (optional)</label>
        <input
          v-model="cardUrl"
          type="text"
          placeholder="https://… link to a UFD card image"
          class="w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-ink"
        />
        <p class="mt-1 text-[11px] text-ink-disabled">
          Phase 1: paste the URL into the body or upload manually after Copy + Open. Auto-attach comes with API integration.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <input
          id="schedule-toggle"
          v-model="scheduleEnabled"
          type="checkbox"
          class="rounded"
        />
        <label for="schedule-toggle" class="text-xs text-ink-muted">Schedule for later</label>
        <input
          v-if="scheduleEnabled"
          v-model="scheduledFor"
          type="datetime-local"
          class="rounded-md border border-divider bg-surface px-2 py-1 text-xs text-ink"
        />
      </div>

      <p v-if="composerError" class="text-xs text-danger">{{ composerError }}</p>
      <p v-if="composerNote" class="text-xs text-success">{{ composerNote }}</p>

      <div class="flex flex-wrap items-center justify-end gap-2 border-t border-divider pt-3">
        <button
          type="button"
          class="btn-ghost text-xs"
          :disabled="composerSaving"
          @click="saveComposer('draft')"
        >
          {{ composerSaving ? 'Saving…' : (editingId ? 'Update draft' : 'Save draft') }}
        </button>
        <button
          v-if="scheduleEnabled"
          type="button"
          class="btn-primary text-xs"
          :disabled="composerSaving"
          @click="saveComposer('scheduled')"
        >
          {{ composerSaving ? 'Saving…' : 'Schedule' }}
        </button>
      </div>
    </section>

    <!-- Queue -->
    <section class="card space-y-3">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span class="eyebrow">Queue</span>
          <h3 class="mt-1 text-sm font-semibold text-ink">Posts</h3>
        </div>
        <div class="flex items-center gap-2">
          <select
            v-model="platformFilter"
            class="rounded-md border border-divider bg-surface px-2 py-1 text-xs text-ink"
          >
            <option value="all">All platforms</option>
            <option value="x">X only</option>
            <option value="reddit">Reddit only</option>
          </select>
          <div class="flex rounded-md border border-divider overflow-hidden text-xs">
            <button
              v-for="s in (['all','draft','scheduled','published','failed'] as const)"
              :key="s"
              type="button"
              :class="['px-3 py-1', queueFilter === s ? 'bg-primary/10 text-primary font-medium' : 'text-ink-muted hover:bg-surface-elevated']"
              @click="queueFilter = s"
            >
              {{ s[0].toUpperCase() + s.slice(1) }} <span class="text-ink-disabled">({{ counts[s] }})</span>
            </button>
          </div>
          <button class="btn-ghost text-xs" :disabled="queueLoading" @click="loadPosts">
            {{ queueLoading ? '…' : 'Refresh' }}
          </button>
        </div>
      </div>

      <div v-if="filteredPosts.length === 0" class="rounded bg-surface-elevated/40 px-3 py-3 text-sm text-ink-muted">
        No posts match the filter.
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="p in filteredPosts"
          :key="p.id"
          class="rounded border border-divider px-3 py-3 space-y-2 hover:bg-surface-elevated/40 transition-colors"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div class="flex items-baseline gap-2">
              <span :class="['rounded-full px-2 py-0.5 text-[10px] font-medium uppercase', platformChip(p.platform)]">
                {{ p.platform }}
              </span>
              <span :class="['rounded-full px-2 py-0.5 text-[10px] font-medium uppercase', statusChip(p.status)]">
                {{ p.status }}
              </span>
              <span v-if="p.subreddit" class="text-[11px] font-mono text-ink-muted">r/{{ p.subreddit }}</span>
              <span v-if="p.scheduled_for && p.status === 'scheduled'" class="text-[11px] text-ink-muted">
                · scheduled {{ fmtDate(p.scheduled_for) }}
              </span>
              <span v-if="p.published_at" class="text-[11px] text-ink-muted">
                · published {{ fmtDate(p.published_at) }}
              </span>
            </div>
            <div class="flex items-center gap-1">
              <button
                v-if="p.status !== 'published'"
                type="button"
                class="btn-ghost text-[11px]"
                @click="loadIntoComposer(p)"
              >
                Edit
              </button>
              <button
                v-if="p.status !== 'published'"
                type="button"
                class="text-[11px] text-primary hover:underline px-2 py-1"
                @click="copyAndOpen(p)"
              >
                Copy + Open {{ p.platform }}
              </button>
              <button
                v-if="p.status !== 'published'"
                type="button"
                class="text-[11px] text-success hover:underline px-2 py-1"
                @click="markPublished(p)"
              >
                Mark published
              </button>
              <a
                v-if="p.external_url"
                :href="p.external_url"
                target="_blank"
                rel="noopener"
                class="text-[11px] text-primary hover:underline px-2 py-1"
              >
                View live →
              </a>
              <button
                type="button"
                class="text-[11px] text-danger hover:underline px-2 py-1"
                @click="deletePost(p)"
              >
                Delete
              </button>
            </div>
          </div>
          <div v-if="p.title" class="text-sm font-semibold text-ink">{{ p.title }}</div>
          <div class="text-xs text-ink whitespace-pre-wrap font-mono">{{ p.body }}</div>
          <div v-if="p.card_url" class="text-[11px] text-ink-muted truncate">
            <span class="text-ink-disabled">card:</span> {{ p.card_url }}
          </div>
          <div v-if="p.error_message" class="text-[11px] text-danger">
            error: {{ p.error_message }}
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
