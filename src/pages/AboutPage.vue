<script setup lang="ts">
/**
 * CommandSite - canonical "home / about" page (public, /about).
 *
 * Built to be the "Application home page" URL on the Google OAuth consent
 * screen. Google's branding review requires the home page to (a) prominently
 * carry the app name that matches the consent screen ("CommandSite") and (b)
 * explain the app's purpose. The Ada-first marketing landing (/) leads with the
 * persona, so this page gives Google a clear, name-matched, purpose-stating home
 * without repositioning the landing.
 */
import { RouterLink } from 'vue-router'
import BrandLogo from '@/components/BrandLogo.vue'
</script>

<template>
  <div class="min-h-screen bg-surface text-ink">
    <header class="border-b border-divider">
      <div class="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <RouterLink to="/about" aria-label="CommandSite home"><BrandLogo :height="32" /></RouterLink>
        <div class="flex gap-4 text-sm text-ink-muted">
          <RouterLink to="/privacy" class="hover:text-brand">Privacy</RouterLink>
          <RouterLink to="/terms" class="hover:text-brand">Terms</RouterLink>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-6 py-14">
      <p class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">The platform</p>
      <h1 class="mt-2 text-4xl font-bold text-ink">CommandSite</h1>
      <p class="mt-4 text-lg leading-relaxed text-ink-muted">
        CommandSite is an AI assistant platform for small businesses and organizations. It connects to the
        tools a team already uses, like Google Workspace (Gmail) and Planning Center, and helps them get
        recurring work done: drafting follow-up messages, surfacing who needs attention, and keeping records
        clean. A person on the team reviews and approves every message before it is sent.
      </p>

      <section class="mt-10 space-y-4">
        <h2 class="text-lg font-semibold text-ink">What CommandSite does</h2>
        <ul class="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-ink-muted">
          <li><span class="font-medium text-ink">Connects your tools.</span> A team securely links the accounts they already use so CommandSite can work alongside them, not replace them.</li>
          <li><span class="font-medium text-ink">Drafts and sends approved messages.</span> CommandSite drafts follow-ups (for example, a welcome to a new guest) and, once a staff member approves, sends them from the organization's own connected email address.</li>
          <li><span class="font-medium text-ink">Surfaces what needs attention.</span> It highlights the people and tasks worth acting on, so nothing falls through the cracks.</li>
          <li><span class="font-medium text-ink">Keeps you in control.</span> Every outbound message is reviewed and approved by a person. Nothing is sent automatically without approval.</li>
        </ul>
      </section>

      <section class="mt-10 space-y-4 rounded-card border border-brand/25 bg-brand/[0.04] p-5">
        <h2 class="text-lg font-semibold text-ink">How CommandSite uses Google data</h2>
        <p class="text-[15px] leading-relaxed text-ink-muted">
          When you connect a Google account, CommandSite requests send-only access (the <code class="rounded bg-surface-elevated px-1 text-[13px]">gmail.send</code> scope)
          so it can send the emails you approve, from your own address, so replies land in your inbox. It does
          not read, store, or index the contents of your mailbox, and it never sells your data. You can revoke
          access at any time from your dashboard or your Google Account settings. See our
          <RouterLink to="/privacy" class="text-brand hover:underline">Privacy Policy</RouterLink> for the full details.
        </p>
      </section>

      <section class="mt-10 space-y-3">
        <h2 class="text-lg font-semibold text-ink">Contact</h2>
        <p class="text-[15px] leading-relaxed text-ink-muted">
          <a href="mailto:josh@commandsite.io" class="text-brand hover:underline">josh@commandsite.io</a>
        </p>
      </section>
    </main>

    <footer class="border-t border-divider">
      <div class="mx-auto flex max-w-3xl items-center justify-between px-6 py-6 text-xs text-ink-muted">
        <span>CommandSite</span>
        <div class="flex gap-4">
          <RouterLink to="/privacy" class="hover:text-brand">Privacy</RouterLink>
          <RouterLink to="/terms" class="hover:text-brand">Terms</RouterLink>
        </div>
      </div>
    </footer>
  </div>
</template>
