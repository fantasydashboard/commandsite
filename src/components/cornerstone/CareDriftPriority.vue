<script setup lang="ts">
/**
 * Focal Point - Care & Drift priority feed. The "this week" action list: the
 * most urgent people/families across all three signals (family drift, serving
 * drift, burnout), interleaved, as photo cards with the drafted note. Faces
 * come from Planning Center avatars. This is the act surface; the directories
 * below are for browsing the full lists.
 */
import { computed, ref } from 'vue'
import { focalPointPriority, type PriorityItem } from '@/lib/clients/focal-point/priority'

const resolved = ref<Set<string>>(new Set())
const active = computed(() => focalPointPriority.items.filter((i) => !resolved.value.has(i.id)))

function approve(id: string) {
  resolved.value = new Set(resolved.value).add(id)
}

const SIGNAL: Record<PriorityItem['signal'], { label: string; cls: string }> = {
  drifting: { label: 'Family drifting', cls: 'bg-warn/15 text-warn' },
  serving: { label: 'Stopped serving', cls: 'bg-accent/15 text-accent' },
  burnout: { label: 'Burnout risk', cls: 'bg-danger/12 text-danger' },
}

function initials(name: string): string {
  const clean = name.replace(/^The\s+/i, '').replace(/\s+family$/i, '')
  return clean.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}
</script>

<template>
  <section class="card">
    <div class="flex items-center justify-between">
      <span class="eyebrow">Priority this week</span>
      <span class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
        <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
        Live from Planning Center
      </span>
    </div>
    <h3 class="mt-1 text-base font-semibold text-ink">
      {{ active.length }} people and families to reach out to
    </h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">
      The most urgent across drift, serving, and burnout, in one list with a note drafted for each. Co-sign to send, edit to revise, skip to resurface. The full directories are below.
    </p>
  </section>

  <div class="space-y-3">
    <article v-for="item in active" :key="item.id" class="card flex flex-col gap-3 sm:flex-row sm:items-start">
      <!-- avatar -->
      <img
        v-if="item.avatar"
        :src="item.avatar"
        :alt="item.name"
        class="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-divider"
        loading="lazy"
      />
      <div
        v-else
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand"
      >{{ initials(item.name) }}</div>

      <!-- content -->
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" :class="SIGNAL[item.signal].cls">
            {{ SIGNAL[item.signal].label }}
          </span>
          <span class="text-sm font-semibold text-ink">{{ item.name }}</span>
        </div>
        <p class="mt-0.5 text-[12px] text-ink-muted">{{ item.standing }} · {{ item.stat }}</p>
        <p class="mt-2 rounded-lg border border-divider bg-surface-elevated/40 px-3 py-2 text-[13px] italic leading-relaxed text-ink">
          "{{ item.draft }}"
        </p>
      </div>

      <!-- actions -->
      <div class="flex shrink-0 flex-row gap-2 sm:w-28 sm:flex-col">
        <button
          class="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-ink-inverse hover:bg-brand-hover"
          @click="approve(item.id)"
        >Approve &amp; send</button>
        <button class="rounded-md border border-divider px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink">Edit</button>
        <button class="px-3 py-1 text-xs text-ink-muted hover:text-ink">Skip</button>
      </div>
    </article>

    <p v-if="!active.length" class="card text-center text-sm text-ink-muted">
      All caught up. Nice work.
    </p>
  </div>
</template>
