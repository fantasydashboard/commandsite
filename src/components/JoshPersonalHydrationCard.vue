<script setup lang="ts">
/**
 * Josh Personal — hydration tap-log card.
 *
 * Today's water total + target, three +oz buttons. Optimistically
 * bumps the local total on click; parent reloads from the metrics
 * stream after each log to reconcile.
 */
import { ref, computed } from 'vue'
import { logWaterOz } from '@/lib/clients/josh-personal/nowStateApi'

const props = defineProps<{
  todayOz: number
  targetOz: number
}>()

const emit = defineEmits<{ (e: 'logged'): void }>()

const writing = ref(false)
const flash = ref<string | null>(null)
const optimisticOz = ref<number>(0)  // local bump for immediate feedback

const displayTotalOz = computed(() => props.todayOz + optimisticOz.value)
const pct = computed(() => {
  if (!props.targetOz) return 0
  return Math.max(0, Math.min(100, (displayTotalOz.value / props.targetOz) * 100))
})
const remaining = computed(() => Math.max(0, props.targetOz - displayTotalOz.value))

async function onTap(oz: number) {
  if (writing.value) return
  writing.value = true
  optimisticOz.value += oz
  const r = await logWaterOz(oz)
  writing.value = false
  if (r.ok) {
    flash.value = `+${oz}oz logged`
    setTimeout(() => { flash.value = null }, 1500)
    emit('logged')
    // Parent will reload props.todayOz; clear our optimistic bump so we
    // don't double-count once the new prop value lands.
    setTimeout(() => { optimisticOz.value = 0 }, 800)
  } else {
    // Roll back optimistic bump on failure
    optimisticOz.value -= oz
    flash.value = `Failed: ${r.error}`
    setTimeout(() => { flash.value = null }, 2500)
  }
}

const customOz = ref<string>('')
async function onLogCustom() {
  const n = Number(customOz.value)
  if (!Number.isFinite(n) || n <= 0 || n > 200) return
  customOz.value = ''
  await onTap(Math.round(n))
}
</script>

<template>
  <section class="card p-4">
    <div class="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <div class="text-[10px] font-semibold uppercase tracking-[0.18em]" style="color: #0ea5e9">Hydration today</div>
        <div class="text-xl font-bold text-ink tabular-nums mt-1">
          {{ Math.round(displayTotalOz) }}<span class="text-sm font-normal text-ink-muted ml-0.5">oz</span>
          <span class="text-sm font-normal text-ink-muted ml-2">/ {{ targetOz }} oz target</span>
        </div>
        <div class="mt-1.5 h-1.5 w-48 rounded-full overflow-hidden" style="background-color: rgb(14 165 233 / 0.15)">
          <div class="h-full rounded-full transition-all" :style="{ width: `${pct}%`, backgroundColor: '#0ea5e9' }" />
        </div>
        <div class="text-[11px] text-ink-muted mt-1">
          <template v-if="remaining > 0">{{ Math.round(remaining) }}oz to go</template>
          <template v-else>Target hit ✓</template>
          <span v-if="flash" class="ml-2 text-success font-semibold">{{ flash }}</span>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <button
          v-for="oz in [8, 16, 32]"
          :key="oz"
          type="button"
          class="rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-50 transition-colors"
          :style="{
            border: '1px solid rgb(14 165 233 / 0.30)',
            backgroundColor: 'rgb(14 165 233 / 0.06)',
            color: '#0ea5e9',
          }"
          :disabled="writing"
          @click="onTap(oz)"
        >+{{ oz }} oz</button>
        <form class="flex items-center gap-1" @submit.prevent="onLogCustom">
          <input
            v-model="customOz"
            type="number"
            inputmode="numeric"
            min="1"
            max="200"
            step="1"
            placeholder="oz"
            class="w-14 rounded-md text-xs px-2 py-2 text-center tabular-nums focus:outline-none disabled:opacity-50"
            :style="{
              border: '1px solid rgb(14 165 233 / 0.30)',
              backgroundColor: 'rgb(14 165 233 / 0.06)',
              color: '#0ea5e9',
            }"
            :disabled="writing"
          />
          <button
            type="submit"
            class="rounded-md px-2.5 py-2 text-xs font-semibold disabled:opacity-50 transition-colors"
            :style="{
              border: '1px solid rgb(14 165 233 / 0.30)',
              backgroundColor: 'rgb(14 165 233 / 0.06)',
              color: '#0ea5e9',
            }"
            :disabled="writing || !customOz || Number(customOz) <= 0"
          >+</button>
        </form>
      </div>
    </div>
  </section>
</template>
