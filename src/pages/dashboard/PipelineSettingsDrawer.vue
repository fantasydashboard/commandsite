<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { Stage } from '@/types/database'

const props = defineProps<{
  pipelineId: string
}>()

const emit = defineEmits<{
  saved: []
  close: []
}>()

// A stage row in the form; id may be undefined for newly-added stages
// that haven't been persisted yet.
type StageRow = {
  id?: string
  name: string
  position: number
  color: string
  is_won: boolean
  is_lost: boolean
}

const STAGE_COLORS = [
  '#93A4C1', // muted gray
  '#2E9FE0', // interface blue
  '#4CCCE8', // signal cyan
  '#2454B7', // brand
  '#2ED3B7', // success teal
  '#F2B544', // warning amber
  '#E85D75', // alert red
  '#818CF8', // violet (for variety)
]

const original = ref<StageRow[]>([])
const working  = ref<StageRow[]>([])
const loading  = ref(true)
const saving   = ref(false)
const error    = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  const { data, error: err } = await supabase
    .from('stages')
    .select('*')
    .eq('pipeline_id', props.pipelineId)
    .order('position')
  if (err) {
    error.value = err.message
    loading.value = false
    return
  }
  const rows = (data ?? []).map((s: Stage) => ({
    id: s.id,
    name: s.name,
    position: s.position,
    color: s.color ?? STAGE_COLORS[0],
    is_won: s.is_won,
    is_lost: s.is_lost,
  }))
  original.value = rows.map((r) => ({ ...r }))
  working.value  = rows.map((r) => ({ ...r }))
  loading.value = false
}

// ---------------------------------------------------------------------------
// Row operations (all in-memory until save)
// ---------------------------------------------------------------------------
function moveUp(i: number) {
  if (i === 0) return
  const arr = working.value
  ;[arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]
  renumber()
}
function moveDown(i: number) {
  if (i === working.value.length - 1) return
  const arr = working.value
  ;[arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]
  renumber()
}
function renumber() {
  working.value.forEach((s, i) => (s.position = i))
}
function remove(i: number) {
  working.value.splice(i, 1)
  renumber()
}
function addStage() {
  working.value.push({
    name: 'New stage',
    position: working.value.length,
    color: STAGE_COLORS[0],
    is_won: false,
    is_lost: false,
  })
}

// Only one stage at a time can be marked won or lost — toggling one resets others.
// (This is opinionated; feel free to remove if you want multiple won/lost stages.)
function setWon(i: number, value: boolean) {
  if (value) {
    working.value.forEach((s, idx) => {
      s.is_won = idx === i
      if (s.is_won) s.is_lost = false
    })
  } else {
    working.value[i].is_won = false
  }
}
function setLost(i: number, value: boolean) {
  if (value) {
    working.value.forEach((s, idx) => {
      s.is_lost = idx === i
      if (s.is_lost) s.is_won = false
    })
  } else {
    working.value[i].is_lost = false
  }
}

// ---------------------------------------------------------------------------
// Diff + save
// ---------------------------------------------------------------------------
const dirty = computed(() => {
  if (working.value.length !== original.value.length) return true
  return working.value.some((w) => {
    if (!w.id) return true
    const o = original.value.find((x) => x.id === w.id)
    if (!o) return true
    return (
      w.name !== o.name ||
      w.position !== o.position ||
      w.color !== o.color ||
      w.is_won !== o.is_won ||
      w.is_lost !== o.is_lost
    )
  })
})

async function save() {
  saving.value = true
  error.value = null

  // Categorize changes.
  const toDelete = original.value.filter((o) => !working.value.some((w) => w.id === o.id))
  const toInsert = working.value.filter((w) => !w.id)
  const toUpdate = working.value.filter((w) => {
    if (!w.id) return false
    const o = original.value.find((x) => x.id === w.id)
    if (!o) return false
    return (
      w.name !== o.name ||
      w.position !== o.position ||
      w.color !== o.color ||
      w.is_won !== o.is_won ||
      w.is_lost !== o.is_lost
    )
  })

  // Apply sequentially. If any one fails we surface it but keep going —
  // simpler than a proper transaction and acceptable for a small set of rows.
  for (const s of toDelete) {
    const { error: err } = await supabase.from('stages').delete().eq('id', s.id!)
    if (err) error.value = err.message
  }
  for (const s of toUpdate) {
    const { error: err } = await supabase
      .from('stages')
      .update({
        name: s.name,
        position: s.position,
        color: s.color,
        is_won: s.is_won,
        is_lost: s.is_lost,
      })
      .eq('id', s.id!)
    if (err) error.value = err.message
  }
  if (toInsert.length > 0) {
    const { error: err } = await supabase.from('stages').insert(
      toInsert.map((s) => ({
        pipeline_id: props.pipelineId,
        name: s.name,
        position: s.position,
        color: s.color,
        is_won: s.is_won,
        is_lost: s.is_lost,
      })),
    )
    if (err) error.value = err.message
  }

  saving.value = false
  if (!error.value) {
    emit('saved')
    emit('close')
  } else {
    // Reload to reflect whatever actually persisted.
    await load()
  }
}

