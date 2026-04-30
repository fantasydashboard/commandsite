<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import type { Client } from '@/types/database'

const auth = useAuthStore()

// AI Social — V1.0 (foundation): brand profile capture only. AI generation
// + Ayrshare publishing arrive in V1.1+. This component is intentionally
// dumb for now: it reads/writes public.client_brand_profiles directly via
// the Supabase client (RLS on the row scopes access by client_id).

const props = defineProps<{ client: Client; config: Record<string, unknown> }>()

interface BrandProfile {
  id?: string
  client_id: string
  business_name: string | null
  description: string | null
  voice: string | null
  audience: string | null
  goals: { primary?: string; secondary?: string[]; cadence?: string } | null
  topics: string[]
  dos: string[]
  donts: string[]
  // sample_posts/lessons_learned/preferences exist in the table but aren't
  // surfaced in V1; AI agents in later phases will read/write them.
}

function emptyProfile(client_id: string, fallbackName: string): BrandProfile {
  return {
    client_id,
    business_name: fallbackName,
    description: null,
    voice: null,
    audience: null,
    goals: { primary: 'awareness', secondary: [], cadence: 'weekly' },
    topics: [],
    dos: [],
    donts: [],
  }
}

const profile = ref<BrandProfile | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const savedAt = ref<Date | null>(null)
// In-progress chip text inputs for topics/dos/donts.
const draft = ref({ topic: '', do_: '', dont: '' })

const goalOptions: { value: string; label: string }[] = [
  { value: 'awareness', label: 'Brand awareness' },
  { value: 'conversion', label: 'Conversion / signups' },
  { value: 'community', label: 'Community engagement' },
  { value: 'education', label: 'Education / authority' },
  { value: 'retention', label: 'Retention of existing users' },
]

const cadenceOptions: { value: string; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'every_other_day', label: 'Every other day' },
  { value: 'weekly', label: 'Weekly batch (3-5 posts)' },
  { value: 'biweekly', label: 'Bi-weekly batch' },
  { value: 'as_needed', label: 'As needed (manual triggers)' },
]

async function load() {
  loading.value = true
  error.value = null
  const { data, error: err } = await supabase
    .from('client_brand_profiles')
    .select('*')
    .eq('client_id', props.client.id)
    .maybeSingle()
  loading.value = false
  if (err) {
    error.value = err.message
    return
  }
  if (data) {
    profile.value = {
      ...data,
      goals: data.goals ?? { primary: 'awareness', secondary: [], cadence: 'weekly' },
      topics: data.topics ?? [],
      dos: data.dos ?? [],
      donts: data.donts ?? [],
    }
  } else {
    profile.value = emptyProfile(props.client.id, props.client.name)
  }
}

async function save() {
  if (!profile.value) return
  saving.value = true
  error.value = null
  // Strip read-only fields the API doesn't want on upsert.
  const payload = {
    client_id: profile.value.client_id,
    business_name: profile.value.business_name,
    description: profile.value.description,
    voice: profile.value.voice,
    audience: profile.value.audience,
    goals: profile.value.goals,
    topics: profile.value.topics,
    dos: profile.value.dos,
    donts: profile.value.donts,
  }
  const { data, error: err } = await supabase
    .from('client_brand_profiles')
    .upsert(payload, { onConflict: 'client_id' })
    .select('*')
    .single()
  saving.value = false
  if (err) {
    error.value = err.message
    return
  }
  profile.value = { ...profile.value, id: data.id }
  savedAt.value = new Date()
}

// Tag input helpers.
function addChip(field: 'topics' | 'dos' | 'donts', text: string) {
  if (!profile.value) return
  const t = text.trim()
  if (!t) return
  if (profile.value[field].includes(t)) return
  profile.value[field] = [...profile.value[field], t]
}
function removeChip(field: 'topics' | 'dos' | 'donts', text: string) {
  if (!profile.value) return
  profile.value[field] = profile.value[field].filter((x) => x !== text)
}

watch(() => props.client.id, load)
onMounted(load)

// ── Strategist (V2) ────────────────────────────────────────────────────
// Pulls live metrics (UFD-specific for now), feeds them + brand profile to
// Claude, gets back a strategic content plan with concrete topic ideas.

interface ProposedTopic {
  topic: string
  theme?: string
  angle: string
  channel?: 'social' | 'email' | 'paid_ads' | 'landing_page'
  target_platforms?: string[]
}

interface Strategy {
  situation_summary: string
  key_observations?: string[]
  themes: { theme: string; why: string }[]
  proposed_topics: ProposedTopic[]
  cadence_recommendation?: string
}

interface StrategyRun {
  id: string
  client_id: string
  run_type: string
  // deno-lint-ignore no-explicit-any
  input: any
  output: Strategy
  // deno-lint-ignore no-explicit-any
  ai_meta: any
  created_at: string
  feedback_notes: string | null
}

const strategyRun = ref<StrategyRun | null>(null)
const strategyLoading = ref(false)
const strategyRunning = ref(false)
const strategyError = ref<string | null>(null)
const generatingTopic = ref<string | null>(null)

// ── Strategy feedback state ───────────────────────────────────────────
// Keyed by `${item_type}:${item_index}` → reaction + comment. Synced with
// social_strategy_feedback rows for the current run.

interface FeedbackEntry {
  reaction: 'up' | 'down' | null
  comment: string
}
const feedbackMap = ref<Record<string, FeedbackEntry>>({})
const feedbackSavingKey = ref<string | null>(null)
const notesForNext = ref('')
const notesSaving = ref(false)
const notesSavedAt = ref<Date | null>(null)

function feedbackKey(type: 'theme' | 'topic', index: number): string {
  return `${type}:${index}`
}
function getFeedback(type: 'theme' | 'topic', index: number): FeedbackEntry {
  return (
    feedbackMap.value[feedbackKey(type, index)] ?? {
      reaction: null,
      comment: '',
    }
  )
}

async function loadFeedbackForRun(runId: string) {
  const { data, error: err } = await supabase
    .from('social_strategy_feedback')
    .select('item_type, item_index, reaction, comment')
    .eq('run_id', runId)
  if (err) {
    strategyError.value = err.message
    return
  }
  const next: Record<string, FeedbackEntry> = {}
  for (const f of data ?? []) {
    next[feedbackKey(f.item_type as 'theme' | 'topic', f.item_index)] = {
      reaction: f.reaction as 'up' | 'down' | null,
      comment: f.comment ?? '',
    }
  }
  feedbackMap.value = next
}

async function persistFeedback(type: 'theme' | 'topic', index: number) {
  if (!strategyRun.value) return
  const key = feedbackKey(type, index)
  const entry = feedbackMap.value[key] ?? { reaction: null, comment: '' }
  feedbackSavingKey.value = key
  // Upsert keyed by (run_id, item_type, item_index) — the migration's
  // unique index.
  const { error: err } = await supabase
    .from('social_strategy_feedback')
    .upsert(
      {
        run_id: strategyRun.value.id,
        client_id: props.client.id,
        item_type: type,
        item_index: index,
        reaction: entry.reaction,
        comment: entry.comment || null,
        created_by: auth.profile?.id ?? null,
      },
      { onConflict: 'run_id,item_type,item_index' },
    )
  feedbackSavingKey.value = null
  if (err) {
    strategyError.value = err.message
  }
}

async function setReaction(
  type: 'theme' | 'topic',
  index: number,
  reaction: 'up' | 'down' | null,
) {
  const key = feedbackKey(type, index)
  const current = feedbackMap.value[key] ?? { reaction: null, comment: '' }
  // Clicking the same reaction again clears it.
  const next = current.reaction === reaction ? null : reaction
  feedbackMap.value = {
    ...feedbackMap.value,
    [key]: { ...current, reaction: next },
  }
  await persistFeedback(type, index)
}

function setComment(type: 'theme' | 'topic', index: number, value: string) {
  const key = feedbackKey(type, index)
  const current = feedbackMap.value[key] ?? { reaction: null, comment: '' }
  feedbackMap.value = {
    ...feedbackMap.value,
    [key]: { ...current, comment: value },
  }
}

async function saveNotesForNext() {
  if (!strategyRun.value) return
  notesSaving.value = true
  const { error: err } = await supabase
    .from('social_strategy_runs')
    .update({ feedback_notes: notesForNext.value })
    .eq('id', strategyRun.value.id)
  notesSaving.value = false
  if (err) {
    strategyError.value = err.message
    return
  }
  notesSavedAt.value = new Date()
  // Mirror locally so the rest of the UI stays consistent.
  if (strategyRun.value) {
    strategyRun.value = {
      ...strategyRun.value,
      // deno-lint-ignore no-explicit-any
      ...(({ feedback_notes: notesForNext.value } as any)),
    }
  }
}

async function loadLatestStrategy() {
  strategyLoading.value = true
  strategyError.value = null
  const { data, error: err } = await supabase
    .from('social_strategy_runs')
    .select('*')
    .eq('client_id', props.client.id)
    .eq('run_type', 'strategist')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  strategyLoading.value = false
  if (err) {
    strategyError.value = err.message
    return
  }
  strategyRun.value = data as StrategyRun | null
  notesForNext.value = strategyRun.value?.feedback_notes ?? ''
  notesSavedAt.value = null
  feedbackMap.value = {}
  if (strategyRun.value) {
    await loadFeedbackForRun(strategyRun.value.id)
  }
}

