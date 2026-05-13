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
import { computed, onMounted, ref } from 'vue'
import type { Client, CsLead, CsReply } from '@/types/database'
import AssistantMark from '@/components/AssistantMark.vue'
import LoadingBar from '@/components/LoadingBar.vue'
import CommandSiteDemoLinkModal from '@/components/CommandSiteDemoLinkModal.vue'
import CommandSiteLogManualDemoModal from '@/components/CommandSiteLogManualDemoModal.vue'
import CommandSiteLeadEditDrawer from '@/components/CommandSiteLeadEditDrawer.vue'
import CommandSiteDealEditDrawer from '@/components/CommandSiteDealEditDrawer.vue'
import CommandSiteOutreachApprovalQueue from '@/components/CommandSiteOutreachApprovalQueue.vue'
import CommandSiteOutreachEditDraftModal from '@/components/CommandSiteOutreachEditDraftModal.vue'
import { useLeads } from '@/lib/clients/commandsite/leadsApi'
import { useOutreachSends } from '@/lib/clients/commandsite/outreachSendsApi'
import { useReplies, CLASSIFICATION_META } from '@/lib/clients/commandsite/repliesApi'
import { useDiscovery, type DiscoveryDeal } from '@/lib/clients/commandsite/discoveryApi'
import { useDeals } from '@/lib/clients/commandsite/dealsApi'
import { useAutoOutreach } from '@/lib/clients/commandsite/useAutoOutreach'
import { useOutreachRealtime } from '@/lib/clients/commandsite/useOutreachRealtime'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'
import GraceLiveTicker from '@/components/grace/GraceLiveTicker.vue'
import { useToasts } from '@/components/grace/useToasts'
import { useAssistantChat } from '@/components/grace/useGraceChat'

defineProps<{ client: Client; config: Record<string, unknown> }>()

const { leads, load: reloadLeads, updateLead, deleteLead } = useLeads()
const { sends, sentToday, sentLastNDays, markSent } = useOutreachSends()
const liveReplies = useReplies()
const dealsApi = useDeals()

// ── Edit drawers + manual demo modal state ────────────────────────────
const editingLead = ref<CsLead | null>(null)
const editingDeal = ref<DiscoveryDeal | null>(null)
const logManualDemoOpen = ref(false)

function openLeadEditor(lead: CsLead) {
  editingLead.value = lead
}
function closeLeadEditor() {
  editingLead.value = null
}
async function onLeadSave(input: { id: string; fields: Record<string, unknown> }) {
  const result = await updateLead(input.id, input.fields)
  if (result.ok) {
    closeLeadEditor()
    await reloadLeads()
  } else {
    errorMsg.value = result.error ?? 'Failed to save lead'
  }
}
async function onLeadDelete(id: string) {
  const result = await deleteLead(id)
  if (result.ok) {
    closeLeadEditor()
    await reloadLeads()
  } else {
    errorMsg.value = result.error ?? 'Failed to delete lead'
  }
}

function openDealEditor(deal: DiscoveryDeal) {
  // Cast — DiscoveryDeal has the same shape we need for editing
  editingDeal.value = deal
}
function closeDealEditor() {
  editingDeal.value = null
}
async function onDealSave(input: { id: string; fields: Record<string, unknown> }) {
  const result = await dealsApi.updateDeal(input.id, input.fields as never)
  if (result.ok) {
    closeDealEditor()
    await Promise.all([discovery.load(), dealsApi.load()])
  } else {
    errorMsg.value = result.error ?? 'Failed to save deal'
  }
}
async function onDealDelete(id: string) {
  try {
    await dealsApi.deleteDeal(id)
    closeDealEditor()
    await Promise.all([discovery.load(), dealsApi.load()])
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e)
  }
}

async function onManualDemoSaved() {
  logManualDemoOpen.value = false
  await Promise.all([discovery.load(), dealsApi.load(), reloadLeads()])
}

// ── View state ────────────────────────────────────────────────────────
type View = 'pipeline' | 'ready' | 'sent' | 'inbox' | 'manual_reply' | 'demos' | 'coming_next'
const view = ref<View>('pipeline')

// Discovery / Demos
const discovery = useDiscovery()

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

// ── Tracking analytics (signal-based, decision-grade) ────────────────
//
// These are the numbers worth steering by. Each is grounded in a hard
// event (a reply landed, a bounce was caught, a demo was booked) — not
// soft signals like opens which are unreliable in 2026.

interface TrackingAnalytics {
  total_sent: number              // distinct sends in the period
  total_replies: number           // any reply
  positive_replies: number        // positive + interested
  bounces: number                 // mailer-daemon catches
  demos_booked: number            // cs_deals.lead_id matches
  reply_rate: number              // 0..1
  positive_rate: number           // 0..1, positive ÷ sent
  bounce_rate: number             // 0..1
  demo_rate: number               // 0..1
  median_hours_to_reply: number | null
}

function safeRate(numer: number, denom: number): number {
  if (denom === 0) return 0
  return numer / denom
}

function analyticsForWindow(days: number): TrackingAnalytics {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const windowSends = sends.value.filter((s) => new Date(s.sent_at).getTime() >= cutoff)
  const totalSent = windowSends.length
  const sentLeadIds = new Set(windowSends.map((s) => s.lead_id))

  // Replies linked to leads we sent to in this window
  const windowReplies = liveReplies.replies.value.filter(
    (r) => r.lead_id && sentLeadIds.has(r.lead_id),
  )
  const totalReplies = windowReplies.length
  const positive = windowReplies.filter(
    (r) => r.classification === 'positive' || r.classification === 'interested',
  ).length

  // Bounces — leads in our send window where bounced_at landed after the send
  const bounces = leads.value.filter((l) => {
    if (!l.bounced_at || !sentLeadIds.has(l.id)) return false
    return new Date(l.bounced_at).getTime() >= cutoff
  }).length

  // Demos booked from these leads (cs_deals.lead_id matching)
  const dealLeadIds = new Set(
    dealsApi.deals.value.map((d) => (d as { lead_id?: string }).lead_id).filter(Boolean) as string[],
  )
  const demos = [...sentLeadIds].filter((id) => dealLeadIds.has(id)).length

  // Median hours to reply — for replies in window, take time delta from
  // the lead's last_contacted_at to received_at.
  const deltas: number[] = []
  for (const r of windowReplies) {
    const lead = leads.value.find((l) => l.id === r.lead_id)
    if (!lead?.last_contacted_at) continue
    const dt = new Date(r.received_at).getTime() - new Date(lead.last_contacted_at).getTime()
    if (dt > 0) deltas.push(dt / (1000 * 60 * 60))
  }
  deltas.sort((a, b) => a - b)
  const median = deltas.length > 0
    ? deltas[Math.floor(deltas.length / 2)]
    : null

  return {
    total_sent: totalSent,
    total_replies: totalReplies,
    positive_replies: positive,
    bounces,
    demos_booked: demos,
    reply_rate: safeRate(totalReplies, totalSent),
    positive_rate: safeRate(positive, totalSent),
    bounce_rate: safeRate(bounces, totalSent),
    demo_rate: safeRate(demos, totalSent),
    median_hours_to_reply: median,
  }
}

