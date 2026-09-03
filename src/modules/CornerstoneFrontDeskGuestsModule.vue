<script setup lang="ts">
/**
 * Cornerstone Front Desk & Guests.
 * Grace's roles on this page: Front Desk + Guest Follow-Up + Story Engine.
 */
import { computed, onMounted, ref } from 'vue'
import type { Client } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { graceSend } from '@/lib/grace/send'
import { STAGE_META as VISITOR_STAGE_META } from '@/lib/clients/cornerstone/visitors'
import { churchDataset } from '@/lib/clients/church/dataset'
import { rolesOnTab, getRole } from '@/lib/clients/cornerstone/roles'
import GraceApprovalQueue, { type ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'
import { focalPointVisitorTouches } from '@/lib/clients/focal-point/visitors'
import LiveActivityFeed from '@/components/ada/LiveActivityFeed.vue'
import RolesOnPage from '@/components/ada/RolesOnPage.vue'
import PageLeadChip from '@/components/cornerstone/PageLeadChip.vue'
import DataFreshnessBadge from '@/components/cornerstone/DataFreshnessBadge.vue'
import AdaIcon from '@/components/ada/AdaIcon.vue'
import GraceRecommendations, { type GraceRecommendation } from '@/components/cornerstone/GraceRecommendations.vue'
import SampleBadge from '@/components/cornerstone/SampleBadge.vue'
import GuestPipelineBoard from '@/components/cornerstone/GuestPipelineBoard.vue'
import VisitorDropOff from '@/components/cornerstone/VisitorDropOff.vue'
import GuestPulseStrip from '@/components/cornerstone/GuestPulseStrip.vue'
import { guestPipelineData, loadCareData } from '@/lib/clients/church/careDataLoader'
import { LIVE_CHURCHES } from '@/lib/clients/church/liveChurches'
import { useCongregationLens } from '@/stores/congregationLens'
import { useLiveActivity, seedEvent, type PoolEvent } from '@/composables/useLiveActivity'

const props = defineProps<{ client: Client; config: Record<string, unknown> }>()

// Freshness is only meaningful for a church with a live Planning Center sync.
const isLiveChurch = computed(() => LIVE_CHURCHES.includes(props.client?.slug))

// Front Desk scopes by congregation: the two Starting Point workflows tag every
// guest English (weekend) or Brazilian, so the KPIs, board, and welcome queue
// all follow the lens.
const lens = useCongregationLens()
const gpInScope = (campus: string) => lens.scope === 'all' || campus === lens.scope

// Live churches load their guest pipeline from the real Planning Center pull;
// everyone else keeps the baked demo snapshot (the getter falls back).
// church_settings.messaging isn't in the generated Database types (added
// after codegen), so it's read through an untyped handle, mirroring
// privacy.ts / careDataLoader.ts.
interface MessagingSettings { enabled: boolean; testMode: boolean }
const messagingSettings = ref<MessagingSettings | null>(null)

onMounted(async () => {
  if (!LIVE_CHURCHES.includes(props.client?.slug)) return
  loadCareData(props.client.slug)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data, error } = await sb
    .from('church_settings')
    .select('messaging')
    .eq('client_id', props.client.id)
    .maybeSingle()
  if (!error && data?.messaging) {
    messagingSettings.value = {
      enabled: data.messaging.enabled ?? false,
      testMode: data.messaging.testMode ?? true,
    }
  }
})

// Staff need to know whether an approve actually reaches the guest before
// they click it: sending off means every approval is logged-only, and test
// mode means it lands in the team's test inbox, not the guest's.
const messagingBannerText = computed(() => {
  const m = messagingSettings.value
  if (!m) return null
  if (!m.enabled) return 'Sending is off, approvals are logged only.'
  if (m.testMode) return 'Test mode: sends go to your test address, not the guest.'
  return null
})

