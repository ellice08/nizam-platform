import { useState } from "react";
import { Phone, Star, Smartphone, Hash, Plus, Trash2, Info } from "lucide-react";
import { Field, OptionCard, SectionTitle, StepHeader } from "./shared";
import { BranchTabs } from "./BranchTabs";
import type { AgentRole, Branch, BranchUser, TelephonyMode, WhatsappMode, WizardState } from "../types";

type Props = { state: WizardState; setBranch: (i: number, patch: Partial<Branch>) => void; renameBranch: (i: number, name: string) => void; };

export const Step3Branches = ({ state, setBranch, renameBranch }: Props) => {
  const [active, setActive] = useState(0);
  const branch = state.branches[active];
  if (!branch) return null;

  const setUsers = (us: BranchUser[]) => setBranch(active, { users: us });

  return (
    <>
      <StepHeader step={3} title="Configure branches" description="Set up each location separately." />

      <BranchTabs branches={state.branches} active={active} onActive={setActive} onRename={renameBranch} editable />

      <div className="space-y-8 max-w-3xl">
        <div className="grid md:grid-cols-2 gap-5">
          <Field label="Branch name" required>
            <input className="nz-input" value={branch.name} onChange={(e) => setBranch(active, { name: e.target.value })} />
          </Field>
          <Field label="City / location">
            <input className="nz-input" value={branch.city} onChange={(e) => setBranch(active, { city: e.target.value })} placeholder="Lagos, Nigeria" />
          </Field>
          <Field label="Timezone">
            <select className="nz-input" value={branch.timezone} onChange={(e) => setBranch(active, { timezone: e.target.value })}>
              <option>Africa/Lagos</option>
              <option>Africa/Accra</option>
              <option>Africa/Nairobi</option>
              <option>Europe/London</option>
              <option>America/New_York</option>
            </select>
          </Field>
        </div>

        <section>
          <div className="flex items-center gap-2 mb-1">
            <SectionTitle>Telephony</SectionTitle>
            <Info className="h-3 w-3 text-[hsl(var(--text-tertiary))] -mt-3" strokeWidth={1.5} />
          </div>
          <p className="text-xs text-[hsl(var(--text-secondary))] -mt-2 mb-4">
            How will customers reach this branch by phone?
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <OptionCard icon={Phone} title="New standard number" description="We provision a new Twilio number for you" tag="Simplest"
              selected={branch.telephony === "new_standard"} onClick={() => setBranch(active, { telephony: "new_standard" })} />
            <OptionCard icon={Star} title="New vanity number" description="Get a memorable 0700 number from a Nigerian operator" tag="Marketing friendly"
              selected={branch.telephony === "new_vanity"} onClick={() => setBranch(active, { telephony: "new_vanity" as TelephonyMode })} />
            <OptionCard icon={Smartphone} title="Existing SIM / billboard number" description="Keep your existing MTN or Airtel number" tag="No disruption"
              selected={branch.telephony === "existing_sim"} onClick={() => setBranch(active, { telephony: "existing_sim" })} />
            <OptionCard icon={Hash} title="Existing vanity number" description="You already have a 0700 number" tag="Already have one"
              selected={branch.telephony === "existing_vanity"} onClick={() => setBranch(active, { telephony: "existing_vanity" })} />
          </div>

          {branch.telephony === "new_vanity" && (
            <div className="mt-4 max-w-md">
              <Field label="Operator name">
                <input className="nz-input" value={branch.vanityOperator ?? ""} onChange={(e) => setBranch(active, { vanityOperator: e.target.value })} placeholder="MTN, Airtel, ..." />
              </Field>
            </div>
          )}
          {branch.telephony === "existing_sim" && (
            <div className="mt-4 max-w-md">
              <Field label="Existing number">
                <input className="nz-input nz-mono" value={branch.existingNumber ?? ""} onChange={(e) => setBranch(active, { existingNumber: e.target.value })} placeholder="+234 ..." />
              </Field>
            </div>
          )}
          {branch.telephony === "existing_vanity" && (
            <div className="mt-4 grid md:grid-cols-2 gap-4 max-w-xl">
              <Field label="Vanity number"><input className="nz-input nz-mono" value={branch.vanityNumber ?? ""} onChange={(e) => setBranch(active, { vanityNumber: e.target.value })} placeholder="0700 ..." /></Field>
              <Field label="Operator name"><input className="nz-input" value={branch.vanityOperator ?? ""} onChange={(e) => setBranch(active, { vanityOperator: e.target.value })} /></Field>
            </div>
          )}
        </section>

        <section>
          <SectionTitle>WhatsApp</SectionTitle>
          <div className="grid md:grid-cols-2 gap-3">
            <OptionCard icon={Phone} title="Dedicated AI number (recommended)" description="New WhatsApp number just for AI enquiries. Your existing WhatsApp is unaffected." tag="Recommended"
              selected={branch.whatsapp === "dedicated"} onClick={() => setBranch(active, { whatsapp: "dedicated" as WhatsappMode })} />
            <OptionCard icon={Smartphone} title="Migrate existing number" description="Move your existing WhatsApp to the AI system" tag="Advanced"
              selected={branch.whatsapp === "migrate"} onClick={() => setBranch(active, { whatsapp: "migrate" })} />
          </div>
        </section>

        <section>
          <SectionTitle>Users</SectionTitle>
          <p className="text-xs text-[hsl(var(--text-secondary))] -mt-2 mb-4">
            Add users for this branch. 2 users included. Additional users billed separately.
          </p>
          <div className="space-y-2">
            {branch.users.map((u) => (
              <div key={u.id} className="grid grid-cols-[1fr_1fr_180px_auto] gap-2 items-center">
                <input className="nz-input h-9" placeholder="Name" value={u.name}
                  onChange={(e) => setUsers(branch.users.map((x) => x.id === u.id ? { ...x, name: e.target.value } : x))} />
                <input className="nz-input h-9" placeholder="Email" value={u.email}
                  onChange={(e) => setUsers(branch.users.map((x) => x.id === u.id ? { ...x, email: e.target.value } : x))} />
                <select className="nz-input h-9" value={u.role}
                  onChange={(e) => setUsers(branch.users.map((x) => x.id === u.id ? { ...x, role: e.target.value as AgentRole } : x))}>
                  <option value="org_admin">Org Admin</option>
                  <option value="branch_admin">Branch Admin</option>
                  <option value="branch_staff">Branch Staff</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button type="button" onClick={() => setUsers(branch.users.filter((x) => x.id !== u.id))}
                  className="h-9 w-9 rounded-md border border-border text-[hsl(var(--text-secondary))] hover:text-primary-subtle hover:border-primary transition-colors duration-150 ease-nz flex items-center justify-center">
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setUsers([...branch.users, { id: `u${Date.now()}`, name: "", email: "", role: "branch_staff" }])}
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-transparent hover:bg-elevated text-foreground px-3 py-2 text-sm transition-colors duration-150 ease-nz">
            <Plus className="h-4 w-4" strokeWidth={1.5} /> Add user
          </button>
        </section>
      </div>
    </>
  );
};

export default Step3Branches;
