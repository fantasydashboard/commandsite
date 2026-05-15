// Hand-rolled types matching supabase/migrations/*.sql.
// Swap for generated types via `supabase gen types typescript` once you're ready.
//
// NOTE: these are type aliases (not interfaces) on purpose — supabase-js's
// GenericTable requires `Record<string, unknown>`, which interfaces do not
// satisfy because interfaces are open to declaration merging.

export type Role = 'admin' | 'client'

// ---------------------------------------------------------------------------
// Core (0001_init.sql)
// ---------------------------------------------------------------------------

export type Client = {
  id: string
  name: string
  slug: string
  active: boolean
  tier: string
  monthly_rate: number
  created_at: string
}

export type UserProfile = {
  id: string
  email: string
  full_name: string | null
  role: Role
  client_id: string | null
  created_at: string
}

export type ClientModule = {
  id: string
  client_id: string
  module_key: string
  enabled: boolean
  config: Record<string, unknown>
  created_at: string
}

type ClientInsert = {
  id?: string
  name: string
  slug: string
  active?: boolean
  tier?: string
  monthly_rate?: number
  created_at?: string
}

type UserProfileInsert = {
  id: string
  email: string
  full_name?: string | null
  role: Role
  client_id?: string | null
  created_at?: string
}

type ClientModuleInsert = {
  id?: string
  client_id: string
  module_key: string
  enabled?: boolean
  config?: Record<string, unknown>
  created_at?: string
}

// ---------------------------------------------------------------------------
// CRM (0002_crm.sql)
// ---------------------------------------------------------------------------

export type Pipeline = {
  id: string
  client_id: string
  name: string
  is_default: boolean
  created_at: string
}

export type Stage = {
  id: string
  pipeline_id: string
  name: string
  position: number
  color: string | null
  is_won: boolean
  is_lost: boolean
  created_at: string
}

export type Contact = {
  id: string
  client_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  company: string | null
  title: string | null
  source: string | null
  owner_name: string | null
  pipeline_id: string | null
  stage_id: string | null
  tags: string[]
  custom_fields: Record<string, unknown>
  last_contacted_at: string | null
  created_at: string
  updated_at: string
}

export type ContactEventType =
  | 'contact_created'
  | 'stage_changed'
  | 'field_updated'
  | 'tag_added'
  | 'tag_removed'
  | 'note_added'
  | 'email_sent'
  | 'email_delivered'
  | 'email_opened'
  | 'email_clicked'
  | 'email_replied'
  | 'sms_sent'
  | 'sms_delivered'
  | 'sms_replied'
  | 'sms_opt_out'
  | 'form_submitted'
  | 'automation_started'
  | 'automation_stopped'
  | 'deal_won'
  | 'deal_lost'
  | 'call_logged'
  | 'meeting_scheduled'

export type ContactEventActor =
  | 'admin'
  | 'client_user'
  | 'system'
  | 'automation'
  | 'contact'

export type ContactEvent = {
  id: string
  client_id: string
  contact_id: string
  event_type: ContactEventType | string
  actor_type: ContactEventActor | string
  actor_id: string | null
  payload: Record<string, unknown>
  occurred_at: string
}

export type ContactNote = {
  id: string
  client_id: string
  contact_id: string
  author_id: string | null
  body: string
  created_at: string
  updated_at: string
}

type PipelineInsert = {
  id?: string
  client_id: string
  name: string
  is_default?: boolean
  created_at?: string
}

type StageInsert = {
  id?: string
  pipeline_id: string
  name: string
  position: number
  color?: string | null
  is_won?: boolean
  is_lost?: boolean
  created_at?: string
}

type ContactInsert = {
  id?: string
  client_id: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  company?: string | null
  title?: string | null
  source?: string | null
  owner_name?: string | null
  pipeline_id?: string | null
  stage_id?: string | null
  tags?: string[]
  custom_fields?: Record<string, unknown>
  last_contacted_at?: string | null
  created_at?: string
  updated_at?: string
}

type ContactEventInsert = {
  id?: string
  client_id: string
  contact_id: string
  event_type: string
  actor_type?: string
  actor_id?: string | null
  payload?: Record<string, unknown>
  occurred_at?: string
}

type ContactNoteInsert = {
  id?: string
  client_id: string
  contact_id: string
  author_id?: string | null
  body: string
  created_at?: string
  updated_at?: string
}

// ── CommandSite-as-a-business · sales pipeline (cs_deals) ──────────────
// Table mirrors the shape of src/lib/clients/commandsite/pipeline.ts.
// Used by Josh's own dashboard for tracking outreach to acquire customers.

export type CsDealStage =
  | 'cold' | 'researched' | 'contacted' | 'replied'
  | 'demo_booked' | 'demo_done' | 'proposal'
  | 'closed_won' | 'closed_lost'

export type CsDealSource =
  | 'manual' | 'cold_email' | 'cold_call' | 'linkedin_dm'
  | 'inbound_demo' | 'referral' | 'event' | 'reddit'
  | 'apollo' | 'social_engager' | 'other'

