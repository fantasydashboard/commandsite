<script setup lang="ts">
import { RouterView } from 'vue-router'
import SlowRequestIndicator from '@/components/SlowRequestIndicator.vue'
</script>

<template>
  <RouterView />
  <!-- Global "still working..." indicator. Appears bottom-right when any
       request has been pending 5+ seconds. Auto-clears on completion. -->
  <SlowRequestIndicator />
</template>