const guestKpisScoped = computed(() => guestPipelineData().kpis[lens.scope])
const pipelineCount = computed(() => guestPipelineData().cases.filter((c) => gpInScope(c.campus)).length)
// Welcome drafts awaiting approval: this week's first-time guests in scope.
// person_id / cardId come from the live PCO payload (Task 3); the baked demo
// snapshot doesn't carry them, so they're read through a widened local type
// rather than added to the shared GuestCase type.
const guestQueue = computed<ApprovalQueueItem[]>(() =>
  guestPipelineData().cases
    .filter((c) => c.draft && gpInScope(c.campus))
    .slice(0, 8)
    .map((c) => {
      const live = c as typeof c & { person_id?: string; cardId?: string }
      // Real send is only meaningful when both identifiers are present
      // (live PCO payload). Before live data lands, or on the baked
      // fallback, these are undefined; omitting message_type here (rather
      // than sending it with undefined ids) keeps GraceApprovalQueue's
      // `sendHandler && item.message_type` guard truthful, so approve
      // falls through to the cosmetic path instead of a doomed grace-send
      // call. Self-heals once live data lands and the queue re-renders.
      const canSend = Boolean(live.person_id && live.cardId)
      return {
        id: c.id,
        role: 'guest_followup',
        icon: 'qa_assistant',
        badge: 'Welcome',
        badgeClass: 'bg-success/15 text-success',
        title: `Welcome: ${c.name}`,
        recipient: `First visit this week · ${c.campus === 'brazilian' ? 'Brazilian service' : 'weekend service'}`,
        preview: c.draft ?? '',
        approved_response: 'Sent. Grace will watch for a reply and flag it for you.',
        ticker_after_approval: `Welcome sent to ${c.name}`,
        ...(canSend
          ? {
              person_id: live.person_id,
              card_id: live.cardId,
              message_type: 'guest_welcome' as const,
              subject: c.campus === 'brazilian' ? 'Foi bom te conhecer na Focal Point' : 'Great to meet you at Focal Point',
            }
          : {}),
      }
    }),
)

// An empty welcome queue means one of two very different things, and "Grace will
// surface the next batch as it lands" reads as the good one either way.
//
// Found this on the Brazilian lens: the queue was empty and looked fine, but the
// last Starting Point card was 20 days old while English had one from 3 days
// ago. Either nobody new came, or the Brazilian service stopped running guests
// through the workflow. The second is a front door nobody is watching, and the
// dashboard was actively reassuring them about it.
//
// The queue only holds first visits from the last 7 days, so when it is empty we
// report how long the wait has been, read off the newest active card's own `age`
// label ('this week' or 'Nw ago').
//
// Scanned by MINIMUM age rather than by taking the first match. Cases are sorted
// newest-first WITHIN a campus but the array runs English then Brazilian, so on
// the All lens "first in-scope" is the newest English card, not the newest card.
// That reports the wrong wait the moment English is the quiet one.
const guestEmptyNote = computed<string | null>(() => {
  if (!isFocalPoint.value) return null
  const weeks = (age: string) => (age === 'this week' ? 0 : Number.parseInt(age, 10) || 0)
  const ages = guestPipelineData().cases.filter((c) => gpInScope(c.campus)).map((c) => c.age)
  const where = lens.scope === 'all' ? '' : ` in the ${lens.scope} congregation`
  if (!ages.length) return `No first-time guests${where} in the last 90 days. Worth checking whether sign-ins are still going through Starting Point.`
  const newest = ages.reduce((a, b) => (weeks(b) < weeks(a) ? b : a))
  if (weeks(newest) === 0) return 'Grace will surface the next batch as it lands.'
  return `Nothing new in the last 7 days${where}. The most recent first-time guest signed in ${newest}.`
})

