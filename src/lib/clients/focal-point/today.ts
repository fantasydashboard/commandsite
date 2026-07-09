// Focal Point Church - Today data (brief + approval queue).
// ---------------------------------------------------------------------------
// The committed version below is REPRESENTATIVE: real aggregate facts (funnel
// %, leader counts) but NO individual congregant names. The real, name-level
// version lives only in the local copy of this file (git skip-worktree), so
// congregant PII never enters git history. See scripts/pull-fp-data.mjs.
//
// Stat tiles still come from the Cornerstone passthrough for now; only the
// brief and approval queue are Focal Point specific.

import type { MorningBrief } from '@/components/cornerstone/GraceMorningHandoff.vue'
import type { ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'

export * from '@/lib/clients/cornerstone/today'

// Grace's Monday brief to Pastor Mark. Aggregate facts are real (pulled from
// PCO workflows + lists); no individual names in the committed version.
export const focalPointBrief: MorningBrief = {
  greeting: "Pastor Mark, here's where things stand from Sunday before staff meeting.",
  paragraphs: [
    {
      lead: '7 first-time families came through Starting Point Sunday',
      body: 'Each one has a welcome ready in your voice, warm and no pressure. I flagged the two a team member is assigned to follow up with personally so none of them slip. Want to review the drafts before they go out?',
    },
    {
      lead: "The pattern I'd flag is the Starting Point gap",
      body: 'Of everyone who has come through Starting Point, only about 22% have reached a New Member Class. That is where people quietly fall away. I can pull the recent guests who have not taken a next step so we can reach out before they drift.',
    },
    {
      lead: 'The pathway is moving',
      body: '129 people have come through Baptism Class, and the Growth Group track is where I would love to see more of them land next. A nudge from you carries the most weight there.',
    },
  ],
  noticed: [
    '93 active Growth Group leaders on file, and leader (Empower) attendance is steady.',
    'Saturday pastor-led prayer drew 152 recently. Worth naming from the stage.',
    'Friend Day is Aug 30. Worth a greeter check across the four services before then.',
  ],
  closing: 'Praying with you this week.',
}

// Approval queue: welcome drafts in Pastor Mark's voice. Committed version
// uses generic descriptors; the local override names the real Sunday guests.
export const focalPointApproval: ApprovalQueueItem[] = [
  {
    id: 'fp-welcome-1',
    role: 'guest_followup',
    icon: 'qa_assistant',
    badge: 'Welcome',
    badgeClass: 'bg-success/15 text-success',
    title: 'Welcome text: first-time family',
    recipient: 'Signed in at Starting Point Sunday',
    preview: '"We were so glad you joined us at Focal Point on Sunday. We know finding a church home looks different for every person, and we would be honored to journey alongside you this season. If we can help in any way, just reply here. Blessings, Pastor Mark"',
    approved_response: 'Sent. They are in the Starting Point follow-up sequence now. If no reply in a few days I will draft a soft second touch.',
    ticker_after_approval: 'Welcome text sent to a first-time family',
  },
  {
    id: 'fp-welcome-2',
    role: 'guest_followup',
    icon: 'qa_assistant',
    badge: 'Welcome',
    badgeClass: 'bg-success/15 text-success',
    title: 'Welcome text: returning guest',
    recipient: 'Second visit · came with a friend',
    preview: '"So glad you were back with us Sunday. It means a lot that you keep choosing to worship with our family. If you are ready for a next step, Starting Point is a great place to begin, and we would love to walk it with you. Blessings, Pastor Mark"',
    approved_response: 'Sent. I will watch for a reply and let you know if they ask about Starting Point.',
    ticker_after_approval: 'Welcome text sent to a returning guest',
  },
  {
    id: 'fp-reengage-1',
    role: 'drift_detection',
    icon: 'alert-triangle',
    badge: 'Re-engage',
    badgeClass: 'bg-warn/15 text-warn',
    title: 'Check-in: Starting Point guest, no next step',
    recipient: 'Came through Starting Point, no New Member Class yet',
    preview: '"Just a quick note to say hello and let you know we have missed you lately at Focal Point. No need to reply if you are swamped, but know that you are being thought of and prayed for. Hope to catch up soon. Blessings, Pastor Mark"',
    approved_response: 'Sent. I will flag it if they re-engage so you can follow up personally.',
    ticker_after_approval: 'Re-engagement note sent to a Starting Point guest',
  },
]