// For UFD, fetch the three metric snapshots in parallel and pass them to
// the Strategist. For other clients we just send an empty snapshot.
async function buildMetricsSnapshot(): Promise<Record<string, unknown> | null> {
  if (props.client.slug !== 'ultimate-fantasy-dashboard') return null

  const [statsRes, emailsRes, stripeRes] = await Promise.all([
    supabase.functions.invoke('ufd-stats', { body: { window: '30d' } }),
    supabase.functions.invoke('ufd-emails', { body: { window: '30d' } }),
    supabase.functions.invoke('ufd-stripe', { body: { window: '30d' } }),
  ])

  // Tolerate any of these failing — the Strategist will get a partial
  // snapshot rather than nothing.
  // deno-lint-ignore no-explicit-any
  const stats = (statsRes.data ?? null) as any
  // deno-lint-ignore no-explicit-any
  const emails = (emailsRes.data ?? null) as any
  // deno-lint-ignore no-explicit-any
  const stripe = (stripeRes.data ?? null) as any

  return {
    window: '30d',
    users: stats?.cards
      ? {
          total: stats.cards.total_users?.value,
          new_in_window: stats.cards.total_users?.new_in_window,
          free_trial: stats.cards.free_trial?.value,
          individual_monthly: stats.cards.individual_monthly?.value,
          individual_annual: stats.cards.individual_annual?.value,
          league_passes: stats.cards.league_passes?.value,
          expired: stats.cards.expired?.value,
        }
      : null,
    emails: emails?.cards
      ? {
          sent: emails.cards.sent,
          delivered: emails.cards.delivered,
          opened: emails.cards.opened,
          clicked: emails.cards.clicked,
          bounced: emails.cards.bounced,
          open_rate: emails.rates?.open_rate ?? 0,
          click_rate: emails.rates?.click_rate ?? 0,
          bounce_rate: emails.rates?.bounce_rate ?? 0,
          top_subjects: (emails.groups ?? []).slice(0, 8).map((g: { subject: string; sent: number; opened: number; clicked: number }) => ({
            subject: g.subject,
            sent: g.sent,
            opened: g.opened,
            clicked: g.clicked,
          })),
        }
      : null,
    revenue: stripe?.cards
      ? {
          mrr: stripe.cards.mrr_cents / 100,
          arr: stripe.cards.arr_cents / 100,
          new_mrr: stripe.cards.new_mrr_cents / 100,
          churned_mrr: stripe.cards.churned_mrr_cents / 100,
          net_new_mrr: stripe.cards.net_new_mrr_cents / 100,
          active_subscriptions: stripe.cards.active_subscriptions,
          plan_mix: stripe.plan_mix?.map((p: { label: string; count: number; mrr_cents: number }) => ({
            plan: p.label,
            count: p.count,
            mrr: p.mrr_cents / 100,
          })),
        }
      : null,
  }
}

async function runStrategist() {
  strategyRunning.value = true
  strategyError.value = null
  const snapshot = await buildMetricsSnapshot()
  const { data, error: err } = await supabase.functions.invoke<{
    run: StrategyRun
    strategy: Strategy
  }>('ai-social-strategist', {
    body: {
      client_id: props.client.id,
      metrics_snapshot: snapshot,
    },
  })
  strategyRunning.value = false
  if (err) {
    strategyError.value = await surfaceFnError(err, 'Strategist failed')
    return
  }
  if (data?.run) {
    strategyRun.value = data.run
    notesForNext.value = data.run.feedback_notes ?? ''
    notesSavedAt.value = null
    feedbackMap.value = {}
  }
}

async function generateFromTopic(topic: ProposedTopic) {
  generatingTopic.value = topic.topic
  strategyError.value = null
  const channel = topic.channel ?? 'social'
  const topicText = topic.angle ? `${topic.topic} — ${topic.angle}` : topic.topic

  if (channel === 'email') {
    // Route to the email writer instead of the social writer.
    const { data, error: err } = await supabase.functions.invoke<{ draft: EmailDraft }>(
      'ai-email-generate',
      { body: { client_id: props.client.id, topic: topicText } },
    )
    generatingTopic.value = null
    if (err) {
      strategyError.value = await surfaceFnError(err, 'Email generation failed')
      return
    }
    if (data?.draft) {
      emailDrafts.value = [data.draft, ...emailDrafts.value]
      previewedEmail.value = data.draft
      subTab.value = 'email'
    }
    return
  }

  // social (default), paid_ads, landing_page — for now only social has a
  // writer; the others fall through and produce social drafts as a stub.
  const { data, error: err } = await supabase.functions.invoke<{ drafts: SocialDraft[] }>(
    'ai-social-generate',
    {
      body: {
        client_id: props.client.id,
        topic: topicText,
        count: 1,
      },
    },
  )
  generatingTopic.value = null
  if (err) {
    strategyError.value = await surfaceFnError(err, 'Generation failed')
    return
  }
  const newDrafts = (data?.drafts ?? []) as SocialDraft[]
  drafts.value = [...newDrafts, ...drafts.value]
  for (const d of newDrafts) {
    activeTabByDraft.value[d.id] = d.variants?.[0]?.platform ?? 'twitter'
  }
  statusFilter.value = 'draft'
  subTab.value = 'social'
}

watch(() => props.client.id, loadLatestStrategy)
onMounted(loadLatestStrategy)

// ── Drafts queue (V1.1) ────────────────────────────────────────────────

interface DraftVariant {
  platform: string
  body: string
  hashtags?: string[]
  notes?: string
}

interface SocialDraft {
  id: string
  client_id: string
  topic: string | null
  variants: DraftVariant[]
  status: 'draft' | 'approved' | 'scheduled' | 'posted' | 'failed' | 'rejected'
  // deno-lint-ignore no-explicit-any
  ai_meta: any
  approved_at: string | null
  scheduled_for: string | null
  posted_at: string | null
  created_at: string
}

const PLATFORMS = ['twitter', 'linkedin', 'facebook', 'instagram'] as const
const PLATFORM_LABELS: Record<string, string> = {
  twitter: 'X',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  instagram: 'Instagram',
}
const PLATFORM_LIMITS: Record<string, number> = {
  twitter: 280,
  linkedin: 3000,
  facebook: 5000,
  instagram: 2200,
}

const drafts = ref<SocialDraft[]>([])
const draftsLoading = ref(false)
const draftsError = ref<string | null>(null)
const generating = ref(false)
const genError = ref<string | null>(null)
const genTopic = ref('')
const genCount = ref(3)
const statusFilter = ref<'all' | 'draft' | 'approved' | 'rejected' | 'posted'>('draft')

// Per-draft selected platform tab and dirty edits.
const activeTabByDraft = ref<Record<string, string>>({})
const dirtyDrafts = ref<Set<string>>(new Set())
const savingDrafts = ref<Set<string>>(new Set())
const copiedDraft = ref<string | null>(null)

async function surfaceFnError(err: unknown, fallback: string): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    try {
      const body = await err.context.json()
      return body?.error
        ? `${body.error} (HTTP ${err.context.status})`
        : `${err.message} (HTTP ${err.context.status})`
    } catch {
      return `${err.message} (HTTP ${err.context.status})`
    }
  }
  return (err as Error)?.message ?? fallback
}

async function loadDrafts() {
  draftsLoading.value = true
  draftsError.value = null
  const { data, error: err } = await supabase
    .from('social_post_drafts')
    .select('*')
    .eq('client_id', props.client.id)
    .order('created_at', { ascending: false })
    .limit(200)
  draftsLoading.value = false
  if (err) {
    draftsError.value = err.message
    return
  }
  drafts.value = (data ?? []) as SocialDraft[]
  // Default tab = first variant's platform per draft.
  const tabs: Record<string, string> = {}
  for (const d of drafts.value) {
    tabs[d.id] = d.variants?.[0]?.platform ?? 'twitter'
  }
  activeTabByDraft.value = tabs
}

async function generate() {
  generating.value = true
  genError.value = null
  const topic = genTopic.value.trim()
  const count = Math.max(1, Math.min(10, genCount.value || (topic ? 1 : 3)))
  const { data, error: err } = await supabase.functions.invoke<{ drafts: SocialDraft[] }>(
    'ai-social-generate',
    { body: { client_id: props.client.id, topic: topic || undefined, count } },
  )
  generating.value = false
  if (err) {
    genError.value = await surfaceFnError(err, 'Generation failed')
    return
  }
  // Prepend new drafts and reset composer.
  const newDrafts = (data?.drafts ?? []) as SocialDraft[]
  drafts.value = [...newDrafts, ...drafts.value]
  for (const d of newDrafts) {
    activeTabByDraft.value[d.id] = d.variants?.[0]?.platform ?? 'twitter'
  }
  genTopic.value = ''
  statusFilter.value = 'draft'
}

function variantFor(draft: SocialDraft, platform: string): DraftVariant | null {
  return draft.variants.find((v) => v.platform === platform) ?? null
}

function setActiveTab(draftId: string, platform: string) {
  activeTabByDraft.value = { ...activeTabByDraft.value, [draftId]: platform }
}

