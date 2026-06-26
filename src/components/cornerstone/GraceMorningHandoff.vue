<script setup lang="ts">
/**
 * GraceMorningHandoff: the conversational coworker note from Grace
 * to the senior or executive pastor.
 *
 * Tonal differences from the Heritage (Ada) version:
 *   - "Pastor" tone, not "blue-collar founder" tone
 *   - Money references are quieter (giving lapses get named but not
 *     dramatized; the focus is on the people)
 *   - Closes "praying with you this week" instead of "have a good
 *     one out there"
 *
 * Content covers the three things a pastoral handoff would cover:
 *   1. What came in from Sunday (visitors, replies, giving signals)
 *   2. Who needs your personal attention this week (drift, grief, care)
 *   3. What I noticed at the system level (volunteer gaps, prayer
 *      request patterns, Sunday flow)
 */

defineProps<{
  pastorName: string
  /** Optional override for the "this morning" timestamp text. */
  timestamp?: string
}>()
</script>

<template>
  <section class="rounded-card border border-brand/25 bg-brand/[0.04] px-5 py-5 sm:px-6 sm:py-6">
    <!-- Header: Grace avatar + name + timestamp -->
    <header class="flex items-center gap-3 mb-4">
      <div class="h-9 w-9 rounded-full bg-brand text-ink-inverse flex items-center justify-center text-sm font-bold flex-shrink-0">
        G
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline gap-2 flex-wrap">
          <span class="text-sm font-bold text-ink">Grace</span>
          <span class="text-[11px] text-ink-muted">{{ timestamp ?? 'Monday morning · 7:00am' }}</span>
        </div>
        <p class="text-[11px] text-ink-muted leading-snug">handoff from yesterday before staff meeting</p>
      </div>
    </header>

    <!-- The note itself: reads as real pastoral prose -->
    <div class="space-y-3.5 text-[13.5px] text-ink leading-relaxed max-w-2xl">
      <p>{{ pastorName }}, here's where things stand from Sunday before staff meeting.</p>

      <p>
        <strong>4 first-time families on Sunday</strong>. The Madduxes were back for their 4th visit (the daughter told her teacher she can't wait to come back). I drafted a Newcomers Lunch invite for them. The other 3 families got welcome cards in your voice. All four sequences are running.
      </p>

      <p>
        <strong>The Sullivan family is the one I'd flag</strong>. Three signals now: no Sunday attendance for 6 weeks, dropped out of their small group in May, paused giving last month. Could be a season, could be something harder. I drafted a no-agenda coffee invite for Drew and Ana that doesn't read as pastoral check-in. Wants your eyes before it goes.
      </p>

      <p>
        <strong>Brian Patel replied to last week's grief follow-up</strong> ("we're doing okay, kids are okay, thank you for checking"). I added him to the 30-day follow-up rotation and flagged him for the prayer team. No action needed from you right now.
      </p>

      <div class="pt-1">
        <p class="text-[12px] text-ink-muted mb-1.5"><strong class="text-ink">A few things I noticed:</strong></p>
        <ul class="space-y-1.5 text-[13px] text-ink-muted">
          <li>
            <span class="text-brand">·</span>
            Sunday school registration is up 22% vs last fall. Worth a shout-out in the announcements this week.
          </li>
          <li>
            <span class="text-brand">·</span>
            3 lapsed givers (~90 days) reactivated in May after my outreach. One was Carol Lin, who said she'd just forgotten to update her card. Small thing, big trust.
          </li>
          <li>
            <span class="text-brand">·</span>
            Volunteer gap on Sunday: greeters team only has 2 confirmed for next Sunday. I'll start the text chain Thursday unless you want to handle it personally.
          </li>
        </ul>
      </div>

      <p class="pt-1">Praying with you this week.</p>

      <p class="text-ink"><span class="text-ink-muted">Grace</span></p>
    </div>
  </section>
</template>