export type CsDealTouchKind = 'email' | 'call' | 'meeting' | 'linkedin' | 'note'

export type CsDeal = {
  id: string
  company_name: string
  contact_name: string
  contact_email: string | null
  contact_title: string | null
  industry: string | null
  city: string | null
  state: string | null
  team_size: number | null
  stage: CsDealStage
  source: CsDealSource
  estimated_arr_cents: number
  next_action: string | null
  next_action_due_at: string | null
  notes: string | null
  last_touch_at: string
  last_touch_kind: CsDealTouchKind | null
  stage_entered_at: string
  created_at: string
  updated_at: string
  created_by: string | null
}

export type CsDealInsert = {
  id?: string
  company_name: string
  contact_name: string
  contact_email?: string | null
  contact_title?: string | null
  industry?: string | null
  city?: string | null
  state?: string | null
  team_size?: number | null
  stage?: CsDealStage
  source?: CsDealSource
  estimated_arr_cents?: number
  next_action?: string | null
  next_action_due_at?: string | null
  notes?: string | null
  last_touch_at?: string
  last_touch_kind?: CsDealTouchKind | null
  stage_entered_at?: string
  created_at?: string
  updated_at?: string
  created_by?: string | null
}

// ── CommandSite-as-a-business · solo-founder settings (cs_settings) ────
// Singleton row. id is always 1. Drives lead scoring, AI brand voice,
// and automation thresholds across the dashboard.
export type CsSettings = {
  id: number
  founder_name: string | null
  founder_email: string | null
  email_signature: string | null
  calendly_link: string | null
  product_demo_link: string | null
  pricing_page_link: string | null
  icp_description: string | null
  icp_industries: string[]
  icp_team_size_min: number | null
  icp_team_size_max: number | null
  icp_team_size_unit: string | null
  icp_geos: string[]
  icp_disqualifiers: string[]
  ai_voice_prompt_guide: string | null
  ai_voice_signature_phrases: string[]
  ai_voice_do_say: string[]
  ai_voice_dont_say: string[]
  reply_classifier_auto_threshold: number
  pipeline_promote_threshold: number
  social_engager_icp_threshold: number
  outreach_auto_approve: boolean
  outreach_auto_draft_min_score: number
  // Gmail OAuth — populated after the Connect Gmail flow (mig 0041).
  // When all three are set, the gmail-send function can mint access
  // tokens and POST to Gmail's API on the account's behalf.
  gmail_refresh_token: string | null
  gmail_account_email: string | null
  gmail_connected_at: string | null
  created_at: string
  updated_at: string
}

type CsSettingsUpdate = Partial<Omit<CsSettings, 'id' | 'created_at' | 'updated_at'>>

// ── CommandSite-as-a-business · lead enrichment (cs_leads) ─────────────

export type CsLeadSource =
  | 'manual_csv'
  | 'apollo_csv'
  | 'linkedin_export'
  | 'social_engager'
  | 'reddit_scrape'
  | 'manual_entry'
  | 'referral'
  | 'other'
  | 'google_maps'

export type CsLeadStatus =
  | 'new'
  | 'queued'
  | 'contacted'
  | 'replied'
  | 'promoted_to_pipeline'
  | 'archived'
  | 'disqualified'

export type CsLead = {
  id: string
  source: CsLeadSource
  imported_batch_id: string | null
  imported_batch_label: string | null
  company_name: string
  contact_name: string | null
  contact_email: string | null
  contact_title: string | null
  contact_phone: string | null
  linkedin_url: string | null
  company_url: string | null
  industry: string | null
  city: string | null
  state: string | null
  country: string | null
  team_size: number | null
  annual_revenue_estimate: number | null
  icp_score: number | null
  icp_score_reason: string | null
  status: CsLeadStatus
  notes: string | null
  tags: string[]
  promoted_deal_id: string | null
  google_maps_place_id: string | null
  google_maps_enriched_at: string | null
  // Source material captured for the cold-email drafter (mig 0027)
  review_excerpts: ReviewExcerpt[] | null
  website_extract: string | null
  // Drafted cold email — populated by draft-cold-email Edge Function
  draft_cold_email_subject: string | null
  draft_cold_email_body: string | null
  draft_cold_email_rationale: string | null
  draft_cold_email_signal: string | null
  draft_cold_email_at: string | null
  draft_cold_email_model: string | null
  // Outreach send aggregates (mig 0035)
  contacted_at: string | null
  last_contacted_at: string | null
  send_count: number
  // Approval-queue lifecycle (mig 0039) — null until first drafted
  draft_state: 'drafting' | 'ready_for_review' | 'approved' | 'sent' | 'rejected' | null
  // Bounce tracking (mig 0042) — null until inbox poll catches a mailer-daemon hit
  bounced_at: string | null
  bounce_reason: string | null
  created_at: string
  updated_at: string
}

export type CsOutreachSend = {
  id: string
  lead_id: string
  subject: string | null
  body: string | null
  channel: 'email' | 'linkedin' | 'sms' | 'phone'
  source: 'manual_gmail' | 'manual_other' | 'smartlead' | 'smartlead_reply' | 'apollo' | 'instantly' | 'auto_approve' | 'other'
  sent_via_email_address: string | null
  external_message_id: string | null
  sequence_step_number: number | null
  sequence_id: string | null
  sent_at: string
  sent_by: string | null
  created_at: string
}