function markDirty(draftId: string) {
  dirtyDrafts.value.add(draftId)
  dirtyDrafts.value = new Set(dirtyDrafts.value)
}

async function saveEdits(draft: SocialDraft) {
  savingDrafts.value.add(draft.id)
  savingDrafts.value = new Set(savingDrafts.value)
  const { error: err } = await supabase
    .from('social_post_drafts')
    .update({ variants: draft.variants })
    .eq('id', draft.id)
  savingDrafts.value.delete(draft.id)
  savingDrafts.value = new Set(savingDrafts.value)
  if (err) {
    draftsError.value = err.message
    return
  }
  dirtyDrafts.value.delete(draft.id)
  dirtyDrafts.value = new Set(dirtyDrafts.value)
}

async function setStatus(draft: SocialDraft, status: SocialDraft['status']) {
  // deno-lint-ignore no-explicit-any
  const update: any = { status }
  if (status === 'approved') {
    update.approved_at = new Date().toISOString()
  } else if (status === 'rejected') {
    update.approved_at = null
  }
  const { error: err } = await supabase
    .from('social_post_drafts')
    .update(update)
    .eq('id', draft.id)
  if (err) {
    draftsError.value = err.message
    return
  }
  draft.status = status
  if (update.approved_at !== undefined) draft.approved_at = update.approved_at
}

async function copyVariant(draft: SocialDraft, platform: string) {
  const v = variantFor(draft, platform)
  if (!v) return
  const text = [v.body, (v.hashtags ?? []).join(' ')].filter(Boolean).join('\n\n')
  try {
    await navigator.clipboard.writeText(text)
    copiedDraft.value = `${draft.id}:${platform}`
    setTimeout(() => {
      if (copiedDraft.value === `${draft.id}:${platform}`) copiedDraft.value = null
    }, 1500)
  } catch {
    /* clipboard write may be blocked; user can copy from textarea */
  }
}

const filteredDrafts = computed(() => {
  if (statusFilter.value === 'all') return drafts.value
  return drafts.value.filter((d) => d.status === statusFilter.value)
})

const draftCounts = computed(() => {
  const counts = { draft: 0, approved: 0, rejected: 0, posted: 0, all: drafts.value.length }
  for (const d of drafts.value) {
    if (d.status === 'draft') counts.draft++
    else if (d.status === 'approved') counts.approved++
    else if (d.status === 'rejected') counts.rejected++
    else if (d.status === 'posted' || d.status === 'scheduled') counts.posted++
  }
  return counts
})

