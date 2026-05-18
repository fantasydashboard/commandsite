<script setup lang="ts">
/**
 * RolesOnPage — sub-tab page header showing which Ada roles live on
 * this page, with a "Back to Today" affordance. Connects the dots
 * from Today's hub for users arriving via role-card click.
 */
import { useRouter } from 'vue-router'
import type { EmployeeRole as AdaRole } from '@/lib/types/employeeRole'
import AdaIcon from './AdaIcon.vue'

const props = defineProps<{
  roles: AdaRole[]
  /** Route name for "Back to Today" (defaults to dashboard.tab with tab=overview) */
  backTo?: { name?: string; params?: Record<string, string>; }
  /** Override the back link label (default "← Back to Today") */
  backLabel?: string
}>()

const router = useRouter()

function goBack() {
  if (props.backTo) {
    router.push(props.backTo)
  } else {
    // Default — go to the Apex Today page
    router.push({ name: 'dashboard.tab', params: { slug: 'apex-heating-and-air', tab: 'overview' } })
  }
}
</script>

<template>
  <div class="rounded-card border border-divider bg-surface-raised px-4 py-2.5 flex items-center gap-3 flex-wrap">
    <span class="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">Roles on this page</span>
    <div class="flex flex-wrap items-center gap-1.5">
      <span
        v-for="role in roles"
        :key="role.key"
        class="inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[11px] font-semibold"
      >
        <AdaIcon :name="role.icon" class="h-3 w-3" />
        <span>{{ role.name }}</span>
      </span>
    </div>
    <button
      type="button"
      class="ml-auto text-[11px] text-brand hover:underline font-medium transition-[transform,opacity] duration-150 ease-out-quart active:scale-[0.97]"
      @click="goBack"
    >{{ backLabel ?? '← Back to Today' }}</button>
  </div>
</template>
