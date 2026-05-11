import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { organisationApi } from "@/api";
import { apiClient } from "@/lib/axios";
import { useOnboardingDraft } from "@/hooks/useOnboardingDraft";
import {
  initialState,
  newBranch,
  defaultLabelsByIndustry,
  type Branch,
  type WizardState,
} from "./onboard/types";
import Step1Org from "./onboard/steps/Step1Org";
import Step2Branding from "./onboard/steps/Step2Branding";
import Step3Branches from "./onboard/steps/Step3Branches";
import Step4Agent from "./onboard/steps/Step4Agent";
import Step5Knowledge from "./onboard/steps/Step5Knowledge";
import Step6Credentials from "./onboard/steps/Step6Credentials";
import Step7Review from "./onboard/steps/Step7Review";
import Step8Done from "./onboard/steps/Step8Done";

type ProvisionStatus = "idle" | "running" | "done" | "pending" | "error";
export type ProvisionStep = {
  id: string;
  label: string;
  status: ProvisionStatus;
  note?: string;
};

const stepsMeta = [
  { n: 1, name: "Organisation", desc: "Company basics" },
  { n: 2, name: "Branding", desc: "Logo & colours" },
  { n: 3, name: "Branches", desc: "Locations & telephony" },
  { n: 4, name: "Agent", desc: "AI persona & voice" },
  { n: 5, name: "Knowledge", desc: "Approved content" },
  { n: 6, name: "Credentials", desc: "Client access" },
  { n: 7, name: "Review", desc: "Confirm & provision" },
  { n: 8, name: "Done", desc: "Live & handed over" },
];

