<script setup lang="ts">
/**
 * GraceRecommendations: the "Grace noticed" / "Grace recommends" block
 * for the Cornerstone (church) demo.
 *
 * Same DNA as AdaRecommendations but in pastoral voice:
 *   - "Worth your eyes" / "Worth a personal touch" instead of leverage chips
 *   - Impact line in terms of PEOPLE re-engaged, not just dollars
 *   - Color treatment matches the brand-tinted card style
 */
import { ref } from 'vue'

export interface GraceRecommendation {
  id: string
  title: string
  tag: string
  tagTone: 'pastoral' | 'opportunity' | 'urgent' | 'leverage'
  body: string
  impact?: string
  actionLabel: string
}

const props = withDefaults(defineProps<{
  recommendations: GraceRecommendation[]
  subtitle?: string
}>(), {
  subtitle: '',
})

const acceptedIds = ref<Set<string>>(new Set())

function accept(id: string): void {
  acceptedIds.value.add(id)
}

function tagToneClass(tone: GraceRecommendation['tagTone']): string {
  switch (tone) {
    case 'pastoral':    return 'bg-brand/15 text-brand'
    case 'opportunity': return 'bg-success/15 text-success'
    case 'urgent':      return 'bg-warn/15 text-warn'
    case 'leverage':    return 'bg-accent/15 text-accent'
  }
}

function defaultSubtitle(): string {
  if (props.subtitle) return props.subtitle
  const n = props.recommendations.length
  return `${n} ${n === 1 ? 'note' : 'notes'} from this week`
}
</script>

<template>
  <section class="card bg-brand/5 border-brand/30">
    <header class="mb-3">
      <div class="flex items-baseline gap-2">
        <span class="rounded-full bg-brand/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
          Grace's notes for you
        </span>
        <span class="text-xs text-ink-muted">{{ defaultSubtitle() }}</span>
      </div>
    </header>

    <div class="space-y-3">
      <article
        v-for="rec in recommendations"
        :key="rec.id"
        class="rounded-card border bg-surface-raised p-3"
        :class="acceptedIds.has(rec.id) ? 'border-success/30 bg-success/[0.04]' : 'border-divider'"
      >
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2 mb-1 flex-wrap">
              <strong class="text-sm text-ink">{{ rec.title }}</strong>
              <span
                class="text-[10px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5"
                :class="tagToneClass(rec.tagTone)"
              >{{ rec.tag }}</span>
            </div>
            <p class="text-[12.5px] text-ink-muted leading-snug" v-html="rec.body"></p>
            <p
              v-if="rec.impact"
              class="text-[12.5px] text-ink-muted leading-snug mt-1 italic"
            >Expected impact: {{ rec.impact }}</p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <button
              v-if="!acceptedIds.has(rec.id)"
              type="button"
              class="rounded-md bg-brand text-ink-inverse px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-[opacity,transform] duration-150 ease-out-quart active:scale-[0.97]"
              @click="accept(rec.id)"
            >{{ rec.actionLabel }}</button>
            <span
              v-else
              class="rounded-md bg-success/15 text-success px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1"
            >✓ Done</span>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
