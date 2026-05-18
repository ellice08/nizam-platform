import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { supabase } from '../lib/supabase.js';
import { ragService } from './rag.service.js';
import { agentService } from './agent.service.js';
import logger from '../utils/logger.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const RAG_BOUNDARY_RULE = `CONVERSATION STYLE:
- You are a calm, warm professional having a real
  conversation. Not a search engine. Not a brochure.
- Keep every response SHORT. One to three sentences
  maximum unless the customer explicitly asks for more
  detail. If you find yourself writing a paragraph,
  stop and cut it in half.
- Be direct. Lead with the answer, not a preamble.
- Sound like a person, not a system. Vary your phrasing.
  Never start two consecutive messages the same way.
- If a customer greets you, greet them back warmly
  in one sentence before anything else.
- You may answer small talk naturally
  (greetings, thank you, etc.) without needing
  knowledge base content.
- For all specific business questions — services,
  pricing, availability, locations, policies —
  use ONLY the knowledge base below. Never invent
  details. Never guess.
- If something is not in the knowledge base, say
  warmly: "Let me get someone from our team to help
  you with that — could I take your name and best
  number to reach you?" Then wait for their response.
- If they provide contact details after escalation,
  confirm warmly: "Perfect, I'll make sure the team
  reaches out to you shortly."