const AdminOnboard = () => {
  const nav = useNavigate();
  const { saveDraft, completeDraft } = useOnboardingDraft();

  const [state, setState] = useState<WizardState>(initialState);
  const [step, setStep] = useState(1);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [savedAt, setSavedAt] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionSteps, setProvisionSteps] = useState<ProvisionStep[]>([]);
  const [provisionResults, setProvisionResults] = useState<ProvisionStep[]>([]);
  const [provisionedOrgId, setProvisionedOrgId] = useState<string | null>(null);

  // Clear validation error whenever the user edits any field
  useEffect(() => {
    setValidationError(null);
  }, [state]);

  // Navigation guard — warn before leaving mid-wizard
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const set = (patch: Partial<WizardState>) =>
    setState((s) => {
      const next = { ...s, ...patch };
      if (patch.branchCount !== undefined && patch.branchCount !== s.branches.length) {
        const target = patch.branchCount;
        if (target > s.branches.length) {
          const extra = Array.from({ length: target - s.branches.length }, (_, i) =>
            newBranch(s.branches.length + i, next.industry)
          );
          next.branches = [...s.branches, ...extra];
        } else {
          next.branches = s.branches.slice(0, target);
        }
      }
      if (patch.industry && patch.industry !== s.industry) {
        next.branches = next.branches.map((b) => ({
          ...b,
          labels: defaultLabelsByIndustry[patch.industry!],
        }));
      }
      return next;
    });

  const setBranch = (i: number, patch: Partial<Branch>) =>
    setState((s) => ({
      ...s,
      branches: s.branches.map((b, idx) => (idx === i ? { ...b, ...patch } : b)),
    }));

  const renameBranch = (i: number, name: string) => setBranch(i, { name });

  const validateStep = (s: number): { valid: boolean; error: string | null } => {
    if (s === 1) {
      if (state.companyName.trim().length < 2)
        return { valid: false, error: "Company name must be at least 2 characters." };
      if (state.slug.trim().length < 2)
        return { valid: false, error: "Slug must be at least 2 characters." };
      if (!/^[a-z0-9-]+$/.test(state.slug))
        return { valid: false, error: "Slug may only contain lowercase letters, numbers, and hyphens." };
      return { valid: true, error: null };
    }
    if (s === 3) {
      const active = state.branches.slice(0, state.branchCount);
      if (!active.every((b) => b.name.trim().length > 0))
        return { valid: false, error: "Every branch must have a name." };
      return { valid: true, error: null };
    }
    if (s === 4) {
      const active = state.branches.slice(0, state.branchCount);
      if (!active.every((b) => b.agentName.trim().length > 0))
        return { valid: false, error: "Every branch must have an agent name." };
      return { valid: true, error: null };
    }
    if (s === 6) {
      if (!/\S+@\S+\.\S+/.test(state.clientEmail))
        return { valid: false, error: "Please enter a valid email address." };
      return { valid: true, error: null };
    }
    return { valid: true, error: null };
  };

  const buildDraftData = (): Record<string, unknown> => ({
    step1: {
      name: state.companyName,
      slug: state.slug,
      industry: state.industry,
      branchCount: state.branchCount,
      implementationPaid: state.feePaid,
    },
    step2: {
      logoUrl: state.logoName,
      primaryColor: state.primaryColor,
      secondaryColor: state.secondaryColor,
    },
    step3: {
      branches: state.branches.slice(0, state.branchCount).map((b) => ({
        name: b.name,
        city: b.city,
        timezone: b.timezone,
        telephony: b.telephony,
      })),
    },
    step4: {
      agents: state.branches.slice(0, state.branchCount).map((b) => ({
        name: b.agentName,
        voice: b.voice,
        tone: b.tone,
        language: b.language,
      })),
    },
    step5: {
      knowledgeBase: state.branches.slice(0, state.branchCount).map((b) => ({
        files: b.files,
        crawlEnabled: b.crawlEnabled,
        crawlUrl: b.crawlUrl,
      })),
    },
    step6: { clientEmail: state.clientEmail },
  });

  const goto = (n: number) => {
    if (n < step) { setStep(n); return; }
    if (completed.has(n)) setStep(n);
  };

  const next = async () => {
    const { valid, error } = validateStep(step);
    if (!valid) { setValidationError(error); return; }
    setValidationError(null);
    const newStep = Math.min(8, step + 1);
    setCompleted((c) => new Set(c).add(step));
    setStep(newStep);
    setSaveStatus("saving");
    await saveDraft(step, buildDraftData());
    setSaveStatus("saved");
    setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  };

  const back = () => {
    setValidationError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const onProvision = async () => {
    const initial: ProvisionStep[] = [
      { id: "org",      label: "Creating organisation",       status: "idle" },
      { id: "branches", label: "Setting up branches",         status: "idle" },
      { id: "agents",   label: "Configuring AI agents",       status: "idle" },
      { id: "branding", label: "Saving brand configuration",  status: "idle" },
      { id: "users",    label: "Inviting branch users",       status: "idle" },
      { id: "phones",   label: "Setting up phone numbers",    status: "idle" },
      { id: "email",    label: "Sending welcome email",       status: "idle" },
    ];
    setProvisionSteps(initial);
    setIsProvisioning(true);

    // Mutable copy so we can update and batch-set state atomically at the end
    const steps: ProvisionStep[] = initial.map((s) => ({ ...s }));
    const mark = (id: string, status: ProvisionStatus, note?: string) => {
      const idx = steps.findIndex((s) => s.id === id);
      if (idx !== -1) steps[idx] = { ...steps[idx], status, note };
      setProvisionSteps([...steps]);
    };

    let orgId: string | null = null;

    // 1. Create organisation
    mark("org", "running");
    try {
      const org = await organisationApi.createOrganisation({
        name: state.companyName,
        slug: state.slug,
        industry: state.industry,
        plan: "trial",
      });
      orgId = org.id;
      setProvisionedOrgId(orgId);
      mark("org", "done");
    } catch {
      mark("org", "error", "Failed to create organisation");
      setIsProvisioning(false);
      return;
    }

    // 2. Create additional branches (branch 1 is auto-created with the org)
    mark("branches", "running");
    try {
      const extra = state.branches.slice(1, state.branchCount);
      for (const b of extra) {
        await organisationApi.createBranch(orgId!, {
          name: b.name,
          location: b.city || undefined,
          timezone: b.timezone,
        });
      }
      mark("branches", "done");
    } catch {
      mark("branches", "error", "Some branches could not be created");
    }

    // 3. Configure AI agents — update auto-created main agent, create agents for extra branches
    mark("agents", "running");
    try {
      const [fetchedBranches, fetchedAgents] = await Promise.all([
        organisationApi.getBranches(orgId!),
        organisationApi.getAgentsByOrg(orgId!),
      ]);

      const mainAgent = fetchedAgents[0];
      const b0 = state.branches[0];

      if (mainAgent && b0) {
        await organisationApi.updateAgent(mainAgent.id, {
          name: b0.agentName || 'Aria',
          tone: b0.tone,
          language: b0.language,
          escalation_contacts: b0.escalationContacts.map(({ name, phone, email }) => ({ name, phone, email })),
          response_time_config: {
            confirmation_hours: b0.confirmationHours ?? 2,
            callback_window_hours: b0.callbackHours ?? 1,
            after_hours_message: b0.afterHoursMessage || 'Our team is currently offline.',
          },
        });
      }

      const extraBranches = fetchedBranches.slice(1);
      for (let i = 0; i < extraBranches.length; i++) {
        const branch = extraBranches[i];
        const wb = state.branches[i + 1];
        await organisationApi.createAgent({
          branch_id: branch.id,
          name: wb?.agentName || 'Aria',
          tone: wb?.tone || 'professional',
          niche: state.industry,
        });
      }

      mark("agents", "done");
    } catch {
      mark("agents", "pending", "Agent configuration could not be completed — update after setup");
    }

    // 3b. Save branding config
    mark("branding", "running");
    try {
      await organisationApi.updateOrganisation(orgId!, {
        branding_config: {
          logo_url: null,
          primary_color: state.primaryColor ?? '#7A2535',
          secondary_color: state.secondaryColor ?? '#C4909A',
          font: 'Arial',
        },
      });
      mark("branding", "done");
    } catch {
      mark("branding", "pending", "Branding could not be saved — update after setup");
    }

    // 3c. Invite branch users
    mark("users", "running");
    try {
      const allUsers = state.branches
        .slice(0, state.branchCount)
        .flatMap((b) => b.users)
        .filter((u) => !!u.email);

      if (allUsers.length === 0) {
        mark("users", "done");
      } else {
        let failed = 0;
        for (const user of allUsers) {
          try {
            await apiClient.post('/api/auth/invite', {
              email: user.email,
              organisation_id: orgId,
              role: user.role,
            });
          } catch {
            failed++;
          }
        }
        if (failed > 0) {
          mark("users", "pending", `${failed} of ${allUsers.length} invite(s) could not be sent`);
        } else {
          mark("users", "done");
        }
      }
    } catch {
      mark("users", "pending", "Branch user invites could not be sent");
    }

    // 4. Phone numbers — pending (requires Twilio / Africa's Talking)
    mark("phones", "pending", "Requires Twilio / Africa's Talking setup");

    // 5. Send welcome email via invite endpoint
    mark("email", "running");
    try {
      await apiClient.post('/api/auth/invite', {
        email: state.clientEmail,
        organisation_id: orgId,
        role: 'org_admin',
      });
      mark("email", "done");
    } catch (err) {
      mark("email", "pending", "User created but welcome email may have failed");
      console.error('Invite error:', err);
    }

    // 6. Mark draft complete
    await completeDraft(orgId);

    setProvisionResults([...steps]);
    setCompleted((c) => new Set(c).add(7));
    setIsProvisioning(false);
    setStep(8);
  };

  const onAnother = () => {
    setState(initialState);
    setCompleted(new Set());
    setStep(1);
    setValidationError(null);
    setSaveStatus("idle");
    setProvisionResults([]);
    setProvisionedOrgId(null);
  };

  const stepNode = useMemo(() => {
    switch (step) {
      case 1: return <Step1Org state={state} set={set} />;
      case 2: return <Step2Branding state={state} set={set} />;
      case 3: return <Step3Branches state={state} setBranch={setBranch} renameBranch={renameBranch} />;
      case 4: return <Step4Agent state={state} setBranch={setBranch} />;
      case 5: return <Step5Knowledge state={state} setBranch={setBranch} />;
      case 6: return <Step6Credentials state={state} set={set} />;
      case 7: return <Step7Review state={state} goto={(s) => setStep(s)} onProvision={onProvision} />;
      default: return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, state]);

  return (
    <div className="min-h-screen flex bg-background text-foreground">

      {/* Provisioning overlay */}
      {isProvisioning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-lg">
            <h2 className="font-display text-2xl text-foreground mb-6">Provisioning workspace…</h2>
            <div className="space-y-4">
              {provisionSteps.map((s) => (
                <div key={s.id} className="flex items-start gap-3">
                  <div className="mt-0.5 h-5 w-5 flex items-center justify-center shrink-0">
                    {s.status === "running" && (
                      <Loader2 className="h-4 w-4 text-primary animate-spin" strokeWidth={1.5} />
                    )}
                    {s.status === "done" && (
                      <Check className="h-4 w-4 text-green-500" strokeWidth={2} />
                    )}
                    {s.status === "pending" && (
                      <Info className="h-4 w-4 text-yellow-500" strokeWidth={1.5} />
                    )}
                    {s.status === "error" && (
                      <X className="h-4 w-4 text-destructive" strokeWidth={1.5} />
                    )}
                    {s.status === "idle" && (
                      <div className="h-4 w-4 rounded-full border border-border" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={cn("text-sm", s.status === "idle" ? "text-muted-foreground" : "text-foreground")}>
                      {s.label}
                    </p>
                    {s.note && (
                      <p className="text-xs text-muted-foreground mt-0.5">{s.note}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Left: step indicator */}
      <aside className="hidden md:flex w-[320px] shrink-0 flex-col bg-sidebar border-r border-border">
        <div className="h-16 flex items-center gap-2 px-6 border-b border-border">
          <span className="font-display text-2xl tracking-tight text-foreground">nizam</span>
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-primary">Onboard</span>
        </div>

        <ol className="flex-1 px-3 py-6 space-y-1">
          {stepsMeta.map((s) => {
            const isCurrent = s.n === step;
            const isDone = completed.has(s.n) || s.n < step;
            const clickable = isDone || s.n < step;
            return (
              <li key={s.n}>
                <button
                  type="button"
                  onClick={() => clickable && goto(s.n)}
                  disabled={!clickable && !isCurrent}
                  className={cn(
                    "w-full flex items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-150 ease-nz",
                    isCurrent ? "bg-elevated" : "hover:bg-elevated",
                    !clickable && !isCurrent && "opacity-60 cursor-not-allowed"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[11px] nz-mono border",
                      isDone
                        ? "bg-primary border-primary text-primary-foreground"
                        : isCurrent
                          ? "border-primary text-primary"
                          : "border-border text-[hsl(var(--text-secondary))]"
                    )}
                  >
                    {isDone ? <Check className="h-3 w-3" strokeWidth={2} /> : s.n}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-sm", isCurrent ? "text-foreground" : "text-[hsl(var(--text-secondary))]")}>
                      {s.name}
                    </span>
                    <span className="block text-[11px] text-[hsl(var(--text-tertiary))] mt-0.5">{s.desc}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="border-t border-border px-6 py-4">
          <button
            onClick={() => {
              if (window.confirm("Your progress has been saved as a draft. You can continue later from the admin overview.")) {
                nav("/admin");
              }
            }}
            className="text-xs text-[hsl(var(--text-secondary))] hover:text-foreground transition-colors"
          >
            Exit wizard
          </button>
        </div>
      </aside>

      {/* Right: content */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 overflow-y-auto px-8 md:px-14 py-12 pb-32">
          <div className="max-w-4xl mx-auto animate-nz-fade-in">
            {step === 8 ? (
              <Step8Done
                state={state}
                onAnother={onAnother}
                provisionResults={provisionResults}
                organisationId={provisionedOrgId}
              />
            ) : stepNode}
          </div>
        </main>

        {/* Bottom bar — hidden on step 8 */}
        {step < 8 && (
          <footer className="border-t border-border bg-background sticky bottom-0">
            <div className="max-w-4xl mx-auto px-8 md:px-14 py-4 flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={back}
                disabled={step === 1}
                className="border-border bg-transparent hover:bg-elevated text-foreground gap-2 disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.5} /> Back
              </Button>

              {/* Centre: validation error or save status */}
              <div className="flex-1 flex items-center justify-center text-xs">
                {validationError ? (
                  <span className="text-destructive text-center">{validationError}</span>
                ) : saveStatus === "saving" ? (
                  <span className="inline-flex items-center gap-1.5 text-[hsl(var(--text-secondary))]">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose animate-pulse" />
                    Saving…
                  </span>
                ) : saveStatus === "saved" ? (
                  <span className="inline-flex items-center gap-1.5 text-[hsl(var(--text-secondary))]">
                    <CheckCircle2 className="h-3.5 w-3.5 text-rose" strokeWidth={1.5} />
                    Draft saved {savedAt && <span className="nz-mono">· {savedAt}</span>}
                  </span>
                ) : null}
              </div>

              {step < 7 ? (
                <Button
                  onClick={next}
                  disabled={!validateStep(step).valid}
                  className="bg-primary hover:bg-primary-hover text-primary-foreground gap-2 disabled:opacity-50"
                >
                  Next <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              ) : (
                <Button
                  onClick={onProvision}
                  className="bg-primary hover:bg-primary-hover text-primary-foreground gap-2"
                >
                  Provision <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              )}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
};

export default AdminOnboard;
