<script setup lang="ts">
import logoOnLight from '@/assets/logo-on-light.png'
import logoOnDark from '@/assets/logo-on-dark.png'

// `surface` describes the background the logo will sit on — not the logo color.
// `light` = light page background (uses the dark-text logo).
// `dark`  = dark header/hero background (uses the white-text logo).
const props = withDefaults(
  defineProps<{ surface?: 'light' | 'dark'; height?: number }>(),
  { surface: 'light', height: 40 },
)

const src = props.surface === 'dark' ? logoOnDark : logoOnLight
</script>

<template>
  <img
    :src="src"
    alt="CommandSite"
    :style="{ height: `${height}px` }"
    class="w-auto select-none"
    draggable="false"
  />
</template>
