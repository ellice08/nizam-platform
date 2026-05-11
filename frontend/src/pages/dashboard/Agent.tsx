import { PageHeader } from "@/components/PageHeader";
import { Copy, Info } from "lucide-react";
import { toast } from 'sonner'
import { useAuthStore } from '@/store'
import { useOrganisation } from '@/hooks'

const Agent = () => {
  const { organisationId } = useAuthStore()
  const { data: org } = useOrganisation(organisationId ?? '')

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
        {/* Status notice */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-surface p-6 flex items-start gap-4">
          <div className="h-10 w-10 rounded-md border border-border flex items-center justify-center shrink-0 text-[hsl(var(--text-secondary))]">
            <Info className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-sm text-foreground font-medium">
              {org?.name ?? 'Your organisation'}
            </p>
            <p className="text-sm text-[hsl(var(--text-secondary))] mt-1 leading-relaxed">
              Agent configuration will be available once voice channels are provisioned.
              Your AI agent is configured and active.
            </p>
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
