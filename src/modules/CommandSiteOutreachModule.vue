<script setup lang="ts">
/**
 * CommandSite Outreach — Phase 1: real Ready-to-Send + Sent + Inbox.
 *
 * The actual workbench for sending the cold emails Ada drafted.
 * Drafts come from cs_leads.draft_cold_email_*. Sends get logged
 * to cs_outreach_sends (DB trigger updates cs_leads aggregates).
 * Inbound replies from cs_replies (real or pasted via the manual
 * classifier).
 *
 * Five views:
 *   1. Ready to send — drafts queued up, copy + mark sent per row
 *   2. Sent — history with "days waiting" + mark-as-replied
 *   3. Inbox — replies (real or manually pasted), with classifier
 *   4. Manual reply — paste form to log a reply you got in Gmail
 *   5. Coming next — placeholder for sequences / Smartlead automation
 */
import { computed, ref } from 'vue'
import type { Client, CsLead, CsReply } from '@/types/database'
import AssistantMark from '@/components/AssistantMark.vue'
import LoadingBar from '@/components/LoadingBar.vue'
import CommandSiteAdaActivityStrip from '@/components/CommandSiteAdaActivityStrip.vue'
import { useLeads } from '@/lib/clients/commandsite/leadsApi'
import { useOutreachSends } from '@/lib/clients/commandsite/outreachSendsApi'
import { useReplies, CLASSIFICATION_META } from '@/lib/clients/commandsite/repliesApi'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const { leads, load: reloadLeads } = useLeads()
const { sends, sentToday, sentLastNDays, markSent } = useOutreachSends()
const liveReplies = useReplies()

// ── View state ────────────────────────────────────────────────────────
type View = 'ready' | 'sent' | 'inbox' | 'manual_reply' | 'coming_next'
const view = ref<View>('ready')

// ── Buckets ───────────────────────────────────────────────────────────

/** Leads with a draft + a contact_email + not yet sent. The Ready queue. */
const readyLeads = computed<CsLead[]>(() => {
  return leads.value
    .filter((l) =>
      !!l.draft_cold_email_body
      && !!l.contact_email
      && (l.send_count ?? 0) === 0
      && l.status !== 'archived'
      && l.status !== 'disqualified',
    )
    .sort((a, b) => (b.icp_score ?? 0) - (a.icp_score ?? 0))
})

/** Leads we've already sent to, ordered by most recent send. */
const sentLeads = computed<CsLead[]>(() => {
  return leads.value
    .filter((l) => (l.send_count ?? 0) > 0)
    .sort((a, b) => {
      const ta = a.last_contacted_at ? new Date(a.last_contacted_at).getTime() : 0
      const tb = b.last_contacted_at ? new Date(b.last_contacted_at).getTime() : 0
      return tb - ta
    })
})

/** Sent + no reply yet, > 24h ago. */
const awaitingReplyLeads = computed<CsLead[]>(() => {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
  return sentLeads.value.filter((l) => {
    if (l.status === 'replied') return false
    const t = l.last_contacted_at ? new Date(l.last_contacted_at).getTime() : 0
    return t < oneDayAgo
  })
})

const repliedLeads = computed<CsLead[]>(() => {
  return leads.value.filter((l) => l.status === 'replied')
})

// ── Headline KPIs (real numbers) ─────────────────────────────────────

const kpis = computed(() => {
  const positive = liveReplies.replies.value.filter(
    (r) => r.classification === 'positive' || r.classification === 'interested',
  ).length
  return {
    drafts_ready: readyLeads.value.length,
    sent_today: sentToday.value.length,
    sent_7d: sentLastNDays(7).length,
    sent_total: sends.value.length,
    awaiting_reply: awaitingReplyLeads.value.length,
    replied: repliedLeads.value.length,
    positive_replies: positive,
  }
})

