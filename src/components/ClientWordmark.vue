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
import FocalPointMark from './cornerstone/FocalPointMark.vue'
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
  <div v-else class="flex items-center gap-2.5 select-none" :style="{ height: `${height}px` }">
    <!-- brand mark in a small rounded tile (app-icon treatment, reads on dark chrome) -->
    <span
      v-if="theme.wordmark.mark === 'focal-point'"
      class="flex items-center justify-center rounded-lg bg-surface-raised shadow-sm ring-1 ring-black/5"
      :style="{ height: `${height}px`, width: `${height}px` }"
    >
      <FocalPointMark class="h-[62%] w-[62%]" />
    </span>
    <div class="flex items-baseline gap-1.5">
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
  </div>
</template>
