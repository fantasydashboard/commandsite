<script setup lang="ts">
/**
 * Lead edit drawer — slides in from the right when a lead row is
 * clicked. Edits all the fields Josh used to drop to SQL for:
 *  - contact_name, contact_email, contact_title, industry, city, state
 *  - notes
 *  - tags (chip editor, with quick-add buttons for pricing-tier tags)
 *  - review_excerpts (4 text boxes — used by the pitch deck's slide 2)
 *
 * Save calls leadsApi.updateLead. Delete calls leadsApi.deleteLead
 * (with confirmation). Both close the drawer on success.
 */
import { ref, computed, watch } from 'vue'
import type { CsLead } from '@/types/database'

interface ReviewQuote {
  text: string
  rating: number | null
  relative_time: string | null
}

const props = defineProps<{
  open: boolean
  lead: CsLead | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', input: {
    id: string
    fields: Record<string, unknown>
  }): void
  (e: 'delete', id: string): void
}>()

// Editable form state
const companyName = ref('')
const contactName = ref('')
const contactEmail = ref('')
const contactTitle = ref('')
const industry = ref('')
const city = ref('')
const state = ref('')
const notes = ref('')
const tags = ref<string[]>([])
const newTag = ref('')
const reviews = ref<ReviewQuote[]>([])

const saving = ref(false)
const showDeleteConfirm = ref(false)

// Hydrate form when a different lead opens
watch(
  () => props.lead?.id,
  () => {
    if (props.lead) {
      companyName.value = props.lead.company_name ?? ''
      contactName.value = props.lead.contact_name ?? ''
      contactEmail.value = props.lead.contact_email ?? ''
      contactTitle.value = (props.lead as { contact_title?: string | null }).contact_title ?? ''
      industry.value = props.lead.industry ?? ''
      city.value = props.lead.city ?? ''
      state.value = props.lead.state ?? ''
      notes.value = props.lead.notes ?? ''
      tags.value = [...(props.lead.tags ?? [])]
      const re = (props.lead as { review_excerpts?: ReviewQuote[] | null }).review_excerpts ?? []
      reviews.value = re.length > 0
        ? re.map((r) => ({ text: r.text ?? '', rating: r.rating ?? null, relative_time: r.relative_time ?? null }))
        : [
            { text: '', rating: null, relative_time: null },
            { text: '', rating: null, relative_time: null },
            { text: '', rating: null, relative_time: null },
          ]
      showDeleteConfirm.value = false
    }
  },
  { immediate: true },
)

// Suggested tags Josh hits often
const SUGGESTED_TAGS = ['tier-large', 'tier-compact', 'tier-multi-congregation', 'high-priority', 'no_response']

function addTag(t: string) {
  const clean = t.trim()
  if (!clean) return
  if (tags.value.includes(clean)) return
  tags.value = [...tags.value, clean]
  newTag.value = ''
}
function removeTag(t: string) {
  tags.value = tags.value.filter((x) => x !== t)
}
function onNewTagKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addTag(newTag.value)
  }
}

function addReviewBox() {
  if (reviews.value.length >= 4) return
  reviews.value = [...reviews.value, { text: '', rating: null, relative_time: null }]
}
function removeReviewBox(idx: number) {
  reviews.value = reviews.value.filter((_, i) => i !== idx)
}

function save() {
  if (!props.lead || saving.value) return
  saving.value = true
  // Filter out empty review boxes
  const cleanReviews = reviews.value
    .map((r) => ({ text: r.text.trim(), rating: r.rating, relative_time: r.relative_time }))
    .filter((r) => r.text.length > 0)

  emit('save', {
    id: props.lead.id,
    fields: {
      company_name: companyName.value.trim(),
      contact_name: contactName.value.trim() || null,
      contact_email: contactEmail.value.trim() || null,
      contact_title: contactTitle.value.trim() || null,
      industry: industry.value.trim() || null,
      city: city.value.trim() || null,
      state: state.value.trim() || null,
      notes: notes.value.trim() || null,
      tags: tags.value,
      review_excerpts: cleanReviews,
    },
  })
  saving.value = false
}