// Real send path: only wired for Focal Point (the queue's message_type +
// person_id/card_id are only populated there). Cornerstone's demo queueItems
// never carry message_type, so GraceApprovalQueue's approve stays cosmetic
// for them even if this were passed unconditionally, but we still gate it
// explicitly so the prop is simply absent on the demo path.
async function sendGuestWelcome(item: ApprovalQueueItem) {
  return graceSend({
    tenant: props.client.slug,
    messageType: item.message_type!,
    cardId: item.card_id!,
    personId: item.person_id!,
    subject: item.subject!,
    body: item.preview,
  })
}
const guestSendHandler = computed(() => (isFocalPoint.value ? sendGuestWelcome : undefined))

// Client-varying data resolved by slug; names preserved so the rest of the
// module and template are unchanged.
const data = churchDataset(props.client.slug)
const visitorStats = data.visitors.stats
const visitors = data.visitors.records

const visitor = computed(() => visitorStats())

// Focal Point gets real Sunday guests + welcome drafts; Cornerstone keeps demo.
const isFocalPoint = computed(() => props.client.slug === 'focal-point-church')
const displayTouches = computed(() => (isFocalPoint.value ? focalPointVisitorTouches : recentVisitorTouches))

interface CallEntry { time: string; from: string; topic: string; outcome: string; tone: 'success' | 'warn' | 'info' }
const recentCalls: CallEntry[] = [
  { time: '2h ago',  from: 'Riley Boucher',           topic: 'Said she came Sunday & loved it', outcome: 'Captured contact + sent welcome SMS',                tone: 'success' },
  { time: '8h ago',  from: 'Anonymous (mobile)',      topic: 'Asked about Sunday service times', outcome: 'Answered + sent service info via text',             tone: 'success' },
  { time: '14h ago', from: 'Kennedy Park',            topic: 'Wanted to know about kids program', outcome: 'Booked her a tour Sat AM',                          tone: 'success' },
  { time: '1d ago',  from: 'Mark — VM',               topic: 'Pastoral request — wife in hospital', outcome: 'Escalated to Pastor Mark immediately (5 PM)',    tone: 'warn' },
  { time: '2d ago',  from: 'The Maddux Family',       topic: 'RSVPing for Newcomers Lunch',      outcome: 'Confirmed + added to attendee list',                tone: 'success' },
]

interface VisitorTouch { name: string; stage: string; latest: string; ago: string }
const recentVisitorTouches: VisitorTouch[] = [
  { name: 'Riley Boucher',     stage: 'First-time',     latest: 'Welcome SMS sent — opened in 11 min',           ago: '2h' },
  { name: 'Kennedy Park',      stage: 'Returning',      latest: 'Day-3 nudge: "What did you think of Sunday?"',   ago: '1d' },
  { name: 'The Maddux Family', stage: 'Connected',      latest: 'Discover Cornerstone class invite drafted',      ago: '3d' },
  { name: 'The Brooks Family', stage: 'Discover Class', latest: 'Week-2 reminder queued for Saturday',            ago: '4d' },
  { name: 'The Yates Family',  stage: 'First-time',     latest: 'Welcome SMS sent — no response yet',             ago: '4d' },
  { name: 'The Reyes Family',  stage: 'Returning',      latest: '"We missed you" check-in sent (4-mo gap)',       ago: '5d' },
]

interface Story { person: string; trigger: string; status: 'captured' | 'drafted' | 'pending'; preview: string }
const recentStories: Story[] = [
  { person: 'Owen Holloway',   trigger: '1 year as Youth Leader', status: 'captured', preview: '"What started as just helping out turned into the most meaningful Wednesday nights of my year..."' },
  { person: 'The Téllez Family', trigger: 'Discover Cornerstone graduation', status: 'drafted', preview: '"We\'d been church-shopping for two years — this was the first place that felt like home..."' },
  { person: 'Baby Ellison',     trigger: 'Birth (Tue)',            status: 'pending',  preview: 'Awaiting permission from Wes + Tara to capture + share' },
]

function callToneClass(tone: CallEntry['tone']): string {
  if (tone === 'warn') return 'bg-warn/15 text-warn'
  if (tone === 'info') return 'bg-accent/15 text-accent'
  return 'bg-success/15 text-success'
}

