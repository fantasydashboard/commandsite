<script setup lang="ts">
/**
 * CommandSite - Privacy Policy (public, /privacy).
 *
 * Hosted on commandsite.io so it can be the privacy-policy URL on the Google
 * OAuth consent screen. Includes the specific disclosures Google requires for a
 * restricted scope (gmail.send): what Google user data is accessed, send-only
 * (no inbox reading), token encryption at rest, revocation, and the verbatim
 * Limited Use disclosure.
 *
 * NOTE FOR JOSH: confirm the legal entity name (currently "CommandSite") and
 * have counsel glance at this before relying on it for a real business.
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
        <RouterLink to="/terms" class="text-sm text-ink-muted hover:text-brand">Terms</RouterLink>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-6 py-12">
      <p class="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">Legal</p>
      <h1 class="mt-2 text-3xl font-bold text-ink">Privacy Policy</h1>
      <p class="mt-2 text-sm text-ink-muted">Last updated {{ LAST_UPDATED }}</p>

      <div class="mt-8 space-y-8">
        <section class="space-y-3">
          <p class="text-[15px] leading-relaxed text-ink-muted">
            CommandSite ("CommandSite," "we," "us") operates the CommandSite platform at commandsite.io,
            including the Grace and Ada AI assistants used by our customers (churches and local service
            businesses). This Privacy Policy explains what information we collect, how we use it, and the
            choices you have. It includes specific disclosures about our use of Google user data.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-ink">Who this covers</h2>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            This policy covers our customers (organizations that subscribe to CommandSite) and the
            authorized users who connect accounts and use the dashboard on their organization's behalf.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-ink">Information we collect</h2>
          <ul class="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink-muted">
            <li><span class="font-medium text-ink">Account information:</span> name, email, organization, role, and login credentials managed through our authentication provider.</li>
            <li><span class="font-medium text-ink">Connected-service data:</span> when you connect a third-party account (for example, Planning Center or Google), we access data from that service, as described below, to provide the features you enable.</li>
            <li><span class="font-medium text-ink">Usage data:</span> standard logs needed to operate and secure the service.</li>
          </ul>
        </section>

        <section class="space-y-3 rounded-card border border-brand/25 bg-brand/[0.04] p-5">
          <h2 class="text-lg font-semibold text-ink">Google user data (Gmail)</h2>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            When an authorized user connects a Google account, CommandSite requests these Google OAuth scopes:
          </p>
          <ul class="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink-muted">
            <li><code class="rounded bg-surface-elevated px-1 text-[13px]">gmail.send</code> to send emails on your behalf.</li>
            <li><code class="rounded bg-surface-elevated px-1 text-[13px]">openid</code> and <code class="rounded bg-surface-elevated px-1 text-[13px]">userinfo.email</code> to identify which email address you connected.</li>
          </ul>
          <p class="text-[15px] font-medium text-ink">How we use this access</p>
          <ul class="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink-muted">
            <li>We use <code class="rounded bg-surface-elevated px-1 text-[13px]">gmail.send</code> only to send emails that a member of your organization has reviewed and approved (for example, a guest welcome or a follow-up note). We send from the address you connected, so replies go to your own inbox.</li>
            <li>We use the account email only to display and route which connected address a message is sent from.</li>
          </ul>
          <p class="text-[15px] font-medium text-ink">What we do not do</p>
          <ul class="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink-muted">
            <li>We do not read, download, index, or store the contents of your Gmail mailbox. The <code class="rounded bg-surface-elevated px-1 text-[13px]">gmail.send</code> scope is send-only and does not grant, and we do not request, read access to your email.</li>
            <li>We do not use Google user data for advertising, and we do not sell it.</li>
            <li>We do not allow humans to read your Google data, except as necessary for security purposes (such as investigating abuse), to comply with applicable law, or where you have given us explicit consent.</li>
          </ul>
          <p class="text-[15px] font-medium text-ink">Storage and security</p>
          <ul class="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink-muted">
            <li>Your Google OAuth tokens are encrypted at rest using AES-256-GCM and are accessible only to our secured server processes. They are never exposed to the browser or to other customers.</li>
            <li>You can revoke CommandSite's access at any time from your dashboard (Settings, then Integrations, then Disconnect) or from your Google Account security settings at myaccount.google.com/permissions. Revoking access stops all sending and deletes the stored connection.</li>
          </ul>
          <p class="text-[15px] font-medium text-ink">Limited Use disclosure</p>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            CommandSite's use and transfer of information received from Google APIs to any other app will
            adhere to the Google API Services User Data Policy, including the Limited Use requirements.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-ink">Other connected services</h2>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            When you connect other services (such as Planning Center), we access only the data needed to
            provide the features you turn on, and we handle it under the same security and non-sale
            commitments described above.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-ink">How we use information</h2>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            To provide, secure, and improve the service, to send communications you or your organization
            have approved, and to comply with legal obligations.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-ink">Sharing</h2>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            We do not sell personal information. We share information only with service providers that help
            us operate the platform (such as our hosting and database providers), under contracts that
            protect it, or where required by law.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-ink">Data retention</h2>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            We keep information for as long as your organization uses the service, and delete or anonymize
            it on request or when it is no longer needed, subject to legal requirements.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-ink">Your choices</h2>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            You can disconnect any connected service, request access to or deletion of your information, and
            contact us with any privacy question.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-ink">Changes</h2>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            We may update this policy. We will post the updated version here with a new "Last updated" date.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-lg font-semibold text-ink">Contact</h2>
          <p class="text-[15px] leading-relaxed text-ink-muted">
            Questions about this policy or your data: <a href="mailto:josh@commandsite.io" class="text-brand hover:underline">josh@commandsite.io</a>.
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