// ── Activity strip items derived from real data ──────────────────────
const recentActivity = computed(() => {
  const items: { icon: string; label: string; detail?: string; ago?: string }[] = []
  if (kpis.value.drafts_ready > 0) {
    items.push({
      icon: '📝',
      label: `${kpis.value.drafts_ready} ${kpis.value.drafts_ready === 1 ? 'draft' : 'drafts'} ready to send`,
      detail: 'Open Ready to send → copy + mark sent per lead',
      ago: 'now',
    })
  }
  if (kpis.value.sent_today > 0) {
    items.push({
      icon: '✉️',
      label: `${kpis.value.sent_today} ${kpis.value.sent_today === 1 ? 'email' : 'emails'} sent today`,
      detail: kpis.value.sent_7d > kpis.value.sent_today
        ? `${kpis.value.sent_7d} this week · ${kpis.value.sent_total} lifetime`
        : `${kpis.value.sent_total} lifetime`,
      ago: 'rolling',
    })
  }
  if (kpis.value.positive_replies > 0) {
    items.push({
      icon: '🟢',
      label: `${kpis.value.positive_replies} positive ${kpis.value.positive_replies === 1 ? 'reply' : 'replies'}`,
      detail: 'Open Inbox → respond + book demos',
      ago: 'rolling',
    })
  } else if (kpis.value.awaiting_reply > 0) {
    items.push({
      icon: '⏳',
      label: `${kpis.value.awaiting_reply} ${kpis.value.awaiting_reply === 1 ? 'lead' : 'leads'} awaiting reply`,
      detail: 'Sent 24h+ ago, no reply yet',
      ago: 'rolling',
    })
  }
  return items
})

// ── Per-row actions (Ready view) ─────────────────────────────────────

const sendingLeadId = ref<string | null>(null)
const flashMsg = ref<string | null>(null)
const errorMsg = ref<string | null>(null)

function flash(msg: string, ms = 4000) {
  flashMsg.value = msg
  setTimeout(() => { flashMsg.value = null }, ms)
}

async function copyEmailToClipboard(lead: CsLead): Promise<boolean> {
  const text = `To: ${lead.contact_email}\nSubject: ${lead.draft_cold_email_subject ?? ''}\n\n${lead.draft_cold_email_body ?? ''}`
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    return true
  }
}

function gmailComposeUrl(lead: CsLead): string {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: lead.contact_email ?? '',
    su: lead.draft_cold_email_subject ?? '',
    body: lead.draft_cold_email_body ?? '',
  })
  return `https://mail.google.com/mail/?${params.toString()}`
}

async function copyAndMark(lead: CsLead) {
  if (sendingLeadId.value) return
  errorMsg.value = null
  await copyEmailToClipboard(lead)

  sendingLeadId.value = lead.id
  const result = await markSent({
    leadId: lead.id,
    subject: lead.draft_cold_email_subject ?? '',
    body: lead.draft_cold_email_body ?? '',
    source: 'manual_gmail',
  })
  sendingLeadId.value = null
  if (!result.ok) {
    errorMsg.value = result.error ?? 'Failed to mark sent'
    return
  }
  await reloadLeads()
  flash(`✓ Copied + marked sent. Paste into Gmail and send. (${lead.company_name})`)
}

async function openComposeAndMark(lead: CsLead) {
  if (sendingLeadId.value) return
  errorMsg.value = null
  // Open Gmail compose in a new tab
  window.open(gmailComposeUrl(lead), '_blank', 'noopener')

  sendingLeadId.value = lead.id
  const result = await markSent({
    leadId: lead.id,
    subject: lead.draft_cold_email_subject ?? '',
    body: lead.draft_cold_email_body ?? '',
    source: 'manual_gmail',
  })
  sendingLeadId.value = null
  if (!result.ok) {
    errorMsg.value = result.error ?? 'Failed to mark sent'
    return
  }
  await reloadLeads()
  flash(`✓ Gmail opened + marked sent (${lead.company_name})`)
}

