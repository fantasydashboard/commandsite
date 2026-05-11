/**
 * Toast notifications — module-level composable.
 *
 * Toasts are global so any page can push one and the container
 * (mounted once in the layout) renders them in the corner.
 */
import { ref } from 'vue'

export interface Toast {
  id: number
  tone: 'success' | 'info' | 'warn'
  text: string
}

const toasts = ref<Toast[]>([])
let idCounter = 0

function push(text: string, tone: Toast['tone'] = 'success', durationMs = 4000) {
  const id = ++idCounter
  toasts.value.push({ id, tone, text })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, durationMs)
}

export function useToasts() {
  return { toasts, push }
}
