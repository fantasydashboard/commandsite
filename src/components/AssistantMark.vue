<script setup lang="ts">
/**
 * Generic AI assistant mark — used wherever Ada or Grace is shown
 * with a visual signature. The persona name (Ada / Grace) does the
 * persona-specific work in copy; the mark is a single shared symbol
 * that reads cleanly at every size.
 *
 * Color is `currentColor`, so size + color come from the parent's
 * Tailwind classes:
 *   <AssistantMark class="h-16 w-16 text-brand" />
 *   <AssistantMark class="h-5 w-5 text-ink-inverse" />  // on dark surfaces
 *
 * Per-client theming flows through automatically — when a dashboard
 * rewrites --color-brand for a specific client, the mark adopts that
 * client's color when used with `text-brand`.
 *
 * SVG is statically imported (not user input), so v-html is safe here.
 */
import assistantMark from '@/assets/assistant-mark.svg?raw'
</script>

<template>
  <span class="inline-flex shrink-0 [&>svg]:h-full [&>svg]:w-full" v-html="assistantMark" />
</template>
