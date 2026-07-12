// Focal Point Church - Care & Drift priority feed.
// ---------------------------------------------------------------------------
// The "this week" action list: the most urgent people/families across all
// three signals (family drift, serving drift, burnout), interleaved, as photo
// cards. Faces come from Planning Center avatars (real photo or PCO initials).
//
// Contains names + photo URLs, so the committed version keeps items EMPTY; the
// real feed lives only in the local copy of this file (git skip-worktree).

export type PrioritySignal = 'drifting' | 'serving' | 'burnout'

export interface PriorityItem {
  id: string
  signal: PrioritySignal
  name: string
  avatar: string        // PCO avatar URL, or '' to fall back to initials
  signalLabel: string   // e.g. "Family drifting", "Stopped serving", "Burnout risk"
  stat: string          // the one "why now" line
  standing: string      // tenure / role context
  draft: string         // the drafted note, in Pastor Mark's voice
}

export const focalPointPriority: {
  total: number
  items: PriorityItem[]
} = {
  total: 410,
  items: [],
}
