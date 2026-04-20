<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { supabase } from '@/lib/supabase'
import type { Client } from '@/types/database'

const clients = ref<Client[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const showCreate = ref(false)

const form = ref({
  name: '',
  slug: '',
  tier: 'standard',
  monthly_rate: 0,
})
const submitting = ref(false)

async function loadClients() {
  loading.value = true
  const { data, error: err } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })
  if (err) error.value = err.message
  else clients.value = data ?? []
  loading.value = false
}

async function toggleActive(c: Client) {
  const { error: err } = await supabase
    .from('clients')
    .update({ active: !c.active })
    .eq('id', c.id)
  if (err) {
    error.value = err.message
    return
  }
  c.active = !c.active
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function onCreate() {
  submitting.value = true
  error.value = null
  const payload = {
    name: form.value.name,
    slug: form.value.slug || slugify(form.value.name),
    tier: form.value.tier,
    monthly_rate: form.value.monthly_rate,
  }
  const { data, error: err } = await supabase
    .from('clients')
    .insert(payload)
    .select()
    .single()
  submitting.value = false
  if (err) {
    error.value = err.message
    return
  }
  clients.value.unshift(data as Client)
  showCreate.value = false
  form.value = { name: '', slug: '', tier: 'standard', monthly_rate: 0 }
}

onMounted(loadClients)
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-semibold text-ink">Clients</h1>
        <p class="text-sm text-ink-muted">All CommandSite dashboards you manage.</p>
      </div>
      <button class="btn-primary" @click="showCreate = !showCreate">
        {{ showCreate ? 'Cancel' : 'New client' }}
      </button>
    </div>

    <div v-if="showCreate" class="card mb-6">
      <h2 class="text-lg font-semibold mb-4 text-ink">Create client</h2>
      <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="onCreate">
        <div class="sm:col-span-2">
          <label class="block text-sm font-medium text-ink mb-1">Name</label>
          <input
            v-model="form.name"
            class="input"
            required
            @blur="form.slug = form.slug || slugify(form.name)"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-ink mb-1">Slug</label>
          <input v-model="form.slug" class="input" placeholder="auto from name" />
        </div>
        <div>
          <label class="block text-sm font-medium text-ink mb-1">Tier</label>
          <select v-model="form.tier" class="input">
            <option value="basic">Basic</option>
            <option value="standard">Standard</option>
            <option value="premium">Premium</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-ink mb-1">Monthly rate</label>
          <input
            v-model.number="form.monthly_rate"
            type="number"
            min="0"
            step="0.01"
            class="input"
          />
        </div>
        <div class="sm:col-span-2 flex justify-end">
          <button type="submit" class="btn-primary" :disabled="submitting">
            {{ submitting ? 'Creating…' : 'Create client' }}
          </button>
        </div>
      </form>
    </div>

    <p v-if="error" class="text-sm text-danger mb-4">{{ error }}</p>

    <div v-if="loading" class="text-sm text-ink-muted">Loading…</div>

    <div v-else-if="clients.length === 0" class="card text-center text-ink-muted">
      No clients yet. Create your first one above.
    </div>

    <div v-else class="card p-0 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-surface-elevated text-left text-ink-muted">
          <tr>
            <th class="px-6 py-3 font-medium">Name</th>
            <th class="px-6 py-3 font-medium">Slug</th>
            <th class="px-6 py-3 font-medium">Tier</th>
            <th class="px-6 py-3 font-medium">Rate</th>
            <th class="px-6 py-3 font-medium">Status</th>
            <th class="px-6 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-divider">
          <tr v-for="c in clients" :key="c.id" class="hover:bg-surface-elevated/50">
            <td class="px-6 py-3 font-medium text-ink">{{ c.name }}</td>
            <td class="px-6 py-3 text-ink-muted">{{ c.slug }}</td>
            <td class="px-6 py-3 text-ink-muted capitalize">{{ c.tier }}</td>
            <td class="px-6 py-3 text-ink-muted">${{ c.monthly_rate.toFixed(2) }}/mo</td>
            <td class="px-6 py-3">
              <button
                class="text-xs font-medium rounded-full px-2.5 py-1"
                :class="c.active
                  ? 'bg-success/15 text-success'
                  : 'bg-surface-elevated text-ink-muted'"
                @click="toggleActive(c)"
              >
                {{ c.active ? 'Active' : 'Inactive' }}
              </button>
            </td>
            <td class="px-6 py-3 text-right">
              <RouterLink
                :to="{ name: 'admin.client-detail', params: { id: c.id } }"
                class="text-sm link"
              >
                Configure →
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
