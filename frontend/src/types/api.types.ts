export interface Tenant {
  id: string
  name: string
  slug: string
  plan: 'trial' | 'starter' | 'pro' | 'enterprise'
  retell_agent_id: string | null
  twilio_phone: string | null
  stripe_customer_id: string | null
  created_at: string
  updated_at: string
}

export interface TenantWithCounts extends Tenant {
  agentsCount: number
  conversationsCount: number
}

export interface TenantStats {
  total_conversations: number
  resolved_conversations: number
  active_agents: number
  conversations_today: number
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface Conversation {
  id: string
  tenant_id: string
  channel: 'chat' | 'voice' | 'whatsapp' | 'sms'
  lead_name: string | null
  lead_phone: string | null
  messages: Message[]
  call_id: string | null
  resolved: boolean
  requires_human: boolean
  created_at: string
  updated_at: string
}

export interface CreateTenantPayload {
  name: string
  slug: string
  plan?: 'trial' | 'starter' | 'pro' | 'enterprise'
}

export interface UpdateTenantPayload {
  name?: string
  plan?: 'trial' | 'starter' | 'pro' | 'enterprise'
  retell_agent_id?: string
  twilio_phone?: string
}

export interface ConversationFilters {
  channel?: 'chat' | 'voice' | 'whatsapp' | 'sms'
  resolved?: boolean
  limit?: number
  offset?: number
  tenant_id?: string
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