function charCount(body: string, platform: string): { count: number; limit: number; over: boolean } {
  const count = (body ?? '').length
  const limit = PLATFORM_LIMITS[platform] ?? 5000
  return { count, limit, over: count > limit }
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

watch(() => props.client.id, loadDrafts)
onMounted(loadDrafts)

// ── Sub-tab navigation (Brand · Strategy · Social · Email) ─────────────
type SubTab = 'brand' | 'strategy' | 'social' | 'email'
const subTab = ref<SubTab>('brand')

// ── Email channel (V1) ────────────────────────────────────────────────
interface EmailContent {
  subject: string
  preview_text?: string
  eyebrow?: string
  headline: string
  lede: string
  sections: { heading?: string; body: string; highlight_color?: string; emoji?: string }[]
  cta_label: string
  cta_url: string
  cta_subtext?: string
  footer_note?: string
}

interface EmailDraft {
  id: string
  client_id: string
  topic: string | null
  // deno-lint-ignore no-explicit-any
  content: EmailContent
  html: string | null
  subject: string | null
  preview_text: string | null
  status: string
  // deno-lint-ignore no-explicit-any
  ai_meta: any
  created_at: string
}

const emailDrafts = ref<EmailDraft[]>([])
const emailDraftsLoading = ref(false)
const emailGenerating = ref(false)
const emailError = ref<string | null>(null)
const emailTopic = ref('')
const emailCtaUrl = ref('')
const previewedEmail = ref<EmailDraft | null>(null)

async function loadEmailDrafts() {
  emailDraftsLoading.value = true
  emailError.value = null
  const { data, error: err } = await supabase
    .from('email_drafts')
    .select('id, client_id, topic, content, html, subject, preview_text, status, ai_meta, created_at')
    .eq('client_id', props.client.id)
    .order('created_at', { ascending: false })
    .limit(50)
  emailDraftsLoading.value = false
  if (err) {
    emailError.value = err.message
    return
  }
  emailDrafts.value = (data ?? []) as EmailDraft[]
  if (!previewedEmail.value && emailDrafts.value.length > 0) {
    previewedEmail.value = emailDrafts.value[0]
  }
}

async function composeEmail() {
  emailGenerating.value = true
  emailError.value = null
  const topic = emailTopic.value.trim()
  const { data, error: err } = await supabase.functions.invoke<{ draft: EmailDraft }>(
    'ai-email-generate',
    {
      body: {
        client_id: props.client.id,
        topic: topic || undefined,
        cta_url: emailCtaUrl.value.trim() || undefined,
      },
    },
  )
  emailGenerating.value = false
  if (err) {
    emailError.value = await surfaceFnError(err, 'Email generation failed')
    return
  }
  if (data?.draft) {
    emailDrafts.value = [data.draft, ...emailDrafts.value]
    previewedEmail.value = data.draft
    emailTopic.value = ''
  }
}

async function saveDraftAsTemplate(draft: EmailDraft) {
  const suggestedKey = (draft.topic ?? draft.subject ?? 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'untitled'
  const key = window.prompt(
    'Template key — used in code/automation references (e.g., trial_chat_quiet). Lowercase + underscores.',
    suggestedKey,
  )
  if (!key) return
  const cleanKey = key.trim().toLowerCase()
  const name =
    window.prompt('Template name (human-friendly)', draft.subject ?? draft.topic ?? 'Untitled') ??
    draft.subject ??
    'Untitled'

  const { error: err } = await supabase.from('email_templates').insert({
    client_id: props.client.id,
    key: cleanKey,
    name: name.trim() || cleanKey,
    description: 'Saved from draft',
    subject: draft.subject,
    preview_text: draft.preview_text,
    html: draft.html,
    content: draft.content,
    status: 'ready',
  })
  if (err) {
    emailError.value = err.message
    return
  }
  await loadEmailTemplates()
  emailError.value = null
  importResult.value = `Saved as template: ${cleanKey}`
}

async function deleteEmailDraft(id: string) {
  if (!confirm('Delete this email draft?')) return
  const { error: err } = await supabase.from('email_drafts').delete().eq('id', id)
  if (err) {
    emailError.value = err.message
    return
  }
  emailDrafts.value = emailDrafts.value.filter((d) => d.id !== id)
  if (previewedEmail.value?.id === id) {
    previewedEmail.value = emailDrafts.value[0] ?? null
  }
}

watch(() => props.client.id, loadEmailDrafts)
onMounted(loadEmailDrafts)

// ── Email templates library ────────────────────────────────────────────
interface EmailTemplate {
  id: string
  client_id: string
  key: string | null
  name: string
  description: string | null
  subject: string | null
  preview_text: string | null
  html: string | null
  status: string
  created_at: string
  updated_at: string
}

const emailTemplates = ref<EmailTemplate[]>([])
const emailTemplatesLoading = ref(false)
const previewedTemplate = ref<EmailTemplate | null>(null)

async function loadEmailTemplates() {
  emailTemplatesLoading.value = true
  const { data, error: err } = await supabase
    .from('email_templates')
    .select('id, client_id, key, name, description, subject, preview_text, html, status, created_at, updated_at')
    .eq('client_id', props.client.id)
    .order('updated_at', { ascending: false })
  emailTemplatesLoading.value = false
  if (err) {
    emailError.value = err.message
    return
  }
  emailTemplates.value = (data ?? []) as EmailTemplate[]
}

const importingTemplates = ref(false)
const importResult = ref<string | null>(null)
async function importUfdTemplates() {
  if (!confirm('Import UFD\'s 11 lifecycle templates (trial + at-risk) + sequence into CommandSite? Safe to run multiple times.')) return
  importingTemplates.value = true
  importResult.value = null
  const { data, error: err } = await supabase.functions.invoke<{
    imported_templates: number
    sequence_id: string
    steps: number
  }>('email-templates-import', { body: {} })
  importingTemplates.value = false
  if (err) {
    importResult.value = await surfaceFnError(err, 'Import failed')
    return
  }
  importResult.value = `Imported ${data?.imported_templates ?? 0} templates + ${data?.steps ?? 0}-step sequence (disabled).`
  await loadEmailTemplates()
}

// ── Send-to-cohort modal ─────────────────────────────────────────────
const sendOpen = ref(false)
const sendSource = ref<{ kind: 'template' | 'draft'; id: string; subject: string | null } | null>(null)
const sendCohort = ref<string>('')
const sendRecipient = ref('')
const sendDryRun = ref(true)
const sendBusy = ref(false)
const sendResult = ref<string | null>(null)
const sendError = ref<string | null>(null)

const COHORT_OPTIONS = [
  { value: '', label: '— Choose audience —' },
  { value: 'free_trial', label: 'Free Trial users' },
  { value: 'expired', label: 'Expired (trial ended, no paid)' },
  { value: 'individual_monthly', label: 'Individual Monthly' },
  { value: 'individual_annual', label: 'Individual Annual' },
  { value: 'league_passes', label: 'League Pass holders' },
  { value: 'total_passes', label: 'All paying users' },
  { value: 'total_users', label: 'All users (use carefully)' },
]

function openSend(kind: 'template' | 'draft', id: string, subject: string | null) {
  sendSource.value = { kind, id, subject }
  sendCohort.value = ''
  sendRecipient.value = ''
  sendDryRun.value = true
  sendResult.value = null
  sendError.value = null
  sendOpen.value = true
}
function closeSend() {
  sendOpen.value = false
  sendSource.value = null
}

async function executeSend() {
  if (!sendSource.value) return
  if (!sendRecipient.value && !sendCohort.value) {
    sendError.value = 'Pick a cohort or enter a recipient email'
    return
  }
  sendBusy.value = true
  sendError.value = null
  sendResult.value = null
  // deno-lint-ignore no-explicit-any
  const body: any = { dry_run: sendDryRun.value }
  if (sendSource.value.kind === 'template') body.template_id = sendSource.value.id
  else body.draft_id = sendSource.value.id
  if (sendRecipient.value.trim()) body.recipient = sendRecipient.value.trim()
  else body.cohort = sendCohort.value

  const { data, error: err } = await supabase.functions.invoke<{
    dry_run?: boolean
    sent?: number
    failed?: number
    skipped?: number
    recipients_count?: number
    sample_recipients?: string[]
  }>('email-send', { body })
  sendBusy.value = false

  if (err) {
    sendError.value = await surfaceFnError(err, 'Send failed')
    return
  }
  if (data?.dry_run) {
    sendResult.value = `Dry run: would send to ${data.recipients_count ?? 0} recipient${(data.recipients_count ?? 0) === 1 ? '' : 's'}. Sample: ${(data.sample_recipients ?? []).join(', ') || '—'}`
  } else {
    sendResult.value = `Sent ${data?.sent ?? 0}, failed ${data?.failed ?? 0}, skipped ${data?.skipped ?? 0}.`
    if (sendSource.value.kind === 'draft') await loadEmailDrafts()
  }
}

watch(() => props.client.id, loadEmailTemplates)
onMounted(loadEmailTemplates)

// ── Sequences admin (Phase 3) ─────────────────────────────────────────
interface EmailSequence {
  id: string
  client_id: string
  key: string
  name: string
  description: string | null
  cohort: string
  anchor_field: string
  enabled: boolean
  updated_at: string
}

interface SequenceStep {
  id: string
  sequence_id: string
  template_key: string
  day_offset: number
  skip_if_paid: boolean
  use_expiry_date: boolean
  step_order: number
}

const sequences = ref<EmailSequence[]>([])
const sequenceSteps = ref<Record<string, SequenceStep[]>>({})
const sequencesLoading = ref(false)
const sequenceTogglingId = ref<string | null>(null)

async function loadSequences() {
  sequencesLoading.value = true
  const { data, error: err } = await supabase
    .from('email_sequences')
    .select('id, client_id, key, name, description, cohort, anchor_field, enabled, updated_at')
    .eq('client_id', props.client.id)
    .order('updated_at', { ascending: false })
  if (err) {
    sequencesLoading.value = false
    emailError.value = err.message
    return
  }
  sequences.value = (data ?? []) as EmailSequence[]

  if (sequences.value.length > 0) {
    const ids = sequences.value.map((s) => s.id)
    const { data: stepData } = await supabase
      .from('email_sequence_steps')
      .select('id, sequence_id, template_key, day_offset, skip_if_paid, use_expiry_date, step_order')
      .in('sequence_id', ids)
      .order('step_order', { ascending: true })
    const grouped: Record<string, SequenceStep[]> = {}
    for (const s of (stepData ?? []) as SequenceStep[]) {
      if (!grouped[s.sequence_id]) grouped[s.sequence_id] = []
      grouped[s.sequence_id].push(s)
    }
    sequenceSteps.value = grouped
  }
  sequencesLoading.value = false
}

async function toggleSequence(seq: EmailSequence) {
  const next = !seq.enabled
  if (next && !confirm(
    `Enable "${seq.name}"?\n\n` +
    `Once enabled, the hourly cron will start sending emails to the ${seq.cohort} cohort.\n\n` +
    `Make sure UFD's Vercel cron is OFF and you've run "Backfill log from UFD" — otherwise users may receive duplicate emails.`,
  )) return
  sequenceTogglingId.value = seq.id
  const { error: err } = await supabase
    .from('email_sequences')
    .update({ enabled: next })
    .eq('id', seq.id)
  sequenceTogglingId.value = null
  if (err) {
    emailError.value = err.message
    return
  }
  seq.enabled = next
}

// ── Send log dashboard ───────────────────────────────────────────────
interface SendLogRow {
  id: string
  recipient: string
  template_key: string | null
  subject: string | null
  status: 'sent' | 'failed' | 'skipped'
  resend_id: string | null
  error_message: string | null
  sent_at: string
  sequence_id: string | null
}

const sendLog = ref<SendLogRow[]>([])
const sendLogLoading = ref(false)

async function loadSendLog() {
  sendLogLoading.value = true
  const { data, error: err } = await supabase
    .from('email_send_log')
    .select('id, recipient, template_key, subject, status, resend_id, error_message, sent_at, sequence_id')
    .eq('client_id', props.client.id)
    .order('sent_at', { ascending: false })
    .limit(100)
  sendLogLoading.value = false
  if (err) {
    emailError.value = err.message
    return
  }
  sendLog.value = (data ?? []) as SendLogRow[]
}

// ── Backfill log from UFD's trial_email_log ───────────────────────────
const backfillingLog = ref(false)
const backfillLogResult = ref<string | null>(null)

async function backfillFromUfdLog() {
  if (!confirm(
    'Copy UFD\'s trial_email_log into CommandSite\'s send log?\n\n' +
    'This is the cutover safety step — after this, CommandSite\'s runner will know which emails UFD already sent and won\'t double up.\n\n' +
    'Idempotent — safe to re-run.',
  )) return
  backfillingLog.value = true
  backfillLogResult.value = null
  const { data, error: err } = await supabase.functions.invoke<{
    scanned: number
    imported: number
    skipped: number
    missing_email: number
  }>('email-log-import', { body: {} })
  backfillingLog.value = false
  if (err) {
    backfillLogResult.value = await surfaceFnError(err, 'Backfill failed')
    return
  }
  backfillLogResult.value = `Scanned ${data?.scanned ?? 0}, imported ${data?.imported ?? 0}, skipped ${data?.skipped ?? 0}.`
  await loadSendLog()
}

function statusChip(s: 'sent' | 'failed' | 'skipped'): string {
  if (s === 'sent') return 'bg-success/10 text-success'
  if (s === 'failed') return 'bg-danger/10 text-danger'
  return 'bg-warning/10 text-warning'
}

function fmtSendTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

watch(() => props.client.id, () => {
  loadSequences()
  loadSendLog()
})
onMounted(() => {
  loadSequences()
  loadSendLog()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header + sub-tab nav -->
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-ink">AI Marketing</h2>
        <p class="text-sm text-ink-muted">
          Brand profile + Strategist + per-channel writers (social, email).
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span v-if="subTab === 'brand' && savedAt" class="text-xs text-ink-muted">
          Saved {{ savedAt.toLocaleTimeString() }}
        </span>
        <button
          v-if="subTab === 'brand'"
          type="button"
          class="btn-primary text-sm"
          :disabled="saving || loading"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save profile' }}
        </button>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="t in [
          { key: 'brand', label: 'Brand' },
          { key: 'strategy', label: 'Strategy' },
          { key: 'social', label: 'Social' },
          { key: 'email', label: 'Email' },
        ]"
        :key="t.key"
        type="button"
        :class="['chip', subTab === t.key && 'chip-active']"
        @click="subTab = t.key as SubTab"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- Top-level error banner (any tab) -->
    <div
      v-if="error"
      class="card border border-danger/30 bg-danger/5 text-sm text-danger"
    >
      {{ error }}
    </div>

    <div v-if="loading && subTab === 'brand'" class="card text-sm text-ink-muted">
      Loading brand profile…
    </div>

    <!-- ── Brand tab ───────────────────────────────────────────────── -->
    <template v-if="subTab === 'brand' && profile && !loading">
      <!-- About -->
      <section class="card space-y-4">
        <div>
          <span class="eyebrow">About</span>
          <h3 class="mt-1 text-base font-semibold text-ink">
            What does {{ profile.business_name || 'this business' }} do?
          </h3>
        </div>
        <div>
          <label class="text-xs font-medium text-ink-muted">Business name</label>
          <input
            v-model="profile.business_name"
            type="text"
            class="mt-1 w-full rounded border border-divider bg-surface-raised px-3 py-2 text-sm"
            placeholder="e.g., Ultimate Fantasy Dashboard"
          />
        </div>
        <div>
          <label class="text-xs font-medium text-ink-muted">Elevator pitch</label>
          <textarea
            v-model="profile.description"
            rows="3"
            class="mt-1 w-full rounded border border-divider bg-surface-raised px-3 py-2 text-sm"
            placeholder="One paragraph: what you do, who it's for, why it's different."
          />
        </div>
      </section>

      <!-- Voice -->
      <section class="card space-y-4">
        <div>
          <span class="eyebrow">Voice</span>
          <h3 class="mt-1 text-base font-semibold text-ink">How do you sound?</h3>
          <p class="text-sm text-ink-muted">
            Describe the tone in your own words. The agent will mirror this.
          </p>
        </div>
        <textarea
          v-model="profile.voice"
          rows="4"
          class="w-full rounded border border-divider bg-surface-raised px-3 py-2 text-sm"
          placeholder="e.g., Confident but not preachy. Plain language, no marketing jargon. Occasional dry humor. Always specific — names, numbers, examples."
        />
      </section>

      <!-- Audience -->
      <section class="card space-y-4">
        <div>
          <span class="eyebrow">Audience</span>
          <h3 class="mt-1 text-base font-semibold text-ink">Who are you talking to?</h3>
        </div>
        <textarea
          v-model="profile.audience"
          rows="4"
          class="w-full rounded border border-divider bg-surface-raised px-3 py-2 text-sm"
          placeholder="e.g., Hardcore fantasy football players (5+ leagues), 25-45, mostly male, frustrated by clunky league software, want sharper analysis to win money leagues."
        />
      </section>

      <!-- Goals -->
      <section class="card space-y-4">
        <div>
          <span class="eyebrow">Goals</span>
          <h3 class="mt-1 text-base font-semibold text-ink">What's social for?</h3>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="text-xs font-medium text-ink-muted">Primary goal</label>
            <select
              v-model="profile.goals!.primary"
              class="mt-1 w-full rounded border border-divider bg-surface-raised px-3 py-2 text-sm"
            >
              <option v-for="g in goalOptions" :key="g.value" :value="g.value">
                {{ g.label }}
              </option>
            </select>
          </div>
          <div>
            <label class="text-xs font-medium text-ink-muted">Posting cadence</label>
            <select
              v-model="profile.goals!.cadence"
              class="mt-1 w-full rounded border border-divider bg-surface-raised px-3 py-2 text-sm"
            >
              <option v-for="c in cadenceOptions" :key="c.value" :value="c.value">
                {{ c.label }}
              </option>
            </select>
          </div>
        </div>
      </section>

      <!-- Topics -->
      <section class="card space-y-3">
        <div>
          <span class="eyebrow">Topics</span>
          <h3 class="mt-1 text-base font-semibold text-ink">What can you post about?</h3>
          <p class="text-sm text-ink-muted">
            Topic areas the AI is allowed to draft about. Add as many as feel honest.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="t in profile.topics"
            :key="t"
            class="chip chip-active flex items-center gap-1"
          >
            {{ t }}
            <button
              type="button"
              class="ml-1 text-ink-inverse/70 hover:text-ink-inverse"
              @click="removeChip('topics', t)"
            >
              ×
            </button>
          </span>
        </div>
        <div class="flex gap-2">
          <input
            v-model="draft.topic"
            type="text"
            class="flex-1 rounded border border-divider bg-surface-raised px-3 py-2 text-sm"
            placeholder="e.g., injury reactions, draft strategy, commissioner tips"
            @keydown.enter.prevent="addChip('topics', draft.topic); draft.topic = ''"
          />
          <button
            type="button"
            class="btn-secondary text-sm"
            @click="addChip('topics', draft.topic); draft.topic = ''"
          >
            Add
          </button>
        </div>
      </section>

      <!-- Do's / Don'ts -->
      <section class="card space-y-4">
        <div>
          <span class="eyebrow">Guardrails</span>
          <h3 class="mt-1 text-base font-semibold text-ink">Do's and don'ts</h3>
          <p class="text-sm text-ink-muted">
            Be specific. The agent treats these as hard rules.
          </p>
        </div>

        <div>
          <label class="text-xs font-medium text-success">Do</label>
          <div class="mt-1 flex flex-wrap gap-2">
            <span
              v-for="t in profile.dos"
              :key="t"
              class="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-xs text-success"
            >
              {{ t }}
              <button
                type="button"
                class="text-success/70 hover:text-success"
                @click="removeChip('dos', t)"
              >
                ×
              </button>
            </span>
          </div>
          <div class="mt-2 flex gap-2">
            <input
              v-model="draft.do_"
              type="text"
              class="flex-1 rounded border border-divider bg-surface-raised px-3 py-2 text-sm"
              placeholder="e.g., Lead with a specific stat or name"
              @keydown.enter.prevent="addChip('dos', draft.do_); draft.do_ = ''"
            />
            <button
              type="button"
              class="btn-secondary text-sm"
              @click="addChip('dos', draft.do_); draft.do_ = ''"
            >
              Add
            </button>
          </div>
        </div>

        <div>
          <label class="text-xs font-medium text-danger">Don't</label>
          <div class="mt-1 flex flex-wrap gap-2">
            <span
              v-for="t in profile.donts"
              :key="t"
              class="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-1 text-xs text-danger"
            >
              {{ t }}
              <button
                type="button"
                class="text-danger/70 hover:text-danger"
                @click="removeChip('donts', t)"
              >
                ×
              </button>
            </span>
          </div>
          <div class="mt-2 flex gap-2">
            <input
              v-model="draft.dont"
              type="text"
              class="flex-1 rounded border border-divider bg-surface-raised px-3 py-2 text-sm"
              placeholder="e.g., No exclamation points; no marketing jargon"
              @keydown.enter.prevent="addChip('donts', draft.dont); draft.dont = ''"
            />
            <button
              type="button"
              class="btn-secondary text-sm"
              @click="addChip('donts', draft.dont); draft.dont = ''"
            >
              Add
            </button>
          </div>
        </div>
      </section>
    </template>

    <!-- ── Strategy tab ─────────────────────────────────────────────── -->
    <template v-if="subTab === 'strategy'">
    <section class="card space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span class="eyebrow">Strategy</span>
          <h3 class="mt-1 text-base font-semibold text-ink">Strategist's read</h3>
          <p class="text-sm text-ink-muted">
            Reads your live metrics + brand profile and proposes what to write about. Each topic can be turned into drafts in one click.
          </p>
        </div>
        <button
          type="button"
          class="btn-primary text-sm"
          :disabled="strategyRunning"
          @click="runStrategist"
        >
          {{ strategyRunning ? 'Thinking…' : strategyRun ? 'Re-run strategist' : 'Run strategist' }}
        </button>
      </div>

      <div
        v-if="strategyError"
        class="rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
      >
        {{ strategyError }}
      </div>

      <div
        v-if="strategyLoading"
        class="rounded bg-surface-elevated/40 px-3 py-3 text-sm text-ink-muted"
      >
        Loading…
      </div>

      <div
        v-else-if="!strategyRun"
        class="rounded bg-surface-elevated/40 px-3 py-3 text-sm text-ink-muted"
      >
        No strategist runs yet. Click <strong>Run strategist</strong> to get a metrics-grounded plan.
      </div>

      <template v-else>
        <div class="text-[11px] text-ink-muted">
          Last run {{ fmtDateTime(strategyRun.created_at) }}
        </div>

        <!-- Situation summary -->
        <div class="rounded border-l-4 border-brand bg-brand/5 px-3 py-2 text-sm text-ink">
          {{ strategyRun.output.situation_summary }}
        </div>

        <!-- Key observations -->
        <div
          v-if="strategyRun.output.key_observations?.length"
          class="space-y-1"
        >
          <span class="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Observations
          </span>
          <ul class="list-disc space-y-1 pl-5 text-sm text-ink">
            <li v-for="(obs, i) in strategyRun.output.key_observations" :key="i">{{ obs }}</li>
          </ul>
        </div>

        <!-- Themes -->
        <div v-if="strategyRun.output.themes?.length" class="space-y-2">
          <span class="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Themes
          </span>
          <div class="grid gap-2 sm:grid-cols-2">
            <div
              v-for="(t, i) in strategyRun.output.themes"
              :key="i"
              class="rounded border border-divider bg-surface-elevated/30 px-3 py-2"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex-1">
                  <div class="text-sm font-medium text-ink">{{ t.theme }}</div>
                  <div class="mt-1 text-xs text-ink-muted">{{ t.why }}</div>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    :class="[
                      'rounded px-1.5 py-0.5 text-xs',
                      getFeedback('theme', i).reaction === 'up'
                        ? 'bg-success/20 text-success'
                        : 'text-ink-muted hover:bg-surface-elevated',
                    ]"
                    :disabled="feedbackSavingKey === feedbackKey('theme', i)"
                    title="Keep doing this"
                    @click="setReaction('theme', i, 'up')"
                  >
                    👍
                  </button>
                  <button
                    type="button"
                    :class="[
                      'rounded px-1.5 py-0.5 text-xs',
                      getFeedback('theme', i).reaction === 'down'
                        ? 'bg-danger/20 text-danger'
                        : 'text-ink-muted hover:bg-surface-elevated',
                    ]"
                    :disabled="feedbackSavingKey === feedbackKey('theme', i)"
                    title="Drop or rethink"
                    @click="setReaction('theme', i, 'down')"
                  >
                    👎
                  </button>
                </div>
              </div>
              <input
                :value="getFeedback('theme', i).comment"
                type="text"
                class="mt-2 w-full rounded border border-divider bg-surface-raised px-2 py-1 text-xs"
                :placeholder="getFeedback('theme', i).reaction === 'down' ? 'Why? (e.g., audience mismatch)' : 'Optional note'"
                @input="setComment('theme', i, ($event.target as HTMLInputElement).value)"
                @blur="persistFeedback('theme', i)"
                @keydown.enter.prevent="persistFeedback('theme', i)"
              />
            </div>
          </div>
        </div>

        <!-- Proposed topics -->
        <div v-if="strategyRun.output.proposed_topics?.length" class="space-y-2">
          <span class="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Proposed topics
          </span>
          <div class="space-y-2">
            <div
              v-for="(t, i) in strategyRun.output.proposed_topics"
              :key="i"
              class="flex flex-wrap items-start justify-between gap-3 rounded border border-divider bg-surface-raised px-3 py-2"
            >
              <div class="flex-1 space-y-1">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-ink">{{ t.topic }}</span>
                  <span
                    v-if="t.theme"
                    class="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] text-brand"
                  >
                    {{ t.theme }}
                  </span>
                </div>
                <div class="text-xs text-ink-muted">{{ t.angle }}</div>
                <div
                  v-if="t.target_platforms?.length"
                  class="flex flex-wrap gap-1 pt-1"
                >
                  <span
                    v-for="p in t.target_platforms"
                    :key="p"
                    class="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] uppercase text-ink-muted"
                  >
                    {{ p }}
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  :class="[
                    'rounded px-1.5 py-0.5 text-xs',
                    getFeedback('topic', i).reaction === 'up'
                      ? 'bg-success/20 text-success'
                      : 'text-ink-muted hover:bg-surface-elevated',
                  ]"
                  :disabled="feedbackSavingKey === feedbackKey('topic', i)"
                  title="Good idea"
                  @click="setReaction('topic', i, 'up')"
                >
                  👍
                </button>
                <button
                  type="button"
                  :class="[
                    'rounded px-1.5 py-0.5 text-xs',
                    getFeedback('topic', i).reaction === 'down'
                      ? 'bg-danger/20 text-danger'
                      : 'text-ink-muted hover:bg-surface-elevated',
                  ]"
                  :disabled="feedbackSavingKey === feedbackKey('topic', i)"
                  title="Skip / rethink"
                  @click="setReaction('topic', i, 'down')"
                >
                  👎
                </button>
                <button
                  type="button"
                  class="btn-secondary text-xs"
                  :disabled="generatingTopic !== null"
                  @click="generateFromTopic(t)"
                >
                  {{ generatingTopic === t.topic ? 'Drafting…' : 'Draft posts' }}
                </button>
              </div>
              <input
                v-if="getFeedback('topic', i).reaction !== null || getFeedback('topic', i).comment"
                :value="getFeedback('topic', i).comment"
                type="text"
                class="basis-full rounded border border-divider bg-surface-raised px-2 py-1 text-xs"
                :placeholder="getFeedback('topic', i).reaction === 'down' ? 'Why pass? (helps next run)' : 'Optional note'"
                @input="setComment('topic', i, ($event.target as HTMLInputElement).value)"
                @blur="persistFeedback('topic', i)"
                @keydown.enter.prevent="persistFeedback('topic', i)"
              />
            </div>
          </div>
        </div>

        <!-- Cadence -->
        <div
          v-if="strategyRun.output.cadence_recommendation"
          class="rounded bg-surface-elevated/30 px-3 py-2 text-xs text-ink-muted"
        >
          <strong class="text-ink">Cadence:</strong>
          {{ strategyRun.output.cadence_recommendation }}
        </div>

        <!-- Notes for next run — fed into the next Strategist run's prompt -->
        <div class="space-y-2 border-t border-divider pt-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Notes for next run
            </span>
            <span v-if="notesSavedAt" class="text-[11px] text-ink-muted">
              Saved {{ notesSavedAt.toLocaleTimeString() }}
            </span>
          </div>
          <textarea
            v-model="notesForNext"
            rows="3"
            class="w-full rounded border border-divider bg-surface-raised px-3 py-2 text-sm"
            placeholder="Anything the Strategist should know going forward? (e.g., 'Audience is more casual than this run assumed', 'Avoid Ohtani topics until end of season')"
          />
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] text-ink-muted">
              These notes + your 👍/👎 feedback feed into the next Strategist run's prompt.
            </span>
            <button
              type="button"
              class="btn-secondary text-xs"
              :disabled="notesSaving"
              @click="saveNotesForNext"
            >
              {{ notesSaving ? 'Saving…' : 'Save notes' }}
            </button>
          </div>
        </div>
      </template>
    </section>
    </template>

    <!-- ── Social tab ───────────────────────────────────────────────── -->
    <template v-if="subTab === 'social'">
    <section class="card space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span class="eyebrow">Social Drafts</span>
          <h3 class="mt-1 text-base font-semibold text-ink">Generate posts</h3>
          <p class="text-sm text-ink-muted">
            Claude reads your brand profile and drafts platform-specific variants. Approve to mark ready, then copy &amp; post (auto-publishing arrives in V1.2).
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-end gap-2">
        <div class="flex-1 min-w-[240px]">
          <label class="text-xs font-medium text-ink-muted">Topic (optional)</label>
          <input
            v-model="genTopic"
            type="text"
            class="mt-1 w-full rounded border border-divider bg-surface-raised px-3 py-2 text-sm"
            placeholder="Leave blank for a fresh batch from your topic list"
            @keydown.enter.prevent="generate"
          />
        </div>
        <div class="w-24">
          <label class="text-xs font-medium text-ink-muted">Count</label>
          <input
            v-model.number="genCount"
            type="number"
            min="1"
            max="10"
            class="mt-1 w-full rounded border border-divider bg-surface-raised px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          class="btn-primary text-sm"
          :disabled="generating"
          @click="generate"
        >
          {{ generating ? 'Generating…' : 'Generate' }}
        </button>
      </div>

      <div
        v-if="genError"
        class="rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
      >
        {{ genError }}
      </div>
    </section>

    <!-- Drafts queue -->
    <section>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <span class="eyebrow">Queue</span>
        <button
          v-for="opt in [
            { key: 'draft', label: `Pending (${draftCounts.draft})` },
            { key: 'approved', label: `Approved (${draftCounts.approved})` },
            { key: 'posted', label: `Posted (${draftCounts.posted})` },
            { key: 'rejected', label: `Rejected (${draftCounts.rejected})` },
            { key: 'all', label: `All (${draftCounts.all})` },
          ]"
          :key="opt.key"
          type="button"
          :class="['chip', statusFilter === opt.key && 'chip-active']"
          @click="statusFilter = opt.key as 'draft' | 'approved' | 'rejected' | 'posted' | 'all'"
        >
          {{ opt.label }}
        </button>
      </div>

      <div
        v-if="draftsError"
        class="card border border-danger/30 bg-danger/5 text-sm text-danger mb-3"
      >
        {{ draftsError }}
      </div>

      <div
        v-if="!draftsLoading && filteredDrafts.length === 0"
        class="card text-center text-sm text-ink-muted"
      >
        <span v-if="drafts.length === 0">
          No drafts yet. Hit <strong>Generate</strong> above to make some.
        </span>
        <span v-else>No drafts in this status.</span>
      </div>

      <div class="space-y-4">
        <div
          v-for="d in filteredDrafts"
          :key="d.id"
          class="card space-y-3"
        >
          <!-- Header: topic + status + actions -->
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <h4 class="text-sm font-semibold text-ink">{{ d.topic || 'Untitled draft' }}</h4>
                <span
                  :class="[
                    'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                    d.status === 'draft' && 'bg-warning/10 text-warning',
                    d.status === 'approved' && 'bg-success/10 text-success',
                    d.status === 'rejected' && 'bg-danger/10 text-danger',
                    (d.status === 'posted' || d.status === 'scheduled') && 'bg-[#2E9FE0]/10 text-[#2E9FE0]',
                    d.status === 'failed' && 'bg-danger/10 text-danger',
                  ]"
                >
                  {{ d.status }}
                </span>
                <span class="text-[11px] text-ink-muted">
                  {{ fmtDateTime(d.created_at) }}
                </span>
              </div>
              <p
                v-if="d.ai_meta?.reasoning"
                class="mt-1 text-xs italic text-ink-muted"
              >
                💭 {{ d.ai_meta.reasoning }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-if="dirtyDrafts.has(d.id)"
                type="button"
                class="btn-secondary text-xs"
                :disabled="savingDrafts.has(d.id)"
                @click="saveEdits(d)"
              >
                {{ savingDrafts.has(d.id) ? 'Saving…' : 'Save edits' }}
              </button>
              <button
                v-if="d.status !== 'approved'"
                type="button"
                class="btn-primary text-xs"
                @click="setStatus(d, 'approved')"
              >
                Approve
              </button>
              <button
                v-if="d.status !== 'rejected'"
                type="button"
                class="btn-ghost text-xs"
                @click="setStatus(d, 'rejected')"
              >
                Reject
              </button>
            </div>
          </div>

          <!-- Platform tabs -->
          <div class="flex flex-wrap gap-1 border-b border-divider">
            <button
              v-for="p in PLATFORMS"
              :key="p"
              type="button"
              :class="[
                'px-3 py-1.5 text-xs font-medium border-b-2 -mb-px',
                activeTabByDraft[d.id] === p
                  ? 'border-brand text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink',
              ]"
              @click="setActiveTab(d.id, p)"
            >
              {{ PLATFORM_LABELS[p] }}
              <span
                v-if="!variantFor(d, p)"
                class="ml-1 text-[10px] text-ink-muted"
              >
                ·
              </span>
            </button>
          </div>

          <!-- Active variant -->
          <template v-for="p in PLATFORMS" :key="`${d.id}-${p}`">
            <div v-if="activeTabByDraft[d.id] === p && variantFor(d, p)" class="space-y-2">
              <textarea
                :value="variantFor(d, p)!.body"
                rows="6"
                class="w-full rounded border border-divider bg-surface-raised px-3 py-2 text-sm font-mono"
                @input="(e) => { const v = variantFor(d, p)!; v.body = (e.target as HTMLTextAreaElement).value; markDirty(d.id) }"
              />
              <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                <div>
                  <span
                    :class="charCount(variantFor(d, p)!.body, p).over ? 'text-danger font-medium' : ''"
                  >
                    {{ charCount(variantFor(d, p)!.body, p).count }}
                  </span>
                  / {{ charCount(variantFor(d, p)!.body, p).limit }} chars
                  <span v-if="p === 'instagram'" class="ml-2 text-[11px] italic">image required at publish</span>
                </div>
                <div class="flex items-center gap-2">
                  <span
                    v-if="variantFor(d, p)!.hashtags?.length"
                    class="text-[11px]"
                  >
                    {{ variantFor(d, p)!.hashtags!.join(' ') }}
                  </span>
                  <button
                    type="button"
                    class="btn-ghost text-xs"
                    @click="copyVariant(d, p)"
                  >
                    {{ copiedDraft === `${d.id}:${p}` ? '✓ Copied' : 'Copy' }}
                  </button>
                </div>
              </div>
              <p v-if="variantFor(d, p)!.notes" class="text-[11px] italic text-ink-muted">
                {{ variantFor(d, p)!.notes }}
              </p>
            </div>
          </template>
          <div
            v-if="!variantFor(d, activeTabByDraft[d.id] ?? 'twitter')"
            class="text-xs italic text-ink-muted"
          >
            No variant for this platform.
          </div>
        </div>
      </div>
    </section>
    </template>

    <!-- ── Email tab ────────────────────────────────────────────────── -->
    <template v-if="subTab === 'email'">
      <section class="card space-y-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span class="eyebrow">Email Composer</span>
            <h3 class="mt-1 text-base font-semibold text-ink">Compose an email</h3>
            <p class="text-sm text-ink-muted">
              Claude writes structured content using your brand voice; the server renders it into your locked-in design baseline (dark theme, green accents, mobile-friendly). You write the topic; the AI does the rest.
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span v-if="importResult" class="text-[11px] text-ink-muted">{{ importResult }}</span>
            <span v-if="backfillLogResult" class="text-[11px] text-ink-muted">{{ backfillLogResult }}</span>
            <button
              type="button"
              class="btn-ghost text-xs"
              :disabled="backfillingLog"
              @click="backfillFromUfdLog"
            >
              {{ backfillingLog ? 'Backfilling…' : '↓ Backfill log from UFD' }}
            </button>
            <button
              type="button"
              class="btn-secondary text-xs"
              :disabled="importingTemplates"
              @click="importUfdTemplates"
            >
              {{ importingTemplates ? 'Importing…' : '↓ Import UFD templates' }}
            </button>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-3">
          <div class="sm:col-span-2">
            <label class="text-xs font-medium text-ink-muted">Topic</label>
            <input
              v-model="emailTopic"
              type="text"
              class="mt-1 w-full rounded border border-divider bg-surface-raised px-3 py-2 text-sm"
              placeholder="What's the email about? (e.g., 'Day-3 trial: Power Rankings showcase')"
              @keydown.enter.prevent="composeEmail"
            />
          </div>
          <div>
            <label class="text-xs font-medium text-ink-muted">CTA URL (optional)</label>
            <input
              v-model="emailCtaUrl"
              type="url"
              class="mt-1 w-full rounded border border-divider bg-surface-raised px-3 py-2 text-sm"
              placeholder="https://ultimatefantasydashboard.com"
            />
          </div>
        </div>
        <div class="flex items-center justify-end gap-2">
          <button
            type="button"
            class="btn-primary text-sm"
            :disabled="emailGenerating"
            @click="composeEmail"
          >
            {{ emailGenerating ? 'Composing…' : 'Compose' }}
          </button>
        </div>

        <div
          v-if="emailError"
          class="rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {{ emailError }}
        </div>
      </section>

      <!-- Templates Library -->
      <section class="card space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <span class="eyebrow">Library</span>
            <h3 class="mt-1 text-sm font-semibold text-ink">
              Saved templates ({{ emailTemplates.length }})
            </h3>
          </div>
          <span v-if="emailTemplatesLoading" class="text-[11px] text-ink-muted">Loading…</span>
        </div>
        <div
          v-if="!emailTemplatesLoading && emailTemplates.length === 0"
          class="rounded bg-surface-elevated/40 px-3 py-3 text-sm text-ink-muted"
        >
          No templates yet. Click <strong>Import UFD templates</strong> above to bring in the 11 lifecycle emails, or save a draft as a template after composing.
        </div>
        <div
          v-else
          class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        >
          <div
            v-for="t in emailTemplates"
            :key="t.id"
            class="rounded border border-divider bg-surface-elevated/30 px-3 py-2"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1 min-w-0">
                <div class="text-xs font-medium text-ink line-clamp-1">{{ t.name }}</div>
                <div
                  v-if="t.subject"
                  class="text-[11px] text-ink-muted line-clamp-1"
                >
                  {{ t.subject }}
                </div>
                <div v-if="t.key" class="mt-0.5 font-mono text-[10px] text-ink-muted">
                  {{ t.key }}
                </div>
              </div>
              <span
                :class="[
                  'rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase shrink-0',
                  t.status === 'ready' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                ]"
              >
                {{ t.status }}
              </span>
            </div>
            <div class="mt-2 flex flex-wrap gap-1">
              <button
                type="button"
                class="btn-ghost text-[11px]"
                @click="previewedTemplate = t"
              >
                Preview
              </button>
              <button
                type="button"
                class="btn-secondary text-[11px]"
                @click="openSend('template', t.id, t.subject)"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        <!-- Template preview slot -->
        <div
          v-if="previewedTemplate"
          class="rounded border border-divider overflow-hidden bg-[#05060a]"
        >
          <div class="flex items-start justify-between gap-2 bg-surface-raised px-3 py-2 border-b border-divider">
            <div class="text-xs">
              <span class="font-medium text-ink">{{ previewedTemplate.name }}</span>
              <span v-if="previewedTemplate.subject" class="text-ink-muted"> · {{ previewedTemplate.subject }}</span>
            </div>
            <button
              type="button"
              class="text-xs text-ink-muted hover:text-ink"
              @click="previewedTemplate = null"
            >
              ×
            </button>
          </div>
          <iframe
            :srcdoc="previewedTemplate.html ?? ''"
            class="w-full"
            style="height: 540px; border: 0;"
            sandbox=""
            title="Template preview"
          />
        </div>
      </section>

      <section class="grid gap-4 lg:grid-cols-3">
        <!-- Drafts list -->
        <div class="card space-y-2 lg:col-span-1">
          <div class="flex items-center justify-between">
            <span class="eyebrow">Drafts</span>
            <span class="text-[11px] text-ink-muted">{{ emailDrafts.length }}</span>
          </div>
          <div
            v-if="emailDraftsLoading && emailDrafts.length === 0"
            class="py-6 text-center text-xs text-ink-muted"
          >
            Loading…
          </div>
          <div
            v-else-if="emailDrafts.length === 0"
            class="py-6 text-center text-xs text-ink-muted"
          >
            No drafts yet. Compose one above.
          </div>
          <div
            v-else
            class="space-y-1 max-h-[600px] overflow-y-auto"
          >
            <button
              v-for="d in emailDrafts"
              :key="d.id"
              type="button"
              :class="[
                'w-full rounded border px-3 py-2 text-left text-xs',
                previewedEmail?.id === d.id
                  ? 'border-brand bg-brand/5'
                  : 'border-divider hover:bg-surface-elevated',
              ]"
              @click="previewedEmail = d"
            >
              <div class="font-medium text-ink line-clamp-1">
                {{ d.subject || d.topic || 'Untitled' }}
              </div>
              <div class="mt-0.5 text-[11px] text-ink-muted">
                {{ new Date(d.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }}
              </div>
            </button>
          </div>
        </div>

        <!-- Preview pane -->
        <div class="card lg:col-span-2">
          <div v-if="!previewedEmail" class="py-12 text-center text-sm text-ink-muted">
            Select a draft to preview, or compose a new one.
          </div>
          <template v-else>
            <div class="mb-3 flex items-start justify-between gap-3">
              <div class="flex-1">
                <div class="text-[11px] uppercase tracking-wide text-ink-muted">Subject</div>
                <div class="text-sm font-semibold text-ink">{{ previewedEmail.subject }}</div>
                <div
                  v-if="previewedEmail.preview_text"
                  class="mt-0.5 text-xs italic text-ink-muted"
                >
                  {{ previewedEmail.preview_text }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="btn-ghost text-xs"
                  @click="saveDraftAsTemplate(previewedEmail)"
                >
                  Save as template
                </button>
                <button
                  type="button"
                  class="btn-secondary text-xs"
                  @click="openSend('draft', previewedEmail.id, previewedEmail.subject)"
                >
                  Send
                </button>
                <button
                  type="button"
                  class="btn-ghost text-xs text-danger"
                  @click="deleteEmailDraft(previewedEmail.id)"
                >
                  Delete
                </button>
              </div>
            </div>
            <div class="rounded border border-divider overflow-hidden bg-[#05060a]">
              <iframe
                :srcdoc="previewedEmail.html ?? ''"
                class="w-full"
                style="height: 720px; border: 0;"
                sandbox=""
                title="Email preview"
              />
            </div>
          </template>
        </div>
      </section>

      <!-- Sequences (lifecycle automation) -->
      <section class="card space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div>
            <span class="eyebrow">Lifecycle</span>
            <h3 class="mt-1 text-sm font-semibold text-ink">Email Sequences</h3>
            <p class="text-xs text-ink-muted">
              Drip campaigns that fire automatically. Hourly cron runs CommandSite's
              <code class="font-mono text-[11px]">email-sequence-runner</code>; only enabled sequences send.
            </p>
          </div>
          <button
            type="button"
            class="btn-ghost text-xs"
            @click="loadSequences"
          >
            Refresh
          </button>
        </div>

        <div
          v-if="sequencesLoading && sequences.length === 0"
          class="py-4 text-center text-sm text-ink-muted"
        >
          Loading…
        </div>
        <div
          v-else-if="sequences.length === 0"
          class="rounded bg-surface-elevated/40 px-3 py-3 text-sm text-ink-muted"
        >
          No sequences yet. Click <strong>Import UFD templates</strong> above to bring in the trial drip.
        </div>
        <div
          v-for="seq in sequences"
          :key="seq.id"
          class="rounded border border-divider px-3 py-3 space-y-2"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-ink">{{ seq.name }}</span>
                <span class="font-mono text-[11px] text-ink-muted">{{ seq.key }}</span>
                <span
                  :class="[
                    'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase',
                    seq.enabled ? 'bg-success/10 text-success' : 'bg-ink-muted/20 text-ink-muted',
                  ]"
                >
                  {{ seq.enabled ? 'Enabled' : 'Disabled' }}
                </span>
              </div>
              <div class="mt-0.5 text-xs text-ink-muted">
                Cohort: <strong>{{ seq.cohort }}</strong> · Anchor: <code class="font-mono text-[10px]">{{ seq.anchor_field }}</code>
                <span v-if="seq.description"> · {{ seq.description }}</span>
              </div>
            </div>
            <button
              type="button"
              :class="[
                'text-xs',
                seq.enabled ? 'btn-secondary' : 'btn-primary',
              ]"
              :disabled="sequenceTogglingId === seq.id"
              @click="toggleSequence(seq)"
            >
              {{
                sequenceTogglingId === seq.id
                  ? 'Working…'
                  : seq.enabled
                  ? 'Disable'
                  : 'Enable'
              }}
            </button>
          </div>

          <div
            v-if="(sequenceSteps[seq.id]?.length ?? 0) > 0"
            class="overflow-x-auto"
          >
            <table class="w-full text-xs">
              <thead>
                <tr class="border-b border-divider/60 text-left text-[10px] uppercase tracking-wide text-ink-muted">
                  <th class="px-2 py-1 font-medium">#</th>
                  <th class="px-2 py-1 font-medium">Template</th>
                  <th class="px-2 py-1 text-right font-medium">Day</th>
                  <th class="px-2 py-1 text-center font-medium">Skip if paid</th>
                  <th class="px-2 py-1 text-center font-medium">Anchor on expiry</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="step in sequenceSteps[seq.id]"
                  :key="step.id"
                  class="border-b border-divider/40 last:border-b-0"
                >
                  <td class="px-2 py-1 text-ink-muted">{{ step.step_order + 1 }}</td>
                  <td class="px-2 py-1 font-mono text-ink">{{ step.template_key }}</td>
                  <td class="px-2 py-1 text-right text-ink">{{ step.day_offset }}</td>
                  <td class="px-2 py-1 text-center">
                    <span v-if="step.skip_if_paid" class="text-success">✓</span>
                    <span v-else class="text-ink-muted">—</span>
                  </td>
                  <td class="px-2 py-1 text-center">
                    <span v-if="step.use_expiry_date" class="text-[#7C3AED]">✓</span>
                    <span v-else class="text-ink-muted">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- Send log -->
      <section class="card space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div>
            <span class="eyebrow">Audit</span>
            <h3 class="mt-1 text-sm font-semibold text-ink">Send Log (last 100)</h3>
            <p class="text-xs text-ink-muted">
              Every send CommandSite has logged — manual sends + sequence runner + backfilled UFD history.
            </p>
          </div>
          <button
            type="button"
            class="btn-ghost text-xs"
            @click="loadSendLog"
          >
            Refresh
          </button>
        </div>

        <div
          v-if="sendLogLoading && sendLog.length === 0"
          class="py-4 text-center text-sm text-ink-muted"
        >
          Loading…
        </div>
        <div
          v-else-if="sendLog.length === 0"
          class="rounded bg-surface-elevated/40 px-3 py-3 text-sm text-ink-muted"
        >
          No sends logged yet.
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-divider text-left text-xs uppercase tracking-wide text-ink-muted">
                <th class="px-2 py-2 font-medium">When</th>
                <th class="px-2 py-2 font-medium">Recipient</th>
                <th class="px-2 py-2 font-medium">Template</th>
                <th class="px-2 py-2 font-medium">Subject</th>
                <th class="px-2 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in sendLog"
                :key="row.id"
                class="border-b border-divider/60 last:border-b-0"
              >
                <td class="whitespace-nowrap px-2 py-1.5 text-ink-muted text-xs">
                  {{ fmtSendTime(row.sent_at) }}
                </td>
                <td class="whitespace-nowrap px-2 py-1.5 text-ink text-xs">
                  {{ row.recipient }}
                </td>
                <td class="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-ink-muted">
                  {{ row.template_key ?? '—' }}
                </td>
                <td class="px-2 py-1.5 text-ink text-xs line-clamp-1">
                  {{ row.subject ?? '—' }}
                </td>
                <td class="whitespace-nowrap px-2 py-1.5">
                  <span
                    :class="['inline-block rounded-full px-2 py-0.5 text-[10px] font-medium', statusChip(row.status)]"
                    :title="row.error_message ?? ''"
                  >
                    {{ row.status }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <!-- Send-to-cohort modal — opens from template/draft "Send" actions -->
    <div
      v-if="sendOpen"
      class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:p-8"
      @click.self="closeSend"
    >
      <div class="w-full max-w-lg rounded-xl bg-surface-raised shadow-xl">
        <div class="flex items-center justify-between border-b border-divider px-6 py-4">
          <div>
            <h3 class="text-base font-semibold text-ink">Send email</h3>
            <p v-if="sendSource?.subject" class="text-xs text-ink-muted">
              {{ sendSource.subject }}
            </p>
          </div>
          <button type="button" class="btn-ghost text-xs" @click="closeSend">Close</button>
        </div>
        <div class="space-y-4 px-6 py-4">
          <div>
            <label class="text-xs font-medium text-ink-muted">Send to cohort</label>
            <select
              v-model="sendCohort"
              :disabled="!!sendRecipient.trim()"
              class="mt-1 w-full rounded border border-divider bg-surface-raised px-3 py-2 text-sm"
            >
              <option v-for="o in COHORT_OPTIONS" :key="o.value" :value="o.value">
                {{ o.label }}
              </option>
            </select>
          </div>
          <div class="text-center text-[11px] uppercase tracking-wide text-ink-muted">— or —</div>
          <div>
            <label class="text-xs font-medium text-ink-muted">Single recipient</label>
            <input
              v-model="sendRecipient"
              type="email"
              :disabled="!!sendCohort"
              class="mt-1 w-full rounded border border-divider bg-surface-raised px-3 py-2 text-sm"
              placeholder="someone@example.com"
            />
          </div>
          <label class="flex items-center gap-2 text-sm text-ink">
            <input v-model="sendDryRun" type="checkbox" class="h-4 w-4" />
            Dry run (preview recipients without sending)
          </label>
          <div
            v-if="sendError"
            class="rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          >
            {{ sendError }}
          </div>
          <div
            v-if="sendResult"
            class="rounded border border-success/30 bg-success/5 px-3 py-2 text-sm text-success"
          >
            {{ sendResult }}
          </div>
        </div>
        <div class="flex items-center justify-end gap-2 border-t border-divider px-6 py-3">
          <button type="button" class="btn-ghost text-sm" @click="closeSend">Cancel</button>
          <button
            type="button"
            class="btn-primary text-sm"
            :disabled="sendBusy || (!sendCohort && !sendRecipient.trim())"
            @click="executeSend"
          >
            {{ sendBusy ? 'Working…' : sendDryRun ? 'Preview' : 'Send' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
