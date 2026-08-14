export interface Organisation {
  id: string
  name: string
  slug: string
  industry: 'real_estate' | 'hospitality' | 'other'
  /** Agent's behavioural-template niche, joined in by the org list endpoint.
      Absent on single-org fetches. */
  agent_niche?: string | null
  subdomain: string | null
  plan: 'trial' | 'starter' | 'pro' | 'enterprise'
  paystack_customer_id: string | null
  stripe_customer_id: string | null
  branding_config: {
    logo_url: string | null
    logo_dark_url?: string | null
    primary_color: string
    primary_hover_color?: string
    secondary_color: string
    accent_color?: string
    background_color?: string
    font: string
    // Deprecated top-level theme fields — kept for read-fallback only; new
    // saves go under `widget` (see below) so the chat widget's appearance is
    // isolated from the org's dashboard branding.
    theme_mode?: 'auto' | 'light' | 'dark'
    font_family?: string
    corner_radius?: 'sharp' | 'rounded' | 'pill'
    widget?: {
      theme_mode?: 'auto' | 'light' | 'dark'
      primary_color?: string
      font_family?: string
      corner_radius?: 'sharp' | 'rounded' | 'pill'
    }
  }
  implementation_paid: boolean
  support_expires_at: string | null
  created_at: string
  updated_at: string
}

export interface OrganisationWithDetails extends Organisation {
  branchCount: number
  userCount: number
  branches: Branch[]
}

export interface OrganisationStats {
  total_conversations: number
  resolved_conversations: number
  active_branches: number
  conversations_today: number
}

export interface Branch {
  id: string
  organisation_id: string
  name: string
  location: string | null
  timezone: string
  business_hours: {
    open_time: string
    close_time: string
    days_active: string[]
    after_hours_template: string
  }
  created_at: string
  updated_at: string
}

export interface TenantUser {
  id: string
  organisation_id: string
  branch_id: string | null
  user_id: string
  role: 'super_admin' | 'org_admin' | 'branch_admin' | 'branch_staff' | 'viewer'
  first_login: boolean
  created_at: string
}

export interface PhoneNumber {
  id: string
  branch_id: string
  number: string
  provider: 'twilio' | 'africas_talking' | 'operator_managed'
  label: string | null
  channel: 'voice' | 'whatsapp'
  is_primary: boolean
  is_vanity: boolean
  vanity_operator: string | null
  africas_talking_virtual_number: string | null
  divert_code: string | null
  created_at: string
}

export interface EscalationContact {
  name: string
  phone: string
  email: string
}

export interface Agent {
  id: string
  branch_id: string
  name: string
  voice_id: string | null
  tone: 'professional' | 'friendly' | 'formal'
  language: string
  niche: 'real_estate' | 'hospitality' | 'other'
  system_prompt: string | null
  channels: string[]
  retell_agent_id: string | null
  escalation_contacts: EscalationContact[]
  rag_boundary_enforced: boolean
  response_time_config: {
    confirmation_hours: number
    callback_window_hours: number
    after_hours_message: string
    confirmation_enabled?: boolean
    business_hours?: {
      enabled: boolean
      mode: "simple" | "custom"
      days: Record<string, { open: string; close: string; closed: boolean }>
    }
  }
  created_at: string
  updated_at: string
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface ConversationNote {
  text: string
  added_by: string
  added_at: string
}

export interface Conversation {
  id: string
  branch_id: string
  agent_id: string | null
  channel: 'chat' | 'voice' | 'whatsapp' | 'sms'
  source_number_id: string | null
  lead_name: string | null
  lead_phone: string | null
  lead_email: string | null
  messages: Message[]
  call_id: string | null
  recording_url: string | null
  resolved: boolean
  requires_human: boolean
  callback_requested: boolean
  preferred_callback_time: string | null
  callback_completed: boolean
  sentiment: string | null
  niche_fields: Record<string, unknown>
  actioned_by: string | null
  actioned_at: string | null
  notes: ConversationNote[]
  intent?: string | null
  booking_details?: { date?: string; subject?: string } | null
  created_at: string
  updated_at: string
}

export interface ConversationFilters {
  channel?: 'chat' | 'voice' | 'whatsapp' | 'sms'
  resolved?: boolean
  branch_id?: string
  limit?: number
  offset?: number
}

export interface CreateOrganisationPayload {
  name: string
  slug: string
  industry?: 'real_estate' | 'hospitality' | 'other'
  plan?: 'trial' | 'starter' | 'pro' | 'enterprise'
}

export interface UpdateOrganisationPayload {
  name?: string
  industry?: 'real_estate' | 'hospitality' | 'other'
  plan?: 'trial' | 'starter' | 'pro' | 'enterprise'
  subdomain?: string
  branding_config?: Partial<Organisation['branding_config']>
}

export interface CreateBranchPayload {
  name: string
  location?: string
  timezone?: string
}

export interface InterestRequest {
  id: string
  company_name: string
  industry: string | null
  locations_count: number | null
  channels_needed: string[]
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  message: string | null
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'rejected'
  created_at: string
}

export interface LeadCaptureField {
  field: string
  label: string
  type: 'text' | 'select' | 'boolean' | 'date' | 'number'
  options?: string[]
}

export interface NicheTemplate {
  id: string
  niche: string
  name: string
  system_prompt_template: string
  lead_capture_fields: LeadCaptureField[]
  default_dashboard_labels: Record<string, string>
  conversation_flows: unknown[]
}

export interface ApiSuccess<T> {
  success: true
  data: T
  message: string
  timestamp: string
}

export interface ApiError {
  success: false
  error: { message: string; code: string; details?: unknown }
  timestamp: string
}
