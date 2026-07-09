// Focal Point Church - Front Desk / Guests data.
// ---------------------------------------------------------------------------
// Committed version is REPRESENTATIVE (no individual names). The real, name
// level version lives only in the local copy of this file (git skip-worktree),
// so congregant PII never enters git. Source: scripts/pull-fp-data.mjs ->
// Starting Point workflow + Visitors list.
//
// Visitor stat tiles still come from the Cornerstone passthrough; only the
// approval queue and the recent-touches list are Focal Point specific.

import type { ApprovalQueueItem } from '@/components/grace/GraceApprovalQueue.vue'

export * from '@/lib/clients/cornerstone/visitors'

// Shape matches the FrontDesk module's VisitorTouch (structural typing).
export interface FocalPointTouch {
  name: string
  stage: string
  latest: string
  ago: string
}

// Recent first-time guests from Sunday (Starting Point sign-ins). Committed
// version uses generic labels; the local override names the real guests.
export const focalPointVisitorTouches: FocalPointTouch[] = [
  { name: 'First-time guest', stage: 'First-time', latest: 'Welcome drafted in Pastor Mark\'s voice', ago: '2d' },
  { name: 'First-time guest', stage: 'First-time', latest: 'Welcome drafted, assigned for personal follow-up', ago: '2d' },
  { name: 'First-time family', stage: 'First-time', latest: 'Welcome drafted, kids checked into Kids Point', ago: '2d' },
  { name: 'Returning guest', stage: 'Returning', latest: 'Second visit, Starting Point invite drafted', ago: '4d' },
  { name: 'Brazilian service guest', stage: 'First-time', latest: 'Welcome drafted (Portuguese hand-off flagged)', ago: '4d' },
  { name: 'Starting Point guest', stage: 'No next step', latest: 'No New Member Class yet, re-engage note drafted', ago: '9d' },
]

// Welcome drafts in Pastor Mark's voice, queued for review (never auto-sent).
export const focalPointFrontDeskQueue: ApprovalQueueItem[] = [
  {
    id: 'fd-fp-welcome-1',
    role: 'guest_followup',
    icon: 'qa_assistant',
    badge: 'Welcome',
    badgeClass: 'bg-success/15 text-success',
    title: 'Welcome text: first-time guest',
    recipient: 'Signed in at Starting Point Sunday',
    preview: '"We were so glad you joined us at Focal Point on Sunday. We know finding a church home looks different for every person, and we would be honored to journey alongside you this season. If we can help in any way, just reply here. Blessings, Pastor Mark"',
    approved_response: 'Sent. They are in the Starting Point follow-up sequence now.',
    ticker_after_approval: 'Welcome text sent to a first-time guest',
  },
  {
    id: 'fd-fp-welcome-2',
    role: 'guest_followup',
    icon: 'qa_assistant',
    badge: 'Welcome',
    badgeClass: 'bg-success/15 text-success',
    title: 'Welcome text: first-time family',
    recipient: 'Signed in Sunday, kids at Kids Point',
    preview: '"So glad you and your family were with us at Focal Point on Sunday. We hope you experienced God\'s presence in a real and personal way. Over the next few weeks we would love to help you discover more about our church family and how you can become part of it. Blessings, Pastor Mark"',
    approved_response: 'Sent. The family is in the Starting Point follow-up sequence. I will flag any reply.',
    ticker_after_approval: 'Welcome text sent to a first-time family',
  },
]
