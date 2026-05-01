export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: 'trial' | 'starter' | 'pro' | 'enterprise';
  retell_agent_id?: string;
  twilio_phone?: string;
  stripe_customer_id?: string;
  created_at: string;
}

export interface Agent {
  id: string;
  tenant_id: string;
  name: string;
  system_prompt: string;
  voice_id?: string;
  tone: 'professional' | 'friendly' | 'formal';
  language: string;
  channels: string[];
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface Conversation {
  id: string;
  tenant_id: string;
  channel: 'chat' | 'voice' | 'whatsapp' | 'sms';
  lead_name?: string;
  lead_phone?: string;
  messages: Message[];
  call_id?: string;
  resolved: boolean;
  requires_human: boolean;
  created_at: string;
}

export interface ConversationAnalysis {
  conversation_id: string;
  sentiment: 'positive' | 'neutral' | 'concern';
  topic: string;
  lead_captured: boolean;
  viewing_booked: boolean;
  lead_score: number;
  follow_up_needed: boolean;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    details?: unknown;
  };
  timestamp: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
