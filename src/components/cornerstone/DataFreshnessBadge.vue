<script setup lang="ts">
/**
 * Focal Point - "data current through {date}" badge. Reads the single as-of date
 * so every surface reports the same freshness. A quiet green dot when the data is
 * recent; explains the refresh model on hover. In production this reflects the
 * scheduled job's last run.
 */
import { asOfLabel } from '@/lib/clients/focal-point/dataFreshness'
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 text-[11px] text-ink-muted"
    title="Grace re-checks every flag after each weekend's check-ins. When someone comes back, they clear off your lists on the next refresh."
  >
    <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
    Data current through {{ asOfLabel() }}
  </span>
</template>
