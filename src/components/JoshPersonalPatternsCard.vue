<script setup lang="ts">
/**
 * Josh Personal — "Patterns Sage noticed" card.
 *
 * Shows undismissed patterns from the nightly detector. Tapping a row
 * emits 'discuss' with a pre-filled prompt — the parent opens Sage
 * chat with the input seeded so Josh just hits Send.
 */
import { computed } from 'vue'
import AssistantMark from '@/components/AssistantMark.vue'
import AdaIcon from '@/components/ada/AdaIcon.vue'
import type { DetectedPattern } from '@/lib/clients/josh-personal/patternsApi'

const props = defineProps<{ patterns: DetectedPattern[] }>()
const emit = defineEmits<{ (e: 'discuss', prompt: string): void }>()

const SEV_TONE: Record<string, { dot: string; pill: string; iconClass: string }> = {
  info:        { dot: 'bg-brand',  pill: 'bg-brand/10 text-brand',   iconClass: 'text-brand' },
  notable:     { dot: 'bg-warn',   pill: 'bg-warn/15 text-warn',     iconClass: 'text-warn' },
  concerning:  { dot: 'bg-danger', pill: 'bg-danger/15 text-danger', iconClass: 'text-danger' },
}

// AdaIcon names (NOT emoji) per impeccable register. The icon system
// matches Apex / Cornerstone surfaces so the visual vocabulary is
// consistent across the brand.
const TYPE_ICON: Record<string, string> = {
  sleep_deviation:     'clock',
  hrv_deviation:       'trending-up',
  weight_pace:         'quote_followup',
  adherence_drift:     'alert-triangle',
  sat_fat_breach:      'alert-triangle',
  bp_threshold:        'flask',
  workout_gap:         'phone-off',
  water_chronic_under: 'flask',
}

// Dedupe by (pattern_type + title) so we never render the same pattern
// twice. Backend has been emitting duplicates for some types and the
// double-render is the most visible bug on this surface. Belt + braces
// at the UI layer until the detector is tightened up.
const uniquePatterns = computed<DetectedPattern[]>(() => {
  const seen = new Set<string>()
  const out: DetectedPattern[] = []
  for (const p of props.patterns) {
    const key = `${p.pattern_type}|${p.title}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
})

function discussPrompt(p: DetectedPattern): string {
  return `Tell me about: ${p.title}`
}
</script>

<template>
  <section v-if="uniquePatterns.length > 0" class="card p-0 overflow-hidden">
    <header class="px-4 py-3 border-b border-divider bg-surface-elevated">
      <div class="flex items-center gap-2">
        <AssistantMark class="h-4 w-4 text-brand" />
        <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Patterns Sage noticed</span>
      </div>
      <div class="text-[11px] text-ink-muted mt-0.5">
        {{ uniquePatterns.length }} pattern{{ uniquePatterns.length === 1 ? '' : 's' }} from last night's scan · tap to discuss
      </div>
    </header>
    <ul class="divide-y divide-divider">
      <li v-for="p in uniquePatterns" :key="p.id" class="px-4 py-3 hover:bg-canvas/40 cursor-pointer group" @click="emit('discuss', discussPrompt(p))">
        <div class="flex items-start gap-3">
          <AdaIcon
            :name="TYPE_ICON[p.pattern_type] ?? 'qa_assistant'"
            class="h-4 w-4 shrink-0 mt-0.5"
            :class="(SEV_TONE[p.severity] ?? SEV_TONE.info).iconClass"
          />
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline justify-between gap-2 flex-wrap">
              <span class="text-sm font-semibold text-ink">{{ p.title }}</span>
              <span
                class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5"
                :class="(SEV_TONE[p.severity] ?? SEV_TONE.info).pill"
              >
                <span class="h-1.5 w-1.5 rounded-full" :class="(SEV_TONE[p.severity] ?? SEV_TONE.info).dot" />
                {{ p.severity }}
              </span>
            </div>
            <p class="text-[12px] text-ink-muted leading-snug mt-1">{{ p.evidence_summary }}</p>
            <div class="text-[11px] text-brand font-medium mt-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
              Discuss with Sage →
            </div>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
