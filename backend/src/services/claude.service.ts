import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { supabase } from '../lib/supabase.js';
import { ragService } from './rag.service.js';
import { agentService } from './agent.service.js';
import { notificationService } from './notification.service.js';
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
- If something is not in the knowledge base AND you
  have not yet collected contact details in this
  conversation, say warmly: "That one I'll need to
  pass to our team — could I take your name and either
  a phone number or email address?" Then wait.
- If something is not in the knowledge base AND you
  have ALREADY collected contact details earlier in
  this conversation, do NOT ask again. Instead let
  them know warmly that you'll pass this to the team
  to cover when they reach out. IMPORTANT: phrase this
  naturally and differently each time — never repeat
  the same wording twice in a conversation. Vary your
  acknowledgement so it feels like a real person, not
  a script. Examples of the kind of variation (do not
  use these verbatim, generate your own each time):
  "I'll make sure the team covers that when they reach
  out", "I'll flag that for the team to go over with
  you", "Good question — I'll add it to what the team
  follows up on."
  Then continue the conversation normally.
- Once they provide contact details for the first time,
  confirm warmly that their enquiry has been captured and the
  team will follow up. Follow the CONFIRMATION TIMING instruction
  below for HOW SOON to say they'll follow up — do not invent your
  own timeframe and never say "shortly" unless that instruction
  tells you to. Then ask: "Is there anything else I can help you
  with in the meantime?"
- If they have more questions, continue helping them
  normally. The team will follow up on the escalated
  topic separately — you do not need to end the
  conversation.
- If they say they are done, close warmly:
  "Great, you're all set. Have a wonderful day!"
- Never reveal you are an AI or using a knowledge base.
- Never use filler words: "Certainly", "Absolutely",
  "Of course", "Great question", "Sure thing".