const analytics7d = computed(() => analyticsForWindow(7))
const analytics30d = computed(() => analyticsForWindow(30))
const analyticsAll = computed(() => analyticsForWindow(365))

function fmtPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function fmtHours(h: number | null): string {
  if (h === null) return '—'
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 24) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

// ── Live ticker + chat hooks (grace primitives) ──────────────────────
const outreachTicker = ref<InstanceType<typeof GraceLiveTicker> | null>(null)
const outreachToasts = useToasts()
const outreachChat = useAssistantChat()

// ── Auto-outreach chain (score → draft → approval queue → send) ───────
// onEvent forwards chain narration onto the visible ticker.
const auto = useAutoOutreach({
  onEvent: (icon, text) => outreachTicker.value?.pushEvent({ icon, text }),
})

const editingDraftLead = ref<CsLead | null>(null)
function openDraftEditor(lead: CsLead) {
  editingDraftLead.value = lead
}
function closeDraftEditor() {
  editingDraftLead.value = null
}
async function onDraftSave(payload: { id: string; subject: string; body: string }) {
  const r = await auto.saveEdit(payload.id, payload.subject, payload.body)
  if (r.ok) {
    outreachToasts.push('✓ Draft saved — still in queue', 'success')
    closeDraftEditor()
  } else {
    errorMsg.value = r.error ?? 'Failed to save draft'
  }
}
async function onDraftSaveAndApprove(payload: { id: string; subject: string; body: string }) {
  const saveRes = await auto.saveEdit(payload.id, payload.subject, payload.body)
  if (!saveRes.ok) {
    errorMsg.value = saveRes.error ?? 'Failed to save draft'
    return
  }
  // Find the fresh lead from the composable's state so we pass the
  // updated subject/body to approve()
  const fresh = auto.leads.value.find((l) => l.id === payload.id)
  if (!fresh) return
  const approveRes = await auto.approve(fresh)
  if (approveRes.ok) {
    outreachToasts.push(`✓ Sent to ${fresh.contact_name || fresh.company_name}`, 'success')
    closeDraftEditor()
  } else {
    errorMsg.value = approveRes.error ?? 'Failed to send'
  }
}
async function onApprove(lead: CsLead) {
  const r = await auto.approve(lead)
  if (r.ok) {
    outreachToasts.push(`✓ Sent to ${lead.contact_name || lead.company_name}`, 'success')
  } else {
    errorMsg.value = r.error ?? 'Failed to send'
  }
}
async function onSkip(lead: CsLead) {
  const r = await auto.skip(lead)
  if (r.ok) outreachToasts.push('Skipped — draft archived as rejected', 'info')
  else errorMsg.value = r.error ?? 'Failed to skip'
}
async function onApproveAll() {
  const { sent, failed } = await auto.approveAll()
  if (sent > 0) outreachToasts.push(`✓ Sent ${sent} ${sent === 1 ? 'email' : 'emails'}`, 'success')
  if (failed > 0) outreachToasts.push(`${failed} failed — check Inbox`, 'warn')
}
async function onAutoApproveToggle(value: boolean) {
  await auto.setAutoApprove(value)
  outreachToasts.push(
    value ? 'Auto-approve ON — drafts will send without you' : 'Auto-approve OFF — back to manual',
    'info',
  )
}

const tickerSeed = computed(() => {
  const events: { icon: string; text: string; ageSec: number }[] = []
  const now = Date.now()

  // Recent sends
  for (const s of sends.value.slice(0, 3)) {
    const lead = leads.value.find((l) => l.id === s.lead_id)
    const co = lead?.contact_name || lead?.company_name || 'lead'
    const ageSec = Math.floor((now - new Date(s.sent_at).getTime()) / 1000)
    const verb = s.source === 'auto_approve' ? 'Auto-sent' : 'Sent'
    events.push({ icon: '📤', text: `${verb} to ${co}`, ageSec })
  }
  // Recent replies
  for (const r of liveReplies.replies.value.slice(0, 3)) {
    const lead = leads.value.find((l) => l.id === r.lead_id)
    const co = lead?.contact_name || lead?.company_name || 'lead'
    const ageSec = Math.floor((now - new Date(r.received_at).getTime()) / 1000)
    const tone = r.classification === 'positive' ? '✅' : r.classification === 'objection' ? '🤔' : '💬'
    events.push({ icon: tone, text: `Reply from ${co} — ${r.classification ?? 'pending'}`, ageSec })
  }
  if (events.length === 0) {
    return [{ icon: '🤖', text: 'Auto-draft cron running every 5 min — events will land here as they happen', ageSec: 0 }]
  }
  return events.sort((a, b) => a.ageSec - b.ageSec).slice(0, 6)
})

// Empty pool — the ticker is purely real-event now. Drift comes from
// the live polling in useOutreachRealtime, not a hardcoded cycle.
const tickerPool: { icon: string; text: string }[] = []

// Real-time event feeder. Seeds cursors from the most recent rows we
// already have so the first poll only catches truly-new arrivals.
const realtime = useOutreachRealtime(() => outreachTicker.value)

