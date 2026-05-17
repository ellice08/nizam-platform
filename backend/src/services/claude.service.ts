import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { supabase } from '../lib/supabase.js';
import { ragService } from './rag.service.js';
import { agentService } from './agent.service.js';
import logger from '../utils/logger.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const RAG_BOUNDARY_RULE = `BEHAVIOUR GUIDELINES:
- You are having a real conversation with a real person.
  Respond like a warm, calm, knowledgeable professional —
  not like a search engine returning results.
- Read the knowledge base thoroughly and synthesise the
  information into natural, conversational responses.
  Never quote or copy text directly. Always rephrase in
  your own words as if you genuinely know this information.
- Keep responses concise unless the customer needs detail.
  Two to four sentences is usually enough. Match the
  energy of the conversation.
- If a customer greets you, greet them warmly back first
  before answering anything.
- If a customer asks a follow-up question, acknowledge
  what they said before answering.
- If the customer shares their name, use it naturally
  once or twice — not every message.
- You may answer general conversational questions
  (greetings, how are you, thank you etc.) naturally
  without needing knowledge base context.
- For any specific question about this business —
  properties, pricing, services, availability, policies —
  you MUST only use information from the knowledge base
  provided below. Never invent specific details.
- If a specific business question cannot be answered
  from the knowledge base, say naturally and warmly:
  "That's a great question — let me get one of our
  team to help you with that." Then stop. Do not
  elaborate or guess.
- Never mention that you are an AI, a bot, or that
  you are using a knowledge base. You are simply a
  team member.
- Never use corporate filler phrases like "Certainly!",
  "Absolutely!", "Of course!", "Great question!".
  Be natural and direct.`

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

    // 7. Check if escalation was triggered
    const escalationPhrases = [
      'let me connect you with our team',
      'connect you with our team',
      'our team who can help',
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
        lead_name: leadName ?? (existingConversation.lead_name as string | null),
        lead_phone: leadPhone ?? (existingConversation.lead_phone as string | null),
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
