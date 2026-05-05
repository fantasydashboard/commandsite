<script setup lang="ts">
/**
 * Reusable KPI card.
 *
 * Shape: small label up top, big value, optional hint/delta below.
 * A 3px colored top border acts as the visual signature — pick the
 * accent prop to color it (and the value) consistently with module
 * conventions.
 */
import { computed } from 'vue'

type AccentName =
  | 'brand'
  | 'accent'
  | 'success'
  | 'warn'
  | 'danger'
  | 'sky'
  | 'cyan'
  | 'violet'
  | 'orange'
  | 'rose'
  | 'emerald'
  | 'ink'

const props = withDefaults(
  defineProps<{
    label: string
    value: string | number
    hint?: string
    /** Numeric delta. Positive = good (green), negative = bad (red). Pass null to skip. */
    delta?: number | string | null
    /** Suffix shown next to the delta — e.g. 'new', 'vs prev', '%'. */
    deltaLabel?: string
    /** Hide the up/down arrow even when delta is set (for "+12 new" style deltas without direction). */
    deltaPlain?: boolean
    accent?: AccentName
    size?: 'sm' | 'md' | 'lg'
    /** When true, the entire card is clickable (cursor + hover lift). */
    interactive?: boolean
  }>(),
  {
    accent: 'brand',
    size: 'md',
    interactive: false,
    deltaPlain: false,
  },
)

// Map accent name → CSS color. The disciplined palette is:
//   brand   — deep blue (CommandSite primary)
//   accent  — sky blue (CommandSite secondary)
//   success — green (positive deltas only)
//   warn    — amber (in-flight / at-risk states)
//   danger  — red (negative states only)
//   muted   — slate (neutral / informational)
// Other names are kept for legacy callers but resolve to disciplined picks.
const ACCENT_HEX: Record<AccentName, string> = {
  brand:   'rgb(var(--color-brand))',
  accent:  'rgb(var(--color-accent))',
  success: '#0EA5A0',
  warn:    '#D97706',
  danger:  '#DC2626',
  // Legacy aliases — collapse to the disciplined two so we don't reintroduce
  // the 8-color KPI rainbow.
  sky:     'rgb(var(--color-accent))',
  cyan:    'rgb(var(--color-accent))',
  violet:  'rgb(var(--color-brand))',
  orange:  '#D97706',
  rose:    '#DC2626',
  emerald: 'rgb(var(--color-brand))',
  ink:     '#0F172A',
}

const accentColor = computed(() => ACCENT_HEX[props.accent])

const valueClasses = computed(() => {
  if (props.size === 'sm') return 'text-2xl'
  if (props.size === 'lg') return 'text-4xl'
  return 'text-3xl'
})

const deltaIsNumber = computed(() => typeof props.delta === 'number')
const deltaDirection = computed<'up' | 'down' | 'flat'>(() => {
  if (!deltaIsNumber.value) return 'flat'
  const n = props.delta as number
  if (n > 0) return 'up'
  if (n < 0) return 'down'
  return 'flat'
})

const deltaDisplay = computed<string>(() => {
  if (props.delta === null || props.delta === undefined) return ''
  if (typeof props.delta === 'string') return props.delta
  const n = props.delta
  if (n > 0) return '+' + n
  return String(n)
})
</script>

<template>
  <div
    class="relative overflow-hidden rounded-card bg-surface-raised shadow-card"
    :class="interactive ? 'cursor-pointer transition-shadow hover:shadow-raised' : ''"
  >
    <!-- Accent top stripe -->
    <div
      class="absolute top-0 left-0 right-0 h-[3px]"
      :style="{ backgroundColor: accentColor }"
    ></div>

    <div class="px-5 pt-4 pb-4">
      <!-- Label -->
      <div class="kpi-label">{{ label }}</div>

      <!-- Big value -->
      <div
        class="mt-1.5 font-bold leading-none tracking-tight"
        :class="valueClasses"
        :style="{ color: accentColor }"
      >
        {{ value }}
      </div>

      <!-- Hint + delta (one line, hint takes precedence on its own line) -->
      <div
        v-if="hint || delta !== undefined && delta !== null && delta !== ''"
        class="mt-2 text-xs text-ink-muted leading-snug"
      >
        <div v-if="hint">{{ hint }}</div>
        <div
          v-if="delta !== undefined && delta !== null && delta !== ''"
          :class="[
            'inline-flex items-center gap-1 font-semibold mt-0.5',
            deltaIsNumber && !deltaPlain
              ? deltaDirection === 'up'
                ? 'text-success'
                : deltaDirection === 'down'
                ? 'text-danger'
                : 'text-ink-muted'
              : 'text-ink',
          ]"
        >
          <span v-if="deltaIsNumber && !deltaPlain">
            <span v-if="deltaDirection === 'up'">↑</span>
            <span v-else-if="deltaDirection === 'down'">↓</span>
          </span>
          <span>{{ deltaDisplay }}</span>
          <span v-if="deltaLabel" class="text-ink-muted font-normal">{{ deltaLabel }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
