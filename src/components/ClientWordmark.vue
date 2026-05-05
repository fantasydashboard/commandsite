<script setup lang="ts">
/**
 * Per-client wordmark — text-based brand identity for clients without
 * an uploaded logo asset. Renders the brand-color "main" word + a softer
 * suffix in chrome-on-dark styling.
 *
 * Falls back to the default CommandSite logo when no wordmark is
 * supplied.
 */
import BrandLogo from './BrandLogo.vue'
import type { ClientTheme } from '@/config/clientThemes'

withDefaults(
  defineProps<{
    theme: ClientTheme
    surface?: 'light' | 'dark'
    height?: number
  }>(),
  { surface: 'light', height: 30 },
)
</script>

<template>
  <BrandLogo v-if="!theme.wordmark" :surface="surface" :height="height" />
  <div
    v-else
    class="flex items-baseline gap-1.5 select-none"
    :style="{ height: `${height}px` }"
  >
    <span
      class="text-2xl leading-none tracking-tight font-extrabold"
      :class="surface === 'dark' ? 'text-chrome-ink' : 'text-ink'"
      :style="{
        color: surface === 'dark' ? undefined : 'rgb(var(--color-brand))',
      }"
    >
      {{ theme.wordmark.text }}
    </span>
    <span
      v-if="theme.wordmark.suffix"
      class="text-[11px] uppercase tracking-[0.2em] font-semibold"
      :class="surface === 'dark' ? 'text-chrome-ink/60' : 'text-ink-muted'"
    >
      {{ theme.wordmark.suffix }}
    </span>
  </div>
</template>
