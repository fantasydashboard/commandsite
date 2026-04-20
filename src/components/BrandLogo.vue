<script setup lang="ts">
import logoUrl from '@/assets/logo.png'

withDefaults(defineProps<{ height?: number }>(), { height: 40 })
</script>

<template>
  <img
    :src="logoUrl"
    alt="CommandSite"
    :style="{ height: `${height}px` }"
    class="w-auto select-none"
    draggable="false"
  />
</template>
