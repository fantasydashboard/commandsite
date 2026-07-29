<script setup lang="ts">
/**
 * CommandSite - Terms of Service (public, /terms).
 *
 * Hosted on commandsite.io so it can be the terms-of-service URL on the Google
 * OAuth consent screen.
 *
 * NOTE FOR JOSH: confirm the legal entity name (currently "CommandSite"), the
 * governing-law state, and have counsel glance at this before relying on it.
 */
import { RouterLink } from 'vue-router'
import BrandLogo from '@/components/BrandLogo.vue'

const LAST_UPDATED = 'July 29, 2026'
</script>

<template>
  <div class="min-h-screen bg-surface text-ink">
    <header class="border-b border-divider">
      <div class="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <RouterLink to="/" aria-label="CommandSite home"><BrandLogo :height="32" /></RouterLink>
        <RouterLink to="/privacy" class="text-sm text-ink-muted hover:text-brand">Privacy</RouterLink>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-6 py-12">
      <p class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Legal</p>
      <h1 class="mt-2 text-3xl font-bold text-ink">Terms of Service</h1>
      <p class="mt-2 text-sm text-ink-muted">Last updated {{ LAST_UPDATED }}</p>

      <div class="mt-8 space-y-8">
        <section class="space-y-3">
          <p class="text-[15px] leading-relaxed text-ink-muted">
            These Terms govern your use of the CommandSite platform at commandsite.io. By using the service,
            you agree to these Terms.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-ink">The service</h2>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            CommandSite provides dashboard and AI-assistant software for organizations. Features depend on
            your subscription and the integrations you connect.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-ink">Accounts</h2>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            You are responsible for your account credentials and for activity under your account. You must
            provide accurate information and be authorized to connect any third-party accounts you link.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-ink">Acceptable use</h2>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            You agree not to misuse the service, including sending unlawful, deceptive, or unsolicited bulk
            messages, infringing others' rights, or attempting to disrupt or gain unauthorized access to the
            platform. You are responsible for the content of messages you approve and send through the
            service and for complying with applicable laws (including anti-spam and communications laws).
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-ink">Third-party services</h2>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            When you connect a third-party service, your use of that service remains subject to its own
            terms. You can disconnect at any time.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-ink">Intellectual property</h2>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            CommandSite and its software are owned by us. You retain ownership of your organization's data.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-ink">Disclaimers</h2>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            The service is provided "as is" without warranties of any kind, to the extent permitted by law.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-ink">Limitation of liability</h2>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            To the extent permitted by law, CommandSite is not liable for indirect, incidental, or
            consequential damages arising from your use of the service.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-ink">Changes</h2>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            We may update these Terms. Continued use after an update means you accept the revised Terms.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-ink">Contact</h2>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            <a href="mailto:josh@commandsite.io" class="text-brand hover:underline">josh@commandsite.io</a>.
          </p>
        </section>
      </div>
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
