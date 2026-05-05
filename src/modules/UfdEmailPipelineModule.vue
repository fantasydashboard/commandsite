<script setup lang="ts">
/**
 * UFD Email Pipeline — Kanban view of where every trial user is in the
 * lifecycle sequence right now. Hover any user card for per-user actions:
 *   ▶ Send  — fire the next eligible step immediately (force=true)
 *   ⊘       — opt the user out of the sequence (writes to
 *             email_recipient_opt_outs, runner skips them)
 *
 * Lives on Marketing > Email subtab. Data comes from the
 * email-pipeline-stats edge function.
 */
import { onMounted, ref, watch } from 'vue'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import UfdUserDetailDrawer from '@/components/UfdUserDetailDrawer.vue'
import type { Client } from '@/types/database'

const props = defineProps<{ client: Client; config: Record<string, unknown> }>()

interface PipelineUser {
  user_id: string
  email: string
  full_name: string | null
  trial_started_at: string | null
  trial_expires_at: string | null
  last_sent_at: string | null
  last_sent_template_key: string | null
  days_at_step: number | null
}
interface PipelineStep {
  id: string
  template_key: string
  day_offset: number
  step_order: number
  skip_if_paid: boolean
  use_expiry_date: boolean
}
interface PipelineData {
  sequence: { id: string; key: string; name: string; anchor_field: string }
  steps: PipelineStep[]
  buckets: {
    not_started: PipelineUser[]
    paid: PipelineUser[]
    completed: PipelineUser[]
    by_step_id: Record<string, PipelineUser[]>
  }
  totals: {
    not_started: number
    paid: number
    completed: number
    by_step_id: Record<string, number>
  }
}

const pipeline = ref<PipelineData | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const detailEmail = ref<string | null>(null)
const actionInFlight = ref<string | null>(null)
const actionResult = ref<string | null>(null)

async function surfaceFnError(err: unknown, fallback: string): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    try {
      const body = await err.context.json()
      return body?.error ?? err.message ?? fallback
    } catch {
      return err.message ?? fallback
    }
  }
  return (err as Error)?.message ?? fallback
}

async function load() {
  loading.value = true
  error.value = null
  const { data, error: err } = await supabase.functions.invoke<PipelineData>(
    'email-pipeline-stats',
    { body: {} },
  )
  loading.value = false
  if (err) {
    error.value = await surfaceFnError(err, 'Pipeline load failed')
    return
  }
  pipeline.value = data ?? null
}

async function sendNow(user: PipelineUser) {
  if (!confirm(`Send the next eligible email to ${user.email} right now?`)) return
  actionInFlight.value = user.user_id
  actionResult.value = null
  try {
    const { data, error: err } = await supabase.functions.invoke<{
      summary?: Record<string, { sent: number; skipped: number; failed: number }>
    }>('email-sequence-runner', {
      body: { user_id: user.user_id, force: true },
    })
    if (err) {
      actionResult.value = await surfaceFnError(err, 'Send failed')
      return
    }
    const total = data?.summary
      ? Object.values(data.summary).reduce((s, x) => s + (x.sent ?? 0), 0)
      : 0
    actionResult.value =
      total > 0
        ? `Sent next step to ${user.email}.`
        : `Nothing to send for ${user.email} (all steps already sent or paid).`
    await load()
  } catch (e: any) {
    actionResult.value = e?.message ?? 'Unknown error'
  } finally {
    actionInFlight.value = null
  }
}

async function skipUser(user: PipelineUser) {
  if (!pipeline.value) return
  if (
    !confirm(
      `Stop sending lifecycle emails to ${user.email}? You can undo this by deleting the row from email_recipient_opt_outs.`,
    )
  ) return
  actionInFlight.value = user.user_id
  actionResult.value = null
  try {
    const { error: err } = await supabase
      .from('email_recipient_opt_outs')
      // deno-lint-ignore no-explicit-any
      .insert({
        client_id: props.client.id,
        recipient: user.email.toLowerCase(),
        sequence_id: pipeline.value.sequence.id,
        reason: 'manually skipped from pipeline view',
      } as any)
    if (err) {
      actionResult.value = err.message
      return
    }
    actionResult.value = `${user.email} opted out of this sequence.`
    await load()
  } catch (e: any) {
    actionResult.value = e?.message ?? 'Unknown error'
  } finally {
    actionInFlight.value = null
  }
}

watch(() => props.client.id, load)
onMounted(load)
</script>