// ---------------------------------------------------------------------------
// Escape to close
// ---------------------------------------------------------------------------
function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close')
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  load()
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer-backdrop">
      <div class="fixed inset-0 bg-ink/40 z-40" @click="emit('close')" />
    </Transition>
    <Transition name="drawer-panel">
      <aside
        class="fixed right-0 top-0 h-screen w-full sm:max-w-2xl bg-surface shadow-raised z-50 flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        <div class="flex items-start justify-between gap-4 px-6 py-5 border-b border-divider bg-surface-raised">
          <div>
            <h2 class="text-xl font-semibold text-ink">Pipeline settings</h2>
            <p class="text-sm text-ink-muted">
              Rename, reorder, add, or remove stages. Changes apply across the CRM.
            </p>
          </div>
          <button
            class="btn-ghost !px-3 !py-1.5 shrink-0"
            aria-label="Close"
            @click="emit('close')"
          >
            <span class="text-lg leading-none">×</span>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-6 py-6">
          <p v-if="error" class="text-sm text-danger mb-4">{{ error }}</p>
          <div v-if="loading" class="text-sm text-ink-muted">Loading…</div>

          <template v-else>
            <ul class="space-y-3">
              <li
                v-for="(s, i) in working"
                :key="s.id ?? `new-${i}`"
                class="rounded-lg border border-divider bg-surface-raised p-3"
              >
                <div class="flex items-center gap-2 mb-3">
                  <div class="flex flex-col">
                    <button
                      class="text-ink-muted hover:text-ink text-xs leading-none py-0.5 disabled:opacity-30"
                      :disabled="i === 0"
                      aria-label="Move up"
                      @click="moveUp(i)"
                    >▲</button>
                    <button
                      class="text-ink-muted hover:text-ink text-xs leading-none py-0.5 disabled:opacity-30"
                      :disabled="i === working.length - 1"
                      aria-label="Move down"
                      @click="moveDown(i)"
                    >▼</button>
                  </div>

                  <input
                    v-model="s.name"
                    class="input flex-1"
                    placeholder="Stage name"
                  />

                  <button
                    class="text-ink-muted hover:text-danger text-sm px-2"
                    aria-label="Delete stage"
                    @click="remove(i)"
                  >
                    Delete
                  </button>
                </div>

                <div class="flex flex-wrap items-center gap-4 pl-7">
                  <!-- Color swatches -->
                  <div class="flex items-center gap-1.5">
                    <span class="text-xs text-ink-muted mr-1">Color</span>
                    <button
                      v-for="c in STAGE_COLORS"
                      :key="c"
                      class="w-5 h-5 rounded-full transition-all"
                      :class="s.color === c ? 'ring-2 ring-brand ring-offset-1 ring-offset-surface-raised' : 'opacity-70 hover:opacity-100'"
                      :style="{ background: c }"
                      :aria-label="`Pick color ${c}`"
                      @click="s.color = c"
                    />
                  </div>

                  <!-- Won / Lost -->
                  <label class="flex items-center gap-1.5 text-xs text-ink-muted">
                    <input
                      type="checkbox"
                      :checked="s.is_won"
                      class="accent-brand"
                      @change="setWon(i, ($event.target as HTMLInputElement).checked)"
                    />
                    Won
                  </label>
                  <label class="flex items-center gap-1.5 text-xs text-ink-muted">
                    <input
                      type="checkbox"
                      :checked="s.is_lost"
                      class="accent-brand"
                      @change="setLost(i, ($event.target as HTMLInputElement).checked)"
                    />
                    Lost
                  </label>
                </div>
              </li>
            </ul>

            <button
              class="btn-secondary mt-4"
              @click="addStage"
            >
              + Add stage
            </button>
          </template>
        </div>

        <div class="px-6 py-4 border-t border-divider bg-surface-raised flex items-center justify-end gap-2">
          <button class="btn-ghost" @click="emit('close')">Cancel</button>
          <button
            class="btn-primary"
            :disabled="!dirty || saving"
            @click="save"
          >
            {{ saving ? 'Saving…' : 'Save changes' }}
          </button>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-backdrop-enter-from,
.drawer-backdrop-leave-to {
  opacity: 0;
}
.drawer-backdrop-enter-active,
.drawer-backdrop-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-panel-enter-from,
.drawer-panel-leave-to {
  transform: translateX(100%);
}
.drawer-panel-enter-active,
.drawer-panel-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
