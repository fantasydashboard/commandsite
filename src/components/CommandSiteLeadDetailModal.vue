<script setup lang="ts">
/**
 * Lead Detail side panel.
 *
 * Slides in from the right when a row in the Leads table is clicked.
 * Shows every editable field that affects the auto-draft pipeline
 * (contact_email, score, status), plus a "Draft outreach now" button
 * that calls draft-cold-email directly so we don't wait for the cron.
 */
import { computed, ref, watch } from 'vue'
import type { CsLead, CsLeadStatus } from '@/types/database'
import { supabase } from '@/lib/supabase'

const props = defineProps<{
  open: boolean
  lead: CsLead | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
  (e: 'drafted', leadId: string): void
}>()

// Editable mirror — we don't mutate the prop directly.
const form = ref({
  contact_email: '',
  contact_name: '',
  contact_title: '',
  contact_phone: '',
  company_url: '',
  linkedin_url: '',
  industry: '',
  city: '',
  state: '',
  notes: '',
})

const saving = ref(false)
const drafting = ref(false)
const enriching = ref(false)
const dropping = ref(false)
const message = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)

// Reset form whenever the lead object identity changes — including when
// the parent reloads after a save/enrich and reassigns detailLead.value
// to a fresh row from the table. We preserve the message banner across
// re-loads of the *same* lead id (so the "Apollo found…" toast doesn't
// disappear after a refresh).
let lastLeadId: string | null = null
watch(
  () => props.lead,
  () => {
    const l = props.lead
    form.value = {
      contact_email: l?.contact_email ?? '',
      contact_name: l?.contact_name ?? '',
      contact_title: l?.contact_title ?? '',
      contact_phone: l?.contact_phone ?? '',
      company_url: l?.company_url ?? '',
      linkedin_url: l?.linkedin_url ?? '',
      industry: l?.industry ?? '',
      city: l?.city ?? '',
      state: l?.state ?? '',
      notes: l?.notes ?? '',
    }
    if (l?.id !== lastLeadId) message.value = null
    lastLeadId = l?.id ?? null
  },
  { immediate: true },
)

const STATUS_LABEL: Record<CsLeadStatus, string> = {
  new: 'New',
  queued: 'Queued',
  contacted: 'Contacted',
  replied: 'Replied',
  promoted_to_pipeline: 'In pipeline',
  archived: 'Archived',
  disqualified: 'Disqualified',
}

const draftReadiness = computed(() => {
  const l = props.lead
  if (!l) return null
  if (!form.value.contact_email.trim()) {
    return { ready: false, reason: 'Add a contact email — auto-draft needs one to send to.' }
  }
  if ((l.icp_score ?? 0) < 65) {
    return { ready: false, reason: `Score ${l.icp_score ?? 0} is below the auto-draft threshold of 65.` }
  }
  if (l.status === 'replied' || l.status === 'disqualified' || l.status === 'archived') {
    return { ready: false, reason: `Status is "${STATUS_LABEL[l.status]}" — auto-draft skips this lead.` }
  }
  if (l.draft_cold_email_subject && l.draft_cold_email_body) {
    return { ready: false, reason: 'A draft already exists — find it in the Outreach approval queue.' }
  }
  return { ready: true, reason: 'Eligible. The cron will draft within 5 minutes — or use "Draft now" to skip the wait.' }
})

const websiteHref = computed(() => {
  const u = form.value.company_url?.trim()
  if (!u) return null
  return u.startsWith('http') ? u : `https://${u}`
})

type SocialLink = { platform: string; label: string; icon: string; url: string }

const SOCIAL_META: Record<string, { label: string; icon: string; ordering: number }> = {
  facebook:  { label: 'Facebook',  icon: '📘', ordering: 1 },
  instagram: { label: 'Instagram', icon: '📷', ordering: 2 },
  yelp:      { label: 'Yelp',      icon: '⭐', ordering: 3 },
  linkedin:  { label: 'LinkedIn',  icon: '💼', ordering: 4 },
  twitter:   { label: 'X · Twitter', icon: '𝕏', ordering: 5 },
  youtube:   { label: 'YouTube',   icon: '▶',  ordering: 6 },
  tiktok:    { label: 'TikTok',    icon: '♪',  ordering: 7 },
}