function onDeleteConfirm() {
  if (!props.lead) return
  emit('delete', props.lead.id)
  showDeleteConfirm.value = false
}

const isDirty = computed(() => {
  if (!props.lead) return false
  return (
    companyName.value.trim() !== (props.lead.company_name ?? '') ||
    contactName.value.trim() !== (props.lead.contact_name ?? '') ||
    contactEmail.value.trim() !== (props.lead.contact_email ?? '') ||
    industry.value.trim() !== (props.lead.industry ?? '') ||
    city.value.trim() !== (props.lead.city ?? '') ||
    state.value.trim() !== (props.lead.state ?? '') ||
    notes.value.trim() !== (props.lead.notes ?? '') ||
    JSON.stringify([...tags.value].sort()) !== JSON.stringify([...(props.lead.tags ?? [])].sort()) ||
    JSON.stringify(reviews.value) !== JSON.stringify((props.lead as { review_excerpts?: ReviewQuote[] | null }).review_excerpts ?? [])
  )
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open && lead"
        class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end"
        @click.self="emit('close')"
      >
        <Transition
          enter-active-class="transition-transform duration-250 ease-out"
          enter-from-class="translate-x-full"
          enter-to-class="translate-x-0"
        >
          <aside
            v-if="open && lead"
            class="w-full max-w-xl bg-surface shadow-2xl flex flex-col h-full overflow-hidden"
          >
            <header class="px-6 py-4 border-b border-divider flex items-center justify-between flex-shrink-0">
              <div>
                <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Edit lead</div>
                <h2 class="text-lg font-bold text-ink mt-0.5">{{ companyName || 'Lead' }}</h2>
              </div>
              <button type="button" class="text-ink-muted hover:text-ink text-2xl leading-none px-2" @click="emit('close')">×</button>
            </header>

            <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <!-- Identity -->
              <section>
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2.5">Identity</div>
                <div class="space-y-3">
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Company name</label>
                    <input v-model="companyName" type="text" class="input" />
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs font-semibold text-ink mb-1.5">Contact name</label>
                      <input v-model="contactName" type="text" class="input" />
                    </div>
                    <div>
                      <label class="block text-xs font-semibold text-ink mb-1.5">Contact title</label>
                      <input v-model="contactTitle" type="text" class="input" placeholder="Pastor / Owner / GM" />
                    </div>
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-ink mb-1.5">Contact email</label>
                    <input v-model="contactEmail" type="email" class="input" />
                  </div>
                  <div class="grid grid-cols-3 gap-3">
                    <div>
                      <label class="block text-xs font-semibold text-ink mb-1.5">Industry</label>
                      <input v-model="industry" type="text" class="input" />
                    </div>
                    <div>
                      <label class="block text-xs font-semibold text-ink mb-1.5">City</label>
                      <input v-model="city" type="text" class="input" />
                    </div>
                    <div>
                      <label class="block text-xs font-semibold text-ink mb-1.5">State</label>
                      <input v-model="state" type="text" class="input" maxlength="2" />
                    </div>
                  </div>
                </div>
              </section>

              <!-- Tags -->
              <section>
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2.5">Tags</div>
                <div class="flex flex-wrap gap-1.5 mb-2">
                  <span
                    v-for="t in tags"
                    :key="t"
                    class="inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand text-[11px] font-semibold px-2 py-0.5"
                  >
                    {{ t }}
                    <button type="button" class="text-brand/70 hover:text-brand text-sm leading-none" @click="removeTag(t)">×</button>
                  </span>
                  <span v-if="tags.length === 0" class="text-[11px] text-ink-disabled italic">No tags yet.</span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    v-model="newTag"
                    type="text"
                    placeholder="Add a tag and hit Enter…"
                    class="input !text-sm flex-1"
                    @keydown="onNewTagKey"
                  />
                  <button type="button" class="rounded-md border border-divider px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand" @click="addTag(newTag)">Add</button>
                </div>
                <div class="mt-2 flex flex-wrap gap-1">
                  <button
                    v-for="t in SUGGESTED_TAGS.filter((s) => !tags.includes(s))"
                    :key="t"
                    type="button"
                    class="rounded-full border border-divider bg-canvas text-ink-muted text-[10px] font-medium px-2 py-0.5 hover:text-brand hover:border-brand"
                    @click="addTag(t)"
                  >+ {{ t }}</button>
                </div>
              </section>

              <!-- Notes -->
              <section>
                <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-2.5">Notes</div>
                <textarea v-model="notes" rows="3" class="input" placeholder="Internal notes — context, conversation snippets, etc." />
              </section>

              <!-- Review excerpts / Deck quotes -->
              <section>
                <div class="flex items-baseline justify-between mb-2.5">
                  <div class="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Deck quotes (slide 2)</div>
                  <button
                    v-if="reviews.length < 4"
                    type="button"
                    class="text-[11px] text-brand font-semibold hover:underline"
                    @click="addReviewBox"
                  >+ Add quote</button>
                </div>
                <p class="text-[11px] text-ink-muted mb-2">
                  These appear on slide 2 of the pitch deck — "A few things I noticed." Can be real reviews or observations from the call.
                </p>
                <div class="space-y-3">
                  <div
                    v-for="(r, idx) in reviews"
                    :key="idx"
                    class="rounded-lg border border-divider bg-canvas/40 p-3"
                  >
                    <div class="flex items-start gap-2 mb-2">
                      <span class="text-[10px] font-semibold text-ink-muted mt-1">#{{ idx + 1 }}</span>
                      <textarea
                        v-model="r.text"
                        rows="2"
                        class="input flex-1 !text-sm"
                        placeholder="The quote or observation, in italics on the deck"
                      />
                      <button type="button" class="text-ink-disabled hover:text-danger text-lg leading-none" @click="removeReviewBox(idx)">×</button>
                    </div>
                    <div class="flex items-center gap-3 pl-6">
                      <label class="flex items-center gap-1.5 text-[10px] text-ink-muted">
                        Rating
                        <input v-model.number="r.rating" type="number" step="0.5" min="1" max="5" class="w-12 rounded border border-divider bg-surface px-1.5 py-0.5 text-[11px] text-ink" />
                        ★
                      </label>
                      <label class="flex items-center gap-1.5 text-[10px] text-ink-muted flex-1">
                        When
                        <input v-model="r.relative_time" type="text" class="flex-1 rounded border border-divider bg-surface px-1.5 py-0.5 text-[11px] text-ink" placeholder="e.g. '2 months ago' or 'from our conversation'" />
                      </label>
                    </div>
                  </div>
                </div>
              </section>

              <!-- Delete -->
              <section class="pt-4 border-t border-divider">
                <div class="text-[10px] font-bold uppercase tracking-wider text-danger mb-2">Danger zone</div>
                <button
                  v-if="!showDeleteConfirm"
                  type="button"
                  class="rounded-md border border-danger/30 text-danger bg-danger/5 px-3 py-1.5 text-xs font-semibold hover:bg-danger/10"
                  @click="showDeleteConfirm = true"
                >Delete this lead</button>
                <div v-else class="flex items-center gap-2">
                  <span class="text-xs text-danger font-semibold">Are you sure? This can't be undone.</span>
                  <button type="button" class="rounded-md bg-danger text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90" @click="onDeleteConfirm">Yes, delete</button>
                  <button type="button" class="rounded-md border border-divider px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand" @click="showDeleteConfirm = false">Cancel</button>
                </div>
              </section>
            </div>

            <footer class="px-6 py-3 border-t border-divider bg-canvas/30 flex items-center justify-between flex-shrink-0">
              <span class="text-[11px] text-ink-disabled">
                <span v-if="isDirty" class="text-warn font-semibold">Unsaved changes</span>
                <span v-else>Up to date</span>
              </span>
              <div class="flex items-center gap-2">
                <button type="button" class="rounded-md border border-divider px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand" @click="emit('close')">Close</button>
                <button
                  type="button"
                  class="rounded-md bg-brand text-white px-4 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-40"
                  :disabled="!isDirty || saving"
                  @click="save"
                >{{ saving ? 'Saving…' : 'Save' }}</button>
              </div>
            </footer>
          </aside>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
