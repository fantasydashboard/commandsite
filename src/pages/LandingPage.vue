<script setup lang="ts">
import { RouterLink } from 'vue-router'
import BrandLogo from '@/components/BrandLogo.vue'
</script>

<template>
  <div class="min-h-screen bg-surface">
    <header class="bg-surface-dark">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-8 py-4">
        <BrandLogo surface="dark" :height="36" />
        <RouterLink
          to="/login"
          class="text-sm text-ink-inverse/70 hover:text-ink-inverse transition-colors"
        >
          Sign in
        </RouterLink>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-8 py-24">
      <h1 class="text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
        Command centers,<br />built for each business.
      </h1>
      <p class="mt-6 max-w-2xl text-lg text-ink-muted">
        CommandSite is a bespoke dashboard service. We design and build a custom
        operations dashboard for your business — metrics, CRM, project status,
        social — all in one login. You focus on running the company; we keep the
        cockpit running.
      </p>

      <div class="mt-10 flex gap-4">
        <a href="mailto:josh@getinthelimelight.com" class="btn-primary">
          Request a dashboard
        </a>
        <RouterLink to="/login" class="btn-secondary">Client sign in</RouterLink>
      </div>

      <div class="mt-24 grid gap-6 sm:grid-cols-3">
        <div class="card">
          <div class="text-sm font-semibold text-brand">Custom</div>
          <p class="mt-2 text-sm text-ink-muted">
            Every dashboard is tailored to the metrics and workflows that matter
            to your business.
          </p>
        </div>
        <div class="card">
          <div class="text-sm font-semibold text-brand">Modular</div>
          <p class="mt-2 text-sm text-ink-muted">
            Metrics, CRM, projects, social — turn modules on as you grow.
          </p>
        </div>
        <div class="card">
          <div class="text-sm font-semibold text-brand">Managed</div>
          <p class="mt-2 text-sm text-ink-muted">
            We maintain it. No IT team required.
          </p>
        </div>
      </div>
    </main>
  </div>
</template>
