<script setup lang="ts">
import type { Client } from '@/types/database'

defineProps<{ client: Client; config: Record<string, unknown> }>()
</script>

<template>
  <div>
    <div class="flex items-baseline justify-between mb-4">
      <h3 class="text-lg font-semibold text-ink">Metrics</h3>
      <span class="text-xs text-ink-disabled">placeholder</span>
    </div>
    <div class="grid grid-cols-3 gap-4">
      <div>
        <div class="text-xs text-ink-muted">Revenue</div>
        <div class="text-2xl font-semibold text-ink">$—</div>
      </div>
      <div>
        <div class="text-xs text-ink-muted">Active users</div>
        <div class="text-2xl font-semibold text-ink">—</div>
      </div>
      <div>
        <div class="text-xs text-ink-muted">Growth</div>
        <div class="text-2xl font-semibold text-ink">—</div>
      </div>
    </div>
  </div>
</template>