const socialLinks = computed<SocialLink[]>(() => {
  const map = props.lead?.social_urls
  if (!map || Object.keys(map).length === 0) return []
  return Object.entries(map)
    .filter(([, url]) => typeof url === 'string' && url.length > 0)
    .map(([platform, url]) => ({
      platform,
      label: SOCIAL_META[platform]?.label ?? platform,
      icon: SOCIAL_META[platform]?.icon ?? '🔗',
      url,
    }))
    .sort((a, b) => (SOCIAL_META[a.platform]?.ordering ?? 99) - (SOCIAL_META[b.platform]?.ordering ?? 99))
})

type VerificationBadge = { label: string; pillClass: string; explainer: string }

const verificationBadge = computed<VerificationBadge | null>(() => {
  const status = props.lead?.email_verification_status
  if (!status || !form.value.contact_email) return null
  switch (status) {
    case 'valid':
      return {
        label: '✓ Verified deliverable',
        pillClass: 'bg-success/15 text-success border border-success/30',
        explainer: 'NeverBounce confirmed this address accepts mail.',
      }
    case 'catchall':
      return {
        label: '~ Catch-all domain',
        pillClass: 'bg-warn/15 text-warn border border-warn/30',
        explainer:
          'The domain accepts mail for any address — we can\'t prove this specific inbox exists. Likely still deliverable but riskier for sender reputation.',
      }
    case 'unknown':
      return {
        label: '? Unverifiable',
        pillClass: 'bg-warn/15 text-warn border border-warn/30',
        explainer:
          'NeverBounce couldn\'t test this address (common for Gmail / Yahoo — provider hides individual accounts). Send at your own discretion.',
      }
    case 'unverified':
      return {
        label: '○ Unverified',
        pillClass: 'bg-ink-muted/15 text-ink-muted border border-ink-muted/30',
        explainer: 'Address saved without a verification check (NeverBounce wasn\'t available).',
      }
    case 'invalid':
    case 'disposable':
      return {
        label: '× Bad address',
        pillClass: 'bg-danger/15 text-danger border border-danger/30',
        explainer: 'NeverBounce flagged this address as invalid or disposable. Sending will bounce.',
      }
    default:
      return null
  }
})

function close() {
  if (saving.value || drafting.value) return
  emit('close')
}

async function save(): Promise<boolean> {
  const l = props.lead
  if (!l) return false
  saving.value = true
  message.value = null

  // Build the DB payload AND a typed snapshot of the new values so we can
  // mutate the lead in place after a successful save. Doing this in place
  // keeps the leads-table row in sync (it shares identity with this lead
  // ref via openDetail) without triggering a full table reload — the
  // reload was the freeze source: an `await load()` in the parent that
  // sometimes hangs or thrashes Vue's render cycle.
  const payload: Record<string, string | null> = {}
  const snapshot: Record<string, string | null> = {}
  for (const [k, v] of Object.entries(form.value)) {
    const trimmed = typeof v === 'string' ? v.trim() : v
    const final = trimmed === '' ? null : (trimmed as string)
    payload[k] = final
    snapshot[k] = final
  }

  try {
    const { error } = await supabase
      .from('cs_leads')
      .update(payload as never)
      .eq('id', l.id)
    if (error) {
      message.value = { kind: 'err', text: `Save failed: ${error.message}` }
      return false
    }
  } catch (err) {
    message.value = {
      kind: 'err',
      text: `Save errored: ${err instanceof Error ? err.message : String(err)}`,
    }
    return false
  } finally {
    saving.value = false
  }

  // Mutate in place — leads-table sees the change immediately.
  Object.assign(l as unknown as Record<string, unknown>, snapshot)
  message.value = { kind: 'ok', text: 'Saved.' }
  return true
}