function storyStatusClass(s: Story['status']): string {
  if (s === 'captured') return 'bg-success/15 text-success'
  if (s === 'drafted')  return 'bg-brand/15 text-brand'
  return 'bg-warn/15 text-warn'
}

// ── Approval queue: visitor sequences + story drafts ──────────────────
// Ordered to lead with Welcome items (the page's headline product),
// then Story Engine items, mirroring the Today page's "headline
// products first" approval pattern.
const queueItems: ApprovalQueueItem[] = [
  {
    id: 'fd-yates-nudge',
    role: 'guest_followup',
    icon: 'qa_assistant',
    badge: 'Welcome',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Day-7 nudge — The Yates Family',
    recipient: 'First-time visitor · welcome SMS sent · no response after 4 days',
    preview: '"Hey Yates Family — just wanted to circle back from last week. No pressure to reply, but if you\'re thinking about coming back this Sunday, we\'d love to see you again. Happy to answer anything about kids ministry or small groups whenever. — Pastor Mark"',
    approved_response: "Sent. If they don't respond by next Sunday I'll move them from 'first-time' to 'cooled' so we don't keep nudging. They opened the welcome SMS though, so I'm cautiously optimistic.",
    ticker_after_approval: 'Day-7 nudge sent to the Yates Family',
  },
  {
    id: 'fd-kennedy-day3',
    role: 'guest_followup',
    icon: 'qa_assistant',
    badge: 'Welcome',
    badgeClass: 'bg-success/15 text-success',
    title: 'Day-3 nudge — Kennedy Park',
    recipient: '2nd visit Sunday · filled out connect card',
    preview: '"Hey Kennedy — wanted to follow up after Sunday and just say it was great having you with us again. Saw the connect card — thanks for that. If you\'re open to it, our Newcomers Lunch is May 19th — informal, no commitment. Otherwise: looking forward to seeing you again whenever feels right. — Pastor Mark"',
    approved_response: "Sent. Kennedy's a soft pipeline lead — I'll watch for an RSVP or a reply, and surface either to you within minutes.",
    ticker_after_approval: 'Day-3 nudge sent to Kennedy Park',
  },
  {
    id: 'fd-tellez-story',
    role: 'stories',
    icon: 'review_engine',
    badge: 'Story Engine',
    badgeClass: 'bg-brand/15 text-brand',
    title: 'Share story — The Téllez Family',
    recipient: 'DC graduation testimony · drafted · awaiting your sign-off',
    preview: '"\'We\'d been church-shopping for two years — this was the first place that felt like home.\' — The Téllez Family. Permission to share on socials + the new-member welcome packet. Drafted with their consent on the form. Edit before publish or approve as-is."',
    approved_response: "Posted — socials, welcome packet, the next bulletin email. The Téllez Family will get a heads-up text from me 30 sec after publish so they're not surprised.",
    ticker_after_approval: 'Téllez story published — socials + bulletin',
  },
  {
    id: 'fd-ellison-permission',
    role: 'stories',
    icon: 'review_engine',
    badge: 'Story Engine',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Story permission ask — Baby Ellison',
    recipient: 'Birth Tue · need Marc + Hannah\'s OK before share',
    preview: '"Marc and Hannah — would you be open to us sharing the news of Baby Ellison\'s arrival on socials + in this Sunday\'s announcement? Totally optional, no pressure either way. If yes, I\'ll draft something simple for your approval first. — Pastor Mark (via Grace)"',
    approved_response: "Sent. Asking for permission first is the right move with births — I'll surface their reply the moment it lands and only THEN draft the announcement.",
    ticker_after_approval: 'Permission ask sent to the Ellisons',
  },
]

