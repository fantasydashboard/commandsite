<script setup lang="ts">
/**
 * Focal Point - Leader digest preview. Serving and burnout cases route to the
 * ministry leader, not the pastor, via a Monday email. This shows the pastor
 * exactly what a leader receives: their team's list, a suggested message, and a
 * one-tap "I reached out" that flows back and moves the card on the board. The
 * confirm buttons are interactive so the flow is felt, not just described.
 * People are pulled from the real priority data by reference (no PII stored here).
 */
import { ref } from 'vue'
import { focalPointPriority } from '@/lib/clients/focal-point/priority'

const open = ref(false)
const done = ref<Set<string>>(new Set())
function confirm(id: string) {
  done.value = new Set(done.value).add(id)
}
function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

// priority.ts is skip-worktree and its COMMITTED copy has `items: []`, so in
// production every pri(i) was undefined and the template's `r.item.avatar`
// threw the moment a staffer clicked "See what a leader receives". The rows are
// filtered to those that actually resolved, and the whole card hides when none
// do, so a data gap degrades to absence instead of a crash.
const pri = (i: number) => focalPointPriority.items[i] as typeof focalPointPriority.items[number] | undefined
// Youth Service team: three who stopped (re-engage) + one over-serving (protect).
const allRows = [
  {
    id: 'ld-1', item: pri(1), kind: 'reengage' as const,
    headsup: 'Heads up: she was serving nearly every week right up until she stopped. This may be a burnout drop, so lead with care, not a recruiting ask.',
    msg: 'Hey Leilani, it has been a few weeks since I have seen you on the team and I have genuinely missed you. No pressure at all to jump back in, I mostly wanted to check that you are doing okay. Would love to catch up whenever works.',
  },
  {
    id: 'ld-2', item: pri(7), kind: 'reengage' as const, headsup: '',
    msg: 'Hey Licette, we have missed you on the Youth Service team the last several weeks. No pressure and no rush, I just wanted to reach out and see how you are doing. You are appreciated more than you know.',
  },
  {
    id: 'ld-3', item: pri(10), kind: 'reengage' as const, headsup: '',
    msg: 'Hey Rahne, I noticed you have been away from the team for a bit and wanted to check in. Nothing you need to do, I just wanted you to know you are thought of. Would love to see you when the time is right.',
  },
  {
    id: 'ld-4', item: pri(8), kind: 'protect' as const,
    headsup: 'This one is the opposite: he is serving almost every week across several ministries. Protect him before he burns out.',
    msg: 'Hey Javenson, you have carried so much for our team lately and I do not want to take it for granted. I would love for you to take a Sunday soon to just come and be filled, we have your spots covered. Thank you for the way you show up.',
  },
]
const KIND = {
  reengage: { label: 'Stopped serving', cls: 'bg-accent/15 text-accent' },
  protect: { label: 'Over-serving', cls: 'bg-danger/12 text-danger' },
}
// Drop any row whose person did not resolve (empty priority payload).
type Row = (typeof allRows)[number]
const rows = allRows.filter(
  (r): r is Row & { item: NonNullable<Row['item']> } => !!r.item,
)
</script>

<template>
  <!-- Hidden entirely when no people resolved: an empty leader-digest demo is
       worse than no demo, and a half-rendered one used to throw. -->
  <section v-if="rows.length" class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <span class="eyebrow">Leader digest</span>
        <h3 class="mt-1 text-base font-semibold text-ink">What your ministry leaders get Monday morning</h3>
        <p class="mt-0.5 max-w-2xl text-sm text-ink-muted">
          Serving and burnout cases route to the leader who knows them, not to you. They act from their inbox, no dashboard, and one tap moves the card on your board.
        </p>
      </div>
      <button
        class="shrink-0 rounded-md border border-divider px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand/5"
        @click="open = !open"
      >
        {{ open ? 'Hide the email' : 'See what a leader receives' }}
      </button>
    </div>

    <!-- email chrome -->
    <div v-if="open" class="mt-4 overflow-hidden rounded-xl border border-divider">
      <div class="border-b border-divider bg-surface-elevated/60 px-4 py-3">
        <div class="text-[11px] text-ink-muted">From <span class="font-semibold text-ink">Grace</span> at Focal Point Church &middot; Monday 6:00 AM</div>
        <div class="mt-0.5 text-sm font-semibold text-ink">Your Youth Service team, 4 people to reach this week</div>
      </div>

      <div class="space-y-4 px-4 py-4">
        <p class="text-[13px] leading-relaxed text-ink">
          Hi Youth Service lead, four people on your team could use a personal touch this week. Reach out however you normally would, a text, a call, a hallway hello, then tap the button so Pastor Mark knows it is handled. That is the whole job.
        </p>

        <article
          v-for="r in rows"
          :key="r.id"
          class="rounded-lg border border-divider p-3"
          :class="done.has(r.id) ? 'bg-success/[0.04]' : 'bg-surface-raised'"
        >
          <div class="flex items-center gap-2.5">
            <img v-if="r.item.avatar" :src="r.item.avatar" :alt="r.item.name" class="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-divider" loading="lazy" />
            <div v-else class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">{{ initials(r.item.name) }}</div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-semibold text-ink">{{ r.item.name }}</span>
                <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" :class="KIND[r.kind].cls">{{ KIND[r.kind].label }}</span>
              </div>
              <div class="text-[11px] text-ink-muted">{{ r.item.stat }}</div>
            </div>
          </div>

          <p v-if="r.headsup" class="mt-2 rounded-md bg-warn/10 px-2.5 py-1.5 text-[12px] leading-snug text-ink">{{ r.headsup }}</p>

          <p class="mt-2 rounded-lg border border-divider bg-surface-elevated/40 px-3 py-2 text-[12px] italic leading-relaxed text-ink-muted">
            Suggested: "{{ r.msg }}"
          </p>

          <div class="mt-2.5 flex items-center gap-3">
            <template v-if="!done.has(r.id)">
              <button
                class="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-ink-inverse hover:bg-brand-hover"
                @click="confirm(r.id)"
              >I reached out</button>
              <span class="text-[11px] text-ink-muted">or reply DONE</span>
            </template>
            <span v-else class="inline-flex items-center gap-1.5 rounded-md bg-success/12 px-2.5 py-1 text-xs font-semibold text-success">
              Logged Jul 13 &middot; Pastor Mark's board updated
            </span>
          </div>
        </article>

        <p class="text-[12px] leading-relaxed text-ink-muted">
          Anyone you do not reach stays on next week's list, and if it keeps sliding it escalates to Pastor Mark. Nothing falls through. Thank you for loving your team well. Warmly, Grace
        </p>
      </div>
    </div>
  </section>
</template>
