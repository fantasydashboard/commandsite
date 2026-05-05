<script setup lang="ts">
/**
 * Social Planner — AI-driven 7-day content calendar.
 *
 * "Generate plan" calls social-plan-generate which pulls the brand profile
 * + latest strategist themes + a hardcoded sport calendar context, asks
 * Claude for 7-10 mixed-platform mixed-creative-type posts, and writes
 * them as social_posts rows with status='planned' + planned_for + creative_type.
 *
 * UI: weekly grid, draggable cards (planned posts can be moved between
 * days), click → opens an inline editor that lets you tweak the body
 * and either schedule, save as draft, or delete.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Client } from '@/types/database'

const props = defineProps<{ client: Client; config: Record<string, unknown> }>()

type Platform = 'x' | 'reddit'
type Status = 'planned' | 'draft' | 'scheduled' | 'published' | 'failed'

interface PlanPost {
  id: string
  client_id: string
  platform: Platform
  title: string | null
  body: string
  subreddit: string | null
  status: Status
  planned_for: string | null
  creative_type: string | null
  scheduled_for: string | null
  plan_batch_id: string | null
  external_url: string | null
  created_at: string
}

const posts = ref<PlanPost[]>([])
const loading = ref(false)
const generating = ref(false)
const error = ref<string | null>(null)
const planMessage = ref<string | null>(null)

// Week start defaults to today (UTC). Users can navigate week-by-week.
const weekStart = ref<string>(todayIso())

function todayIso(): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function fmtDayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

const weekDays = computed<string[]>(() =>
  Array.from({ length: 7 }, (_, i) => addDays(weekStart.value, i)),
)

const postsByDay = computed<Record<string, PlanPost[]>>(() => {
  const out: Record<string, PlanPost[]> = {}
  for (const day of weekDays.value) out[day] = []
  for (const p of posts.value) {
    const date = p.planned_for ?? (p.scheduled_for ? p.scheduled_for.slice(0, 10) : null)
    if (date && out[date]) out[date].push(p)
  }
  return out
})

async function load() {
  loading.value = true
  error.value = null
  // Pull every post that lands inside the visible week (planned OR scheduled).
  const weekEnd = addDays(weekStart.value, 7)
  const { data, error: err } = await supabase
    .from('social_posts')
    .select(
      'id, client_id, platform, title, body, subreddit, status, planned_for, creative_type, scheduled_for, plan_batch_id, external_url, created_at',
    )
    .eq('client_id', props.client.id)
    .or(`planned_for.gte.${weekStart.value},scheduled_for.gte.${weekStart.value}`)
    .or(`planned_for.lt.${weekEnd},scheduled_for.lt.${weekEnd}`)
    .order('created_at', { ascending: false })
    .limit(200)
  loading.value = false
  if (err) {
    error.value = err.message
    return
  }
  posts.value = (data ?? []) as PlanPost[]
}

async function generatePlan() {
  if (
    !confirm(
      `Generate a 7-day plan starting ${weekStart.value}? This calls Claude and inserts ~7-10 planned posts. You can edit, reschedule, or delete each one.`,
    )
  ) return

  generating.value = true
  planMessage.value = null
  error.value = null
  try {
    const { data, error: err } = await supabase.functions.invoke<{
      summary: string
      posts_created: number
      sport_context: { primary_sport: string }
    }>('social-plan-generate', {
      body: { start_date: weekStart.value },
    })
    if (err) {
      if (err instanceof FunctionsHttpError) {
        try {
          const body = await err.context.json()
          error.value = body?.error ?? err.message
        } catch {
          error.value = err.message
        }
      } else {
        error.value = err.message
      }
      return
    }
    planMessage.value = `${data?.posts_created ?? 0} posts planned · ${data?.summary ?? ''}`
    await load()
  } finally {
    generating.value = false
  }
}

// ── Edit modal ───────────────────────────────────────────────────────────
const editing = ref<PlanPost | null>(null)
const editBody = ref('')
const editTitle = ref('')
const editSubreddit = ref('')
const editScheduledFor = ref('')

function openEdit(p: PlanPost) {
  editing.value = p
  editBody.value = p.body
  editTitle.value = p.title ?? ''
  editSubreddit.value = p.subreddit ?? ''
  editScheduledFor.value = p.scheduled_for ? p.scheduled_for.slice(0, 16) : ''
}

function closeEdit() {
  editing.value = null
}

async function saveEdit(asStatus: 'planned' | 'draft' | 'scheduled') {
  if (!editing.value) return
  const updates: Partial<PlanPost> = {
    body: editBody.value,
    title: editTitle.value || null,
    subreddit: editSubreddit.value.trim().replace(/^r\//, '') || null,
    status: asStatus,
    scheduled_for:
      asStatus === 'scheduled' && editScheduledFor.value
        ? new Date(editScheduledFor.value).toISOString()
        : null,
  }
  // Cast to silence stale Database types; runtime fine.
  // deno-lint-ignore no-explicit-any
  const { error: err } = await (supabase
    .from('social_posts') as any)
    .update(updates)
    .eq('id', editing.value.id)
  if (err) {
    error.value = err.message
    return
  }
  closeEdit()
  await load()
}

async function deletePost(p: PlanPost) {
  if (!confirm(`Delete this ${p.platform} post?`)) return
  const { error: err } = await supabase.from('social_posts').delete().eq('id', p.id)
  if (err) {
    error.value = err.message
    return
  }
  await load()
}

// ── Drag-to-reschedule ───────────────────────────────────────────────────
const draggingPostId = ref<string | null>(null)

function onDragStart(_evt: DragEvent, p: PlanPost) {
  draggingPostId.value = p.id
}

function onDragEnd() {
  draggingPostId.value = null
}

async function onDrop(_evt: DragEvent, dayIso: string) {
  if (!draggingPostId.value) return
  const id = draggingPostId.value
  draggingPostId.value = null
  // Update planned_for to the new day. If the post was scheduled, also
  // shift scheduled_for to the new day at the original time-of-day.
  const post = posts.value.find((p) => p.id === id)
  if (!post) return
  const updates: Partial<PlanPost> = {
    planned_for: dayIso,
  }
  if (post.scheduled_for) {
    const originalTime = post.scheduled_for.slice(11) // HH:MM:SS.sssZ
    updates.scheduled_for = `${dayIso}T${originalTime}`
  }
  // deno-lint-ignore no-explicit-any
  const { error: err } = await (supabase
    .from('social_posts') as any)
    .update(updates)
    .eq('id', id)
  if (err) {
    error.value = err.message
    return
  }
  await load()
}

// ── Display helpers ──────────────────────────────────────────────────────
function statusChip(s: Status): string {
  if (s === 'planned') return 'bg-accent/10 text-accent'
  if (s === 'draft') return 'bg-ink-muted/15 text-ink-muted'
  if (s === 'scheduled') return 'bg-warn/10 text-warn'
  if (s === 'published') return 'bg-success/10 text-success'
  return 'bg-danger/10 text-danger'
}
function platformChip(p: Platform): string {
  if (p === 'reddit') return 'bg-[#FF4500]/10 text-[#FF4500]'
  return 'bg-ink/10 text-ink'
}
function creativeIcon(c: string | null): string {
  if (c === 'downloadable_card') return '🃏'
  if (c === 'hot_take') return '🔥'
  if (c === 'educational') return '📚'
  if (c === 'poll') return '📊'
  if (c === 'reactive') return '⚡️'
  return '✏️'
}

function shiftWeek(by: number) {
  weekStart.value = addDays(weekStart.value, by * 7)
}

function gotoThisWeek() {
  weekStart.value = todayIso()
}

watch([() => props.client.id, weekStart], load)
onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">Social Planner</h2>
        <p class="text-sm text-ink-muted">
          AI-driven 7-day content calendar. Pulls your brand profile + strategist themes + sport calendar context. Drag posts between days to reschedule, click to edit + publish.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex items-center gap-1 text-xs">
          <button class="btn-ghost text-xs" @click="shiftWeek(-1)">‹</button>
          <button class="btn-ghost text-xs" @click="gotoThisWeek">This week</button>
          <button class="btn-ghost text-xs" @click="shiftWeek(1)">›</button>
        </div>
        <span class="text-xs text-ink-muted">
          {{ fmtDayLabel(weekStart) }} → {{ fmtDayLabel(addDays(weekStart, 6)) }}
        </span>
        <button
          type="button"
          class="btn-primary text-xs"
          :disabled="generating"
          @click="generatePlan"
        >
          {{ generating ? 'Generating…' : '✨ Generate week' }}
        </button>
      </div>
    </div>

    <p v-if="error" class="text-sm text-danger">{{ error }}</p>
    <p
      v-if="planMessage"
      class="text-sm text-success rounded bg-success/5 border border-success/30 px-3 py-2"
    >
      {{ planMessage }}
    </p>

    <!-- Calendar grid -->
    <div class="grid grid-cols-1 gap-3 md:grid-cols-7">
      <div
        v-for="day in weekDays"
        :key="day"
        class="rounded-card bg-surface-raised shadow-card p-3 min-h-[200px] space-y-2 transition-colors"
        :class="day === todayIso() ? 'ring-2 ring-brand/30' : ''"
        @dragover.prevent
        @drop="(e) => onDrop(e, day)"
      >
        <div class="flex items-baseline justify-between border-b border-divider/60 pb-2">
          <div class="kpi-label">{{ fmtDayLabel(day) }}</div>
          <div class="text-[11px] text-ink-disabled">
            {{ postsByDay[day]?.length ?? 0 }}
          </div>
        </div>

        <div v-if="(postsByDay[day]?.length ?? 0) === 0" class="text-[11px] text-ink-disabled italic py-3 text-center">
          (empty)
        </div>

        <div
          v-for="p in (postsByDay[day] ?? [])"
          :key="p.id"
          :draggable="p.status !== 'published'"
          class="rounded border border-divider bg-surface px-2 py-1.5 text-xs cursor-pointer hover:bg-surface-elevated transition-colors space-y-1"
          :class="draggingPostId === p.id ? 'opacity-40' : ''"
          @dragstart="(e) => onDragStart(e, p)"
          @dragend="onDragEnd"
          @click="openEdit(p)"
        >
          <div class="flex items-center gap-1 flex-wrap">
            <span :class="['rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase', platformChip(p.platform)]">
              {{ p.platform }}
            </span>
            <span :class="['rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase', statusChip(p.status)]">
              {{ p.status }}
            </span>
            <span class="text-[10px]">{{ creativeIcon(p.creative_type) }}</span>
          </div>
          <div v-if="p.title" class="text-[11px] font-semibold text-ink line-clamp-1">
            {{ p.title }}
          </div>
          <div class="text-[11px] text-ink line-clamp-3 leading-snug">{{ p.body }}</div>
        </div>
      </div>
    </div>

    <p class="text-[11px] text-ink-disabled italic">
      Drag any planned/draft post to a different day to reschedule. Click to edit + decide whether to keep as planned, save as draft, or schedule for a specific time.
    </p>

    <!-- Edit modal -->
    <div
      v-if="editing"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
      @click.self="closeEdit"
    >
      <div class="w-full max-w-2xl rounded-xl bg-surface-raised shadow-xl space-y-0 overflow-hidden">
        <div class="flex items-center justify-between border-b border-divider px-5 py-3">
          <div class="flex items-center gap-2">
            <span :class="['rounded-full px-2 py-0.5 text-[10px] font-medium uppercase', platformChip(editing.platform)]">{{ editing.platform }}</span>
            <span :class="['rounded-full px-2 py-0.5 text-[10px] font-medium uppercase', statusChip(editing.status)]">{{ editing.status }}</span>
            <span v-if="editing.creative_type" class="text-[11px] text-ink-muted">
              {{ creativeIcon(editing.creative_type) }} {{ editing.creative_type }}
            </span>
          </div>
          <button type="button" class="btn-ghost text-xs" @click="closeEdit">Close</button>
        </div>

        <div class="px-5 py-4 space-y-3">
          <div v-if="editing.platform === 'reddit'">
            <label class="text-xs text-ink-muted block mb-1">Title</label>
            <input
              v-model="editTitle"
              type="text"
              class="w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </div>
          <div v-if="editing.platform === 'reddit'">
            <label class="text-xs text-ink-muted block mb-1">Subreddit (no r/)</label>
            <input
              v-model="editSubreddit"
              type="text"
              placeholder="fantasyfootball"
              class="w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </div>
          <div>
            <label class="text-xs text-ink-muted block mb-1">
              Body
              <span v-if="editing.platform === 'x'" class="text-ink-disabled font-mono">
                ({{ editBody.length }}/280)
              </span>
            </label>
            <textarea
              v-model="editBody"
              :rows="editing.platform === 'reddit' ? 8 : 4"
              class="w-full rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-ink font-mono"
            ></textarea>
          </div>
          <div>
            <label class="text-xs text-ink-muted block mb-1">
              Schedule for (optional — set if you want to publish via the runner later)
            </label>
            <input
              v-model="editScheduledFor"
              type="datetime-local"
              class="rounded-md border border-divider bg-surface px-2 py-1 text-xs text-ink"
            />
          </div>
        </div>

        <div class="flex items-center justify-between border-t border-divider px-5 py-3">
          <button
            type="button"
            class="text-xs text-danger hover:underline"
            @click="deletePost(editing); closeEdit()"
          >
            Delete
          </button>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="btn-ghost text-xs"
              @click="saveEdit('planned')"
            >Keep as planned</button>
            <button
              type="button"
              class="btn-ghost text-xs"
              @click="saveEdit('draft')"
            >Save as draft</button>
            <button
              v-if="editScheduledFor"
              type="button"
              class="btn-primary text-xs"
              @click="saveEdit('scheduled')"
            >Schedule</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