// ── Manual reply paste form ──────────────────────────────────────────
const manualLeadId = ref<string>('')
const manualFromEmail = ref('')
const manualFromName = ref('')
const manualSubject = ref('')
const manualBody = ref('')
const classifying = ref(false)
const classifyResult = ref<{
  classification: string
  classification_confidence: number
  classification_reason: string
  suggested_reply: string | null
} | null>(null)

const manualLeadOptions = computed(() => {
  return sentLeads.value.map((l) => ({
    id: l.id,
    label: `${l.company_name} · ${l.contact_email}`,
  }))
})

function pickLeadForManual(leadId: string) {
  manualLeadId.value = leadId
  const l = leads.value.find((x) => x.id === leadId)
  if (l) {
    manualFromEmail.value = l.contact_email ?? ''
    manualFromName.value = l.contact_name ?? ''
  }
}

async function classifyManualReply() {
  if (classifying.value) return
  classifying.value = true
  classifyResult.value = null
  errorMsg.value = null
  try {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) {
      errorMsg.value = 'Not signed in'
      return
    }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/classify-manual-reply`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'authorization': `Bearer ${session.access_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        lead_id: manualLeadId.value || undefined,
        from_email: manualFromEmail.value,
        from_name: manualFromName.value || undefined,
        subject: manualSubject.value || undefined,
        body: manualBody.value,
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      errorMsg.value = `${res.status}: ${detail.slice(0, 250)}`
      return
    }
    const data = await res.json()
    classifyResult.value = {
      classification: data.classification,
      classification_confidence: data.classification_confidence,
      classification_reason: data.classification_reason,
      suggested_reply: data.suggested_reply ?? null,
    }
    await Promise.all([reloadLeads(), liveReplies.load()])
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err)
  } finally {
    classifying.value = false
  }
}

function resetManualForm() {
  manualLeadId.value = ''
  manualFromEmail.value = ''
  manualFromName.value = ''
  manualSubject.value = ''
  manualBody.value = ''
  classifyResult.value = null
}

// ── Helpers ──────────────────────────────────────────────────────────

function fmtAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / (60 * 1000))
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  return `${d}d ago`
}
function fmtDays(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const d = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (d === 0) return 'today'
  if (d === 1) return '1 day'
  return `${d} days`
}

const LEAD_INDEX = computed<Map<string, CsLead>>(() => {
  const m = new Map<string, CsLead>()
  for (const l of leads.value) m.set(l.id, l)
  return m
})

function leadForReply(r: CsReply): CsLead | null {
  if (!r.lead_id) return null
  return LEAD_INDEX.value.get(r.lead_id) ?? null
}
</script>

