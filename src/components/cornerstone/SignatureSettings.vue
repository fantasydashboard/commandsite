<script setup lang="ts">
/**
 * Settings - the name at the bottom of Grace's drafts.
 *
 * This was hardcoded to one pastor's name in three separate places: the guest
 * welcome, the family drift note, and the serving ask. That breaks the moment a
 * church sends from anyone else's address, because the guest gets an email from
 * the Connections team signed by the pastor. Sender and signature are one
 * decision, not two, so this sits next to the sending account.
 *
 * Guest welcomes are drafted server-side, so a change here only reaches them on
 * the next recompute. The UI says so rather than letting it look broken.
 */
import { onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { DEFAULT_SIGNATURE } from '@/lib/clients/church/careDataLoader'

const props = defineProps<{ clientId: string }>()

// church_settings is absent from the generated types, same as privacy.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

const signature = ref('')
const loading = ref(true)
const saving = ref(false)
const saved = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const { data } = await sb.from('church_settings').select('messaging').eq('client_id', props.clientId).maybeSingle()
    signature.value = (data?.messaging?.signature ?? '').trim()
  } catch { /* falls back to the default */ }
  loading.value = false
})

async function save() {
  saving.value = true
  error.value = null
  try {
    // Merge rather than replace: messaging also holds enabled, testMode,
    // testRecipient, quiet hours and rate limits, and clobbering those would
    // silently turn sending off or point it at nobody.
    const { data } = await sb.from('church_settings').select('messaging').eq('client_id', props.clientId).maybeSingle()
    const messaging = { ...(data?.messaging ?? {}), signature: signature.value.trim() }
    const { error: err } = await sb
      .from('church_settings')
      .upsert({ client_id: props.clientId, messaging }, { onConflict: 'client_id' })
    if (err) throw new Error(err.message)
    saved.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="eyebrow">Who signs the notes</span>
      <span class="text-[11px] text-ink-muted">Used on every draft</span>
    </div>
    <h3 class="mt-1 text-base font-semibold text-ink">Sign-off name</h3>
    <p class="mt-1 max-w-2xl text-sm text-ink-muted">
      The name at the bottom of every note Grace drafts. It should match the account you send
      from: a welcome that arrives from the Connections team but is signed by a pastor reads as
      a form letter, which is the one thing these notes cannot afford to be.
    </p>

    <div v-if="!loading" class="mt-4 flex flex-wrap items-center gap-3">
      <input
        v-model="signature"
        type="text"
        :placeholder="DEFAULT_SIGNATURE"
        class="w-full max-w-xs rounded-md border border-divider bg-surface-raised px-3 py-1.5 text-sm text-ink placeholder:text-ink-disabled focus:border-brand focus:outline-none"
        @input="saved = false"
      />
      <button
        type="button"
        class="rounded-md bg-brand px-4 py-1.5 text-xs font-semibold text-ink-inverse hover:bg-brand-hover disabled:opacity-50"
        :disabled="saving"
        @click="save"
      >{{ saving ? 'Saving…' : 'Save' }}</button>
      <span v-if="saved" class="text-[11px] font-medium text-success">Saved</span>
      <span v-if="error" class="text-[11px] text-danger">{{ error }}</span>
    </div>
    <p v-else class="mt-4 text-[11px] text-ink-muted">Loading…</p>

    <div class="mt-4 rounded-lg border border-divider bg-surface px-3 py-2.5">
      <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Preview</div>
      <p class="mt-1 text-[13px] italic leading-relaxed text-ink">
        "…If we can help in any way, just reply here. Blessings, {{ signature.trim() || DEFAULT_SIGNATURE }}"
      </p>
    </div>

    <p class="mt-3 text-[11px] leading-relaxed text-ink-disabled">
      Care notes and serving asks pick this up straight away. Guest welcomes are drafted during
      the nightly sync, so those change after the next refresh.
    </p>
  </section>
</template>