onMounted(() => {
  // Seed once the initial loads settle. We use the most-recent
  // timestamp from each stream — anything newer than these on the next
  // poll counts as a real new event worth narrating.
  const lastSendAt = sends.value[0]?.sent_at ?? null
  const lastReplyAt = liveReplies.replies.value[0]?.received_at ?? null
  const lastDraftAt = leads.value
    .filter((l) => l.draft_cold_email_at)
    .map((l) => l.draft_cold_email_at!)
    .sort()
    .pop() ?? null
  // Deals cursor stays at "now" (set on composable mount) — first poll
  // picks up only deals booked after page open. Good enough for now.
  realtime.seedCursors({ lastSendAt, lastReplyAt, lastDraftAt })
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

  // Live ticker + chat acknowledgment from Ada
  outreachTicker.value?.pushEvent({ icon: '📤', text: `Sent to ${lead.company_name} — marked + logged` })
  outreachToasts.push(`✓ Done — sent to ${lead.company_name}`, 'success')
  outreachChat.addAiMessage(
    `Sent to ${lead.company_name}. Logged in cs_outreach_sends, status flipped to 'contacted'. If they don't reply in 3 days, the followup cron will draft Touch 2 automatically — surfaces here in your Ready queue.`,
  )
}

// ── Manual reply paste form (uses draft-reply, the adaptive drafter) ─
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
  drafted_response: string
  suggested_action: string
  reasoning: string
} | null>(null)
const editedDraftResponse = ref('')

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
  if (!manualLeadId.value) {
    errorMsg.value = 'Pick a lead first — Ada needs the conversation context.'
    return
  }
  classifying.value = true
  classifyResult.value = null
  errorMsg.value = null
  try {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) {
      errorMsg.value = 'Not signed in'
      return
    }
    // Phase 2: use the new adaptive drafter with full conversation
    // history + KB injected, NOT the basic classifier.
    const res = await fetch(`${SUPABASE_URL}/functions/v1/draft-reply`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'authorization': `Bearer ${session.access_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        lead_id: manualLeadId.value,
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
      drafted_response: data.drafted_response,
      suggested_action: data.suggested_action,
      reasoning: data.reasoning,
    }
    editedDraftResponse.value = data.drafted_response
    await Promise.all([reloadLeads(), liveReplies.load()])
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err)
  } finally {
    classifying.value = false
  }
}

async function copyDraftedReply() {
  if (!classifyResult.value) return
  try {
    await navigator.clipboard.writeText(editedDraftResponse.value)
    flash('✓ Drafted reply copied. Paste into Gmail to respond.')
  } catch {
    const ta = document.createElement('textarea')
    ta.value = editedDraftResponse.value
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    flash('✓ Drafted reply copied.')
  }
}

async function regenerateDraft() {
  // Re-run the same classify (it'll pick up any new context). For now
  // just reruns — Phase 3 polish: pass a "make it different" hint.
  await classifyManualReply()
}

function resetManualForm() {
  manualLeadId.value = ''
  manualFromEmail.value = ''
  manualFromName.value = ''
  manualSubject.value = ''
  manualBody.value = ''
  classifyResult.value = null
  editedDraftResponse.value = ''
  rawPastedEmail.value = ''
  parseStatus.value = null
}

// ── Raw-email paste + parser ─────────────────────────────────────────
// Lets Josh paste the entire raw Gmail reply (headers + body + quote)
// and we extract From email/name, Subject, Body, then auto-match the
// lead from sent leads. Saves ~30s per reply on dropdown scrolling.

const rawPastedEmail = ref('')
const parseStatus = ref<{ ok: boolean; message: string } | null>(null)

function parseRawEmail(raw: string): {
  fromEmail?: string
  fromName?: string
  subject?: string
  body?: string
} {
  const out: { fromEmail?: string; fromName?: string; subject?: string; body?: string } = {}

  // From header — handle both "Name <email>" and bare email
  const fromMatch = raw.match(/^\s*From:\s*(?:"?([^"<\n]+?)"?\s*)?<?([\w.+-]+@[\w.-]+\.[a-zA-Z]+)>?/im)
  if (fromMatch) {
    if (fromMatch[1]) out.fromName = fromMatch[1].trim()
    out.fromEmail = fromMatch[2].toLowerCase()
  } else {
    // Fallback: any email address that's not Josh's
    const emailMatch = raw.match(/<?([\w.+-]+@[\w.-]+\.[a-zA-Z]+)>?/)
    if (emailMatch) out.fromEmail = emailMatch[1].toLowerCase()
  }

  const subjectMatch = raw.match(/^\s*Subject:\s*(.+)$/im)
  if (subjectMatch) out.subject = subjectMatch[1].trim()

  // Body: strip headers, strip "On X wrote:" + quoted lines
  let body = raw
  body = body.replace(/^(From|To|Date|Subject|Cc|Bcc|Reply-To|Sent|Message-ID|MIME-Version|Content-Type|Content-Transfer-Encoding):\s*.*$/gim, '')
  body = body.replace(/On\s+[^\n]+\s+wrote:[\s\S]*$/m, '')
  body = body.split('\n').filter((l) => !l.trim().startsWith('>')).join('\n')
  body = body.replace(/\n{3,}/g, '\n\n').trim()
  if (body) out.body = body

  return out
}

function findLeadByEmail(email: string): string | null {
  const e = email.toLowerCase().trim()
  const lead = sentLeads.value.find((l) => (l.contact_email ?? '').toLowerCase().trim() === e)
  return lead?.id ?? null
}

function parseAndAutofill() {
  parseStatus.value = null
  const raw = rawPastedEmail.value.trim()
  if (!raw) {
    parseStatus.value = { ok: false, message: 'Paste a Gmail reply (with headers + body) above first.' }
    return
  }
  const parsed = parseRawEmail(raw)
  if (!parsed.fromEmail) {
    parseStatus.value = { ok: false, message: 'Could not find a From: email. Paste the full raw email including headers.' }
    return
  }

  manualFromEmail.value = parsed.fromEmail
  if (parsed.fromName) manualFromName.value = parsed.fromName
  if (parsed.subject) manualSubject.value = parsed.subject
  if (parsed.body) manualBody.value = parsed.body

  // Auto-match lead from sent
  const matchedId = findLeadByEmail(parsed.fromEmail)
  if (matchedId) {
    manualLeadId.value = matchedId
    parseStatus.value = { ok: true, message: `✓ Auto-filled and matched lead by ${parsed.fromEmail}` }
  } else {
    parseStatus.value = {
      ok: false,
      message: `Auto-filled, but no sent lead matches ${parsed.fromEmail}. Pick the lead manually below.`,
    }
  }
}

// ── Pipeline view: kanban stages from cs_leads.status + send_count ──

interface PipelineStage {
  key: string
  label: string
  toneClass: string
  filter: (l: CsLead) => boolean
}

const PIPELINE_STAGES: PipelineStage[] = [
  {
    key: 'new', label: 'New', toneClass: 'border-ink-muted/30',
    filter: (l) => (l.status === 'new' || l.status === 'queued') && (l.send_count ?? 0) === 0
      && !!l.draft_cold_email_body && !!l.contact_email,
  },
  {
    key: 'touch_1', label: 'Touch 1 sent', toneClass: 'border-brand/30',
    filter: (l) => l.status === 'contacted' && (l.send_count ?? 0) === 1,
  },
  {
    key: 'touch_2', label: 'Touch 2 sent', toneClass: 'border-brand/30',
    filter: (l) => l.status === 'contacted' && (l.send_count ?? 0) === 2,
  },
  {
    key: 'touch_3plus', label: 'Touch 3+ sent', toneClass: 'border-brand/30',
    filter: (l) => l.status === 'contacted' && (l.send_count ?? 0) >= 3,
  },
  {
    key: 'replied', label: 'Replied', toneClass: 'border-success/30',
    filter: (l) => l.status === 'replied',
  },
  {
    key: 'pipeline', label: 'In pipeline', toneClass: 'border-success/40',
    filter: (l) => l.status === 'promoted_to_pipeline',
  },
  {
    key: 'closed', label: 'Disqualified / Archived', toneClass: 'border-ink-muted/20',
    filter: (l) => l.status === 'disqualified' || l.status === 'archived',
  },
]

const stageBuckets = computed<Record<string, CsLead[]>>(() => {
  const out: Record<string, CsLead[]> = {}
  for (const s of PIPELINE_STAGES) {
    out[s.key] = leads.value.filter(s.filter)
      .sort((a, b) => (b.icp_score ?? 0) - (a.icp_score ?? 0))
  }
  return out
})

function fmtLastAction(l: CsLead): string {
  if (l.status === 'replied') return 'replied'
  if (l.last_contacted_at) return `sent ${fmtAge(l.last_contacted_at)}`
  return 'no activity'
}

function jumpToLeadInManualReply(leadId: string) {
  view.value = 'manual_reply'
  pickLeadForManual(leadId)
}

// ── Demos view handlers ─────────────────────────────────────────────

const briefError = ref<string | null>(null)
async function onGenerateBrief(dealId: string) {
  briefError.value = null
  const r = await discovery.generateBrief(dealId)
  if (!r.ok) {
    briefError.value = r.error ?? 'Failed to generate brief'
    setTimeout(() => { briefError.value = null }, 8000)
  }
}

// Per-deal post-call form state — keyed by deal id so multiple cards
// can hold their own form drafts simultaneously
const postCallForms = ref<Record<string, {
  interest_level: 'hot' | 'warm' | 'lukewarm' | 'cold'
  specific_concern: string
  next_step: string
  extra_notes: string
  expanded: boolean
}>>({})

function ensureForm(dealId: string) {
  if (!postCallForms.value[dealId]) {
    postCallForms.value[dealId] = {
      interest_level: 'warm',
      specific_concern: '',
      next_step: '',
      extra_notes: '',
      expanded: false,
    }
  }
}

function togglePostCallForm(dealId: string) {
  ensureForm(dealId)
  postCallForms.value[dealId].expanded = !postCallForms.value[dealId].expanded
}

const followupResult = ref<Record<string, { subject: string; body: string }>>({})
const followupError = ref<string | null>(null)

async function onDraftFollowup(deal: DiscoveryDeal) {
  ensureForm(deal.id)
  const f = postCallForms.value[deal.id]
  if (!f.next_step.trim()) {
    followupError.value = 'Add a next-step note before drafting.'
    setTimeout(() => { followupError.value = null }, 5000)
    return
  }
  followupError.value = null
  const r = await discovery.draftFollowup({
    deal_id: deal.id,
    interest_level: f.interest_level,
    specific_concern: f.specific_concern || undefined,
    next_step: f.next_step,
    extra_notes: f.extra_notes || undefined,
  })
  if (!r.ok) {
    followupError.value = r.error ?? 'Failed to draft'
    setTimeout(() => { followupError.value = null }, 8000)
    return
  }
  if (r.subject && r.body) {
    followupResult.value[deal.id] = { subject: r.subject, body: r.body }
  }
}

async function copyAndMarkFollowupSent(deal: DiscoveryDeal) {
  const result = followupResult.value[deal.id]
  if (!result) return
  const text = `Subject: ${result.subject}\nTo: ${deal.contact_email}\n\n${result.body}`
  try { await navigator.clipboard.writeText(text) }
  catch { /* fallback omitted for brevity */ }
  await discovery.markFollowupSent(deal.id)
  flash(`✓ Copied + marked sent (${deal.company_name})`)
}

function fmtScheduled(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function fmtTimeUntil(iso: string | null): string {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - Date.now()
  if (ms < 0) return 'past'
  const hr = Math.floor(ms / (60 * 60 * 1000))
  if (hr < 1) return 'in <1h'
  if (hr < 24) return `in ${hr}h`
  return `in ${Math.floor(hr / 24)}d`
}

// ── Demo link modal (per lead) ───────────────────────────────────────
const demoLinkOpen = ref(false)
const demoLinkLead = ref<CsLead | null>(null)

function openDemoLink(lead: CsLead) {
  demoLinkLead.value = lead
  demoLinkOpen.value = true
}

// When in manual-reply view + a lead is picked, expose it for demo
const currentManualLead = computed<CsLead | null>(() => {
  if (!manualLeadId.value) return null
  return LEAD_INDEX.value.get(manualLeadId.value) ?? null
})

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
    <GraceLiveTicker
      ref="outreachTicker"
      :seed="tickerSeed"
      :pool="tickerPool"
      subtitle="Live — sends, replies, drafts, bookings (polls every 20s)"
    />

    <!-- ── Approval Queue (hero) ────────────────────────────────────── -->
    <CommandSiteOutreachApprovalQueue
      :items="auto.queueItems.value"
      :sent-today="auto.sentTodayCount.value"
      :drafted-today="auto.draftedTodayCount.value"
      :auto-approve="auto.autoApprove.value"
      :min-score="auto.minScore.value"
      :gmail-connected="auto.gmailConnected.value"
      :gmail-email="auto.gmailEmail.value"
      :last-approved-id="auto.lastApprovedId.value"
      @approve="onApprove"
      @edit="openDraftEditor"
      @skip="onSkip"
      @approve-all="onApproveAll"
      @update:auto-approve="onAutoApproveToggle"
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

    <!-- ── Tracking analytics ──────────────────────────────────────── -->
    <section class="card p-4">
      <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
            Tracking · decision metrics
          </div>
          <h3 class="text-sm font-semibold text-ink mt-0.5">
            What's working, what's wasted
          </h3>
        </div>
        <p class="text-[11px] text-ink-muted">
          Reply / bounce data flows in from gmail-inbox-poll every 10 minutes.
          Opens are intentionally not tracked — Apple Mail Privacy Protection
          makes them noise.
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <!-- Last 7 days -->
        <div class="rounded-md border border-divider bg-surface-raised p-3">
          <div class="kpi-label mb-2">Last 7 days</div>
          <dl class="space-y-1.5 text-sm">
            <div class="flex justify-between"><dt class="text-ink-muted">Sent</dt>
              <dd class="font-semibold tabular-nums">{{ analytics7d.total_sent }}</dd></div>
            <div class="flex justify-between"><dt class="text-ink-muted">Reply rate</dt>
              <dd class="font-semibold tabular-nums" :class="analytics7d.reply_rate >= 0.05 ? 'text-success' : 'text-ink'">
                {{ fmtPct(analytics7d.reply_rate) }}
                <span class="text-[10px] text-ink-muted font-normal">({{ analytics7d.total_replies }})</span>
              </dd></div>
            <div class="flex justify-between"><dt class="text-ink-muted">Positive rate</dt>
              <dd class="font-semibold tabular-nums text-success">
                {{ fmtPct(analytics7d.positive_rate) }}
                <span class="text-[10px] text-ink-muted font-normal">({{ analytics7d.positive_replies }})</span>
              </dd></div>
            <div class="flex justify-between"><dt class="text-ink-muted">Bounce rate</dt>
              <dd class="font-semibold tabular-nums" :class="analytics7d.bounce_rate >= 0.03 ? 'text-danger' : 'text-ink-muted'">
                {{ fmtPct(analytics7d.bounce_rate) }}
                <span class="text-[10px] text-ink-muted font-normal">({{ analytics7d.bounces }})</span>
              </dd></div>
            <div class="flex justify-between"><dt class="text-ink-muted">Demos booked</dt>
              <dd class="font-semibold tabular-nums text-brand">
                {{ analytics7d.demos_booked }}
                <span class="text-[10px] text-ink-muted font-normal">({{ fmtPct(analytics7d.demo_rate) }})</span>
              </dd></div>
            <div class="flex justify-between"><dt class="text-ink-muted">Median time-to-reply</dt>
              <dd class="font-semibold tabular-nums">{{ fmtHours(analytics7d.median_hours_to_reply) }}</dd></div>
          </dl>
        </div>

        <!-- Last 30 days -->
        <div class="rounded-md border border-divider bg-surface-raised p-3">
          <div class="kpi-label mb-2">Last 30 days</div>
          <dl class="space-y-1.5 text-sm">
            <div class="flex justify-between"><dt class="text-ink-muted">Sent</dt>
              <dd class="font-semibold tabular-nums">{{ analytics30d.total_sent }}</dd></div>
            <div class="flex justify-between"><dt class="text-ink-muted">Reply rate</dt>
              <dd class="font-semibold tabular-nums" :class="analytics30d.reply_rate >= 0.05 ? 'text-success' : 'text-ink'">
                {{ fmtPct(analytics30d.reply_rate) }}
                <span class="text-[10px] text-ink-muted font-normal">({{ analytics30d.total_replies }})</span>
              </dd></div>
            <div class="flex justify-between"><dt class="text-ink-muted">Positive rate</dt>
              <dd class="font-semibold tabular-nums text-success">
                {{ fmtPct(analytics30d.positive_rate) }}
                <span class="text-[10px] text-ink-muted font-normal">({{ analytics30d.positive_replies }})</span>
              </dd></div>
            <div class="flex justify-between"><dt class="text-ink-muted">Bounce rate</dt>
              <dd class="font-semibold tabular-nums" :class="analytics30d.bounce_rate >= 0.03 ? 'text-danger' : 'text-ink-muted'">
                {{ fmtPct(analytics30d.bounce_rate) }}
                <span class="text-[10px] text-ink-muted font-normal">({{ analytics30d.bounces }})</span>
              </dd></div>
            <div class="flex justify-between"><dt class="text-ink-muted">Demos booked</dt>
              <dd class="font-semibold tabular-nums text-brand">
                {{ analytics30d.demos_booked }}
                <span class="text-[10px] text-ink-muted font-normal">({{ fmtPct(analytics30d.demo_rate) }})</span>
              </dd></div>
            <div class="flex justify-between"><dt class="text-ink-muted">Median time-to-reply</dt>
              <dd class="font-semibold tabular-nums">{{ fmtHours(analytics30d.median_hours_to_reply) }}</dd></div>
          </dl>
        </div>

        <!-- All time -->
        <div class="rounded-md border border-divider bg-surface-raised p-3">
          <div class="kpi-label mb-2">All time</div>
          <dl class="space-y-1.5 text-sm">
            <div class="flex justify-between"><dt class="text-ink-muted">Sent</dt>
              <dd class="font-semibold tabular-nums">{{ analyticsAll.total_sent }}</dd></div>
            <div class="flex justify-between"><dt class="text-ink-muted">Reply rate</dt>
              <dd class="font-semibold tabular-nums">
                {{ fmtPct(analyticsAll.reply_rate) }}
                <span class="text-[10px] text-ink-muted font-normal">({{ analyticsAll.total_replies }})</span>
              </dd></div>
            <div class="flex justify-between"><dt class="text-ink-muted">Positive rate</dt>
              <dd class="font-semibold tabular-nums text-success">
                {{ fmtPct(analyticsAll.positive_rate) }}
                <span class="text-[10px] text-ink-muted font-normal">({{ analyticsAll.positive_replies }})</span>
              </dd></div>
            <div class="flex justify-between"><dt class="text-ink-muted">Bounce rate</dt>
              <dd class="font-semibold tabular-nums">
                {{ fmtPct(analyticsAll.bounce_rate) }}
                <span class="text-[10px] text-ink-muted font-normal">({{ analyticsAll.bounces }})</span>
              </dd></div>
            <div class="flex justify-between"><dt class="text-ink-muted">Demos booked</dt>
              <dd class="font-semibold tabular-nums text-brand">
                {{ analyticsAll.demos_booked }}
                <span class="text-[10px] text-ink-muted font-normal">({{ fmtPct(analyticsAll.demo_rate) }})</span>
              </dd></div>
            <div class="flex justify-between"><dt class="text-ink-muted">Median time-to-reply</dt>
              <dd class="font-semibold tabular-nums">{{ fmtHours(analyticsAll.median_hours_to_reply) }}</dd></div>
          </dl>
        </div>
      </div>

      <!-- Interpretation guidance -->
      <p class="text-[11px] text-ink-muted italic mt-3 leading-relaxed">
        Benchmarks for cold outreach to SMB owners: 5%+ reply rate is healthy, 10%+ is strong.
        Bounce rate above 3% means deliverability is at risk (review your domain warmup).
        Demos-booked rate is the only number that matters for revenue — everything else is leading indicator.
      </p>
    </section>

    <!-- ── Status messages ─────────────────────────────────────────── -->
    <div v-if="flashMsg" class="rounded-md bg-success/10 text-success px-3 py-2 text-sm">{{ flashMsg }}</div>
    <div v-if="errorMsg" class="rounded-md bg-danger/10 text-danger px-3 py-2 text-sm">{{ errorMsg }}</div>

    <!-- ── View tabs ───────────────────────────────────────────────── -->
    <div class="card p-2">
      <div class="flex items-center gap-1 flex-wrap">
        <button
          type="button"
          class="rounded-md px-3 py-1.5 text-sm font-semibold transition-colors"
          :class="view === 'pipeline' ? 'bg-brand text-white' : 'text-ink hover:bg-canvas/50'"
          @click="view = 'pipeline'"
        >Pipeline</button>
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
          class="rounded-md px-3 py-1.5 text-sm font-semibold transition-colors inline-flex items-center gap-1"
          :class="view === 'demos' ? 'bg-brand text-white' : 'text-ink hover:bg-canvas/50'"
          @click="view = 'demos'"
        >📅 Demos
          <span v-if="discovery.upcoming.value.length > 0" class="ml-1 rounded-full bg-success/20 text-success text-[10px] font-bold px-1.5 py-0.5">{{ discovery.upcoming.value.length }}</span>
        </button>
        <button
          type="button"
          class="rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-canvas/50 ml-auto"
          :class="view === 'coming_next' ? 'bg-canvas text-ink' : ''"
          @click="view = 'coming_next'"
        >Coming next →</button>
      </div>
    </div>

    <!-- ── VIEW: Pipeline (kanban) ─────────────────────────────────── -->
    <section v-if="view === 'pipeline'">
      <div class="overflow-x-auto pb-2">
        <div class="inline-flex items-start gap-3 min-w-full">
          <div
            v-for="stage in PIPELINE_STAGES"
            :key="stage.key"
            class="rounded-card border bg-surface flex-shrink-0 w-72"
            :class="stage.toneClass"
          >
            <header class="px-3 py-2 border-b border-divider bg-surface-elevated rounded-t-card">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-semibold text-ink">{{ stage.label }}</span>
                <span class="text-[10px] font-bold tabular-nums text-ink-muted">{{ stageBuckets[stage.key].length }}</span>
              </div>
            </header>
            <div class="p-2 space-y-2 max-h-[600px] overflow-y-auto">
              <div
                v-if="stageBuckets[stage.key].length === 0"
                class="text-[11px] text-ink-disabled italic text-center py-4"
              >Nothing here</div>
              <div
                v-for="lead in stageBuckets[stage.key]"
                :key="lead.id"
                class="rounded-md border border-divider bg-surface-raised p-2 hover:border-brand/40 transition-colors group"
              >
                <button
                  type="button"
                  class="w-full text-left"
                  @click="jumpToLeadInManualReply(lead.id)"
                >
                  <div class="flex items-start justify-between gap-1.5 mb-1">
                    <span class="text-[12px] font-semibold text-ink truncate flex-1 min-w-0">{{ lead.company_name }}</span>
                    <span
                      class="rounded-full px-1.5 py-0 text-[9px] font-bold tabular-nums shrink-0"
                      :class="(lead.icp_score ?? 0) >= 80 ? 'bg-success/15 text-success' : (lead.icp_score ?? 0) >= 60 ? 'bg-warn/15 text-warn' : 'bg-ink-muted/15 text-ink-muted'"
                    >{{ lead.icp_score ?? '—' }}</span>
                  </div>
                  <div class="text-[10px] text-ink-muted truncate">{{ lead.contact_email }}</div>
                  <div class="text-[10px] text-ink-disabled mt-0.5">{{ fmtLastAction(lead) }}</div>
                </button>
                <button
                  type="button"
                  class="w-full mt-1.5 rounded-md text-[10px] font-medium text-brand bg-brand/5 hover:bg-brand/10 px-2 py-1 inline-flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  @click.stop="openDemoLink(lead)"
                >📊 Custom demo link</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p class="text-[11px] text-ink-disabled italic text-center mt-2">
        Click any card → jump to the manual-reply form pre-loaded with that lead.
      </p>
    </section>

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
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <div class="text-ink font-semibold text-sm">{{ lead.company_name }}</div>
                    <span
                      v-if="(lead.tags ?? []).includes('followup_drafted_touch_3')"
                      class="inline-flex items-center rounded-full bg-warn/15 text-warn px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                    >Touch 3 · breakup</span>
                    <span
                      v-else-if="(lead.tags ?? []).includes('followup_drafted_touch_2')"
                      class="inline-flex items-center rounded-full bg-brand/15 text-brand px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                    >Touch 2</span>
                  </div>
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
                    <button
                      type="button"
                      class="text-[10px] text-ink-muted hover:text-ink"
                      @click="openLeadEditor(lead)"
                    >✎ Edit lead</button>
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
                <td class="px-3 py-2 text-right whitespace-nowrap">
                  <div class="inline-flex items-center gap-2">
                    <button
                      v-if="lead.status !== 'replied'"
                      type="button"
                      class="text-xs text-brand font-medium hover:underline"
                      @click="view = 'manual_reply'; pickLeadForManual(lead.id)"
                    >Log a reply</button>
                    <button
                      type="button"
                      class="text-[11px] text-ink-muted hover:text-ink"
                      @click="openLeadEditor(lead)"
                    >✎ Edit</button>
                  </div>
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
      <!-- Quick paste: dump the raw Gmail reply, auto-fill the form -->
      <div class="card p-4 border-brand/30 bg-brand/5">
        <div class="flex items-start gap-2 mb-2">
          <AssistantMark class="h-4 w-4 text-brand mt-0.5" />
          <div class="flex-1">
            <h3 class="text-sm font-semibold text-ink">Quick paste · auto-fill from Gmail</h3>
            <p class="text-xs text-ink-muted">
              In Gmail: ⋮ → "Show original" → copy. Or just copy the visible reply with the From: line. We'll find the lead, fill the form, and queue Ada's draft response.
            </p>
          </div>
        </div>
        <textarea
          v-model="rawPastedEmail"
          rows="5"
          placeholder="Paste the raw email (headers + body)…"
          class="input font-mono text-xs"
        />
        <div class="flex items-center justify-between gap-2 mt-2">
          <div v-if="parseStatus" class="text-xs flex-1" :class="parseStatus.ok ? 'text-success' : 'text-warn'">
            {{ parseStatus.message }}
          </div>
          <div v-else class="text-[11px] text-ink-disabled flex-1">
            Auto-detects From email + name, Subject, Body. Matches the lead from your Sent list.
          </div>
          <button
            type="button"
            class="btn-primary !text-xs whitespace-nowrap"
            :disabled="!rawPastedEmail.trim()"
            @click="parseAndAutofill"
          >Parse + auto-fill</button>
        </div>
      </div>

      <div class="card p-4">
        <h3 class="text-sm font-semibold text-ink mb-2">
          Reply details
        </h3>
        <p class="text-xs text-ink-muted mb-3">
          Ada classifies (positive / objection / OOF / etc.) + drafts a suggested response for the right categories.
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

      <!-- Classification result + Ada's drafted reply (editable) -->
      <div v-if="classifyResult" class="card p-4 border-brand/30 space-y-3">
        <!-- Header: classification + confidence + reasoning -->
        <div>
          <div class="flex items-center gap-2 flex-wrap mb-2">
            <AssistantMark class="h-5 w-5 text-brand" />
            <span class="text-sm font-semibold text-ink">Ada classified this as:</span>
            <span
              class="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider"
              :class="CLASSIFICATION_META[(classifyResult.classification as keyof typeof CLASSIFICATION_META)]?.pillClass ?? 'bg-ink-muted/10 text-ink-muted'"
            >{{ classifyResult.classification }}</span>
            <span class="text-[11px] text-ink-muted">{{ Math.round(classifyResult.classification_confidence * 100) }}% confidence</span>
            <span
              class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
              :class="
                classifyResult.suggested_action === 'send' ? 'bg-success/15 text-success' :
                classifyResult.suggested_action === 'edit' ? 'bg-warn/15 text-warn' :
                classifyResult.suggested_action === 'manual' ? 'bg-danger/15 text-danger' :
                'bg-ink-muted/10 text-ink-muted'"
            >suggested: {{ classifyResult.suggested_action }}</span>
          </div>
          <p class="text-xs text-ink-muted italic">
            <strong class="text-ink">Why:</strong> {{ classifyResult.classification_reason }}
          </p>
          <p class="text-xs text-ink-muted italic mt-1">
            <strong class="text-ink">Ada's reasoning:</strong> {{ classifyResult.reasoning }}
          </p>
        </div>

        <!-- Editable drafted response -->
        <div class="rounded-card border border-brand/30 bg-brand/5 overflow-hidden">
          <div class="px-3 py-2 border-b border-brand/15 bg-brand/10 flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <AssistantMark class="h-3.5 w-3.5 text-brand" />
              <span class="text-[10px] font-semibold uppercase tracking-wider text-brand">Ada's drafted reply (editable)</span>
            </div>
            <span class="text-[10px] text-ink-muted">{{ editedDraftResponse.split(/\s+/).filter(w => w).length }} words</span>
          </div>
          <textarea
            v-model="editedDraftResponse"
            rows="8"
            class="w-full p-3 bg-surface text-sm text-ink leading-relaxed font-sans focus:outline-none resize-none"
          />
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            class="text-xs text-brand font-medium hover:underline inline-flex items-center gap-1"
            :disabled="classifying"
            @click="regenerateDraft"
          >
            <AssistantMark class="h-3 w-3 text-brand" />
            Regenerate
          </button>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-md border border-divider text-ink bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:border-brand inline-flex items-center gap-1"
              @click="copyDraftedReply"
            >📋 Copy reply</button>
            <button
              type="button"
              class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 inline-flex items-center gap-1"
              @click="copyDraftedReply"
            >
              ✓ Copy + send via Gmail
            </button>
          </div>
        </div>

        <!-- Custom demo CTA — appears for positive/interested replies -->
        <div
          v-if="currentManualLead && (classifyResult.classification === 'positive' || classifyResult.classification === 'interested')"
          class="rounded-card border border-success/30 bg-success/5 p-3 flex items-center justify-between gap-3 flex-wrap"
        >
          <div class="text-xs text-ink leading-snug">
            <strong class="text-success">They're interested.</strong> Want to send them a custom Ada demo URL too? It rebrands a real CommandSite for {{ currentManualLead.company_name }} so they can click around before the call.
          </div>
          <button
            type="button"
            class="rounded-md bg-success text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 inline-flex items-center gap-1.5 shrink-0"
            @click="openDemoLink(currentManualLead)"
          >📊 Generate custom demo link</button>
        </div>

        <p class="text-[10px] text-ink-disabled italic text-center">
          Conservative mode: Ada drafts, you approve. Copy → paste into Gmail → send. Auto-send via Smartlead comes in Phase 3.
        </p>
      </div>
    </section>

    <!-- ── VIEW: Demos (discovery calls) ───────────────────────────── -->
    <section v-if="view === 'demos'" class="space-y-4">
      <!-- Header with "Log a manual demo" button -->
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="text-xs text-ink-muted">
          Auto-populated from Calendly bookings. Click any row to edit, or log a manual demo for calls scheduled outside Calendly.
        </div>
        <button
          type="button"
          class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 inline-flex items-center gap-1.5"
          @click="logManualDemoOpen = true"
        >
          <span>+</span>
          <span>Log a manual demo</span>
        </button>
      </div>

      <p v-if="briefError" class="text-sm text-danger">{{ briefError }}</p>
      <p v-if="followupError" class="text-sm text-danger">{{ followupError }}</p>

      <!-- Empty state -->
      <div v-if="!discovery.loading.value && discovery.upcoming.value.length === 0 && discovery.past.value.length === 0" class="card p-8 text-center">
        <p class="text-sm text-ink-muted mb-2">No discovery calls booked yet.</p>
        <p class="text-xs text-ink-disabled">
          When prospects click your Calendly link and book, they'll appear here automatically (Calendly webhook → cs_deals).
        </p>
        <div class="text-[11px] text-ink-disabled mt-3 space-y-1">
          <p>Service-business prospects: <code class="font-mono">calendly.com/josh-commandsite/30-min-discovery-services-walkthrough</code></p>
          <p>Church / ministry prospects: <code class="font-mono">calendly.com/josh-commandsite/30-min-discovery-church-walkthrough</code></p>
        </div>
      </div>

      <!-- Upcoming -->
      <div v-if="discovery.upcoming.value.length > 0">
        <div class="flex items-baseline gap-2 mb-3">
          <h3 class="text-sm font-semibold text-ink">Upcoming</h3>
          <span class="text-[10px] text-ink-muted">{{ discovery.upcoming.value.length }} {{ discovery.upcoming.value.length === 1 ? 'call' : 'calls' }}</span>
        </div>
        <div class="space-y-3">
          <article v-for="deal in discovery.upcoming.value" :key="deal.id" class="card p-4 border-success/20">
            <header class="flex items-start justify-between gap-3 flex-wrap mb-2">
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap mb-0.5">
                  <h4 class="text-base font-semibold text-ink">{{ deal.company_name }}</h4>
                  <span class="rounded-full bg-success/15 text-success px-2 py-0.5 text-[10px] font-semibold">
                    {{ fmtTimeUntil(deal.scheduled_at) }}
                  </span>
                </div>
                <div class="text-[11px] text-ink-muted">
                  {{ deal.contact_name }} · {{ deal.contact_email }}
                  <template v-if="deal.industry"> · {{ deal.industry }}</template>
                  <template v-if="deal.city"> · {{ deal.city }}, {{ deal.state }}</template>
                </div>
                <div class="text-[11px] text-brand font-semibold mt-0.5">
                  📅 {{ fmtScheduled(deal.scheduled_at) }}
                  <span v-if="deal.scheduled_call_duration_min" class="text-ink-muted font-normal ml-1">· {{ deal.scheduled_call_duration_min }}min</span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="rounded-md border border-divider text-ink-muted bg-surface-raised px-2.5 py-1.5 text-xs font-medium hover:border-brand hover:text-ink"
                  @click="openDealEditor(deal)"
                >✎ Edit</button>
                <a
                  v-if="deal.discovery_demo_url"
                  :href="deal.discovery_demo_url"
                  target="_blank"
                  rel="noopener"
                  class="rounded-md border border-divider text-ink bg-surface-raised px-3 py-1.5 text-xs font-semibold hover:border-brand inline-flex items-center gap-1"
                >📊 Preview demo</a>
                <button
                  type="button"
                  class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5"
                  :disabled="discovery.generatingBriefId.value === deal.id"
                  @click="onGenerateBrief(deal.id)"
                >
                  <AssistantMark class="h-3.5 w-3.5 text-white" />
                  <span v-if="discovery.generatingBriefId.value === deal.id">Drafting…</span>
                  <span v-else-if="deal.discovery_brief">Regenerate brief</span>
                  <span v-else>Generate brief</span>
                </button>
              </div>
            </header>

            <!-- The brief itself, if generated -->
            <div v-if="deal.discovery_brief" class="rounded-card border border-brand/20 bg-brand/5 p-4 mt-2">
              <div class="text-[10px] font-semibold uppercase tracking-wider text-brand mb-2 inline-flex items-center gap-1.5">
                <AssistantMark class="h-3 w-3 text-brand" />
                Ada's pre-call brief
                <span v-if="deal.discovery_brief_generated_at" class="text-ink-disabled font-normal normal-case ml-1">
                  · drafted {{ new Date(deal.discovery_brief_generated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }}
                </span>
              </div>
              <pre class="whitespace-pre-wrap text-sm text-ink leading-relaxed font-sans">{{ deal.discovery_brief }}</pre>
            </div>
          </article>
        </div>
      </div>

      <!-- Past -->
      <div v-if="discovery.past.value.length > 0">
        <div class="flex items-baseline gap-2 mb-3 mt-6">
          <h3 class="text-sm font-semibold text-ink">Past calls</h3>
          <span class="text-[10px] text-ink-muted">{{ discovery.past.value.length }} {{ discovery.past.value.length === 1 ? 'call' : 'calls' }}</span>
        </div>
        <div class="space-y-3">
          <article v-for="deal in discovery.past.value" :key="deal.id" class="card p-4">
            <header class="flex items-start justify-between gap-3 flex-wrap mb-2">
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap mb-0.5">
                  <h4 class="text-base font-semibold text-ink">{{ deal.company_name }}</h4>
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    :class="deal.post_call_followup_sent_at ? 'bg-success/15 text-success' : 'bg-warn/15 text-warn'"
                  >
                    {{ deal.post_call_followup_sent_at ? 'Follow-up sent' : 'Awaiting follow-up' }}
                  </span>
                </div>
                <div class="text-[11px] text-ink-muted">
                  {{ deal.contact_name }} · {{ deal.contact_email }}
                  · {{ fmtScheduled(deal.scheduled_at) }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="rounded-md border border-divider text-ink-muted bg-surface-raised px-2.5 py-1 text-xs font-medium hover:border-brand hover:text-ink"
                  @click="openDealEditor(deal)"
                >✎ Edit</button>
                <button
                  type="button"
                  class="text-xs text-brand font-medium hover:underline"
                  @click="togglePostCallForm(deal.id)"
                >{{ postCallForms[deal.id]?.expanded ? 'Hide' : 'Log notes + draft follow-up' }}</button>
              </div>
            </header>

            <!-- Inline post-call form -->
            <div v-if="postCallForms[deal.id]?.expanded" class="space-y-3 mt-3 pt-3 border-t border-divider">
              <div class="grid sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-ink mb-1">Interest level</label>
                  <select v-model="postCallForms[deal.id].interest_level" class="input text-sm">
                    <option value="hot">🔥 Hot — wants to move forward</option>
                    <option value="warm">☀️ Warm — interested, needs nudge</option>
                    <option value="lukewarm">🟡 Lukewarm — on the fence</option>
                    <option value="cold">❄️ Cold — likely no</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-semibold text-ink mb-1">Specific concern (optional)</label>
                  <input v-model="postCallForms[deal.id].specific_concern" type="text" class="input text-sm" placeholder="Pricing, timing, AI skepticism…" />
                </div>
              </div>
              <div>
                <label class="block text-xs font-semibold text-ink mb-1">Next step agreed</label>
                <input v-model="postCallForms[deal.id].next_step" type="text" class="input text-sm" placeholder="Send pricing proposal Tuesday · Demo their setup live · etc." />
              </div>
              <div>
                <label class="block text-xs font-semibold text-ink mb-1">Extra notes (optional)</label>
                <textarea v-model="postCallForms[deal.id].extra_notes" rows="2" class="input text-sm font-sans" placeholder="Anything else Ada should know when drafting the recap…"></textarea>
              </div>
              <div class="flex items-center justify-end gap-2">
                <button
                  type="button"
                  class="btn-primary !text-sm inline-flex items-center gap-1.5"
                  :disabled="discovery.draftingFollowupId.value === deal.id || !postCallForms[deal.id].next_step"
                  @click="onDraftFollowup(deal)"
                >
                  <AssistantMark class="h-3.5 w-3.5 text-white" />
                  <span v-if="discovery.draftingFollowupId.value === deal.id">Ada is drafting…</span>
                  <span v-else>Draft follow-up email</span>
                </button>
              </div>
            </div>

            <!-- Drafted follow-up result -->
            <div v-if="followupResult[deal.id]" class="rounded-card border border-brand/30 bg-brand/5 p-4 mt-3">
              <div class="text-[10px] font-semibold uppercase tracking-wider text-brand mb-2 inline-flex items-center gap-1.5">
                <AssistantMark class="h-3 w-3 text-brand" />
                Ada's follow-up draft
              </div>
              <div class="text-sm font-semibold text-ink mb-2">Subject: {{ followupResult[deal.id].subject }}</div>
              <pre class="whitespace-pre-wrap text-sm text-ink leading-relaxed font-sans mb-3">{{ followupResult[deal.id].body }}</pre>
              <div class="flex items-center justify-end gap-2">
                <button
                  type="button"
                  class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90"
                  @click="copyAndMarkFollowupSent(deal)"
                >📋 Copy + mark sent</button>
              </div>
            </div>

            <!-- Already-sent follow-up summary -->
            <div v-else-if="deal.post_call_followup_draft" class="text-[11px] text-ink-muted mt-2 italic">
              Ada drafted a follow-up
              <span v-if="deal.post_call_followup_drafted_at">{{ new Date(deal.post_call_followup_drafted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}</span>
              <span v-if="deal.post_call_followup_sent_at"> · marked sent {{ new Date(deal.post_call_followup_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }}</span>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- ── Demo link modal ─────────────────────────────────────────── -->
    <CommandSiteDemoLinkModal
      :open="demoLinkOpen"
      :lead="demoLinkLead"
      @close="demoLinkOpen = false"
    />

    <!-- ── Log a manual demo modal ───────────────────────────────── -->
    <CommandSiteLogManualDemoModal
      :open="logManualDemoOpen"
      :leads="leads"
      @close="logManualDemoOpen = false"
      @saved="onManualDemoSaved"
    />

    <!-- ── Lead edit drawer ──────────────────────────────────────── -->
    <CommandSiteLeadEditDrawer
      :open="editingLead !== null"
      :lead="editingLead"
      @close="closeLeadEditor"
      @save="onLeadSave"
      @delete="onLeadDelete"
    />

    <!-- ── Deal edit drawer ──────────────────────────────────────── -->
    <CommandSiteDealEditDrawer
      :open="editingDeal !== null"
      :deal="editingDeal as never"
      @close="closeDealEditor"
      @save="onDealSave"
      @delete="onDealDelete"
    />

    <!-- ── Edit-draft modal (approval queue inline edit) ─────────── -->
    <CommandSiteOutreachEditDraftModal
      :open="editingDraftLead !== null"
      :lead="editingDraftLead"
      @close="closeDraftEditor"
      @save="onDraftSave"
      @save-and-approve="onDraftSaveAndApprove"
    />

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