<template>
  <div class="space-y-3">
    <section class="card space-y-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span class="eyebrow">Pipeline</span>
          <h3 class="mt-1 text-sm font-semibold text-ink">Email Pipeline</h3>
          <p class="text-xs text-ink-muted">
            Where each UFD trial user is in the lifecycle right now. Column = the last template sent. Hover a card for per-user actions (Send Now / Skip).
          </p>
        </div>
        <button
          type="button"
          class="btn-ghost text-xs"
          :disabled="loading"
          @click="load"
        >
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>

      <p v-if="error" class="text-xs text-danger">{{ error }}</p>
      <p
        v-if="actionResult"
        class="text-xs text-success rounded bg-success/5 border border-success/30 px-2 py-1.5"
      >
        {{ actionResult }}
      </p>

      <div v-if="!pipeline && loading" class="py-4 text-center text-sm text-ink-muted">
        Loading pipeline…
      </div>
      <div
        v-else-if="pipeline && pipeline.steps.length === 0"
        class="rounded bg-surface-elevated/40 px-3 py-3 text-sm text-ink-muted"
      >
        Sequence has no steps yet.
      </div>
      <div v-else-if="pipeline" class="overflow-x-auto -mx-3 px-3">
        <div class="flex gap-3 min-w-max pb-2">
          <!-- Not started -->
          <div class="w-[220px] flex-shrink-0 rounded border border-divider bg-surface-elevated/40 p-2 space-y-2">
            <div class="flex items-baseline justify-between border-b border-divider/60 pb-2">
              <span class="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Not started</span>
              <span class="text-[11px] font-mono text-ink">{{ pipeline.totals.not_started }}</span>
            </div>
            <div class="space-y-1.5 max-h-72 overflow-y-auto">
              <div
                v-for="u in pipeline.buckets.not_started.slice(0, 25)"
                :key="u.user_id"
                class="group relative rounded bg-surface px-2 py-1.5 text-xs hover:bg-surface-elevated transition-colors"
              >
                <button
                  type="button"
                  class="w-full text-left"
                  :disabled="actionInFlight === u.user_id"
                  @click="detailEmail = u.email"
                >
                  <div class="truncate font-medium text-ink pr-12">{{ u.full_name || u.email }}</div>
                  <div v-if="u.full_name" class="truncate text-[10px] text-ink-muted">{{ u.email }}</div>
                </button>
                <div class="absolute top-1 right-1 hidden group-hover:flex items-center gap-1">
                  <button
                    type="button"
                    title="Send first step now"
                    class="rounded bg-brand/10 hover:bg-brand/20 text-brand text-[10px] font-semibold px-1.5 py-0.5"
                    :disabled="actionInFlight === u.user_id"
                    @click.stop="sendNow(u)"
                  >▶ Send</button>
                  <button
                    type="button"
                    title="Skip this user from sequence"
                    class="rounded bg-danger/10 hover:bg-danger/20 text-danger text-[10px] font-semibold px-1.5 py-0.5"
                    :disabled="actionInFlight === u.user_id"
                    @click.stop="skipUser(u)"
                  >⊘</button>
                </div>
              </div>
              <div
                v-if="pipeline.buckets.not_started.length > 25"
                class="px-1 text-[10px] text-ink-muted"
              >+{{ pipeline.buckets.not_started.length - 25 }} more</div>
              <div
                v-if="pipeline.buckets.not_started.length === 0"
                class="px-1 py-2 text-[11px] text-ink-disabled italic"
              >No users</div>
            </div>
          </div>

          <!-- One column per step -->
          <div
            v-for="step in pipeline.steps"
            :key="step.id"
            class="w-[220px] flex-shrink-0 rounded border border-divider bg-surface-elevated/40 p-2 space-y-2"
          >
            <div class="border-b border-divider/60 pb-2">
              <div class="flex items-baseline justify-between">
                <span class="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Day {{ step.day_offset }}</span>
                <span class="text-[11px] font-mono text-ink">{{ pipeline.totals.by_step_id[step.id] ?? 0 }}</span>
              </div>
              <div class="truncate font-mono text-[11px] text-ink">{{ step.template_key }}</div>
            </div>
            <div class="space-y-1.5 max-h-72 overflow-y-auto">
              <div
                v-for="u in pipeline.buckets.by_step_id[step.id]?.slice(0, 25) ?? []"
                :key="u.user_id"
                class="group relative rounded bg-surface px-2 py-1.5 text-xs hover:bg-surface-elevated transition-colors"
              >
                <button
                  type="button"
                  class="w-full text-left"
                  :disabled="actionInFlight === u.user_id"
                  @click="detailEmail = u.email"
                >
                  <div class="truncate font-medium text-ink pr-12">{{ u.full_name || u.email }}</div>
                  <div
                    v-if="u.days_at_step !== null"
                    :class="[
                      'mt-0.5 text-[10px]',
                      u.days_at_step >= 7 ? 'text-warn font-semibold' : 'text-ink-muted',
                    ]"
                  >{{ u.days_at_step === 0 ? 'today' : `${u.days_at_step}d here` }}</div>
                </button>
                <div class="absolute top-1 right-1 hidden group-hover:flex items-center gap-1">
                  <button
                    type="button"
                    title="Send next step now"
                    class="rounded bg-brand/10 hover:bg-brand/20 text-brand text-[10px] font-semibold px-1.5 py-0.5"
                    :disabled="actionInFlight === u.user_id"
                    @click.stop="sendNow(u)"
                  >▶ Send</button>
                  <button
                    type="button"
                    title="Skip this user from sequence"
                    class="rounded bg-danger/10 hover:bg-danger/20 text-danger text-[10px] font-semibold px-1.5 py-0.5"
                    :disabled="actionInFlight === u.user_id"
                    @click.stop="skipUser(u)"
                  >⊘</button>
                </div>
              </div>
              <div
                v-if="(pipeline.buckets.by_step_id[step.id]?.length ?? 0) > 25"
                class="px-1 text-[10px] text-ink-muted"
              >+{{ (pipeline.buckets.by_step_id[step.id]?.length ?? 0) - 25 }} more</div>
              <div
                v-if="(pipeline.buckets.by_step_id[step.id]?.length ?? 0) === 0"
                class="px-1 py-2 text-[11px] text-ink-disabled italic"
              >No users</div>
            </div>
          </div>

          <!-- Paid (success state) -->
          <div class="w-[220px] flex-shrink-0 rounded border border-success/30 bg-success/5 p-2 space-y-2">
            <div class="flex items-baseline justify-between border-b border-success/20 pb-2">
              <span class="text-[11px] font-semibold uppercase tracking-wide text-success">Paid</span>
              <span class="text-[11px] font-mono text-ink">{{ pipeline.totals.paid }}</span>
            </div>
            <div class="space-y-1.5 max-h-72 overflow-y-auto">
              <button
                v-for="u in pipeline.buckets.paid.slice(0, 25)"
                :key="u.user_id"
                type="button"
                class="w-full rounded bg-surface px-2 py-1.5 text-left text-xs hover:bg-surface-elevated transition-colors"
                @click="detailEmail = u.email"
              >
                <div class="truncate font-medium text-ink">{{ u.full_name || u.email }}</div>
              </button>
              <div
                v-if="pipeline.buckets.paid.length > 25"
                class="px-1 text-[10px] text-ink-muted"
              >+{{ pipeline.buckets.paid.length - 25 }} more</div>
              <div
                v-if="pipeline.buckets.paid.length === 0"
                class="px-1 py-2 text-[11px] text-ink-disabled italic"
              >No users</div>
            </div>
          </div>

          <!-- Completed (sequence done, didn't convert) -->
          <div class="w-[220px] flex-shrink-0 rounded border border-divider bg-surface-elevated/40 p-2 space-y-2">
            <div class="flex items-baseline justify-between border-b border-divider/60 pb-2">
              <span class="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Completed</span>
              <span class="text-[11px] font-mono text-ink">{{ pipeline.totals.completed }}</span>
            </div>
            <div class="space-y-1.5 max-h-72 overflow-y-auto">
              <button
                v-for="u in pipeline.buckets.completed.slice(0, 25)"
                :key="u.user_id"
                type="button"
                class="w-full rounded bg-surface px-2 py-1.5 text-left text-xs hover:bg-surface-elevated transition-colors"
                @click="detailEmail = u.email"
              >
                <div class="truncate font-medium text-ink">{{ u.full_name || u.email }}</div>
              </button>
              <div
                v-if="pipeline.buckets.completed.length > 25"
                class="px-1 text-[10px] text-ink-muted"
              >+{{ pipeline.buckets.completed.length - 25 }} more</div>
              <div
                v-if="pipeline.buckets.completed.length === 0"
                class="px-1 py-2 text-[11px] text-ink-disabled italic"
              >No users</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <UfdUserDetailDrawer
      :open="detailEmail !== null"
      :email="detailEmail"
      :client="props.client"
      @close="detailEmail = null"
    />
  </div>
</template>
