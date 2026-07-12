import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { supabase } from '../lib/supabase.js';
import { ragService } from './rag.service.js';
import { agentService } from './agent.service.js';
import { notificationService } from './notification.service.js';
import { intentService } from './intent.service.js';
import logger from '../utils/logger.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const RAG_BEFORE = `CONVERSATION STYLE:
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
- Customers often use informal words for the same things. Treat "site", "place",
  "spot", "location", "property", "development", "estate", and "scheme" as referring
  to the named developments/estates in the knowledge base. Map their casual wording
  to the correct knowledge-base entries rather than treating it as something you
  don't recognise.
- IMPORTANT — disambiguate before escalating: If the customer's question could refer
  to more than one item in the knowledge base — for example the same product or
  property name exists in multiple locations/estates, or several options match what
  they asked — do NOT pass it to the team. Instead, briefly present the matching
  options (with the key distinguishing detail like location or price) and ask which
  one they mean. Example shape (generate your own wording): "We have two — the Shore
  at [location A] (₦X) and the Shore at [location B] (₦Y). Which one did you mean?"
  Only treat something as "not in the knowledge base" once you are sure the answer
  genuinely isn't there. Answering or clarifying from the knowledge base always comes
  before escalation.
- FACTUAL ACCURACY — ABSOLUTE RULES:
  - Only state facts (prices, locations, unit names, sizes, availability) that appear
    EXPLICITLY in the knowledge base context provided. Never infer, estimate, or
    extrapolate a fact that is not written there.
  - NEVER combine details from different properties, projects, or locations into one
    answer. Each fact you state must come from a single, explicit statement in the
    context about that exact property.
  - If the context does not explicitly contain the answer (e.g. a price or a unit's
    details), DO NOT GUESS — use the handoff flow (collect name + phone/email and flag
    for the team) exactly as you do for other unknown answers.
  - Never assume a property exists in another location because of a similar name. If
    the customer mentions a property or location you cannot find explicitly in the
    context, say you want to confirm with the team rather than describing it.
  - A wrong price or invented property is the worst possible failure — when in ANY
    doubt, hand off.
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
`;

const RAG_AFTER = ` LEAD DETAILS: Whenever the customer provides ANY of their contact or booking details
in this turn (their name, a phone number, an email, or a preferred date/time for a
tour or callback), append a lead block as the VERY LAST thing in your reply, after any
<<ESCALATE>> and <<INTENT:...>> tags, in this EXACT format with double quotes:
<<LEAD name="" phone="" email="" date="" subject="">>
Fill ONLY the fields the customer actually gave this turn or earlier in the
conversation; leave the others as empty strings. Put the person's name in name, digits
in phone, the email address in email, any preferred day/time (e.g. "Friday",
"tomorrow 2pm") in date, and in subject what the booking or enquiry is ABOUT — e.g.
the property or development they want to tour ("Hutu Orchards"), or the topic they
want to discuss with sales. Fill subject from anywhere in the conversation, not just
this turn. Leave subject empty if there is no specific subject. Example: customer
wants a tour of Hutu on Friday and gives "alameen, alameen@gmail.com" ->
<<LEAD name="Alameen" phone="" email="alameen@gmail.com" date="Friday" subject="Hutu Orchards">>
Never mention or explain this block; it is removed before the customer sees your
reply. If the customer gave none of these details this turn, do NOT append a lead
block.`;

interface ConfiguredIntent {
  key: string;
  label: string;
  description?: string | null;
  fields?: Array<{ key: string; label: string; required?: boolean }>;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildIntentHandling(intents: ConfiguredIntent[]): string {
  let block = `INTENT HANDLING (important — decide what the customer WANTS):