// ── Live activity (scoped to Front Desk & Guests) ─────────────────────
const liveSeed = [
  seedEvent(6 * 60,   'front_desk',    'Caught a call — Sun service times question, info text sent', 'front_desk'),
  seedEvent(11 * 60,  'qa_assistant',  'Riley opened welcome SMS — 11 min after send',                'guest_followup'),
  seedEvent(47 * 60,  'check-circle',  'Connect form submitted — Kennedy Park (2nd visit)',            'front_desk'),
  seedEvent(3 * 3600, 'review_engine', 'Owen Holloway story captured — 1-yr Youth Leader milestone',  'stories'),
]
const livePool: PoolEvent[] = [
  { icon: 'front_desk',    text: 'Caught a call — pastoral request, escalated to Pastor Mark', role: 'front_desk' },
  { icon: 'check-circle',  text: 'Connect card submitted via web form',                          role: 'front_desk' },
  { icon: 'qa_assistant',  text: 'Welcome SMS opened — first-time visitor',                      role: 'guest_followup' },
  { icon: 'review_engine', text: 'Story drafted — testimony ready for review',                   role: 'stories' },
  { icon: 'calendar',      text: 'Newcomers Lunch RSVP — Maddux Family',                          role: 'guest_followup' },
  { icon: 'qa_assistant',  text: 'Forwarded inquiry — kids ministry routed to team lead',         role: 'front_desk' },
]

const { events: liveEvents, fmtAgo: fmtLiveAgo, pushEvent } = useLiveActivity({
  seed: liveSeed,
  pool: livePool,
})

function onApproved(item: ApprovalQueueItem) {
  if (!item.ticker_after_approval) return
  const role = item.role ?? 'front_desk'
  pushEvent({ icon: item.icon, text: item.ticker_after_approval, role })
}

const pageRoles = rolesOnTab('front-desk-guests')

// ── Grace's recommendations for Front Desk & Guests ─────────────────
const frontDeskRecommendations: GraceRecommendation[] = [
  {
    id: 'fd-newcomers-lunch',
    title: '3 families hit the 3rd-visit window this week',
    tag: 'Highest leverage',
    tagTone: 'leverage',
    body: 'The Madduxes (4th visit), the Reyes-Quinns (3rd visit), and the Harpers (3rd visit) all just crossed into the Newcomers Lunch sweet spot. Pre-decision families who attend close to membership at 71%. I drafted personal invites for all three.',
    impact: 'A 3x lift in membership conversion if even 2 of 3 attend.',
    actionLabel: 'Read the 3 invites',
  },
  {
    id: 'fd-riley-followup',
    title: 'Riley Boucher (Sunday visitor) hasn\'t replied to her welcome text',
    tag: 'Worth your eyes',
    tagTone: 'pastoral',
    body: 'She called Saturday saying she "loved Sunday" but hasn\'t responded to the welcome text I sent Monday. Could be a busy week, could be cooling off. Worth a brief personal note from you before I send the day-7 nudge.',
    actionLabel: 'Send personal note',
  },
  {
    id: 'fd-mark-pastoral',
    title: 'Mark called Tuesday at 5pm about his wife in the hospital, follow-up overdue',
    tag: 'Urgent',
    tagTone: 'urgent',
    body: 'I escalated to you immediately when the call came in. Tracking shows no logged follow-up since. Even a 2-minute text from you matters in this window.',
    actionLabel: 'Mark called/visited',
  },
]
</script>

