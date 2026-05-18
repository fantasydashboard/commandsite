<script setup lang="ts">
/**
 * AdaIcon — a lean inline-SVG icon for every Ada role + queue/activity category.
 *
 * Replaces emoji as iconography in chrome (Hub tiles, RolesOnPage chips,
 * Approval Queue item leads, Live Activity event leads). Emoji stay only
 * in voice surfaces (customer quote previews, prose).
 *
 * Falls back to rendering the input as a span (emoji passthrough) when
 * the name doesn't match a known icon. This keeps Cornerstone modules
 * working until they're migrated.
 *
 * Icon paths are MIT-licensed Lucide-style 24×24 viewBox, stroke-width=2,
 * round caps + joins.
 */
import { computed } from 'vue'

const props = defineProps<{
  /** Role key, category name (truck, clock, etc.), or fallback emoji string. */
  name: string
}>()

const KNOWN = new Set([
  // Role keys
  'front_desk', 'quote_followup', 'customer_health', 'reactivation',
  'schedule_coord', 'review_engine', 'email_marketing', 'performance_reporting',
  'qa_assistant', 'referral_hunter', 'deal_won_handoff', 'job_documentation',
  // Generic categories
  'truck', 'check-circle', 'clock', 'alert-triangle', 'dollar-sign',
  'shuffle', 'phone-off', 'trending-up', 'zap', 'flask', 'building', 'calendar',
])

const isKnown = computed(() => KNOWN.has(props.name))
</script>

<template>
  <svg
    v-if="isKnown"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- ── Role icons ────────────────────────────────────────────── -->

    <!-- Front Desk: phone -->
    <template v-if="name === 'front_desk'">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.86.34 1.7.66 2.5a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.8.32 1.64.54 2.5.66A2 2 0 0 1 22 16.92z" />
    </template>

    <!-- Quote Follow-Up: clipboard-list -->
    <template v-else-if="name === 'quote_followup'">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6M9 16h6M9 8h.01" />
    </template>

    <!-- Customer Health: heart-pulse -->
    <template v-else-if="name === 'customer_health'">
      <path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0L12 5.34l-.77-.76a5.4 5.4 0 0 0-7.65 0 5.4 5.4 0 0 0 0 7.65L12 21l8.42-8.77a5.4 5.4 0 0 0 0-7.65z" />
      <path d="M3 12h3l2-3 3 6 2-3h8" />
    </template>

    <!-- Reactivation Engine: refresh-ccw -->
    <template v-else-if="name === 'reactivation'">
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </template>

    <!-- Schedule Coordination: calendar-clock -->
    <template v-else-if="name === 'schedule_coord'">
      <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <circle cx="17" cy="17" r="5" />
      <path d="M17 14.5V17l1.5 1.5" />
    </template>

    <!-- Review Engine: star -->
    <template v-else-if="name === 'review_engine'">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </template>

    <!-- Email Marketing: mail -->
    <template v-else-if="name === 'email_marketing'">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </template>

    <!-- Performance Reporting: bar-chart-3 -->
    <template v-else-if="name === 'performance_reporting'">
      <path d="M3 3v18h18" />
      <path d="M7 16V8M12 16v-5M17 16v-9" />
    </template>

    <!-- Q&A Assistant: message-circle -->
    <template v-else-if="name === 'qa_assistant'">
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" />
    </template>

    <!-- Referral Hunter: users -->
    <template v-else-if="name === 'referral_hunter'">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </template>

    <!-- Deal-Won Handoff: target -->
    <template v-else-if="name === 'deal_won_handoff'">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </template>

    <!-- Job Documentation: camera -->
    <template v-else-if="name === 'job_documentation'">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="4" />
    </template>

    <!-- ── Generic category icons ────────────────────────────────── -->

    <!-- truck -->
    <template v-else-if="name === 'truck'">
      <path d="M5 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0" />
      <path d="M9 18h6V6H1v12h2" />
      <path d="M15 8h4l3 4v6h-3" />
    </template>

    <!-- check-circle -->
    <template v-else-if="name === 'check-circle'">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </template>

    <!-- clock -->
    <template v-else-if="name === 'clock'">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </template>

    <!-- alert-triangle -->
    <template v-else-if="name === 'alert-triangle'">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </template>

    <!-- dollar-sign -->
    <template v-else-if="name === 'dollar-sign'">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </template>

    <!-- shuffle -->
    <template v-else-if="name === 'shuffle'">
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </template>

    <!-- phone-off -->
    <template v-else-if="name === 'phone-off'">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </template>

    <!-- trending-up -->
    <template v-else-if="name === 'trending-up'">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </template>

    <!-- zap -->
    <template v-else-if="name === 'zap'">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </template>

    <!-- flask: beaker -->
    <template v-else-if="name === 'flask'">
      <path d="M4.5 3h15M6 3v15a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V3M6 10h12" />
    </template>

    <!-- building -->
    <template v-else-if="name === 'building'">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
    </template>

    <!-- calendar -->
    <template v-else-if="name === 'calendar'">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </template>
  </svg>

  <!-- Fallback: render unknown names as text (emoji passthrough) -->
  <span v-else aria-hidden="true">{{ name }}</span>
</template>
