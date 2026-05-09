<script setup lang="ts">
/**
 * CommandSite — generate a custom Ada demo link for a prospect.
 *
 * Picks the right template (apex for service businesses, cornerstone
 * for ministry orgs) and constructs a URL like:
 *   /dashboard/apex-heating-and-air?demo_company=Premium%20Electric
 *     &demo_industry=Electrical&demo_city=Orlando&demo_state=FL
 *
 * Anyone with the link can view the dashboard (template slugs are
 * already public). The DashboardLayout reads the demo_* params and
 * renders an intro banner + overrides the wordmark — same dashboard
 * Josh shows on every demo, but feels custom to the prospect.
 */
import { ref, computed, watch } from 'vue'
import type { CsLead } from '@/types/database'

const props = defineProps<{
  open: boolean
  lead: CsLead | null
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

// Editable fields — pre-filled from the lead but Josh can tweak before
// generating (e.g. clean up "In Phaze Electric Inc." → "In Phaze Electric")
const company = ref('')
const industry = ref('')
const city = ref('')
const state = ref('')
const copied = ref(false)

watch(() => props.lead, (l) => {
  if (l) {
    company.value = (l.company_name ?? '').replace(/\s+(LLC|Inc\.?|Corp\.?)$/i, '').trim()
    industry.value = l.industry ?? ''
    city.value = l.city ?? ''
    state.value = l.state ?? ''
    copied.value = false
  }
}, { immediate: true })

watch(() => props.open, (o) => {
  if (o) copied.value = false
})

// Industry → demo template mapping. Service businesses use the Apex
// Heating & Air template. Churches/ministry use Cornerstone. Default
// service template if industry is unrecognized.
function templateForIndustry(industry: string | null): string {
  const i = (industry ?? '').toLowerCase()
  if (i.includes('church') || i.includes('ministry')) return 'cornerstone-church'
  // Everything else (HVAC, plumbing, electrical, roofing, landscaping,
  // pool service, pest control, remodeling) → Apex template
  return 'apex-heating-and-air'
}

const template = computed(() => templateForIndustry(industry.value))

// Build the demo URL. Uses window.location.origin so it works in
// dev (localhost) + prod (Vercel).
const demoUrl = computed(() => {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const params = new URLSearchParams()
  if (company.value) params.set('demo_company', company.value)
  if (industry.value) params.set('demo_industry', industry.value)
  if (city.value) params.set('demo_city', city.value)
  if (state.value) params.set('demo_state', state.value)
  return `${origin}/dashboard/${template.value}?${params.toString()}`
})

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(demoUrl.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2500)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = demoUrl.value
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2500)
  }
}

function openInNewTab() {
  window.open(demoUrl.value, '_blank', 'noopener')
}

function close() {
  emit('close')
}

const suggestedMessage = computed(() => {
  return `Hey — pulled together a quick demo dashboard for ${company.value || '[Company]'}. It's a real CommandSite — set up for a sample ${industry.value?.toLowerCase() || 'service'} shop${city.value && state.value ? ` in ${city.value}, ${state.value}` : ''}. Click around and you'll see what Ada would handle from day one (call answering, quote follow-ups, review requests, customer reactivation).

${demoUrl.value}

When we hop on the 15 min, I'll show you what your version would catch in the first week.

— Josh`
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-ink/60"
        @click.self="close"
      >
        <div
          class="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-card bg-surface-raised shadow-2xl overflow-hidden"
          role="dialog"
          aria-modal="true"
        >
          <!-- Header -->
          <div class="px-6 py-4 border-b border-divider bg-surface-elevated">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-1">
                  Custom demo link
                </div>
                <h2 class="text-lg font-semibold text-ink">Generate a personalized Ada demo URL</h2>
                <p class="text-xs text-ink-muted mt-0.5">
                  Sends them to a real CommandSite dashboard, rebranded with their company name + industry. Public link — no login required.
                </p>
              </div>
              <button
                type="button"
                class="text-ink-muted hover:text-ink text-2xl leading-none p-1 -mr-2"
                @click="close"
              >×</button>
            </div>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <!-- Editable fields -->
            <div class="grid sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-ink mb-1.5">Company name <span class="text-danger">*</span></label>
                <input v-model="company" type="text" class="input" placeholder="Premium Electric" />
                <p class="text-[10px] text-ink-muted mt-1">Wordmark + intro banner show this name</p>
              </div>
              <div>
                <label class="block text-xs font-semibold text-ink mb-1.5">Industry</label>
                <input v-model="industry" type="text" class="input" placeholder="Electrical" />
                <p class="text-[10px] text-ink-muted mt-1">Used in intro copy + suffix</p>
              </div>
              <div>
                <label class="block text-xs font-semibold text-ink mb-1.5">City</label>
                <input v-model="city" type="text" class="input" placeholder="Orlando" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-ink mb-1.5">State</label>
                <input v-model="state" type="text" class="input" placeholder="FL" maxlength="2" />
              </div>
            </div>

            <!-- Template badge -->
            <div class="rounded-card bg-canvas border border-divider p-3 flex items-center gap-2">
              <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Template:</span>
              <span class="text-xs font-medium text-ink">
                {{ template === 'apex-heating-and-air' ? 'Apex Heating & Air (service business)' : 'Cornerstone Community Church (ministry)' }}
              </span>
              <span class="ml-auto text-[10px] text-ink-disabled italic">auto-picked from industry</span>
            </div>

            <!-- The URL -->
            <div>
              <label class="block text-xs font-semibold text-ink mb-1.5">Demo URL — share this with the prospect</label>
              <div class="rounded-card border border-divider bg-canvas p-3 break-all font-mono text-[11px] text-ink leading-snug select-all">
                {{ demoUrl }}
              </div>
            </div>

            <!-- Suggested copy -->
            <div class="rounded-card border border-brand/15 bg-brand/5 p-3">
              <div class="text-[10px] font-semibold uppercase tracking-wider text-brand mb-2">Suggested message to send them</div>
              <p class="text-sm text-ink leading-relaxed font-sans whitespace-pre-line">{{ suggestedMessage }}</p>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between gap-3 px-6 py-4 border-t border-divider bg-surface-elevated">
            <button type="button" class="btn-ghost !text-sm" @click="openInNewTab">
              Preview in new tab ↗
            </button>
            <div class="flex items-center gap-2">
              <button type="button" class="btn-secondary !text-sm" @click="close">Done</button>
              <button
                type="button"
                class="btn-primary !text-sm inline-flex items-center gap-1.5"
                :disabled="!company"
                @click="copyUrl"
              >
                <span v-if="copied">✓ Copied</span>
                <span v-else>📋 Copy URL</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