INTERNAL SIGNAL (very important): Whenever your reply hands off to the human
team in ANY way — you cannot answer from the knowledge base, you are asking for the
customer's contact details so the team can follow up, or you are confirming you'll
pass something to the team — append the exact token <<ESCALATE>> as the VERY LAST
thing in your reply, after a space. Do NOT mention this token, explain it, or use
it in any other situation. If the turn is a normal answer with no hand-off, do NOT
append it. The token will be removed before the customer sees your reply.`

interface Message {
  role: 'user' | 'assistant';
  content: string;
  escalated?: boolean;
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
  newEscalation: boolean;
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

  private async sendEscalationNotification(params: {
    branchId: string;
    agentRecord: Record<string, unknown>;
    conversation: Record<string, unknown>;
    customerQuestion: string;
    channel: string;
  }): Promise<void> {
    const { branchId, agentRecord, conversation, customerQuestion, channel } = params;
    try {
      // 1. Gather recipient emails
      const recipients = new Set<string>();

      // a. Configured escalation contacts on the agent
      const contacts = agentRecord.escalation_contacts;
      if (Array.isArray(contacts)) {
        for (const c of contacts) {
          if (c && typeof c === 'object' && typeof (c as Record<string, unknown>).email === 'string') {
            const email = (c as Record<string, string>).email;
            if (email.includes('@')) recipients.add(email.trim());
          }
        }
      }

      // b. Look up the branch -> organisation
      const { data: branch } = await supabase
        .from('branches')
        .select('id, name, organisation_id')
        .eq('id', branchId)
        .maybeSingle();

      const branchName = (branch as Record<string, unknown> | null)?.name as string ?? 'your branch';

      const organisationId = (branch as Record<string, unknown> | null)?.organisation_id as string | undefined;

      if (organisationId) {
        // c. Fetch org_admin + branch_admin tenant_users for this org/branch
        const { data: tenantUsers } = await supabase
          .from('tenant_users')
          .select('user_id, role, branch_id')
          .eq('organisation_id', organisationId)
          .in('role', ['org_admin', 'branch_admin']);

        const relevantUserIds = ((tenantUsers ?? []) as Array<Record<string, unknown>>)
          .filter(tu =>
            tu.role === 'org_admin' ||
            (tu.role === 'branch_admin' && tu.branch_id === branchId)
          )
          .map(tu => tu.user_id as string);

        // d. Resolve their emails from auth.users via admin API
        for (const userId of relevantUserIds) {
          try {
            const { data: userData } = await supabase.auth.admin.getUserById(userId);
            const email = userData?.user?.email;
            if (email) recipients.add(email);
          } catch {
            // skip unresolved users
          }
        }
      }

      const toEmails = Array.from(recipients);
      if (toEmails.length === 0) {
        logger.info(`Escalation: no recipients configured for branch ${branchId}`);
        return;
      }

      // 2. Build a short transcript from the conversation messages
      const msgs = Array.isArray(conversation.messages) ? conversation.messages as Message[] : [];
      const transcript = msgs
        .slice(-8)
        .map(m => `${m.role === 'user' ? 'Customer' : 'AI'}: ${m.content}`)
        .join('\n');

      // 3. Send the alert
      await notificationService.sendEscalationAlert({
        toEmails,
        customerName: (conversation.lead_name as string | null) ?? 'A customer',
        channel,
        transcript,
        question: customerQuestion,
        branchName,
      });

      logger.info(`Escalation alert sent for branch ${branchId} to ${toEmails.length} recipient(s)`);
    } catch (err) {
      // Never let notification failure break the chat flow
      logger.error(`Escalation notification failed for branch ${branchId}`, { err });
    }
  }

  async chat(params: ChatParams): Promise<ChatResult> {
    const { branchId, message, sessionId, channel, leadName, leadPhone } = params;

    // 1. Fetch agent config for this branch
    const agent = await agentService.getOrCreateAgent(branchId);
    const agentRecord = agent as Record<string, unknown>;

    const provider = (agentRecord.llm_provider as string) ?? 'anthropic';
    const model = (agentRecord.llm_model as string) ??
      (provider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514');

    // 1b. Fetch branch timezone for after-hours evaluation
    const { data: branchRow } = await supabase
      .from('branches')
      .select('timezone')
      .eq('id', branchId)
      .maybeSingle();
    const branchTimezone = (branchRow as { timezone?: string } | null)?.timezone ?? 'Africa/Lagos';

    // 2. Get RAG context from pgvector
    const context = await ragService.getContext({
      query: message,
      branchId,
      matchCount: 8,
      matchThreshold: 0.7,
    });

    // 3. Build base prompt (systemPrompt finalised after step 4)
    const agentName = (agentRecord.name as string) ?? 'Aria';

    const rawPrompt = (agentRecord.system_prompt as string) ??
      `You are ${agentName}, a warm and helpful assistant.`;

    const basePrompt = rawPrompt
      .replace(/\{\{agent_name\}\}/g, agentName)
      .replace(/^You are Aria,/m, `You are ${agentName},`)
      .replace(/^You are Aria /m, `You are ${agentName} `);

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

    // 4b. Build final system prompt now that we have conversation state
    const hasContact = !!(
      (existingConversation.lead_phone as string | null) ||
      (existingConversation.lead_email as string | null)
    )

    const contactContext = hasContact
      ? '\n\nIMPORTANT: You have already collected this customer\'s contact details earlier in this conversation. If you cannot answer something, do NOT ask for their details again — just acknowledge naturally that you\'ll pass it to the team — varying your wording each time, never repeating the same phrase. Keep it warm and brief.'
      : ''

    const responseTimeConfig = agentRecord.response_time_config as {
      business_hours?: unknown;
      after_hours_message?: string;
    } | null | undefined;

    const afterHours = this.isAfterHours(
      responseTimeConfig?.business_hours,
      branchTimezone
    );

    const afterHoursMessage =
      responseTimeConfig?.after_hours_message ||
      'Our team is currently offline.';

    const nextOpen = afterHours
      ? this.nextOpenDescription(responseTimeConfig?.business_hours, branchTimezone)
      : '';

    const afterHoursContext = afterHours
      ? `\n\nNOTE — OUTSIDE BUSINESS HOURS: The business is currently closed (the team will next be available ${nextOpen}). Do NOT change how you ASK for contact details — ask cleanly and normally. The closed-hours timing belongs ONLY in your CONFIRMATION after the customer has given their details (see the confirmation rule). Never stack the offline notice onto the contact request.`
      : '';

    const confirmationHours = (responseTimeConfig as { confirmation_hours?: number } | null | undefined)?.confirmation_hours ?? 2;
    const confirmationEnabled = (responseTimeConfig as { confirmation_enabled?: boolean } | null | undefined)?.confirmation_enabled ?? false;

    let confirmationContext = '';
    if (afterHours) {
      confirmationContext = `\n\nCONFIRMATION TIMING: When the customer provides their contact details, confirm warmly and tell them the team is currently offline but will follow up ${nextOpen}. Phrase it naturally and warmly, e.g. "Thank you — our team is offline right now, but they'll follow up ${nextOpen}." Do NOT promise a specific number of hours while closed.`;
    } else if (confirmationEnabled) {
      confirmationContext = `\n\nCONFIRMATION TIMING: When the customer provides their contact details, confirm warmly that someone will be in touch within ${confirmationHours} hour${confirmationHours === 1 ? '' : 's'}. Keep the phrase "be in touch" in your confirmation.`;
    } else {
      confirmationContext = `\n\nCONFIRMATION TIMING: When the customer provides their contact details, confirm warmly that someone will be in touch, without committing to a specific timeframe. Keep the phrase "be in touch" in your confirmation.`;
    }

    const systemPrompt = context
      ? `${basePrompt}\n\n${RAG_BOUNDARY_RULE}\n\nKNOWLEDGE BASE — read this thoroughly and use it to inform your responses. Synthesise and rephrase naturally, never quote directly:\n\n${context}\n\nRemember: respond as a warm professional having a real conversation, not as a search result.${contactContext}${afterHoursContext}${confirmationContext}`
      : `${basePrompt}\n\n${RAG_BOUNDARY_RULE}\n\nNote: No knowledge base has been set up yet. For any specific business questions, let the customer know a team member will follow up with them.${contactContext}${afterHoursContext}${confirmationContext}`;

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

    // Primary escalation signal: the model appends <<ESCALATE>> when handing off.
    // Detect it, then strip it (and any stray whitespace) before the reply is used
    // or stored anywhere.
    const modelEscalationSignal = /<<\s*ESCALATE\s*>>/i.test(reply);
    reply = reply.replace(/<<\s*ESCALATE\s*>>/gi, '').replace(/\s+$/, '').trim();

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
      const phoneMatch = message.match(/(\+?[\d\s\-().]{7,15})/)
      if (phoneMatch) {
        extractedPhone = phoneMatch[1].trim()
      }
      // Extract email pattern
      const emailMatch = message.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)
      if (emailMatch) {
        extractedEmail = emailMatch[0]
      }

      // Extract the NAME by removing any email/phone we found, plus common
      // filler words, then taking what remains if it looks like a name.
      let nameCandidate = message
      if (extractedEmail) nameCandidate = nameCandidate.replace(extractedEmail, ' ')
      if (extractedPhone) nameCandidate = nameCandidate.replace(extractedPhone, ' ')

      // Strip common filler/lead-in words and separators
      nameCandidate = nameCandidate
        .replace(/\b(my name is|my name's|name is|i am|i'm|it's|its|this is|the|email|e-mail|mail|phone|number|is|and|you can reach me at|reach me at|call me|contact me)\b/gi, ' ')
        .replace(/[,;:|/\\]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      // Accept as a name only if what remains is 1-4 words of plausible name
      // characters (letters, spaces, hyphens, apostrophes, dots for initials).
      if (
        nameCandidate.length >= 2 &&
        nameCandidate.length <= 60 &&
        /^[A-Za-z][A-Za-z .'\-]*$/.test(nameCandidate) &&
        nameCandidate.split(' ').filter(Boolean).length <= 4
      ) {
        extractedName = nameCandidate
          .split(' ')
          .filter(Boolean)
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
      }
    }

    // 7. Check if escalation was triggered
    const escalationPhrases = [
      'let me get someone from our team',
      'someone from our team to help',
      'let me connect you with our team',
      'connect you with our team',
      'our team who can help',
      'pass to our team',
      'pass this to our team',
      'need to pass',
      'someone will be in touch',
      'team will be in touch',
      'team reaches out',
    ];

    // Once requiresHuman is true it stays true for this
    // conversation — never reset it even if subsequent
    // replies don't contain escalation phrases
    const alreadyEscalated =
      (existingConversation.requires_human as boolean) === true

    const phraseEscalation = escalationPhrases.some(phrase =>
      reply.toLowerCase().includes(phrase.toLowerCase())
    )
    const newEscalation = modelEscalationSignal || phraseEscalation

    // After-hours conversations always require human follow-up — the team must
    // call back when the business reopens, even if no escalation phrase fired.
    const requiresHuman = alreadyEscalated || newEscalation || afterHours

    // 8. Save updated conversation
    const finalMessages: Message[] = [
      ...updatedMessages,
      {
        role: 'assistant',
        content: reply,
        ...(newEscalation ? { escalated: true } : {}),
      },
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

    if ((newEscalation || afterHours) && !alreadyEscalated) {
      void this.sendEscalationNotification({
        branchId,
        agentRecord,
        conversation: {
          ...existingConversation,
          messages: finalMessages,
          lead_name: extractedName ?? leadName ?? existingConversation.lead_name,
        },
        customerQuestion: message,
        channel,
      });
    }

    logger.info(
      `Chat complete: branch=${branchId} session=${sessionId} ` +
      `requiresHuman=${requiresHuman} provider=${provider}`
    );

    return { reply, sessionId, conversationId, requiresHuman, newEscalation };
  }

  private isAfterHours(
    businessHours: unknown,
    timezone: string
  ): boolean {
    try {
      const bh = businessHours as {
        enabled?: boolean;
        days?: Record<string, { open: string; close: string; closed: boolean }>;
      } | null | undefined;

      if (!bh || !bh.enabled || !bh.days) return false;

      const tz = timezone || 'Africa/Lagos';

      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date());

      const weekdayRaw = parts.find(p => p.type === 'weekday')?.value ?? '';
      let hourStr = parts.find(p => p.type === 'hour')?.value ?? '0';
      const minStr = parts.find(p => p.type === 'minute')?.value ?? '0';
      // Intl can return '24' at midnight in some environments — normalise
      if (hourStr === '24') hourStr = '0';

      const dayMap: Record<string, string> = {
        Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu',
        Fri: 'fri', Sat: 'sat', Sun: 'sun',
      };
      const dayKey = dayMap[weekdayRaw];
      if (!dayKey) return false;

      const today = bh.days[dayKey];
      if (!today) return false;
      if (today.closed) return true;

      const nowMinutes = parseInt(hourStr, 10) * 60 + parseInt(minStr, 10);
      const [oH, oM] = (today.open || '00:00').split(':').map(Number);
      const [cH, cM] = (today.close || '23:59').split(':').map(Number);
      const openMinutes = oH * 60 + (oM || 0);
      const closeMinutes = cH * 60 + (cM || 0);

      return nowMinutes < openMinutes || nowMinutes >= closeMinutes;
    } catch {
      return false; // never let this break the chat
    }
  }

  private nextOpenDescription(businessHours: unknown, timezone: string): string {
    try {
      const bh = businessHours as {
        enabled?: boolean;
        days?: Record<string, { open: string; close: string; closed: boolean }>;
      } | null | undefined;
      if (!bh || !bh.days) return 'when we reopen';

      const tz = timezone || 'Africa/Lagos';
      const order = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const labels: Record<string, string> = {
        sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
        thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
      };

      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(new Date());
      const wdShort = parts.find(p => p.type === 'weekday')?.value ?? '';
      let hourStr = parts.find(p => p.type === 'hour')?.value ?? '0';
      if (hourStr === '24') hourStr = '0';
      const minStr = parts.find(p => p.type === 'minute')?.value ?? '0';
      const shortToKey: Record<string, string> = {
        Sun: 'sun', Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat',
      };
      const todayKey = shortToKey[wdShort];
      if (!todayKey) return 'when we reopen';
      const todayIdx = order.indexOf(todayKey);
      const nowMinutes = parseInt(hourStr, 10) * 60 + parseInt(minStr, 10);

      const opensLaterToday = (() => {
        const d = bh.days[todayKey];
        if (!d || d.closed) return false;
        const [oH, oM] = (d.open || '00:00').split(':').map(Number);
        return nowMinutes < (oH * 60 + (oM || 0));
      })();

      if (opensLaterToday) return 'later today';

      for (let offset = 1; offset <= 7; offset++) {
        const idx = (todayIdx + offset) % 7;
        const key = order[idx];
        const d = bh.days[key];
        if (d && !d.closed) {
          if (offset === 1) return 'tomorrow';
          return `on ${labels[key]}`;
        }
      }
      return 'when we reopen';
    } catch {
      return 'when we reopen';
    }
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
