import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from 'sonner'
import { cn } from "@/lib/utils";
import { useAuthStore } from '@/store'
import { useAgentsByOrg, useUpdateAgent } from '@/hooks'

const tones = ["professional", "friendly", "formal"] as const;
type Tone = typeof tones[number];

const Agent = () => {
  const { organisationId } = useAuthStore()
  const { data: agents, isLoading } = useAgentsByOrg(organisationId ?? '')
  const { mutate: updateAgent, isPending: saving } = useUpdateAgent()

  const agent = agents?.[0]

  const [name, setName] = useState('')
  const [tone, setTone] = useState<Tone>('professional')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [afterHoursMessage, setAfterHoursMessage] = useState('')
  const [confirmationHours, setConfirmationHours] = useState(2)

  useEffect(() => {
    if (agent) {
      setName(agent.name ?? 'Aria')
      setTone((agent.tone as Tone) ?? 'professional')
      setSystemPrompt(agent.system_prompt ?? '')
      setAfterHoursMessage(agent.response_time_config?.after_hours_message ?? '')
      setConfirmationHours(agent.response_time_config?.confirmation_hours ?? 2)
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
              {/* Agent name */}
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

              {/* Tone */}
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

              {/* System prompt */}
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

              {/* After hours message */}
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

              {/* Confirmation hours */}
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
