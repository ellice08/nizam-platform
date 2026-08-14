import { useState } from "react";
import { Plus, Trash2, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field, SectionTitle, StepHeader, Toggle } from "./shared";
import { BranchTabs } from "./BranchTabs";
import type { Branch, WizardState } from "../types";
import { BusinessHoursEditor } from "@/components/BusinessHoursEditor"
import { IntentsEditor } from "@/components/IntentsEditor";
import { NICHE_OPTIONS } from "@/lib/niches";

type Props = {
  state: WizardState;
  setBranch: (i: number, patch: Partial<Branch>) => void;
  set: (patch: Partial<WizardState>) => void;
};

const tones: Array<Branch["tone"]> = ["professional", "friendly", "formal"];

export const Step4Agent = ({ state, setBranch, set }: Props) => {
  const [active, setActive] = useState(0);
  const b = state.branches[active];
  if (!b) return null;

  return (
    <>
      <StepHeader step={4} title="Configure the AI agent" description="One agent per branch. Settings apply to all channels." />
      <BranchTabs branches={state.branches} active={active} onActive={setActive} />

      <div className="space-y-8 max-w-3xl">
        {/* Niche is an ORG-level choice (one template for the account), shown
            explicitly so the operator confirms it rather than inheriting it
            silently from the industry picked in Step 1 — that implicit
            derivation is how a real-estate client ended up on a hospitality
            prompt with nobody noticing. */}
        <div>
          <Field label="Agent niche" required>
            <select
              className="nz-input"
              value={state.niche}
              onChange={(e) => set({ niche: e.target.value as typeof state.niche, nicheEdited: true })}
            >
              {NICHE_OPTIONS.map((n) => (
                <option key={n.value} value={n.value}>{n.label}</option>
              ))}
            </select>
          </Field>
          <p className="mt-2 text-xs text-[hsl(var(--text-tertiary))] leading-relaxed">
            {NICHE_OPTIONS.find((n) => n.value === state.niche)?.implies}
          </p>
          {!state.nicheEdited && (
            <p className="mt-1 text-xs text-[hsl(var(--text-tertiary))]">
              Suggested from the industry you chose in Step 1. Change it here if it doesn't fit.
            </p>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <Field label="Agent name">
            <input className="nz-input" value={b.agentName} onChange={(e) => setBranch(active, { agentName: e.target.value })} />
          </Field>
          <Field label="Voice">
            <div className="flex items-center gap-2">
              <select className="nz-input flex-1" value={b.voice} onChange={(e) => setBranch(active, { voice: e.target.value })}>
                <option value="professional_female">Professional Female (ElevenLabs)</option>
                <option value="professional_male">Professional Male (ElevenLabs)</option>
                <option value="warm_female">Warm Female (ElevenLabs)</option>
                <option value="friendly_male">Friendly Male (ElevenLabs)</option>
              </select>
              <button type="button" className="h-10 px-3 rounded-md border border-border text-[hsl(var(--text-secondary))] hover:text-foreground hover:bg-elevated transition-colors duration-150 ease-nz flex items-center gap-1.5 text-xs">
                <Play className="h-3.5 w-3.5" strokeWidth={1.5} /> Preview
              </button>
            </div>
          </Field>
        </div>

        <Field label="Tone">
          <div className="flex items-center gap-2">
            {tones.map((t) => (
              <button key={t} type="button" onClick={() => setBranch(active, { tone: t })}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs border transition-colors duration-150 ease-nz capitalize",
                  b.tone === t
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border bg-transparent text-[hsl(var(--text-secondary))] hover:text-foreground hover:bg-elevated"
                )}>
                {t}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Language">
          <select className="nz-input md:w-72" value={b.language} onChange={(e) => setBranch(active, { language: e.target.value })}>
            <option>English</option>
            <option>French</option>
            <option>Yoruba</option>
            <option>Swahili</option>
          </select>
        </Field>

        <section>
          <SectionTitle>Response times</SectionTitle>
          <div className="space-y-5 max-w-xl">
            <Field label="Confirmation response time">
              <Toggle
                checked={b.confirmationEnabled}
                onChange={(v) => setBranch(active, { confirmationEnabled: v })}
                label="Promise a specific response time"
              />
              <p className="text-xs text-[hsl(var(--text-tertiary))]">
                When off, the assistant says it will follow up without committing to a timeframe.
              </p>
              <div className={cn("flex items-center gap-2", !b.confirmationEnabled && "opacity-40 pointer-events-none")}>
                <input
                  type="number"
                  min={0}
                  disabled={!b.confirmationEnabled}
                  className="nz-input nz-mono w-24"
                  value={b.confirmationHours}
                  onChange={(e) => setBranch(active, { confirmationHours: +e.target.value })}
                />
                <span className="text-sm text-[hsl(var(--text-secondary))]">hours</span>
              </div>
            </Field>
            <Field label="Callback window">
              <div className="flex items-center gap-2">
                <input type="number" min={0} className="nz-input nz-mono w-24" value={b.callbackHours} onChange={(e) => setBranch(active, { callbackHours: +e.target.value })} />
                <span className="text-sm text-[hsl(var(--text-secondary))]">hours</span>
              </div>
            </Field>
          </div>
        </section>

        <section>
          <SectionTitle>Escalation contacts</SectionTitle>
          <div className="space-y-2">
            {b.escalationContacts.map((c) => (
              <div key={c.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <input className="nz-input h-9" placeholder="Name" value={c.name}
                  onChange={(e) => setBranch(active, { escalationContacts: b.escalationContacts.map((x) => x.id === c.id ? { ...x, name: e.target.value } : x) })} />
                <input className="nz-input h-9" placeholder="Phone" value={c.phone}
                  onChange={(e) => setBranch(active, { escalationContacts: b.escalationContacts.map((x) => x.id === c.id ? { ...x, phone: e.target.value } : x) })} />
                <input className="nz-input h-9" placeholder="Email" value={c.email}
                  onChange={(e) => setBranch(active, { escalationContacts: b.escalationContacts.map((x) => x.id === c.id ? { ...x, email: e.target.value } : x) })} />
                <button type="button" onClick={() => setBranch(active, { escalationContacts: b.escalationContacts.filter((x) => x.id !== c.id) })}
                  className="h-9 w-9 rounded-md border border-border text-[hsl(var(--text-secondary))] hover:text-primary-subtle hover:border-primary transition-colors duration-150 ease-nz flex items-center justify-center">
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
          <button type="button"
            onClick={() => setBranch(active, { escalationContacts: [...b.escalationContacts, { id: `e${Date.now()}`, name: "", phone: "", email: "" }] })}
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-transparent hover:bg-elevated text-foreground px-3 py-2 text-sm transition-colors duration-150 ease-nz">
            <Plus className="h-4 w-4" strokeWidth={1.5} /> Add escalation contact
          </button>
        </section>

        <section>
          <SectionTitle>Intents</SectionTitle>
          <IntentsEditor
            value={b.intents}
            onChange={(next) => setBranch(active, { intents: next })}
          />
        </section>

        <section>
          <SectionTitle>After hours</SectionTitle>
          <div className="space-y-4">
            <Toggle checked={b.afterHoursEnabled} onChange={(v) => setBranch(active, { afterHoursEnabled: v })} label="Enable after-hours message" />
            {b.afterHoursEnabled && (
              <>
                <textarea className="nz-textarea h-28" value={b.afterHoursMessage} onChange={(e) => setBranch(active, { afterHoursMessage: e.target.value })} />

                <BusinessHoursEditor
                  value={b.businessHours}
                  onChange={(bh) => setBranch(active, { businessHours: bh })}
                />
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
};

export default Step4Agent;
