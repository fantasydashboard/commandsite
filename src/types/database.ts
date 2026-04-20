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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
