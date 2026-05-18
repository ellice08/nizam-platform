import { useState, useEffect, useRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Copy, Send, Bot, User } from "lucide-react";
import { toast } from 'sonner'
import { cn } from "@/lib/utils";
import { useAuthStore } from '@/store'
import { useAgentsByOrg, useUpdateAgent, useBranches } from '@/hooks'
import { organisationApi } from '@/api'

const tones = ["professional", "friendly", "formal"] as const;
type Tone = typeof tones[number];

const Agent = () => {
  const { organisationId, branchId: storeBranchId } = useAuthStore()
  const { data: agents, isLoading } = useAgentsByOrg(organisationId ?? '')
  const { mutate: updateAgent, isPending: saving } = useUpdateAgent()

  // Resolve branch_id for org-level users
  const { data: branches } = useBranches(
    storeBranchId ? '' : (organisationId ?? '')
  )
  const resolvedBranchId = storeBranchId ?? branches?.[0]?.id ?? null

  const agent = agents?.[0]

  // Agent config form state
  const [name, setName] = useState('')
  const [tone, setTone] = useState<Tone>('professional')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [afterHoursMessage, setAfterHoursMessage] = useState('')
  const [confirmationHours, setConfirmationHours] = useState(2)
  const [escalationContacts, setEscalationContacts] = useState<Array<{ name: string; phone: string; email: string }>>([])

  useEffect(() => {
    if (agent) {
      setName(agent.name ?? 'Aria')
      setTone((agent.tone as Tone) ?? 'professional')
      setSystemPrompt(agent.system_prompt ?? '')
      setAfterHoursMessage(agent.response_time_config?.after_hours_message ?? '')
      setConfirmationHours(agent.response_time_config?.confirmation_hours ?? 2)
      setEscalationContacts(
        (agent.escalation_contacts as Array<{
          name: string; phone: string; email: string
        }>) ?? []
      )
    }
  }, [agent])

  const handleSave = () => {
    if (!agent) return
    updateAgent({
      agentId: agent.id,
      payload: {
        name,
        tone,
        system_prompt: systemPrompt,
        escalation_contacts: escalationContacts,
        response_time_config: {
          confirmation_hours: confirmationHours,
          callback_window_hours: agent.response_time_config?.callback_window_hours ?? 1,
          after_hours_message: afterHoursMessage,
        },
      },
    }, {
      onSuccess: () => toast.success('Agent configuration saved'),
      onError: () => toast.error('Failed to save agent configuration'),
    })
  }

  // Test chat state
  const [testMessages, setTestMessages] = useState<Array<{
    role: 'user' | 'assistant'
    content: string
    requiresHuman?: boolean
  }>>([])
  const [testInput, setTestInput] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [sessionId] = useState(() => crypto.randomUUID())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [testMessages])

  const handleTestSend = async () => {
    if (!testInput.trim() || testLoading || !resolvedBranchId) return

    const userMessage = testInput.trim()
    setTestInput('')
    setTestLoading(true)

    setTestMessages(prev => [...prev, { role: 'user', content: userMessage }])

    try {
      const result = await organisationApi.sendChatMessage({
        message: userMessage,
        branchId: resolvedBranchId,
        sessionId,
        channel: 'chat',
      })
      setTestMessages(prev => [
        ...prev,
        { role: 'assistant', content: result.reply, requiresHuman: result.requiresHuman },
      ])
    } catch {
      setTestMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.', requiresHuman: false },
      ])
    } finally {
      setTestLoading(false)
    }
  }

  // Embed code
  const embedCode = `<script src="https://app.ellice.io/widget.js"\n  data-org-id="${organisationId ?? ''}"></script>`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedCode)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Failed to copy')
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Agent"
        description="Persona, voice, guardrails, and escalation."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Agent configuration form */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-surface p-6 space-y-6">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium">
            Agent settings
          </h3>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full max-w-sm" />
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-10 w-full max-w-xs" />
            </div>
          ) : (
            <div className="space-y-6 max-w-2xl">
              <div>
                <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
                  Agent name
                </label>
                <input
                  className="nz-input w-full max-w-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Aria"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
                  Tone
                </label>
                <div className="flex items-center gap-2">
                  {tones.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTone(t)}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-xs border transition-colors duration-150 ease-nz capitalize",
                        tone === t
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-border bg-transparent text-[hsl(var(--text-secondary))] hover:text-foreground hover:bg-elevated"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
                  System prompt
                </label>
                <textarea
                  className="nz-textarea h-32 w-full"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Describe how the agent should behave…"
                />
                <p className="mt-1.5 text-xs text-[hsl(var(--text-tertiary))]">
                  Only organisation admins can edit the system prompt.
                </p>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
                  After hours message
                </label>
                <textarea
                  className="nz-textarea h-24 w-full"
                  value={afterHoursMessage}
                  onChange={(e) => setAfterHoursMessage(e.target.value)}
                  placeholder="Our team is currently offline…"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
                  Confirmation response time
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    className="nz-input nz-mono w-24"
                    value={confirmationHours}
                    onChange={(e) => setConfirmationHours(Number(e.target.value))}
                  />
                  <span className="text-sm text-[hsl(var(--text-secondary))]">hours</span>
                </div>
              </div>

              {/* Escalation contacts */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))]">
                    Escalation contacts
                  </label>
                  <button
                    type="button"
                    onClick={() => setEscalationContacts(prev => [
                      ...prev,
                      { name: '', phone: '', email: '' }
                    ])}
                    className="text-xs text-[hsl(var(--text-secondary))] hover:text-foreground transition-colors duration-150"
                  >
                    + Add contact
                  </button>
                </div>

                {escalationContacts.length === 0 ? (
                  <p className="text-xs text-[hsl(var(--text-tertiary))]">
                    No escalation contacts. Add a contact to receive alerts when the AI cannot answer a question.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {escalationContacts.map((contact, i) => (
                      <div key={i} className="rounded-lg border border-border p-3 space-y-2 relative">
                        <button
                          type="button"
                          onClick={() => setEscalationContacts(
                            prev => prev.filter((_, idx) => idx !== i)
                          )}
                          className="absolute top-2 right-2 text-xs text-[hsl(var(--text-tertiary))] hover:text-destructive transition-colors"
                        >
                          Remove
                        </button>
                        <input
                          className="nz-input w-full"
                          placeholder="Full name"
                          value={contact.name}
                          onChange={e => setEscalationContacts(prev =>
                            prev.map((c, idx) =>
                              idx === i ? { ...c, name: e.target.value } : c
                            )
                          )}
                        />
                        <input
                          className="nz-input w-full"
                          placeholder="Phone number"
                          value={contact.phone}
                          onChange={e => setEscalationContacts(prev =>
                            prev.map((c, idx) =>
                              idx === i ? { ...c, phone: e.target.value } : c
                            )
                          )}
                        />
                        <input
                          className="nz-input w-full"
                          placeholder="Email address"
                          type="email"
                          value={contact.email}
                          onChange={e => setEscalationContacts(prev =>
                            prev.map((c, idx) =>
                              idx === i ? { ...c, email: e.target.value } : c
                            )
                          )}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button
                onClick={handleSave}
                disabled={saving || isLoading || !agent}
                className="bg-primary hover:bg-primary-hover text-primary-foreground"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          )}
        </div>

        {/* Test your agent */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-surface overflow-hidden">
          {/* Panel header */}
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] font-medium">
                Test your agent
              </p>
              <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">
                Send a message to see how your agent responds
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-[#4CAF50]" />
              <span className="text-xs text-[hsl(var(--text-secondary))]">Live</span>
            </div>
          </div>

          {/* Messages area */}
          <div className="h-80 overflow-y-auto p-4 space-y-4 bg-[#0A0A08]">
            {testMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <Bot size={28} strokeWidth={1.5} className="text-[hsl(var(--text-tertiary))] mb-3" />
                <p className="text-sm text-[hsl(var(--text-secondary))]">Ask your agent anything</p>
                <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1 max-w-xs">
                  Responses are grounded in your knowledge base
                </p>
              </div>
            ) : (
              <>
                {testMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-3",
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {msg.role === 'assistant' && (
                      <div className="h-7 w-7 rounded-full bg-surface border border-border flex items-center justify-center shrink-0 mt-0.5">
                        <Bot size={14} strokeWidth={1.5} className="text-[hsl(var(--text-secondary))]" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[75%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                        msg.role === 'user'
                          ? "bg-primary text-primary-foreground"
                          : "bg-surface border border-border text-foreground"
                      )}
                    >
                      {msg.content}
                      {(msg as { role: string; content: string; escalated?: boolean; requiresHuman?: boolean }).escalated && (
                        <p className="text-xs mt-1.5 text-[#F0C5CC] flex items-center gap-1">
                          Flagged for team follow-up
                        </p>
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="h-7 w-7 rounded-full bg-surface border border-border flex items-center justify-center shrink-0 mt-0.5">
                        <User size={14} strokeWidth={1.5} className="text-[hsl(var(--text-secondary))]" />
                      </div>
                    )}
                  </div>
                ))}
                {testLoading && (
                  <div className="flex gap-3 justify-start">
                    <div className="h-7 w-7 rounded-full bg-surface border border-border flex items-center justify-center shrink-0">
                      <Bot size={14} strokeWidth={1.5} className="text-[hsl(var(--text-secondary))]" />
                    </div>
                    <div className="bg-surface border border-border rounded-lg px-3 py-2">
                      <div className="flex gap-1 items-center h-4">
                        <div className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--text-tertiary))] animate-bounce [animation-delay:0ms]" />
                        <div className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--text-tertiary))] animate-bounce [animation-delay:150ms]" />
                        <div className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--text-tertiary))] animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input area */}
          <div className="px-4 py-3 border-t border-border flex gap-2 items-end">
            <textarea
              value={testInput}
              onChange={e => setTestInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleTestSend()
                }
              }}
              placeholder="Type a message to test your agent…"
              rows={1}
              className="flex-1 bg-[#0A0A08] border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-[hsl(var(--text-tertiary))] resize-none outline-none focus:border-primary transition-colors duration-150 max-h-32 overflow-y-auto"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
              disabled={testLoading || !resolvedBranchId}
            />
            <button
              onClick={() => void handleTestSend()}
              disabled={testLoading || !testInput.trim() || !resolvedBranchId}
              className="h-9 w-9 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shrink-0 transition-colors duration-150"
            >
              <Send size={14} strokeWidth={1.5} className="text-primary-foreground" />
            </button>
          </div>
        </div>

        {/* Embed code */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-surface p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium">
              Embed code
            </h3>
            <button
              onClick={handleCopy}
              className="text-xs text-[hsl(var(--text-secondary))] hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <Copy className="h-3 w-3" strokeWidth={1.5} /> Copy
            </button>
          </div>
          <pre className="nz-mono text-xs bg-background border border-border rounded-md p-4 overflow-x-auto text-[hsl(var(--text-secondary))]">
{embedCode}
          </pre>
          <p className="text-xs text-[hsl(var(--text-tertiary))]">
            Paste this snippet into the <code className="nz-mono">&lt;head&gt;</code> of your website to activate the chat widget.
          </p>
        </div>
      </div>
    </>
  );
};

export default Agent;
