<script setup lang="ts">
/**
 * Focal Point - Comms drafts. Grace writes the weekly recap and newsletter FROM
 * the real dashboard numbers (attendance, first-timers, online), so the comms
 * admin stops gathering stats. The admin approves and sends. Sending and open-rate
 * analytics are future-framed, not invented. Only real numbers appear in copy.
 */
import { ref } from 'vue'
import { focalPointInsights as fp } from '@/lib/clients/focal-point/insights'

const approved = ref<Set<string>>(new Set())
function approve(id: string) { approved.value = new Set(approved.value).add(id) }

const tw = fp.thisWeekend
const liveViews = fp.online.liveViews.counts[fp.online.liveViews.counts.length - 1]

const drafts = [
  {
    id: 'recap',
    kind: 'Sunday recap',
    to: 'Members email',
    body: `This past Sunday, ${tw.grand} of you joined us in person across our services, and we welcomed ${tw.firstTimers} first-time guests. Another ${liveViews} watched the live stream from home. Thank you for showing up and for making room for the people worshipping next to you. If you were here for the first time, we would love to meet you at Starting Point. See you next weekend.`,
  },
  {
    id: 'news',
    kind: 'Midweek newsletter',
    to: 'Full list',
    body: `A few things this week: Newcomers Lunch RSVPs are open, Growth Groups resume, and we would love your help serving this Sunday, a few teams are still short. Reply here if you would like to jump in. Grateful for you.`,
  },
]
</script>

<template>
  <section class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Comms drafts</span>
      <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
        Written from your real numbers
      </span>
    </div>
    <h3 class="mt-1 text-base font-semibold text-ink">The weekly comms, already written for your admin</h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">
      Grace drafts the recap and newsletter straight from this dashboard, so nobody spends Monday morning gathering the numbers. Your comms admin approves and sends.
    </p>

    <div class="mt-4 space-y-3">
      <article v-for="d in drafts" :key="d.id" class="rounded-lg border border-divider p-3" :class="approved.has(d.id) ? 'bg-success/[0.04]' : ''">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="rounded bg-brand/12 px-1.5 py-0.5 text-[10px] font-semibold text-brand">{{ d.kind }}</span>
            <span class="text-[11px] text-ink-muted">to {{ d.to }}</span>
          </div>
          <template v-if="!approved.has(d.id)">
            <button class="rounded-md border border-divider px-3 py-1 text-xs font-semibold text-brand hover:bg-brand/5" @click="approve(d.id)">Approve for admin</button>
          </template>
          <span v-else class="rounded-md bg-success/12 px-2.5 py-1 text-xs font-semibold text-success">Sent to admin</span>
        </div>
        <p class="mt-2 rounded-lg border border-divider bg-surface-elevated/40 px-3 py-2 text-[12px] italic leading-relaxed text-ink">"{{ d.body }}"</p>
      </article>
    </div>

    <p class="mt-3 text-[11px] text-ink-disabled">
      Only real numbers appear here. Sending, scheduling, and open-rate analytics connect to your email tool when you are ready.
    </p>
  </section>
</template>