- Before responding to a request, decide whether the customer is (a) asking a
  QUESTION you can answer from the knowledge base, (b) asking a question you CANNOT
  answer, or (c) expressing an ACTION they want to take. Actions are different from
  questions — handle them deliberately.`;

  if (intents.length > 0) {
    block += `\n- Recognised actions and what to collect for each (collect details NATURALLY and\n  PROGRESSIVELY — ask one or two things at a time, never fire a long list of\n  questions in one message; it should feel like a friendly conversation, not a form):`;
    for (const intent of intents) {
      const fieldList = Array.isArray(intent.fields) && intent.fields.length > 0
        ? intent.fields.map(f => f.label).join(', ') + ', their name, and a phone number or email'
        : 'their name, and a phone number or email';
      const descPart = intent.description ? ` — ${intent.description}` : '';
      block += `\n  • ${intent.label.toUpperCase()}${descPart} — collect: ${fieldList}. Acknowledge the specific request warmly rather than giving a generic 'let me connect you'.`;
    }
  }

  block += `
- For any unanswerable question that is NOT one of the above actions, treat it as a
  GENERAL enquiry: follow the existing contact-collection rule above.
- In ALL cases, once you have their name and a phone number or email, follow the
  CONFIRMATION TIMING instruction to confirm. Do not ask for contact details twice if
  already collected earlier in the conversation.

- Never reveal you are an AI or using a knowledge base.
- Never open a reply by praising or commenting on the question itself.
  Banned openers and filler (and ALL variations of them) include: "Certainly",
  "Absolutely", "Of course", "Sure", "Sure thing", "Great question", "That's a
  great question", "Good question", "Happy to help", "I'd be happy to". Lead
  directly with the substance — the answer, or the next step. If you catch
  yourself starting with an acknowledgement of the question, delete it and start
  with the real content.

INTERNAL SIGNAL (very important): Whenever your reply hands off to the human
team in ANY way — you cannot answer from the knowledge base, you are asking for the
customer's contact details so the team can follow up, or you are confirming you'll
pass something to the team — append the exact token <<ESCALATE>> as the VERY LAST
thing in your reply, after a space. Do NOT mention this token, explain it, or use
it in any other situation. If the turn is a normal answer with no hand-off, do NOT
append it. The token will be removed before the customer sees your reply.
 ADDITIONALLY, whenever you are handling one of the recognised ACTIONS or a general
