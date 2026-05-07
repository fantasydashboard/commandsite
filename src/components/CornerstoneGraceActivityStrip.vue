<script setup lang="ts">
/**
 * Cornerstone — per-page Grace activity strip.
 *
 * Drops onto any Cornerstone module to surface "Grace's role(s) on
 * this page" + recent relevant activity. Reinforces the AI-employee
 * positioning across every tab — not just Today.
 */
import { computed } from 'vue'
import { rolesOnTab } from '@/lib/clients/cornerstone/roles'
import AssistantMark from '@/components/AssistantMark.vue'

interface ActivityItem {
  icon: string
  label: string
  detail?: string
  ago?: string
}

const props = defineProps<{
  /** Tab key — looked up against graceRoles to find which roles live here */
  tabKey: string
  /** Optional per-page summary line ("Grace handled 12 calls this week") */
  summary?: string
  /** Recent activity items to surface */
  activity?: ActivityItem[]
}>()

const roles = computed(() => rolesOnTab(props.tabKey))
</script>

<template>
  <section class="card overflow-hidden p-0 border border-brand/30">
    <div class="flex items-start gap-3 bg-brand/5 px-5 py-3 border-b border-brand/20">
      <div class="flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 text-brand flex-shrink-0">
        <AssistantMark class="h-5 w-5" />
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap mb-0.5">
          <span class="text-sm font-semibold text-ink">Grace's role on this page</span>
          <template v-for="role in roles" :key="role.key">
            <span class="rounded-full bg-brand/15 text-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
              <span>{{ role.icon }}</span>
              <span>{{ role.name }}</span>
            </span>
          </template>
        </div>
        <p v-if="summary" class="text-xs text-ink-muted leading-relaxed">{{ summary }}</p>
      </div>
    </div>

    <div v-if="activity && activity.length > 0" class="px-5 py-3 bg-surface-raised">
      <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
        Grace's recent activity here
      </div>
      <ul class="space-y-1.5">
        <li
          v-for="(a, i) in activity"
          :key="i"
          class="flex items-center gap-2 text-xs"
        >
          <span class="text-base flex-shrink-0">{{ a.icon }}</span>
          <span class="font-medium text-ink">{{ a.label }}</span>
          <span v-if="a.detail" class="text-ink-muted truncate flex-1">{{ a.detail }}</span>
          <span v-if="a.ago" class="text-[10px] text-ink-disabled flex-shrink-0">{{ a.ago }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
