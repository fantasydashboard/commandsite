<script setup lang="ts">
/**
 * CommandSite Conversations module — outbound + inbound email log per lead.
 *
 * Thin tab wrapper around the reusable ConversationsView. ConversationsView
 * is intentionally tenant-aware so the same component renders for future
 * Ada/Grace clients with `tenant='ada-<clientid>'` etc; today it defaults
 * to 'commandsite' which reads cs_* tables.
 *
 * Props are the standard module shape: { client, config }. Unused here
 * (this module ignores the client prop because cs_* tables are
 * CommandSite-scoped — when we extend to other tenants, the module will
 * forward client.slug into the tenant prop).
 */
import ConversationsView from '@/components/conversations/ConversationsView.vue'
</script>

<template>
  <ConversationsView tenant="commandsite" persona-name="Ada" />
</template>
