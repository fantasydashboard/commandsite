/**
 * v-reveal — small scroll-triggered fade-up directive.
 *
 * Adds `reveal-pending` while waiting for the element to intersect,
 * then adds `is-revealed` once it crosses 15% of the viewport. The
 * styles for both classes live in `main.css` so the directive itself
 * is dependency-free (one IntersectionObserver, ~20 lines).
 *
 * Respects `prefers-reduced-motion`: opted-in users skip the animation
 * (element is revealed immediately without transform/opacity transition).
 *
 * Usage:
 *   <section v-reveal>...</section>
 *   <article v-reveal="{ threshold: 0.3, delay: 60 }">...</article>
 */
import type { Directive, DirectiveBinding } from 'vue'

interface RevealOptions {
  /** Visibility ratio (0-1) at which to trigger. Default 0.15. */
  threshold?: number
  /** Delay before applying the reveal class, in ms. Default 0. */
  delay?: number
}

export const reveal: Directive<HTMLElement, RevealOptions | undefined> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<RevealOptions | undefined>) {
    // No-IO environments + reduced-motion users → reveal immediately.
    if (
      typeof IntersectionObserver === 'undefined'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      el.classList.add('is-revealed')
      return
    }

    const threshold = binding.value?.threshold ?? 0.15
    const delay = binding.value?.delay ?? 0

    el.classList.add('reveal-pending')

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      if (delay > 0) {
        setTimeout(() => el.classList.add('is-revealed'), delay)
      } else {
        el.classList.add('is-revealed')
      }
      observer.disconnect()
    }, { threshold })

    observer.observe(el)

    // Cache for cleanup.
    ;(el as HTMLElement & { __reveal_observer?: IntersectionObserver }).__reveal_observer = observer
  },
  unmounted(el: HTMLElement) {
    const observer = (el as HTMLElement & { __reveal_observer?: IntersectionObserver }).__reveal_observer
    observer?.disconnect()
  },
}