- Never reveal you are an AI or using a knowledge base.
- Never use filler words: "Certainly", "Absolutely",
  "Of course", "Great question", "Sure thing".`

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatParams {
  branchId: string;
  message: string;
  sessionId: string;
  channel: 'chat' | 'voice' | 'whatsapp';
  leadName?: string;
  leadPhone?: string;
}

interface ChatResult {
  reply: string;
  sessionId: string;
  conversationId: string;
  requiresHuman: boolean;
}

class ClaudeService {

  private async callAnthropic(
    systemPrompt: string,
    messages: Message[],
    model: string
  ): Promise<string> {
    const response = await anthropic.messages.create({
      model: model ?? 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });

    return response.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('');
  }

  private async callOpenAI(
    systemPrompt: string,
    messages: Message[],
    model: string
  ): Promise<string> {
    const response = await openaiClient.chat.completions.create({
      model: model ?? 'gpt-4o',
      max_tokens: 600,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
    });

    return response.choices[0]?.message?.content ?? '';
  }

  async chat(params: ChatParams): Promise<ChatResult> {
    const { branchId, message, sessionId, channel, leadName, leadPhone } = params;

    // 1. Fetch agent config for this branch
    const agent = await agentService.getOrCreateAgent(branchId);
    const agentRecord = agent as Record<string, unknown>;

    const provider = (agentRecord.llm_provider as string) ?? 'anthropic';
    const model = (agentRecord.llm_model as string) ??
      (provider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514');

    // 2. Get RAG context from pgvector
    const context = await ragService.getContext({
      query: message,
      branchId,
      matchCount: 5,
      matchThreshold: 0.75,
    });

    // 3. Build system prompt
    const agentName = (agentRecord.name as string) ?? 'Aria';

    const rawPrompt = (agentRecord.system_prompt as string) ??
      `You are ${agentName}, a warm and helpful assistant.`;

    const basePrompt = rawPrompt
      .replace(/\{\{agent_name\}\}/g, agentName)
      .replace(/^You are Aria,/m, `You are ${agentName},`)
      .replace(/^You are Aria /m, `You are ${agentName} `);

    const systemPrompt = context
      ? `${basePrompt}\n\n${RAG_BOUNDARY_RULE}\n\nKNOWLEDGE BASE — read this thoroughly and use it to inform your responses. Synthesise and rephrase naturally, never quote directly:\n\n${context}\n\nRemember: respond as a warm professional having a real conversation, not as a search result.`
      : `${basePrompt}\n\n${RAG_BOUNDARY_RULE}\n\nNote: No knowledge base has been set up yet. For any specific business questions, let the customer know a team member will follow up with them.`;

    // 4. Get or create conversation
    const existingConversation = await this.getOrCreateConversation({
      sessionId,
      branchId,
      agentId: agentRecord.id as string,
      channel,
      leadName,
      leadPhone,
    });

    const conversationId = existingConversation.id as string;
    const messages = (existingConversation.messages as Message[]) ?? [];

    // 5. Add user message to history
    const updatedMessages: Message[] = [
      ...messages,
      { role: 'user', content: message },
    ];

    // 6. Call the correct LLM provider
    let reply: string;

    try {
      if (provider === 'openai') {
        reply = await this.callOpenAI(systemPrompt, updatedMessages, model);
        logger.info(`LLM: OpenAI ${model} — branch ${branchId}`);
      } else {
        reply = await this.callAnthropic(systemPrompt, updatedMessages, model);
        logger.info(`LLM: Anthropic ${model} — branch ${branchId}`);
      }
    } catch (err) {
      logger.error(
        `LLM call failed (${provider}): ${err instanceof Error ? err.message : String(err)}`
      );
      throw err;
    }

    // 6b. Check if user is providing contact details
    // after a previous escalation request
    const previousMessages = messages // messages before this turn
    const lastAssistantMessage = [...previousMessages]
      .reverse()
      .find(m => m.role === 'assistant')

    const assistantAskedForContact = lastAssistantMessage
      ? [
          'take your name',
          'best number',
          'reach you',
          'contact details',
          'get back to you',
        ].some(phrase =>
          lastAssistantMessage.content.toLowerCase().includes(phrase)
        )
      : false

    // Simple contact extraction from user message
    let extractedName: string | null = null
    let extractedPhone: string | null = null
    let extractedEmail: string | null = null

    if (assistantAskedForContact) {
      // Extract phone number pattern
      const phoneMatch = message.match(
        /(\+?[\d\s\-().]{7,15})/
      )
      if (phoneMatch) {
        extractedPhone = phoneMatch[1].trim()
      }

      // Extract email pattern
      const emailMatch = message.match(
        /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/
      )
      if (emailMatch) {
        extractedEmail = emailMatch[0]
      }

      // If no phone/email, treat the whole message as a name
      // if it's short (likely just a name)
      if (!extractedPhone && !extractedEmail && message.trim().split(' ').length <= 4) {
        extractedName = message.trim()
      }
    }

    // 7. Check if escalation was triggered
    const escalationPhrases = [
      'let me get someone from our team',
      'someone from our team to help',
      'let me connect you with our team',
      'connect you with our team',
      'our team who can help',
      'best number to reach you',
    ];
    const requiresHuman = escalationPhrases.some(phrase =>
      reply.toLowerCase().includes(phrase.toLowerCase())
    );

    // 8. Save updated conversation
    const finalMessages: Message[] = [
      ...updatedMessages,
      { role: 'assistant', content: reply },
    ];

    await supabase
      .from('conversations')
      .update({
        messages: finalMessages,
        requires_human: requiresHuman,
        lead_name: extractedName ?? leadName ??
          (existingConversation.lead_name as string | null),
        lead_phone: extractedPhone ?? leadPhone ??
          (existingConversation.lead_phone as string | null),
        lead_email: extractedEmail ??
          (existingConversation.lead_email as string | null),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    logger.info(
      `Chat complete: branch=${branchId} session=${sessionId} ` +
      `requiresHuman=${requiresHuman} provider=${provider}`
    );

    return { reply, sessionId, conversationId, requiresHuman };
  }

  private async getOrCreateConversation(params: {
    sessionId: string;
    branchId: string;
    agentId: string;
    channel: string;
    leadName?: string;
    leadPhone?: string;
  }): Promise<Record<string, unknown>> {
    const { sessionId, branchId, agentId, channel, leadName, leadPhone } = params;

    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .eq('branch_id', branchId)
      .eq('call_id', sessionId)
      .maybeSingle();

    if (existing) return existing as Record<string, unknown>;

    const { data: created, error } = await supabase
      .from('conversations')
      .insert({
        branch_id: branchId,
        agent_id: agentId,
        channel,
        call_id: sessionId,
        lead_name: leadName ?? null,
        lead_phone: leadPhone ?? null,
        messages: [],
        resolved: false,
        requires_human: false,
      })
      .select()
      .single();

    if (error || !created) {
      throw new Error(`Failed to create conversation: ${error?.message}`);
    }

    return created as Record<string, unknown>;
  }
}

export const claudeService = new ClaudeService();
