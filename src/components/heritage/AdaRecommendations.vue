<script setup lang="ts">
/**
 * AdaRecommendations — the "Ada noticed" / "Ada recommends" block.
 *
 * Sits on every dashboard page. Same DNA across pages:
 *   - 2-3 recommendations, each with title + reasoning + impact + action
 *   - Tag chip indicating urgency (Highest leverage / Growing fast / Free revenue / etc.)
 *   - Dismissable per-rec via accepted state ("Done" pill)
 *
 * This is what makes Ada feel like a thinking coworker, not just admin
 * software. Pages without an Ada Recommends block read as data displays.
 * Pages WITH one read as a coworker handing the operator a punch list.
 *
 * Style mirrors the existing inline block in HeritageLeadSourcesModule.vue
 * verbatim so the visual reads as part of the same product.
 */
import { ref } from 'vue'

export interface AdaRecommendation {
  id: string
  title: string
  tag: string
  tagTone: 'leverage' | 'growing' | 'free' | 'urgent' | 'opportunity'
  body: string
  impact?: string
  actionLabel: string
  actionUrl?: string
}

const props = withDefaults(defineProps<{
  recommendations: AdaRecommendation[]
  /** Subtitle text. Defaults to count-based summary. */
  subtitle?: string
}>(), {
  subtitle: '',
})

const acceptedIds = ref<Set<string>>(new Set())

function accept(id: string): void {
  acceptedIds.value.add(id)
}

function tagToneClass(tone: AdaRecommendation['tagTone']): string {
  switch (tone) {
    case 'leverage':   return 'bg-warn/15 text-warn'
    case 'growing':    return 'bg-success/15 text-success'
    case 'free':       return 'bg-success/15 text-success'
    case 'urgent':     return 'bg-danger/15 text-danger'
    case 'opportunity':return 'bg-brand/15 text-brand'
  }
}

function defaultSubtitle(): string {
  if (props.subtitle) return props.subtitle
  const n = props.recommendations.length
  return `${n} ${n === 1 ? 'action' : 'actions'} worth considering this week`
}
</script>

<template>
  <section class="card bg-brand/5 border-brand/30">
    <header class="mb-3">
      <div class="flex items-baseline gap-2">
        <span class="rounded-full bg-brand/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
          Ada's recommendations
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