hand-off, append an intent tag as the VERY LAST thing in your reply, right after
<<ESCALATE>>, in this exact format: `;

  if (intents.length > 0) {
    const tagList = intents.map(i => `<<INTENT:${i.key}>> for ${i.label.toLowerCase()}`).join(', ');
    block += `${tagList}, or <<INTENT:general>> for any other hand-off to the team.`;
  } else {
    block += `<<INTENT:general>> for any hand-off to the team.`;
  }

  block += ` Use exactly one intent tag. Example ending: "... could I take your name and a phone number? <<ESCALATE>> <<INTENT:general>>". Like <<ESCALATE>>, never mention or explain these tags; they are removed before the customer sees your reply.`;

  return block;
}

function buildRagBoundaryRule(intents: ConfiguredIntent[]): string {
  return RAG_BEFORE + buildIntentHandling(intents) + '\n' + RAG_AFTER;
}

// ── Tag-safe streaming emitter ────────────────────────────────────────────
// Buffers raw LLM tokens and forwards clean speech/text to the caller, holding
// back anything that might be the start of a <<...>> control tag (ESCALATE /
// INTENT / LEAD) until it's confirmed one way or the other. Confirmed tags are
// discarded entirely from the emit stream — post-processing (finalizeTurn)
// strips and parses them from the full accumulated text, same as the
// non-streaming path — so they must never reach the caller.
class TagSafeEmitter {
  private pending = '';

  constructor(private readonly onToken: (text: string) => void) {}

  push(raw: string): void {
    if (!raw) return;
    this.pending += raw;
    this.drain();
  }

  private drain(): void {
    for (;;) {
      const ltIndex = this.pending.indexOf('<');

      if (ltIndex === -1) {
        if (this.pending) {
          this.onToken(this.pending);
          this.pending = '';
        }
        return;
      }

      if (ltIndex > 0) {
        this.onToken(this.pending.slice(0, ltIndex));
        this.pending = this.pending.slice(ltIndex);
      }

      // pending now starts with '<'; need a second char to know if it's '<<'
      if (this.pending.length < 2) return;

      if (!this.pending.startsWith('<<')) {
        // lone '<' — not a tag; release it and keep scanning the rest
        this.onToken(this.pending[0]);
        this.pending = this.pending.slice(1);
        continue;
      }

      // starts with '<<' — a control tag; hold until it closes with '>>'
      const endIndex = this.pending.indexOf('>>');
      if (endIndex === -1) return; // incomplete tag — wait for more tokens

      // discard the whole tag; finalizeTurn parses/strips it from the full text
      this.pending = this.pending.slice(endIndex + 2);
    }
  }

  flush(): void {
    if (!this.pending) return;
    let text = this.pending;
    this.pending = '';
    // Strip any tag remnant (complete or truncated by stream end) before flushing.
    text = text.replace(/<<[^>]*>>/g, '').replace(/<<[^>]*$/g, '');
    if (text) this.onToken(text);
  }
}

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

// Shared setup output — everything chat() and chatStream() need before and
// after the LLM call, so the two paths cannot drift from each other.
interface PreparedTurn {
  branchId: string;
  message: string;
  sessionId: string;
  channel: 'chat' | 'voice' | 'whatsapp';
  leadPhone?: string;
  provider: string;
  model: string;
  systemPrompt: string;
  updatedMessages: Message[];
  previousMessages: Message[];
  agentRecord: Record<string, unknown>;
  activeIntents: ConfiguredIntent[];
  existingConversation: Record<string, unknown>;
  conversationId: string;
  afterHours: boolean;
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

  private async callOpenAIStream(
    systemPrompt: string,
    messages: Message[],
    model: string,
    onRawToken: (text: string) => void
  ): Promise<string> {
    const stream = await openaiClient.chat.completions.create({
      model: model ?? 'gpt-4o',
      max_tokens: 600,
      temperature: 0.7,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
    });

    let full = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) {
        full += delta;
        onRawToken(delta);
      }
    }
    return full;
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

  // Shared setup path for chat() and chatStream(): agent config, intents, RAG
  // context, system prompt construction, and conversation get/create. Both
  // callers get an identical PreparedTurn — no room for the two paths to drift.
  private async prepareTurn(params: ChatParams): Promise<PreparedTurn> {
    const { branchId, message, sessionId, channel, leadName, leadPhone } = params;

    // 1. Fetch agent config for this branch
    const agent = await agentService.getOrCreateAgent(branchId);
    const agentRecord = agent as Record<string, unknown>;

    // Fetch enabled intents for this agent; degrade to [] on error so chat never breaks.
    const agentId = agentRecord.id as string;
    let activeIntents: ConfiguredIntent[] = [];
    try {
      const allIntents = await intentService.listByAgent(agentId) as Array<ConfiguredIntent & { enabled?: boolean }>;
      activeIntents = allIntents.filter(i => i.enabled !== false);
    } catch {
      // intentService failure is non-fatal
    }
    const ragBoundaryRule = buildRagBoundaryRule(activeIntents);

    const provider = (agentRecord.llm_provider as string) ?? 'anthropic';
    // Voice latency: time-to-first-token matters most there, and gpt-4o-mini
    // is materially faster than gpt-4o for the same reply quality on this prompt.
    const model = (agentRecord.llm_model as string) ??
      (provider === 'openai'
        ? (channel === 'voice' ? 'gpt-4o-mini' : 'gpt-4o')
        : 'claude-sonnet-4-20250514');

    // 1b. Fetch branch timezone for after-hours evaluation
    const { data: branchRow } = await supabase
      .from('branches')
      .select('timezone')
      .eq('id', branchId)
      .maybeSingle();
    const branchTimezone = (branchRow as { timezone?: string } | null)?.timezone ?? 'Africa/Lagos';

    // 2. Get or create conversation — moved ahead of RAG retrieval so its
    // history can seed the retrieval query below (follow-ups like "how many
    // sqm is it" have no subject on their own and need recent turns for
    // retrieval to find the right chunk).
    const existingConversation = await this.getOrCreateConversation({
      sessionId,
      branchId,
      agentId: agentRecord.id as string,
      channel,
      leadName,
      leadPhone,
    });

    const conversationId = existingConversation.id as string;
    const previousMessages = (existingConversation.messages as Message[]) ?? [];

    // 3. Get RAG context from pgvector. Retrieval query includes the last 3
    // exchanges (6 messages) plus the new message so subject-less follow-ups
    // still retrieve against the right topic, not just the bare latest
    // message. Capped to ~1500 chars from the END so the newest text (the
    // actual question) always survives the cap.
    const recentTurns = previousMessages.slice(-6).map(m => m.content).join('\n');
    const rawRetrievalQuery = recentTurns ? `${recentTurns}\n${message}` : message;
    const retrievalQuery = rawRetrievalQuery.length > 1500
      ? rawRetrievalQuery.slice(-1500)
      : rawRetrievalQuery;

    const context = await ragService.getContext({
      query: retrievalQuery,
      branchId,
      matchCount: 8,
      matchThreshold: 0.6,
    });

    // 4. Build base prompt (systemPrompt finalised after step 4b)
    const agentName = (agentRecord.name as string) ?? 'Aria';

    const rawPrompt = (agentRecord.system_prompt as string) ??
      `You are ${agentName}, a warm and helpful assistant.`;

    const basePrompt = rawPrompt
      .replace(/\{\{agent_name\}\}/g, agentName)
      .replace(/^You are Aria,/m, `You are ${agentName},`)
      .replace(/^You are Aria /m, `You are ${agentName} `);

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
      ? `${basePrompt}\n\n${ragBoundaryRule}\n\nKNOWLEDGE BASE — read this thoroughly and use it to inform your responses. Rephrase naturally in a warm conversational tone, but never merge facts from different properties or invent details not explicitly present. Never quote directly:\n\n${context}\n\nRemember: respond as a warm professional having a real conversation, not as a search result.${contactContext}${afterHoursContext}${confirmationContext}`
      : `${basePrompt}\n\n${ragBoundaryRule}\n\nNote: No knowledge base has been set up yet. For any specific business questions, let the customer know a team member will follow up with them.${contactContext}${afterHoursContext}${confirmationContext}`;

    // 5. Add user message to history
    const updatedMessages: Message[] = [
      ...previousMessages,
      { role: 'user', content: message },
    ];

    return {
      branchId,
      message,
      sessionId,
      channel,
      leadPhone,
      provider,
      model,
      systemPrompt,
      updatedMessages,
      previousMessages,
      agentRecord,
      activeIntents,
      existingConversation,
      conversationId,
      afterHours,
    };
  }

  async chat(params: ChatParams): Promise<ChatResult> {
    const turn = await this.prepareTurn(params);

    let reply: string;
    try {
      if (turn.provider === 'openai') {
        reply = await this.callOpenAI(turn.systemPrompt, turn.updatedMessages, turn.model);
        logger.info(`LLM: OpenAI ${turn.model} — branch ${turn.branchId}`);
      } else {
        reply = await this.callAnthropic(turn.systemPrompt, turn.updatedMessages, turn.model);
        logger.info(`LLM: Anthropic ${turn.model} — branch ${turn.branchId}`);
      }
    } catch (err) {
      logger.error(
        `LLM call failed (${turn.provider}): ${err instanceof Error ? err.message : String(err)}`
      );
      throw err;
    }

    return this.finalizeTurn(turn, reply);
  }

  // Streaming variant — same setup + same post-processing as chat(), only the
  // LLM call and delivery differ. onToken receives tag-stripped text chunks as
  // they arrive so a caller (e.g. the voice websocket) can forward them live.
  async chatStream(params: ChatParams & { onToken: (text: string) => void }): Promise<ChatResult> {
    const { onToken, ...chatParams } = params;
    const turn = await this.prepareTurn(chatParams);

    const emitter = new TagSafeEmitter(onToken);

    let reply: string;
    try {
      if (turn.provider === 'openai') {
        reply = await this.callOpenAIStream(turn.systemPrompt, turn.updatedMessages, turn.model, (rawToken) => {
          emitter.push(rawToken);
        });
        logger.info(`LLM: OpenAI ${turn.model} (stream) — branch ${turn.branchId}`);
      } else {
        // VA2: Anthropic has no streaming path yet — fall back to one non-streaming
        // call and emit it as a single chunk. Streaming Anthropic can come later.
        logger.info(`LLM stream fallback: Anthropic ${turn.model} — non-streaming single-shot emit — branch ${turn.branchId}`);
        reply = await this.callAnthropic(turn.systemPrompt, turn.updatedMessages, turn.model);
        emitter.push(reply);
      }
    } catch (err) {
      logger.error(
        `LLM stream call failed (${turn.provider}): ${err instanceof Error ? err.message : String(err)}`
      );
      throw err;
    }
    emitter.flush();

    return this.finalizeTurn(turn, reply);
  }

  // Shared post-processing for chat() and chatStream(): tag detect/strip
  // (ESCALATE / INTENT / LEAD), contact extraction, escalation resolution,
  // conversation storage, and notifications. Identical for both callers.
  private async finalizeTurn(turn: PreparedTurn, rawReply: string): Promise<ChatResult> {
    const {
      branchId, message, sessionId, channel, leadPhone, provider,
      updatedMessages, previousMessages, agentRecord, activeIntents,
      existingConversation, conversationId, afterHours,
    } = turn;

    let reply = rawReply;

    // Primary escalation signal: the model appends <<ESCALATE>> when handing off.
    // Detect it, then strip it (and any stray whitespace) before the reply is used
    // or stored anywhere.
    const modelEscalationSignal = /<<\s*ESCALATE\s*>>/i.test(reply);
    reply = reply.replace(/<<\s*ESCALATE\s*>>/gi, '').replace(/\s+$/, '').trim();

    // Detect the intent tag using the configured keys + general as the valid set.
    const validKeys = [...activeIntents.map(i => i.key), 'general'];
    const intentRe = new RegExp(`<<\\s*INTENT\\s*:\\s*(${validKeys.map(escapeRegex).join('|')})\\s*>>`, 'i');
    const intentMatch = reply.match(intentRe);
    const detectedIntent = intentMatch ? intentMatch[1].toLowerCase() : null;
    reply = reply.replace(/<<\s*INTENT\s*:\s*\w+\s*>>/gi, '').replace(/\s+$/, '').trim();
    if (detectedIntent) {
      logger.info(`Intent detected: ${detectedIntent} — branch ${branchId}`);
    }

    // Model-based lead extraction (primary). Parse the structured <<LEAD ...>> block
    // the model appends, validate lightly, then strip it before the reply is used.
    let modelLeadName: string | null = null;
    let modelLeadPhone: string | null = null;
    let modelLeadEmail: string | null = null;
    let modelLeadDate: string | null = null;
    let modelLeadSubject: string | null = null;
    const leadBlockMatch = reply.match(/<<\s*LEAD\b([^>]*)>>/i);
    if (leadBlockMatch) {
      const attrs = leadBlockMatch[1];
      const getAttr = (key: string): string | null => {
        const m = attrs.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`, 'i'));
        const v = m ? m[1].trim() : '';
        return v.length > 0 ? v : null;
      };
      const rawName = getAttr('name');
      const rawPhone = getAttr('phone');
      const rawEmail = getAttr('email');
      const rawDate = getAttr('date');
      const rawSubject = getAttr('subject');

      if (rawName && /^[A-Za-z][A-Za-z .'\-]{1,59}$/.test(rawName) && rawName.split(' ').filter(Boolean).length <= 5) {
        modelLeadName = rawName.split(' ').filter(Boolean)
          .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
      if (rawPhone && /\d/.test(rawPhone)) {
        modelLeadPhone = rawPhone.replace(/[^\d+\-()\s]/g, '').trim() || null;
      }
      if (rawEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail)) {
        modelLeadEmail = rawEmail;
      }
      if (rawDate) {
        modelLeadDate = rawDate.slice(0, 60);
      }
      if (rawSubject) {
        modelLeadSubject = rawSubject.slice(0, 120);
      }
    }
    // Strip the LEAD block (bulletproof) before reply is used/stored anywhere.
    reply = reply.replace(/<<\s*LEAD\b[^>]*>>/gi, '').replace(/\s+$/, '').trim();
    // Final safety net: remove ANY leftover <<...>> sentinel that may have slipped.
    reply = reply.replace(/<<[^>]*>>/g, '').replace(/\s+$/, '').trim();
    if (modelLeadDate) {
      logger.info(`Lead booking date captured (Phase 2 will store): "${modelLeadDate}" — branch ${branchId}`);
    }

    // 6b. Check if user is providing contact details
    // after a previous escalation request
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

    // Prefer model-extracted lead fields; fall back to regex extraction.
    // (Model parsing is independent of assistantAskedForContact, so intent flows
    // where the gate was false still capture details.)
    const finalName = modelLeadName ?? extractedName;
    const finalPhone = modelLeadPhone ?? extractedPhone;
    const finalEmail = modelLeadEmail ?? extractedEmail;

    // Build booking_details from extracted fields (only include what we have).
    const bookingDetails: Record<string, string> = {};
    if (modelLeadDate) bookingDetails.date = modelLeadDate;
    if (modelLeadSubject) bookingDetails.subject = modelLeadSubject;
    const hasBookingDetails = Object.keys(bookingDetails).length > 0;

    // Resolve intent to persist: prefer freshly detected, else keep stored value.
    const persistedIntent =
      detectedIntent ?? (existingConversation.intent as string | null) ?? null;

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
        lead_name: finalName ??
          (existingConversation.lead_name as string | null),
        lead_phone: finalPhone ?? leadPhone ??
          (existingConversation.lead_phone as string | null),
        lead_email: finalEmail ??
          (existingConversation.lead_email as string | null),
        intent: persistedIntent,
        booking_details: hasBookingDetails
          ? { ...(existingConversation.booking_details as Record<string, unknown> ?? {}), ...bookingDetails }
          : (existingConversation.booking_details as Record<string, unknown> ?? null),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    const leadNewlyCaptured =
      (!!finalName  && !existingConversation.lead_name)  ||
      (!!finalPhone && !existingConversation.lead_phone) ||
      (!!finalEmail && !existingConversation.lead_email);
    if (leadNewlyCaptured) {
      void notificationService.createNotification({
        branchId, type: 'lead', title: 'New lead captured',
        body: [finalName, finalPhone, finalEmail].filter(Boolean).join(' · ') || 'New contact',
        link: `/dashboard/conversations?c=${conversationId}`,
        entityType: 'conversation', entityId: conversationId, minRole: null,
        audience: 'tenant',
      });
    }

    if ((newEscalation || afterHours) && !alreadyEscalated) {
      void notificationService.createNotification({
        branchId, type: 'escalation', title: 'Conversation needs attention',
        body: (finalName ?? (existingConversation.lead_name as string | null)) ?? 'A customer needs a human',
        link: `/dashboard/conversations?c=${conversationId}`,
        entityType: 'conversation', entityId: conversationId, minRole: null,
        audience: 'tenant',
      });
      void this.sendEscalationNotification({
        branchId,
        agentRecord,
        conversation: {
          ...existingConversation,
          messages: finalMessages,
          lead_name: finalName ?? (existingConversation.lead_name as string | null),
          intent: persistedIntent,
          booking_details: hasBookingDetails
            ? bookingDetails
            : (existingConversation.booking_details ?? null),
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