async function dropAsUnreachable() {
  const l = props.lead
  if (!l) return
  const confirmed = window.confirm(
    `Drop "${l.company_name}" as unreachable?\n\n`
    + 'This sets the lead to Disqualified and tags it as "no_contact_available." '
    + 'The auto-draft cron will skip it. You can requeue later if a better '
    + 'enrichment source surfaces their email.',
  )
  if (!confirmed) return

  dropping.value = true
  message.value = null
  const existingTags = (l.tags ?? []).filter((t) => t !== 'no_contact_available')
  const { error } = await supabase
    .from('cs_leads')
    .update({
      status: 'disqualified',
      tags: [...existingTags, 'no_contact_available'],
    } as never)
    .eq('id', l.id)
  dropping.value = false
  if (error) {
    message.value = { kind: 'err', text: `Couldn't drop: ${error.message}` }
    return
  }
  emit('saved')
  emit('close')
}

async function rerunEmailScrape() {
  const l = props.lead
  if (!l) return
  enriching.value = true
  message.value = null
  // Clear the current email + verification status + stale tags so the
  // function re-processes this lead under the latest ranker logic.
  const cleanedTags = (l.tags ?? []).filter((t) =>
    !['email_enriched', 'email_verified', 'email_invalid', 'email_disposable',
      'email_catch_all', 'email_unverifiable', 'email_unverified',
      'email_not_found', 'email_fetch_error'].includes(t),
  )
  const { error: clearErr } = await supabase
    .from('cs_leads')
    .update({
      contact_email: null,
      email_verification_status: null,
      tags: cleanedTags,
    } as never)
    .eq('id', l.id)
  if (clearErr) {
    enriching.value = false
    message.value = { kind: 'err', text: `Couldn't reset lead: ${clearErr.message}` }
    return
  }
  const { error: fnErr } = await supabase.functions.invoke('enrich-lead-emails', {
    body: { lead_ids: [l.id] },
  })
  enriching.value = false
  if (fnErr) {
    message.value = { kind: 'err', text: `Scrape failed: ${fnErr.message}` }
    return
  }
  message.value = { kind: 'ok', text: 'Re-scraped. Check the email field for the new result.' }
  emit('saved')
}

async function enrichViaApollo() {
  const l = props.lead
  if (!l) return
  enriching.value = true
  message.value = null
  const { data, error: fnErr } = await supabase.functions.invoke('apollo-enrich-lead', {
    body: { lead_id: l.id },
  })
  enriching.value = false
  if (fnErr) {
    message.value = { kind: 'err', text: `Apollo call failed: ${fnErr.message}` }
    return
  }
  const r = (data ?? {}) as {
    status?: string
    person?: { name?: string | null; title?: string | null; email?: string | null; email_status?: string | null }
    org?: { name?: string | null; domain?: string | null }
    error?: string
  }
  if (r.status === 'found' && r.person) {
    const obfuscated = r.person.email_status === 'obfuscated_free_tier'
    const summary = [
      r.person.name ?? '(no name)',
      r.person.title ?? '',
      obfuscated ? `email locked: ${r.person.email}` : (r.person.email ?? 'no email returned'),
    ].filter(Boolean).join(' · ')
    message.value = {
      kind: obfuscated ? 'err' : 'ok',
      text: obfuscated
        ? `Apollo found a contact but the email is locked behind a credit on free tier. ${summary}`
        : `Apollo found: ${summary}`,
    }
    emit('saved')
  } else if (r.status === 'no_org_match') {
    message.value = { kind: 'err', text: `Apollo couldn't match the company: ${r.error ?? 'no match'}` }
  } else if (r.status === 'no_people_match') {
    message.value = { kind: 'err', text: `Apollo matched the company (${r.org?.name ?? '?'}) but returned no people.` }
  } else if (r.status === 'apollo_error') {
    message.value = { kind: 'err', text: `Apollo error: ${r.error ?? 'unknown'}` }
  } else {
    message.value = { kind: 'err', text: `Apollo: unexpected response (${r.status ?? 'no status'})` }
  }
}