<template>
  <div class="space-y-4">
    <!-- ── Sage activity strip (real data) ──────────────────────────── -->
    <CommandSiteAdaActivityStrip
      tab-key="outreach"
      summary="The send queue + sent history + reply inbox. Phase 1 is manual paste-to-Gmail with one-click 'mark sent.' Sequences + Smartlead automation come next."
      :activity="recentActivity"
    />

    <!-- ── Header ───────────────────────────────────────────────────── -->
    <div class="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h2 class="text-xl font-semibold text-ink">Outreach</h2>
        <p class="text-xs text-ink-muted mt-0.5">
          Send your drafts, log replies, watch the funnel.
        </p>
      </div>
    </div>

    <!-- ── Real KPI strip ──────────────────────────────────────────── -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      <div class="card p-3">
        <div class="kpi-label">Drafts ready</div>
        <div class="text-xl font-semibold tabular-nums text-brand">{{ kpis.drafts_ready }}</div>
      </div>
      <div class="card p-3">
        <div class="kpi-label">Sent today</div>
        <div class="text-xl font-semibold tabular-nums">{{ kpis.sent_today }}</div>
      </div>
      <div class="card p-3">
        <div class="kpi-label">Sent (7d)</div>
        <div class="text-xl font-semibold tabular-nums">{{ kpis.sent_7d }}</div>
      </div>
      <div class="card p-3">
        <div class="kpi-label">Awaiting reply</div>
        <div class="text-xl font-semibold tabular-nums text-warn">{{ kpis.awaiting_reply }}</div>
      </div>
      <div class="card p-3">
        <div class="kpi-label">Replied</div>
        <div class="text-xl font-semibold tabular-nums text-success">{{ kpis.replied }}</div>
      </div>
      <div class="card p-3">
        <div class="kpi-label">Positive replies</div>
        <div class="text-xl font-semibold tabular-nums text-success">{{ kpis.positive_replies }}</div>
      </div>
    </div>

    <!-- ── Status messages ─────────────────────────────────────────── -->
    <div v-if="flashMsg" class="rounded-md bg-success/10 text-success px-3 py-2 text-sm">{{ flashMsg }}</div>
    <div v-if="errorMsg" class="rounded-md bg-danger/10 text-danger px-3 py-2 text-sm">{{ errorMsg }}</div>

    <!-- ── View tabs ───────────────────────────────────────────────── -->
    <div class="card p-2">
      <div class="flex items-center gap-1 flex-wrap">
        <button
          type="button"
          class="rounded-md px-3 py-1.5 text-sm font-semibold transition-colors"
          :class="view === 'ready' ? 'bg-brand text-white' : 'text-ink hover:bg-canvas/50'"
          @click="view = 'ready'"
        >Ready to send <span class="opacity-70">({{ kpis.drafts_ready }})</span></button>
        <button
          type="button"
          class="rounded-md px-3 py-1.5 text-sm font-semibold transition-colors"
          :class="view === 'sent' ? 'bg-brand text-white' : 'text-ink hover:bg-canvas/50'"
          @click="view = 'sent'"
        >Sent <span class="opacity-70">({{ kpis.sent_total }})</span></button>
        <button
          type="button"
          class="rounded-md px-3 py-1.5 text-sm font-semibold transition-colors"
          :class="view === 'inbox' ? 'bg-brand text-white' : 'text-ink hover:bg-canvas/50'"
          @click="view = 'inbox'"
        >Inbox <span class="opacity-70">({{ liveReplies.replies.value.length }})</span></button>
        <button
          type="button"
          class="rounded-md px-3 py-1.5 text-sm font-semibold transition-colors"
          :class="view === 'manual_reply' ? 'bg-brand text-white' : 'text-ink hover:bg-canvas/50'"
          @click="view = 'manual_reply'"
        >+ Log a reply</button>
        <button
          type="button"
          class="rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-canvas/50 ml-auto"
          :class="view === 'coming_next' ? 'bg-canvas text-ink' : ''"
          @click="view = 'coming_next'"
        >Coming next →</button>
      </div>
    </div>

    <!-- ── VIEW: Ready to send ─────────────────────────────────────── -->
    <section v-if="view === 'ready'">
      <div v-if="readyLeads.length === 0" class="card p-8 text-center">
        <p class="text-sm text-ink-muted mb-2">No drafts ready to send.</p>
        <p class="text-xs text-ink-disabled">
          Head to the <strong class="text-ink">Leads tab</strong>, click <strong>Draft cold emails</strong>, then come back here.
        </p>
      </div>
      <div v-else class="card p-0 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-canvas text-[10px] font-semibold text-ink-muted uppercase tracking-wide">
              <tr>
                <th class="px-3 py-2 text-left w-12">Score</th>
                <th class="px-3 py-2 text-left">Lead</th>
                <th class="px-3 py-2 text-left">Subject</th>
                <th class="px-3 py-2 text-left">Body preview</th>
                <th class="px-3 py-2 text-right">Send</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-divider">
              <tr v-for="lead in readyLeads" :key="lead.id" class="hover:bg-canvas/30 align-top">
                <td class="px-3 py-3">
                  <span
                    class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
                    :class="(lead.icp_score ?? 0) >= 80 ? 'bg-success/15 text-success' : (lead.icp_score ?? 0) >= 60 ? 'bg-warn/15 text-warn' : 'bg-ink-muted/15 text-ink-muted'"
                  >{{ lead.icp_score ?? '—' }}</span>
                </td>
                <td class="px-3 py-3">
                  <div class="text-ink font-semibold text-sm">{{ lead.company_name }}</div>
                  <div class="text-[11px] text-ink-muted font-mono">{{ lead.contact_email }}</div>
                  <div class="text-[10px] text-ink-disabled">{{ lead.industry || '—' }}{{ lead.city ? ' · ' + lead.city : '' }}</div>
                </td>
                <td class="px-3 py-3 text-ink text-sm font-medium">{{ lead.draft_cold_email_subject || '—' }}</td>
                <td class="px-3 py-3 text-ink-muted text-xs leading-snug max-w-[380px]">
                  {{ (lead.draft_cold_email_body ?? '').slice(0, 200) }}{{ (lead.draft_cold_email_body ?? '').length > 200 ? '…' : '' }}
                </td>
                <td class="px-3 py-3 text-right whitespace-nowrap">
                  <div class="inline-flex flex-col gap-1 items-end">
                    <button
                      type="button"
                      class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                      :disabled="sendingLeadId === lead.id"
                      @click="openComposeAndMark(lead)"
                    >
                      {{ sendingLeadId === lead.id ? 'Marking…' : 'Open Gmail + mark sent' }}
                    </button>
                    <button
                      type="button"
                      class="text-[11px] text-brand hover:underline"
                      :disabled="sendingLeadId === lead.id"
                      @click="copyAndMark(lead)"
                    >Or copy + mark sent</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ── VIEW: Sent ──────────────────────────────────────────────── -->
    <section v-if="view === 'sent'">
      <div v-if="sentLeads.length === 0" class="card p-8 text-center">
        <p class="text-sm text-ink-muted">Nothing sent yet.</p>
      </div>
      <div v-else class="card p-0 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-canvas text-[10px] font-semibold text-ink-muted uppercase tracking-wide">
              <tr>
                <th class="px-3 py-2 text-left">Lead</th>
                <th class="px-3 py-2 text-left">Subject</th>
                <th class="px-3 py-2 text-left">Sent</th>
                <th class="px-3 py-2 text-left">Status</th>
                <th class="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-divider">
              <tr v-for="lead in sentLeads" :key="lead.id" class="hover:bg-canvas/30">
                <td class="px-3 py-2">
                  <div class="text-ink font-semibold text-sm">{{ lead.company_name }}</div>
                  <div class="text-[11px] text-ink-muted font-mono">{{ lead.contact_email }}</div>
                </td>
                <td class="px-3 py-2 text-ink text-sm">{{ lead.draft_cold_email_subject || '—' }}</td>
                <td class="px-3 py-2 text-xs text-ink-muted">
                  <div>{{ lead.last_contacted_at ? fmtAge(lead.last_contacted_at) : '—' }}</div>
                  <div v-if="lead.send_count && lead.send_count > 1" class="text-[10px] text-ink-disabled">
                    {{ lead.send_count }} touches total
                  </div>
                </td>
                <td class="px-3 py-2">
                  <span
                    v-if="lead.status === 'replied'"
                    class="inline-flex items-center gap-1 rounded-full bg-success/15 text-success px-2 py-0.5 text-[10px] font-semibold"
                  >
                    <span class="h-1.5 w-1.5 rounded-full bg-success" />
                    Replied
                  </span>
                  <span
                    v-else-if="lead.last_contacted_at && (Date.now() - new Date(lead.last_contacted_at).getTime()) > 24 * 60 * 60 * 1000"
                    class="inline-flex items-center gap-1 rounded-full bg-warn/15 text-warn px-2 py-0.5 text-[10px] font-semibold"
                  >
                    Awaiting · {{ lead.last_contacted_at ? fmtDays(lead.last_contacted_at) : '' }}
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[10px] font-semibold"
                  >Sent</span>
                </td>
                <td class="px-3 py-2 text-right">
                  <button
                    v-if="lead.status !== 'replied'"
                    type="button"
                    class="text-xs text-brand font-medium hover:underline"
                    @click="view = 'manual_reply'; pickLeadForManual(lead.id)"
                  >Log a reply</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ── VIEW: Inbox (replies, real or manually pasted) ──────────── -->
    <section v-if="view === 'inbox'">
      <div v-if="liveReplies.loading.value" class="card p-4">
        <LoadingBar message="Loading replies…" />
      </div>
      <div v-else-if="liveReplies.replies.value.length === 0" class="card p-8 text-center">
        <p class="text-sm text-ink-muted mb-2">No replies yet.</p>
        <p class="text-xs text-ink-disabled">
          When you get a reply in Gmail, switch to <strong class="text-ink">+ Log a reply</strong> and paste it. Sage classifies + tracks.
        </p>
      </div>
      <div v-else class="space-y-3">
        <div
          v-for="r in liveReplies.replies.value"
          :key="r.id"
          class="card p-4"
        >
          <div class="flex items-start justify-between gap-3 mb-2">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap mb-0.5">
                <span class="font-semibold text-ink text-sm">{{ r.from_name || r.from_email }}</span>
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  :class="CLASSIFICATION_META[r.classification ?? 'unclassified'].pillClass"
                >{{ CLASSIFICATION_META[r.classification ?? 'unclassified'].label }}</span>
                <span class="text-[10px] text-ink-disabled">{{ Math.round((r.classification_confidence ?? 0) * 100) }}% conf</span>
              </div>
              <div class="text-[11px] text-ink-muted">
                {{ r.subject || '(no subject)' }}
                <span v-if="leadForReply(r)" class="ml-2">· {{ leadForReply(r)?.company_name }}</span>
                · {{ fmtAge(r.received_at) }}
              </div>
            </div>
          </div>
          <div class="text-sm text-ink leading-relaxed whitespace-pre-wrap">{{ r.body }}</div>
          <div v-if="r.classification_reason" class="mt-2 text-[11px] text-ink-muted italic">
            <strong>Why {{ CLASSIFICATION_META[r.classification ?? 'unclassified'].label.toLowerCase() }}:</strong>
            {{ r.classification_reason }}
          </div>
          <div
            v-if="r.drafted_response"
            class="mt-3 rounded-card border border-brand/15 bg-brand/5 p-3"
          >
            <div class="text-[10px] font-semibold uppercase tracking-wider text-brand mb-1 inline-flex items-center gap-1">
              <AssistantMark class="h-3 w-3 text-brand" />
              Sage's drafted reply
            </div>
            <p class="text-sm text-ink leading-relaxed whitespace-pre-wrap italic">"{{ r.drafted_response }}"</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── VIEW: Manual reply (paste) ──────────────────────────────── -->
    <section v-if="view === 'manual_reply'" class="space-y-4">
      <div class="card p-4">
        <h3 class="text-sm font-semibold text-ink mb-2">
          Paste a reply you got in Gmail
        </h3>
        <p class="text-xs text-ink-muted mb-3">
          Sage classifies it (positive / objection / OOF / etc.) + drafts a suggested reply for the right categories.
        </p>

        <div class="space-y-3">
          <div>
            <label class="block text-xs font-semibold text-ink mb-1.5">Lead (who replied)</label>
            <select
              :value="manualLeadId"
              class="input"
              @change="pickLeadForManual(($event.target as HTMLSelectElement).value)"
            >
              <option value="">— pick a lead from sent —</option>
              <option v-for="opt in manualLeadOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
            </select>
          </div>

          <div class="grid sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-ink mb-1.5">From email</label>
              <input v-model="manualFromEmail" type="email" class="input" placeholder="maria@sunshineplumbing.co" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-ink mb-1.5">From name (optional)</label>
              <input v-model="manualFromName" type="text" class="input" placeholder="Maria Castillo" />
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-ink mb-1.5">Subject (optional)</label>
            <input v-model="manualSubject" type="text" class="input" placeholder="Re: quick question for maria" />
          </div>

          <div>
            <label class="block text-xs font-semibold text-ink mb-1.5">Reply body</label>
            <textarea
              v-model="manualBody"
              rows="6"
              class="input font-sans text-sm"
              placeholder="Paste the full email body here…"
            />
          </div>

          <div class="flex items-center justify-end gap-2">
            <button
              type="button"
              class="btn-ghost !text-sm"
              :disabled="classifying"
              @click="resetManualForm"
            >Reset</button>
            <button
              type="button"
              class="btn-primary !text-sm inline-flex items-center gap-1.5"
              :disabled="classifying || !manualFromEmail || !manualBody"
              @click="classifyManualReply"
            >
              <AssistantMark class="h-3.5 w-3.5 text-white" />
              {{ classifying ? 'Sage is classifying…' : 'Classify + log reply' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Classification result -->
      <div v-if="classifyResult" class="card p-4 border-brand/30">
        <div class="flex items-center gap-2 flex-wrap mb-3">
          <AssistantMark class="h-5 w-5 text-brand" />
          <span class="text-sm font-semibold text-ink">Sage classified this as:</span>
          <span
            class="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
            :class="CLASSIFICATION_META[(classifyResult.classification as keyof typeof CLASSIFICATION_META)]?.pillClass ?? 'bg-ink-muted/10 text-ink-muted'"
          >{{ classifyResult.classification }}</span>
          <span class="text-[11px] text-ink-muted">{{ Math.round(classifyResult.classification_confidence * 100) }}% confidence</span>
        </div>
        <p class="text-xs text-ink-muted italic mb-3">
          <strong>Why:</strong> {{ classifyResult.classification_reason }}
        </p>
        <div v-if="classifyResult.suggested_reply" class="rounded-card border border-brand/15 bg-brand/5 p-3">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-brand mb-1">Sage's suggested reply</div>
          <p class="text-sm text-ink leading-relaxed whitespace-pre-wrap">"{{ classifyResult.suggested_reply }}"</p>
          <p class="text-[10px] text-ink-muted mt-2 italic">
            Copy + paste into Gmail to respond. (Auto-send via Smartlead is Phase 3.)
          </p>
        </div>
      </div>
    </section>

    <!-- ── VIEW: Coming next ──────────────────────────────────────── -->
    <section v-if="view === 'coming_next'" class="card p-6">
      <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-2">Coming next</div>
      <h3 class="text-base font-semibold text-ink mb-3">Sequences · Smartlead automation · Demos · Deliverability</h3>
      <ul class="space-y-2 text-sm text-ink-muted">
        <li>📧 <strong class="text-ink">Sequences</strong> — multi-touch cadences (day 1 cold + day 3 follow-up + day 7 breakup), AI-drafted per lead from current data</li>
        <li>🚀 <strong class="text-ink">Smartlead automation</strong> — push leads into Smartlead campaigns via API, their webhook returns replies to our classifier</li>
        <li>🤖 <strong class="text-ink">Auto-handle</strong> — high-confidence positives auto-create deal in pipeline + draft Calendly reply for one-click approval</li>
        <li>📊 <strong class="text-ink">Demos booked</strong> — Calendly webhook → cs_deals show up here with show-up tracking</li>
        <li>📬 <strong class="text-ink">Deliverability</strong> — sending domain health, suppression list, bounce + spam monitoring</li>
      </ul>
      <p class="text-xs text-ink-disabled mt-4 italic">
        Build order depends on first-batch results — Phase 3 (Smartlead) is next once we know the message works.
      </p>
    </section>
  </div>
</template>
