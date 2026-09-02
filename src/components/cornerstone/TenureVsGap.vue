<script setup lang="ts">
/**
 * Focal Point - "Who you are actually losing" (Care & Drift).
 *
 * The one view on this page that ranks by PASTORAL WEIGHT instead of recency.
 *
 * Every other section is a list sorted by how long someone has been gone. That
 * hides the thing that matters most: a household that came for two years before
 * going quiet is a completely different event from one that came four times and
 * faded, and in a 40-row table those two sit side by side looking identical.
 *
 * Plotting tenure (Sundays attended) against gap (Sundays missed) separates them
 * instantly, and the quadrant lines are not decorative: they are the exact
 * thresholds the rest of the page already runs on.
 *
 *   x = LONG_GONE_SUNDAYS (8)      how long absent before it stops being a blip
 *   y = ESTABLISHED_SUNDAYS (15)   how much history before they count as rooted
 *
 * So the chart doubles as an explanation of the page's own triage: top-right is
 * the escalated lane, bottom-right is the long-drifted review, and the left half
 * is this week's notes. Someone who wants to know "why is this family a call and
 * that one a note" can read the answer off the picture.
 *
 * Uses live drift data. Aggregate positions only; names appear on hover, and the
 * export is the same sensitive, scope-gated CSV as the directories.
 */
import { computed, ref } from 'vue'
import { driftData } from '@/lib/clients/church/careDataLoader'
import { ESTABLISHED_SUNDAYS, LONG_GONE_SUNDAYS } from '@/lib/clients/focal-point/familyPipeline'
import { useCongregationLens } from '@/stores/congregationLens'
import { congregationOf } from '@/lib/clients/focal-point/congregationLive'
import { useCareActions } from '@/stores/careActions'
import { exportCsv } from '@/lib/exportCsv'
import ExportButton from '@/components/cornerstone/ExportButton.vue'

const props = defineProps<{ clientName: string }>()

const lens = useCongregationLens()
const care = useCareActions()

// Below this a scatter is noise: a handful of dots in a big empty frame says
// less than the lists already do. Same discipline as the drift-curve bars.
const MIN_POINTS = 8

interface Pt {
  family: string
  tenure: number
  gap: number
  x: number
  y: number
  critical: boolean
}

const families = computed(() =>
  driftData().families.filter(
    (f) => (lens.scope === 'all' || congregationOf(f.family) === lens.scope) && !care.isHidden(`family:${f.family}`),
  ),
)

// Plot geometry in a 0-100 viewBox space; the SVG scales to the container.
const PAD = { l: 9, r: 4, t: 5, b: 11 }
const maxGap = computed(() => Math.max(LONG_GONE_SUNDAYS * 2, ...families.value.map((f) => f.sundaysMissed)))
const maxTenure = computed(() => Math.max(ESTABLISHED_SUNDAYS * 2, ...families.value.map((f) => f.totalSundays)))

const sx = (gap: number) => PAD.l + (gap / maxGap.value) * (100 - PAD.l - PAD.r)
const sy = (tenure: number) => 100 - PAD.b - (tenure / maxTenure.value) * (100 - PAD.t - PAD.b)

const points = computed<Pt[]>(() =>
  families.value.map((f) => ({
    family: f.family,
    tenure: f.totalSundays,
    gap: f.sundaysMissed,
    x: sx(f.sundaysMissed),
    y: sy(f.totalSundays),
    critical: f.totalSundays >= ESTABLISHED_SUNDAYS && f.sundaysMissed >= LONG_GONE_SUNDAYS,
  })),
)

const criticalCount = computed(() => points.value.filter((p) => p.critical).length)
const xLine = computed(() => sx(LONG_GONE_SUNDAYS))
const yLine = computed(() => sy(ESTABLISHED_SUNDAYS))

const hover = ref<Pt | null>(null)

function onExport() {
  exportCsv(
    [...families.value].sort(
      (a, b) => b.totalSundays * b.sundaysMissed - a.totalSundays * a.sundaysMissed,
    ),
    [
      { header: 'Family', value: (f) => `The ${f.family} family` },
      { header: 'Sundays attended', value: (f) => f.totalSundays },
      { header: 'Sundays missed', value: (f) => f.sundaysMissed },
      { header: 'Months attending', value: (f) => f.monthsAttending },
      { header: 'Last checked in', value: (f) => f.lastSeen },
      {
        header: 'Established and long gone',
        value: (f) => (f.totalSundays >= ESTABLISHED_SUNDAYS && f.sundaysMissed >= LONG_GONE_SUNDAYS ? 'yes' : 'no'),
      },
    ],
    { client: props.clientName, dataset: 'tenure-vs-gap', scope: lens.scope },
  )
}
</script>