async function draftNow() {
  const l = props.lead
  if (!l) return
  if (!draftReadiness.value?.ready) return
  drafting.value = true
  message.value = null

  // Save first so the edge function reads the current contact_email + url.
  const saveOk = await save()
  if (!saveOk) {
    drafting.value = false
    return
  }

  // Mark drafting so the cron doesn't double-pick.
  await supabase.from('cs_leads').update({ draft_state: 'drafting' } as never).eq('id', l.id)

  const { error: fnErr } = await supabase.functions.invoke('draft-cold-email', {
    body: { lead_ids: [l.id] },
  })
  drafting.value = false

  if (fnErr) {
    await supabase.from('cs_leads').update({ draft_state: null } as never).eq('id', l.id)
    message.value = { kind: 'err', text: `Draft failed: ${fnErr.message}` }
    return
  }
  message.value = {
    kind: 'ok',
    text: 'Drafted. Head to Outreach → Approval Queue to review and send.',
  }
  emit('drafted', l.id)
}
</script>

<template>
  <Teleport to="body">
    <!-- backdrop -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0" enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100" leave-to-class="opacity-0"
    >
      <div v-if="open && lead" class="fixed inset-0 z-40 bg-ink/40" @click="close"></div>
    </Transition>

    <!-- panel -->
    <Transition
      enter-active-class="transition-transform duration-300 ease-out"
      enter-from-class="translate-x-full" enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-200 ease-out"
      leave-from-class="translate-x-0" leave-to-class="translate-x-full"
    >
      <aside
        v-if="open && lead"
        class="fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl bg-surface shadow-2xl flex flex-col"
      >
        <header class="flex items-start justify-between gap-3 px-5 py-4 border-b border-divider bg-surface-raised">
          <div class="min-w-0">
            <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand mb-0.5">
              Lead detail
            </div>
            <h2 class="text-base font-bold text-ink leading-tight truncate">
              {{ lead.company_name }}
            </h2>
            <p class="text-[11px] text-ink-muted mt-0.5">
              Score {{ lead.icp_score ?? '—' }} ·
              Status: {{ STATUS_LABEL[lead.status] }} ·
              Source: {{ lead.source }}
            </p>
          </div>
          <button
            type="button"
            class="text-ink-muted hover:text-ink text-lg leading-none p-1"
            aria-label="Close"
            @click="close"
          >✕</button>
        </header>

        <div class="flex-1 overflow-y-auto p-5 space-y-5">
          <!-- Readiness banner -->
          <div
            v-if="draftReadiness"
            class="rounded-card border px-3 py-2.5 text-xs"
            :class="draftReadiness.ready
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-warn/30 bg-warn/10 text-warn'"
          >
            <div class="flex items-center gap-2 font-semibold mb-0.5">
              <span class="text-base leading-none">{{ draftReadiness.ready ? '✓' : '⚠' }}</span>
              <span>{{ draftReadiness.ready ? 'Auto-draft eligible' : 'Auto-draft blocked' }}</span>
            </div>
            <p class="text-ink leading-snug">{{ draftReadiness.reason }}</p>
          </div>

          <!-- Contact -->
          <section>
            <div class="flex items-center justify-between mb-2 flex-wrap gap-1">
              <h3 class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Contact</h3>
              <div class="flex items-center gap-1.5">
                <button
                  v-if="lead?.company_url"
                  type="button"
                  class="rounded-md border border-brand/40 text-brand bg-surface px-2 py-0.5 text-[11px] font-semibold hover:bg-brand/10 disabled:opacity-50"
                  :disabled="enriching || saving || drafting"
                  title="Re-scrape the company website for emails under the latest ranker logic. Clears the current email first."
                  @click="rerunEmailScrape"
                >{{ enriching ? 'Working…' : '↻ Re-scrape site' }}</button>
                <button
                  type="button"
                  class="rounded-md border border-accent/40 text-accent bg-surface px-2 py-0.5 text-[11px] font-semibold hover:bg-accent/10 disabled:opacity-50"
                  :disabled="enriching || saving || drafting"
                  title="Search Apollo for verified contact info — costs 1 email credit if a result is returned"
                  @click="enrichViaApollo"
                >{{ enriching ? 'Searching…' : '🔍 Find via Apollo' }}</button>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <label class="col-span-2 block">
                <div class="flex items-center justify-between mb-0.5">
                  <span class="text-[11px] text-ink-muted">Email <span class="text-danger">*</span></span>
                  <span
                    v-if="verificationBadge"
                    class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                    :class="verificationBadge.pillClass"
                    :title="verificationBadge.explainer"
                  >{{ verificationBadge.label }}</span>
                </div>
                <input
                  v-model="form.contact_email"
                  type="email"
                  placeholder="name@company.com"
                  class="w-full rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-sm text-ink font-mono focus:border-brand focus:outline-none"
                />
                <p
                  v-if="verificationBadge"
                  class="text-[11px] text-ink-muted mt-1 leading-snug"
                >{{ verificationBadge.explainer }}</p>
              </label>
              <label class="block">
                <span class="block text-[11px] text-ink-muted mb-0.5">Name</span>
                <input
                  v-model="form.contact_name"
                  type="text"
                  class="w-full rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
                />
              </label>
              <label class="block">
                <span class="block text-[11px] text-ink-muted mb-0.5">Title</span>
                <input
                  v-model="form.contact_title"
                  type="text"
                  placeholder="Owner, Office Manager…"
                  class="w-full rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
                />
              </label>
              <label class="block">
                <span class="block text-[11px] text-ink-muted mb-0.5">Phone</span>
                <input
                  v-model="form.contact_phone"
                  type="tel"
                  class="w-full rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-sm text-ink font-mono focus:border-brand focus:outline-none"
                />
              </label>
              <label class="block">
                <span class="block text-[11px] text-ink-muted mb-0.5">LinkedIn</span>
                <input
                  v-model="form.linkedin_url"
                  type="url"
                  placeholder="linkedin.com/in/…"
                  class="w-full rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-sm text-ink font-mono focus:border-brand focus:outline-none"
                />
              </label>
            </div>
          </section>

          <!-- Company -->
          <section>
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Company</h3>
              <a
                v-if="websiteHref"
                :href="websiteHref"
                target="_blank"
                rel="noopener"
                class="text-[11px] text-brand hover:underline"
              >Open website ↗</a>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <label class="col-span-2 block">
                <span class="block text-[11px] text-ink-muted mb-0.5">Website</span>
                <input
                  v-model="form.company_url"
                  type="url"
                  placeholder="https://…"
                  class="w-full rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-sm text-ink font-mono focus:border-brand focus:outline-none"
                />
              </label>
              <label class="block">
                <span class="block text-[11px] text-ink-muted mb-0.5">Industry</span>
                <input
                  v-model="form.industry"
                  type="text"
                  class="w-full rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
                />
              </label>
              <div class="grid grid-cols-2 gap-2">
                <label class="block">
                  <span class="block text-[11px] text-ink-muted mb-0.5">City</span>
                  <input
                    v-model="form.city"
                    type="text"
                    class="w-full rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
                  />
                </label>
                <label class="block">
                  <span class="block text-[11px] text-ink-muted mb-0.5">State</span>
                  <input
                    v-model="form.state"
                    type="text"
                    maxlength="2"
                    class="w-full rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-sm text-ink uppercase focus:border-brand focus:outline-none"
                  />
                </label>
              </div>
            </div>
          </section>

          <!-- Social profiles -->
          <section v-if="socialLinks.length > 0">
            <h3 class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
              Social profiles
              <span class="text-[10px] font-normal normal-case tracking-normal text-ink-muted ml-1">
                · owners often list emails on Facebook / Instagram that they hide on their website
              </span>
            </h3>
            <div class="flex flex-wrap gap-2">
              <a
                v-for="link in socialLinks"
                :key="link.platform"
                :href="link.url"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 rounded-md border border-divider bg-surface-raised px-2.5 py-1 text-xs font-medium text-ink hover:border-brand/40 hover:bg-brand/5 transition-colors"
                :title="link.url"
              >
                <span aria-hidden="true">{{ link.icon }}</span>
                <span>{{ link.label }}</span>
                <span class="text-ink-muted">↗</span>
              </a>
            </div>
          </section>

          <!-- Score reason (read-only) -->
          <section v-if="lead.icp_score_reason">
            <h3 class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">Why this score</h3>
            <p class="text-[12.5px] text-ink leading-relaxed bg-surface-raised border border-divider rounded-md px-3 py-2">
              {{ lead.icp_score_reason }}
            </p>
          </section>

          <!-- Notes -->
          <section>
            <h3 class="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">Notes</h3>
            <textarea
              v-model="form.notes"
              rows="3"
              placeholder="Anything you want Ada to know before drafting…"
              class="w-full rounded-md border border-divider bg-surface-raised px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none resize-y"
            />
          </section>

          <!-- Existing draft preview -->
          <section v-if="lead.draft_cold_email_subject">
            <h3 class="text-[10px] font-semibold uppercase tracking-wider text-accent mb-1">Existing draft</h3>
            <div class="rounded-md border border-accent/30 bg-accent/5 px-3 py-2.5 text-sm space-y-1.5">
              <div class="text-[11px] text-ink-muted">Subject</div>
              <div class="font-mono text-ink">{{ lead.draft_cold_email_subject }}</div>
              <div class="text-[11px] text-ink-muted pt-1">Body</div>
              <div class="text-ink leading-relaxed whitespace-pre-wrap text-[12.5px]">{{ lead.draft_cold_email_body }}</div>
            </div>
          </section>

          <!-- Status message -->
          <div
            v-if="message"
            class="rounded-md px-3 py-2 text-xs font-medium"
            :class="message.kind === 'ok'
              ? 'bg-success/10 text-success border border-success/30'
              : 'bg-danger/10 text-danger border border-danger/30'"
          >
            {{ message.text }}
          </div>
        </div>

        <footer class="flex items-center justify-between gap-2 px-5 py-3 border-t border-divider bg-surface-raised flex-wrap">
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="text-xs text-ink-muted hover:text-ink"
              :disabled="saving || drafting || dropping"
              @click="close"
            >Cancel</button>
            <button
              v-if="lead && lead.status !== 'disqualified' && lead.status !== 'promoted_to_pipeline'"
              type="button"
              class="text-xs text-danger hover:underline disabled:opacity-50"
              :disabled="saving || drafting || dropping"
              :title="'Mark this lead as unreachable — no email found. Sets status to Disqualified with a recovery tag.'"
              @click="dropAsUnreachable"
            >{{ dropping ? 'Dropping…' : 'Drop — can\'t reach' }}</button>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-md border border-brand/40 text-brand bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-brand/10 disabled:opacity-50"
              :disabled="saving || drafting || dropping"
              @click="save"
            >{{ saving ? 'Saving…' : 'Save changes' }}</button>
            <button
              type="button"
              class="rounded-md bg-brand text-white px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
              :disabled="!draftReadiness?.ready || saving || drafting || dropping"
              :title="draftReadiness?.ready ? 'Draft a touch-1 cold email now (skips the 5-min cron wait)' : draftReadiness?.reason"
              @click="draftNow"
            >{{ drafting ? 'Drafting…' : 'Draft outreach now →' }}</button>
          </div>
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>
