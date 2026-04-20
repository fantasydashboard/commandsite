<script setup lang="ts">
import type { Client } from '@/types/database'

defineProps<{ client: Client; config: Record<string, unknown> }>()
</script>

<template>
  <div>
    <div class="flex items-baseline justify-between mb-4">
      <h3 class="text-lg font-semibold text-ink">Projects</h3>
      <span class="text-xs text-ink-disabled">placeholder</span>
    </div>
    <p class="text-sm text-ink-muted">
      Tasks, milestones, and team workload will live here.
    </p>
  </div>
</template>
