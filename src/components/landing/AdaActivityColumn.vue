<script setup lang="ts">
/**
 * AdaActivityColumn — vertical scrolling "day-log" column for the hero.
 *
 * Renders Ada's recent actions as soft elevated cards, grouped by day,
 * continuously drifting upward. Cards are duplicated end-to-end so the
 * loop is seamless (CSS animation translates the inner stack by -50%
 * over 60s, which lands the duplicated half exactly where the original
 * started).
 *
 * Hover pauses the drift so the reader can read a card that caught their
 * eye. A top/bottom gradient mask softens entry + exit edges.
 *
 * Respects `prefers-reduced-motion`: column renders statically with the
 * mask still applied.
 *
 * The card data is curated, not live — this is atmospheric proof beside
 * the headline, not the working live feed. (The real LiveActivityFeed
 * is rendered below in the hub section.)
 */
import AdaIcon from '@/components/ada/AdaIcon.vue'

interface Card {
  icon: string
  title: string
  detail: string
  time: string
}

interface DayGroup {
  day: string
  cards: Card[]
}

const days: DayGroup[] = [
  {
    day: 'TUE · 19 MAY',
    cards: [
      { icon: 'phone-off',      title: 'Caught missed call · Walter Knox',  detail: 'AC quote · Tue 9 AM booked',                time: '8:47p'  },
      { icon: 'review_engine',  title: 'Asked Diane Rivera for a review',   detail: 'Job finished 1:50p · 5★ in 14 min',         time: '4:30p'  },
      { icon: 'quote_followup', title: 'Day-3 follow-up · The Whitlocks',   detail: '$4,200 quote · still warm',                 time: '2:14p'  },
      { icon: 'reactivation',   title: 'Reactivated Megan Riley',           detail: '18 months since last service',              time: '11:08a' },
    ],
  },
  {
    day: 'MON · 18 MAY',
    cards: [
      { icon: 'review_engine',   title: 'Trevor Ng · 5-star review',         detail: 'Ada thanked him by name',                  time: '4:42p'  },
      { icon: 'quote_followup',  title: 'Day-1 check-in · The Yangs',        detail: '$7,800 heat pump quote',                   time: '2:08p'  },
      { icon: 'customer_health', title: 'Flagged the Hernandez account',     detail: 'Last service: 14 months ago',              time: '11:21a' },
      { icon: 'schedule_coord',  title: 'Emergency booked · Petersons',      detail: 'No-heat call · Priya routed at 6:15 AM',   time: '6:15a'  },
    ],
  },
  {
    day: 'FRI · 16 MAY',
    cards: [
      { icon: 'phone-off',     title: 'Caught missed call · Marcus Hill',    detail: 'Sat install 8 AM booked',                  time: '7:53p'  },
      { icon: 'reactivation',  title: 'Win-back SMS · 12 customers',         detail: '1 replied within the hour',                time: '3:30p'  },
      { icon: 'review_engine', title: '4.9★ rating holding steady',          detail: '18 new reviews this month · was 2',        time: '10:45a' },
      { icon: 'phone-off',     title: '2 overnight calls handled',           detail: '$1,200 in jobs · both confirmed',          time: '9:10a'  },
    ],
  },
]

// Duplicate for seamless infinite scroll.
const loop = [...days, ...days]
</script>

<template>
  <div class="ada-column" aria-hidden="true">
    <div class="ada-column-inner">
      <template v-for="(group, gi) in loop" :key="gi">
        <div class="ada-day-header">{{ group.day }}</div>
        <div
          v-for="(card, ci) in group.cards"
          :key="`${gi}-${ci}`"
          class="ada-card bg-surface-raised"
        >
          <div class="ada-card-icon">
            <AdaIcon :name="card.icon" class="h-4 w-4" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline justify-between gap-2">
              <div class="text-sm font-semibold text-ink truncate">{{ card.title }}</div>
              <div class="text-[10px] text-ink-disabled flex-shrink-0 tabular-nums">{{ card.time }}</div>
            </div>
            <div class="text-[11px] text-ink-muted leading-snug mt-0.5 truncate">{{ card.detail }}</div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ada-column {
  position: relative;
  height: 100%;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%);
          mask-image: linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%);
}

.ada-column-inner {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  animation: adaColumnScroll 60s linear infinite;
  will-change: transform;
}
.ada-column:hover .ada-column-inner {
  animation-play-state: paused;
}

@keyframes adaColumnScroll {
  from { transform: translateY(0); }
  to   { transform: translateY(-50%); }
}

.ada-day-header {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(var(--color-ink-disabled));
  padding: 1rem 0.25rem 0.25rem;
  margin-top: 0.5rem;
}
.ada-day-header:first-child {
  margin-top: 0;
}

.ada-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-radius: 14px;
  border: 1px solid rgb(var(--color-divider) / 0.6);
  padding: 0.75rem 1rem;
  box-shadow:
    0 4px 12px -4px rgb(0 0 0 / 0.08),
    0 1px 3px -1px rgb(0 0 0 / 0.06);
}

.ada-card-icon {
  height: 36px;
  width: 36px;
  border-radius: 9999px;
  background: rgb(var(--color-brand) / 0.1);
  color: rgb(var(--color-brand));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

@media (prefers-reduced-motion: reduce) {
  .ada-column-inner { animation: none; }
}
</style>
