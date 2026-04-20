<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center gap-4 bg-surface text-ink">
    <div class="text-6xl font-semibold">404</div>
    <p class="text-ink-muted">This page doesn't exist.</p>
    <RouterLink to="/" class="btn-secondary">Go home</RouterLink>
  </div>
</template>
