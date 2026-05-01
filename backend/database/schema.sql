-- HOW TO USE THIS FILE:
-- 1. Go to your Supabase project dashboard
-- 2. Click "SQL Editor" in the left sidebar
-- 3. Click "New query"
-- 4. Copy and paste this entire file
-- 5. Click "Run"
-- Do NOT run this more than once (use IF NOT EXISTS to be safe)

-- Enable pgvector extension for RAG knowledge base
CREATE EXTENSION IF NOT EXISTS vector;

-- Tenants (your clients — real estate agencies etc)
CREATE TABLE IF NOT EXISTS tenants (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  plan text DEFAULT 'trial' CHECK (plan IN ('trial','starter','pro','enterprise')),
  retell_agent_id text,
  twilio_phone text,
  stripe_customer_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Link users to tenants
CREATE TABLE IF NOT EXISTS tenant_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text DEFAULT 'admin' CHECK (role IN ('admin','viewer')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- AI agents (one or more per tenant)
CREATE TABLE IF NOT EXISTS agents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name text DEFAULT 'Aria',
  system_prompt text,
  voice_id text,
  tone text DEFAULT 'professional' CHECK (tone IN ('professional','friendly','formal')),
  language text DEFAULT 'English',
  channels jsonb DEFAULT '["chat","whatsapp"]',
  capabilities jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Conversations across all channels
CREATE TABLE IF NOT EXISTS conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  channel text CHECK (channel IN ('chat','voice','whatsapp','sms')),
  lead_name text,
  lead_phone text,
  messages jsonb DEFAULT '[]',
  call_id text,
  resolved boolean DEFAULT false,
  requires_human boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Post-conversation AI analysis
CREATE TABLE IF NOT EXISTS conversation_analysis (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  sentiment text CHECK (sentiment IN ('positive','neutral','concern')),
  topic text,
  lead_captured boolean DEFAULT false,
  viewing_booked boolean DEFAULT false,
  lead_score integer CHECK (lead_score >= 1 AND lead_score <= 10),
  follow_up_needed boolean DEFAULT false,
  analyzed_at timestamptz DEFAULT now()
);

-- Knowledge base document chunks for RAG
CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}',
  embedding vector(1536),
  created_at timestamptz DEFAULT now()
);

-- Index for fast vector similarity search
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
  ON document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enable Row Level Security on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policy: users only see their own tenant's data
CREATE POLICY "tenant_isolation" ON conversations
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tenant_isolation" ON agents
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tenant_isolation" ON document_chunks
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tenant_isolation" ON conversation_analysis
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE
      tenant_id IN (
        SELECT tenant_id FROM tenant_users
        WHERE user_id = auth.uid()
      )
    )
  );

-- Vector similarity search function
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  p_tenant_id uuid,
  match_count int DEFAULT 5,
  match_threshold float DEFAULT 0.78
)
RETURNS TABLE(id uuid, content text, metadata jsonb, similarity float)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id, dc.content, dc.metadata,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE dc.tenant_id = p_tenant_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