<template>
  <section v-if="points.length >= MIN_POINTS" class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Who you are actually losing</span>
      <div class="flex items-center gap-3">
        <span class="text-[11px] text-ink-muted">Every flagged family</span>
        <ExportButton label="Download list" sensitive :count="points.length" @export="onExport" />
      </div>
    </div>

    <h3 class="mt-1 text-base font-semibold text-ink">How rooted they were, against how long they have been gone</h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">
      Every other list here sorts by how recently someone was seen. This one sorts by what
      is at stake: a family who came for two years is a different loss from one who came
      four times, and in a list those two look the same.
    </p>

    <div class="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem]">
      <div class="relative">
        <svg viewBox="0 0 100 100" class="h-64 w-full" role="img"
             aria-label="Scatter of flagged families: Sundays attended against Sundays missed">
          <!-- Quadrant wash: top-right is the group that matters most -->
          <rect :x="xLine" :y="PAD.t" :width="100 - PAD.r - xLine" :height="yLine - PAD.t"
                fill="rgb(217 119 6 / 0.07)" />

          <!-- Threshold lines. These are the real cut-offs the page runs on. -->
          <line :x1="xLine" :y1="PAD.t" :x2="xLine" :y2="100 - PAD.b" stroke="#CBD5E1" stroke-width="0.4" stroke-dasharray="1.5 1.5" />
          <line :x1="PAD.l" :y1="yLine" :x2="100 - PAD.r" :y2="yLine" stroke="#CBD5E1" stroke-width="0.4" stroke-dasharray="1.5 1.5" />

          <!-- Axes -->
          <line :x1="PAD.l" :y1="100 - PAD.b" :x2="100 - PAD.r" :y2="100 - PAD.b" stroke="#E2E8F0" stroke-width="0.5" />
          <line :x1="PAD.l" :y1="PAD.t" :x2="PAD.l" :y2="100 - PAD.b" stroke="#E2E8F0" stroke-width="0.5" />

          <!-- Points. 2px surface ring so overlapping households stay countable. -->
          <g>
            <circle
              v-for="p in points"
              :key="p.family"
              :cx="p.x"
              :cy="p.y"
              r="1.7"
              :fill="p.critical ? '#D97706' : '#1d4ed8'"
              fill-opacity="0.8"
              stroke="#fff"
              stroke-width="0.5"
              class="cursor-pointer"
              @mouseenter="hover = p"
              @mouseleave="hover = null"
            />
          </g>

          <text :x="PAD.l" :y="99" font-size="3" fill="#94A3B8">0</text>
          <text :x="100 - PAD.r" :y="99" font-size="3" fill="#94A3B8" text-anchor="end">{{ maxGap }} Sundays missed</text>
          <text :x="1" :y="PAD.t + 2" font-size="3" fill="#94A3B8">{{ maxTenure }}</text>
          <text :x="1" :y="100 - PAD.b" font-size="3" fill="#94A3B8">0</text>
        </svg>

        <div
          v-if="hover"
          class="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-[11px] shadow-card"
        >
          <span class="font-semibold text-ink">The {{ hover.family }} family</span>
          <span class="text-ink-muted"> · came {{ hover.tenure }} Sundays · gone {{ hover.gap }}</span>
        </div>
      </div>

      <div class="space-y-3 text-[12px] leading-relaxed">
        <div class="rounded-lg border border-warn/30 bg-warn/[0.06] px-3 py-2.5">
          <div class="flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full" style="background:#D97706"></span>
            <span class="font-semibold text-ink">Rooted, and gone</span>
          </div>
          <p class="mt-1 text-ink-muted">
            <span class="font-semibold text-ink">{{ criticalCount }}</span> households attended
            {{ ESTABLISHED_SUNDAYS }}+ Sundays and have now missed {{ LONG_GONE_SUNDAYS }}+.
            These are the calls. A drafted note is not enough here.
          </p>
        </div>
        <div class="rounded-lg border border-divider px-3 py-2.5">
          <div class="flex items-center gap-1.5">
            <span class="h-2 w-2 rounded-full" style="background:#1d4ed8"></span>
            <span class="font-semibold text-ink">Everyone else</span>
          </div>
          <p class="mt-1 text-ink-muted">
            Left of the line is a recent gap, a note still fits. Bottom-right came only a
            handful of times months ago; those sit in the review list rather than this
            week's queue.
          </p>
        </div>
        <p class="text-[11px] text-ink-disabled">
          The dashed lines are the actual thresholds this page uses, so the picture also
          explains why any given family is a call, a note, or a review.
        </p>
      </div>
    </div>
  </section>
</template>