<template>
  <div class="space-y-4">
    <RolesOnPage
      :roles="pageRoles"
      :back-to="{ name: 'dashboard.tab', params: { slug: client.slug, tab: 'today' } }">
      <template #lead>
        <PageLeadChip :client-id="client.id" page="front-desk-guests" />
        <DataFreshnessBadge v-if="isLiveChurch" resource="guestPipeline" />
      </template>
    </RolesOnPage>

    <!-- Grace's note (hidden for Focal Point: Cornerstone narrative, Mark-as-congregant) -->
    <section v-if="!isFocalPoint" class="rounded-card border border-brand/25 bg-brand/[0.04] px-5 py-4">
      <header class="flex items-center gap-2.5 mb-2.5">
        <div class="h-7 w-7 rounded-full bg-brand text-ink-inverse flex items-center justify-center text-xs font-bold flex-shrink-0">G</div>
        <span class="text-xs font-bold text-ink">Grace's note on first-time visitors + the front desk</span>
      </header>
      <p class="text-[13.5px] text-ink leading-relaxed max-w-2xl">
        <strong>22 inquiries this week, 100% answered.</strong> Industry benchmark for churches without a connections coordinator is around 53%. The other 47% would be voicemails sitting on someone's desk Monday morning. Three families just hit the Newcomers Lunch window (4th visit territory), which is the highest-leverage moment in the entire new-visitor journey. Mark called Tuesday with a real pastoral need, I escalated immediately, and he's waiting on a personal follow-up from you.
      </p>
    </section>

    <!-- Welcome hero block: this is the page's headline product, treated
         the same way the Today page treats Welcome in its role grid.
         Headline metric matches Today exactly ("8 welcomes / first-time
         families this week") so the same number reads the same way on
         both surfaces. -->
    <section v-if="!isFocalPoint" class="card border-2 border-brand bg-brand/[0.04] !p-5">
      <div class="text-[10px] font-bold uppercase tracking-[0.18em] text-brand mb-2">Headline role · this page</div>
      <div class="flex items-baseline gap-2 mb-3">
        <AdaIcon name="qa_assistant" class="h-5 w-5 text-brand" />
        <span class="font-bold text-ink text-lg">Welcome</span>
      </div>
      <div class="flex flex-wrap items-end gap-x-8 gap-y-3 justify-between">
        <div class="min-w-0">
          <div class="text-3xl font-bold text-brand tabular-nums leading-none">8 welcomes</div>
          <div class="text-[11px] uppercase tracking-wide text-ink-muted mt-1.5">first-time families this week</div>
          <!-- Supporting stats: sentence-case chips with clear separators
               instead of a wall of dense uppercase microtext. Checkmark
               icon on the drift line makes "0" read unambiguously as
               good news (zero failures, not zero data). -->
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3 text-xs text-ink-muted">
            <span><span class="font-semibold text-ink">42%</span> connected</span>
            <span class="text-ink-disabled" aria-hidden="true">·</span>
            <span class="inline-flex items-center gap-1">
              <AdaIcon name="check-circle" class="h-3 w-3 text-success flex-shrink-0" />
              <span>0 drift escalations from last 30 welcomes</span>
            </span>
          </div>
        </div>
        <div class="text-xs text-ink-muted max-w-md">
          <span class="font-semibold text-ink">Latest:</span> Riley Boucher opened her welcome SMS · 11 min after send
        </div>
      </div>
    </section>

    <div
      v-if="isFocalPoint && messagingBannerText"
      class="rounded-card border border-warn/20 bg-warn/10 px-4 py-2.5 text-xs text-ink-muted"
    >
      {{ messagingBannerText }}
    </div>

    <GraceApprovalQueue
      :items="isFocalPoint ? guestQueue : queueItems"
      :initial-resolved="isFocalPoint ? 0 : 5"
      assistant-name="Grace"
      :heading="isFocalPoint ? 'Needs you this week' : 'First-touch queue'"
      :subtitle="isFocalPoint ? 'Welcome notes for this week\'s first-time guests. Approve to send. Everyone else is tracked on the board below.' : 'Visitor sequences + story permissions awaiting your eyes. Co-sign to send.'"
      :send-handler="guestSendHandler"
      :empty-note="isFocalPoint ? guestEmptyNote : null"
      @approved="onApproved"
    />


    <!-- KPI strip (Focal Point: real, from Planning Center) -->
    <div v-if="isFocalPoint" class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">First-timers (4 wks)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ guestKpisScoped.firstTimers4w }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">signed in at Starting Point</div>
      </div>
      <div class="card">
        <div class="kpi-label">Still just visitors</div>
        <div class="mt-1 text-2xl font-bold text-warn tabular-nums">{{ guestKpisScoped.stillVisitors }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">of {{ guestKpisScoped.recentGuests }} in the Starting Point workflow</div>
      </div>
      <div class="card">
        <div class="kpi-label">In the pipeline</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ pipelineCount }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">guests Grace is walking in</div>
      </div>
      <div class="card">
        <div class="kpi-label">Finished welcome</div>
        <!-- Deliberately NOT success-green. This is a completion rate, and a low
             one is not good news; rendering 10% in green congratulated the church
             on the worst number on the page. "Still just visitors" already carries
             the warning, so this stays neutral rather than double-signalling. -->
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ guestKpisScoped.completedPct }}%</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">of the {{ guestKpisScoped.recentGuests }} in the workflow</div>
      </div>
    </div>

    <!-- Monthly flow. Sits with the KPI strip because it is state ("how is this
         month running"), not analysis. Self-hides until the live payload carries
         a `monthly` series, so the Cornerstone demo and the baked fallback are
         unaffected. -->
    <GuestPulseStrip v-if="isFocalPoint" :client-name="client.name" />

    <!-- KPI strip (Cornerstone demo) -->
    <div v-if="!isFocalPoint" class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card">
        <div class="kpi-label">Calls handled (7d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">47</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">12 captured visitor info</div>
      </div>
      <div class="card">
        <div class="kpi-label">First-timers (30d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">{{ visitor.first_time_30d }}</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">{{ visitor.total_active }} active in pipeline</div>
      </div>
      <div class="card">
        <div class="kpi-label">Connect rate</div>
        <div class="mt-1 text-2xl font-bold text-success tabular-nums">{{ Math.round(visitor.connect_rate * 100) }}%</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">visitors → connected</div>
      </div>
      <div class="card">
        <div class="kpi-label">Stories captured (30d)</div>
        <div class="mt-1 text-2xl font-bold text-ink tabular-nums">7</div>
        <div class="text-[11px] text-ink-disabled mt-0.5">3 share-ready quotes drafted</div>
      </div>
    </div>

    <!-- Focal Point: real guest pipeline board (front-door mirror of Care & Drift).
         Guests can't be scoped by the congregation lens; the page-aware lens bar
         in the chrome says so, so no per-board note is needed here. -->
    <GuestPipelineBoard v-if="isFocalPoint" :client-name="client.name" />

    <!-- Where the pipeline leaks, AFTER the operational path. The order on this
         page is deliberate: queue (this week's work), KPIs (state), board
         (everyone), then this (why it matters). An analysis card above the board
         interrupts someone who came here to work the list. -->
    <VisitorDropOff v-if="isFocalPoint" :client-name="client.name" />

    <!-- Focal Point: phone answering is a real capability, honestly future-framed -->
    <section v-if="isFocalPoint" class="card flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <span class="eyebrow">Front desk phone</span>
        <p class="mt-1 max-w-2xl text-sm text-ink-muted">
          When you are ready, Grace can answer your phone line too: capture the caller, text service info, book a visit, and escalate a pastoral request to you in real time. Not connected yet, and nothing here is invented.
        </p>
      </div>
      <span class="shrink-0 rounded-md bg-surface-elevated px-2.5 py-1 text-[11px] font-medium text-ink-muted">Available when you want it</span>
    </section>

    <!-- Front Desk: recent calls Grace handled (Cornerstone demo only) -->
    <section v-if="!isFocalPoint" id="front_desk" class="card scroll-mt-24">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Front Desk · Recent calls</span> <SampleBadge v-if="isFocalPoint" />
          <span class="text-xs text-ink-muted">what Grace handled at the phone</span>
        </div>
      </div>
      <ul class="space-y-2">
        <li
          v-for="(c, i) in recentCalls"
          :key="i"
          class="flex items-start gap-3 rounded-md bg-surface-elevated/60 px-3 py-2"
        >
          <span class="text-[10px] text-ink-disabled flex-shrink-0 mt-0.5 w-14">{{ c.time }}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-semibold text-ink">{{ c.from }}</span>
              <span class="text-[11px] text-ink-muted">· {{ c.topic }}</span>
            </div>
            <p class="text-[11px] text-ink-muted mt-0.5">{{ c.outcome }}</p>
          </div>
          <span
            class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide flex-shrink-0"
            :class="callToneClass(c.tone)"
          >{{ c.tone === 'warn' ? 'Escalated' : 'Auto' }}</span>
        </li>
      </ul>
    </section>

    <!-- Guest Follow-Up: visitor pipeline (Cornerstone demo; Focal Point uses the board above) -->
    <section v-if="!isFocalPoint" id="guest_followup" class="card scroll-mt-24">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Welcome · Pipeline</span>
          <span class="text-xs text-ink-muted">Grace's first-time visitor follow-up, by stage</span>
        </div>
      </div>

      <div v-if="!isFocalPoint" class="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        <div
          v-for="stage in (['first_time','returning','connected','membership_class','member'] as const)"
          :key="stage"
          class="rounded-md border border-divider bg-surface-elevated/40 px-3 py-2"
        >
          <div class="flex items-center gap-1.5 mb-0.5">
            <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: VISITOR_STAGE_META[stage].color }"></span>
            <span class="kpi-label">{{ VISITOR_STAGE_META[stage].label }}</span>
          </div>
          <div class="text-xl font-bold text-ink tabular-nums">{{ visitor.by_stage[stage] }}</div>
        </div>
      </div>

      <div>
        <div class="kpi-label mb-2">Recent Grace touches</div>
        <ul class="space-y-1.5">
          <li
            v-for="(t, i) in displayTouches"
            :key="i"
            class="flex items-center gap-2 text-xs"
          >
            <span class="font-semibold text-ink min-w-0 truncate w-32">{{ t.name }}</span>
            <span class="rounded bg-surface-elevated text-ink-muted px-1.5 py-0.5 text-[10px] font-medium flex-shrink-0">{{ t.stage }}</span>
            <span class="text-ink-muted truncate flex-1">{{ t.latest }}</span>
            <span class="text-[10px] text-ink-disabled flex-shrink-0">{{ t.ago }} ago</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- Story Engine (hidden for Focal Point: Cornerstone testimonials) -->
    <section v-if="!isFocalPoint" id="stories" class="card scroll-mt-24">
      <div class="mb-3 flex items-baseline justify-between flex-wrap gap-2">
        <div class="flex items-baseline gap-2">
          <span class="eyebrow">Story Engine · Recent</span>
          <span class="text-xs text-ink-muted">testimonies Grace asked for</span>
        </div>
      </div>
      <div class="space-y-2">
        <article
          v-for="(s, i) in recentStories"
          :key="i"
          class="rounded-md border border-divider bg-surface-elevated/40 px-3 py-2"
        >
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="text-sm font-semibold text-ink">{{ s.person }}</span>
            <span class="text-[11px] text-ink-muted">· {{ s.trigger }}</span>
            <span
              class="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
              :class="storyStatusClass(s.status)"
            >{{ s.status }}</span>
          </div>
          <p class="text-[11px] text-ink-muted italic leading-relaxed">{{ s.preview }}</p>
        </article>
      </div>
    </section>

    <LiveActivityFeed
      v-if="!isFocalPoint"
      :events="liveEvents"
      :fmt-ago="fmtLiveAgo"
      :get-role="getRole"
      title="Front desk + guests activity"
      subtitle="Grace's stream scoped to this page · auto-updates"
    />

    <!-- Grace's recommendations (hidden for Focal Point: Cornerstone narrative) -->
    <GraceRecommendations v-if="!isFocalPoint" :recommendations="frontDeskRecommendations" />

    <!-- Quiet visitors used reference (silence ESLint via reference) -->
    <span v-if="false">{{ visitors.length }}</span>
  </div>
</template>
