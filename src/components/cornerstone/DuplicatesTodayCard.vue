<script setup lang="ts">
/**
 * Focal Point - Today: "clean up these duplicate profiles" recommendation.
 * Surfaces the people who are on a live care/drift list AND have duplicate
 * profiles in Planning Center, with Grace's reconciliation verdict. Merging keeps
 * the lists accurate; a "review" verdict means the flag itself may be a false
 * alarm and should be checked first. Grace never merges, this is a to-do for you.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { flaggedDuplicates, duplicateStats } from '@/lib/clients/focal-point/duplicateReview'

const props = defineProps<{ slug: string }>()
const router = useRouter()

const flagged = computed(() => flaggedDuplicates())
const stats = computed(() => duplicateStats())
const reviewCount = computed(() => flagged.value.filter((r) => r.reconcile?.verdict === 'review').length)
const confirmedCount = computed(() => flagged.value.length - reviewCount.value)

// Link to the profile with the real activity (the one to keep); merge the rest into it.
const keepProfile = (r: (typeof flagged.value)[number]) => r.profiles[0]?.id ?? ''
const pcoUrl = (id: string) => `https://people.planningcenteronline.com/people/${id}`

function openSettings() {
  router.push({ name: 'dashboard.tab', params: { slug: props.slug, tab: 'settings' } })
}
</script>

<template>
  <section v-if="flagged.length" class="card">
    <div class="flex items-start justify-between gap-3">
      <div>
        <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Records to clean up</span>
        <h3 class="mt-1 text-base font-semibold text-ink">
          {{ flagged.length }} flagged people have duplicate profiles in Planning Center
        </h3>
      </div>
      <span class="inline-flex items-center gap-1.5 rounded-full bg-surface-elevated px-2.5 py-1 text-[11px] text-ink-muted">
        <svg viewBox="0 0 16 16" class="h-3 w-3 text-brand" fill="currentColor"><path d="M8 1.5 15 14H1z" /></svg>
        ~10 min in Planning Center
      </span>
    </div>

    <p class="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
      Before flagging anyone, Grace combined their check-ins across duplicate profiles.
      <template v-if="reviewCount">
        <span class="font-semibold text-warn">{{ reviewCount }} may be a false alarm</span> and should be checked before anyone reaches out.
        <template v-if="confirmedCount">The other {{ confirmedCount }} held up.</template>
      </template>
      <template v-else>
        All {{ confirmedCount }} flags held, the activity was on one profile and the duplicate is empty. Merging won't change today's lists, it keeps future flags accurate and your records clean.
      </template>
    </p>

    <ul class="mt-3 divide-y divide-divider/70">
      <li
        v-for="r in flagged"
        :key="r.name"
        class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
      >
        <div class="min-w-0">
          <span class="text-sm font-medium text-ink">{{ r.name }}</span>
          <span class="ml-2 text-[12px] text-ink-muted">{{ r.flags.join(', ') }} · {{ r.count }} profiles</span>
        </div>
        <div class="flex items-center gap-2">
          <span
            class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            :class="r.reconcile?.verdict === 'review' ? 'bg-warn/15 text-warn' : 'bg-surface-elevated text-ink-muted'"
          >{{ r.reconcile?.verdict === 'review' ? 'Check flag' : 'Confirmed' }}</span>
          <a
            :href="pcoUrl(keepProfile(r))"
            target="_blank"
            rel="noopener"
            class="text-xs font-semibold text-brand hover:underline"
          >Fix in Planning Center</a>
        </div>
      </li>
    </ul>

    <div class="mt-3 flex items-center justify-between border-t border-divider pt-3">
      <span class="text-[11px] text-ink-disabled">Grace surfaces the matches; Planning Center owns the merge.</span>
      <button type="button" class="text-xs font-semibold text-brand hover:underline" @click="openSettings">
        Review all {{ stats.clusters }} possible duplicates
      </button>
    </div>
  </section>
</template>