export type CsOutreachSendInsert = Partial<Omit<CsOutreachSend, 'id' | 'created_at'>> & {
  lead_id: string
}

export type ReviewExcerpt = {
  text: string
  rating: number | null
  relative_time: string | null
}

export type CsLeadInsert = Partial<Omit<CsLead, 'id' | 'created_at' | 'updated_at'>> & {
  company_name: string
  source: CsLeadSource
}

// ── CommandSite-as-a-business · inbound replies (cs_replies) ───────────

export type CsReplyClassification =
  | 'positive'
  | 'objection'
  | 'interested'
  | 'oof'
  | 'unsubscribe'
  | 'negative'
  | 'unclassified'

export type CsReply = {
  id: string
  lead_id: string | null
  deal_id: string | null
  smartlead_campaign_id: string | null
  smartlead_sequence_id: string | null
  smartlead_message_id: string | null
  smartlead_thread_id: string | null
  from_email: string
  from_name: string | null
  subject: string | null
  body: string
  received_at: string
  classification: CsReplyClassification | null
  classification_confidence: number | null
  classification_reason: string | null
  classification_model: string | null
  classified_at: string | null
  auto_handled: boolean
  auto_handled_action: string | null
  auto_handled_at: string | null
  needs_review: boolean
  reviewed_by: string | null
  reviewed_at: string | null
  raw_payload: unknown
  drafted_response: string | null
  drafted_at: string | null
  draft_approved: boolean
  draft_approved_at: string | null
  draft_sent_at: string | null
  // Gmail-source tracking (mig 0042) — set when the reply came in via
  // gmail-inbox-poll. Used for threading the outbound response back
  // into the same conversation.
  gmail_message_id: string | null
  gmail_thread_id: string | null
  created_at: string
  updated_at: string
}

export type CsReplyUpdate = Partial<Omit<CsReply, 'id' | 'created_at' | 'updated_at' | 'raw_payload'>>

// ── UFD replies — parallel to CsReply but for the support@ufd inbox.
// Classification shape is UFD-specific (feedback/question/support/cancel/praise
// vs. cold-email's positive/objection/etc).
export type UfdReplyClassification =
  | 'feedback'
  | 'question'
  | 'support'
  | 'cancel'
  | 'praise'
  | 'oof'
  | 'unsubscribe'
  | 'unclassified'

export type UfdReply = {
  id: string
  user_email: string
  user_name: string | null
  reply_to_step: string | null
  reply_to_message_id: string | null
  from_email: string
  from_name: string | null
  subject: string | null
  body: string
  received_at: string
  gmail_message_id: string | null
  gmail_thread_id: string | null
  classification: UfdReplyClassification | null
  classification_confidence: number | null
  classification_reason: string | null
  classification_model: string | null
  classified_at: string | null
  drafted_response: string | null
  drafted_at: string | null
  draft_approved: boolean
  draft_approved_at: string | null
  draft_sent_at: string | null
  auto_handled: boolean
  auto_handled_action: string | null
  auto_handled_at: string | null
  needs_review: boolean
  reviewed_by: string | null
  reviewed_at: string | null
  raw_payload: unknown
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: Client
        Insert: ClientInsert
        Update: Partial<ClientInsert>
        Relationships: []
      }
      users: {
        Row: UserProfile
        Insert: UserProfileInsert
        Update: Partial<UserProfileInsert>
        Relationships: []
      }
      client_modules: {
        Row: ClientModule
        Insert: ClientModuleInsert
        Update: Partial<ClientModuleInsert>
        Relationships: []
      }
      pipelines: {
        Row: Pipeline
        Insert: PipelineInsert
        Update: Partial<PipelineInsert>
        Relationships: []
      }
      stages: {
        Row: Stage
        Insert: StageInsert
        Update: Partial<StageInsert>
        Relationships: []
      }
      contacts: {
        Row: Contact
        Insert: ContactInsert
        Update: Partial<ContactInsert>
        Relationships: []
      }
      contact_events: {
        Row: ContactEvent
        Insert: ContactEventInsert
        Update: Partial<ContactEventInsert>
        Relationships: []
      }
      contact_notes: {
        Row: ContactNote
        Insert: ContactNoteInsert
        Update: Partial<ContactNoteInsert>
        Relationships: []
      }
      cs_deals: {
        Row: CsDeal
        Insert: CsDealInsert
        Update: Partial<CsDealInsert>
        Relationships: []
      }
      cs_settings: {
        Row: CsSettings
        Insert: Partial<CsSettings>
        Update: CsSettingsUpdate
        Relationships: []
      }
      cs_leads: {
        Row: CsLead
        Insert: CsLeadInsert
        Update: Partial<CsLeadInsert>
        Relationships: []
      }
      cs_replies: {
        Row: CsReply
        Insert: Partial<CsReply>
        Update: CsReplyUpdate
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
