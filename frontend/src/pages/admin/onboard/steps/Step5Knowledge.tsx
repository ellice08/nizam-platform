import { useRef, useState } from "react";
import { UploadCloud, FileText, X } from "lucide-react";
import { Field, SectionTitle, StepHeader, Toggle } from "./shared";
import { BranchTabs } from "./BranchTabs";
import type { Branch, WizardState } from "../types";

type Props = { state: WizardState; setBranch: (i: number, patch: Partial<Branch>) => void };

export const Step5Knowledge = ({ state, setBranch }: Props) => {
  const [active, setActive] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const b = state.branches[active];
  if (!b) return null;

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).map((f) => ({ id: `f${Date.now()}-${f.name}`, name: f.name, size: `${Math.round(f.size / 1024)} KB` }));
    setBranch(active, { files: [...b.files, ...next] });
  };

  const setLabel = (i: number, v: string) => {
    const labels = [...b.labels] as Branch["labels"];
    labels[i] = v;
    setBranch(active, { labels });
  };

  return (
    <>
      <StepHeader step={5} title="Load the knowledge base" description="The AI only answers from approved content." />
      <BranchTabs branches={state.branches} active={active} onActive={setActive} />

      <div className="space-y-8 max-w-3xl">
        <section>
          <button type="button" onClick={() => fileInput.current?.click()}
            className="w-full rounded-lg border border-dashed border-border bg-surface hover:bg-elevated transition-colors duration-150 ease-nz py-12 flex flex-col items-center">
            <UploadCloud className="h-8 w-8 text-[hsl(var(--text-tertiary))]" strokeWidth={1.5} />
            <p className="mt-3 text-sm text-foreground">Upload PDFs, Word documents, or text files</p>
            <p className="mt-1 text-xs text-[hsl(var(--text-secondary))]">The AI will only answer from this content</p>
          </button>
          <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />

          {b.files.length > 0 && (
            <div className="mt-4 rounded-lg border border-border bg-surface divide-y divide-border">
              {b.files.map((f) => (
                <div key={f.id} className="flex items-center gap-3 px-5 py-3">
                  <FileText className="h-4 w-4 text-[hsl(var(--text-secondary))]" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{f.name}</p>
                    <p className="text-xs text-[hsl(var(--text-tertiary))] nz-mono">{f.size}</p>
                  </div>
                  <button type="button" onClick={() => setBranch(active, { files: b.files.filter((x) => x.id !== f.id) })}
                    className="h-8 w-8 rounded-md text-[hsl(var(--text-secondary))] hover:text-foreground hover:bg-elevated flex items-center justify-center transition-colors duration-150 ease-nz">
                    <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionTitle>Website crawl</SectionTitle>
          <div className="space-y-4">
            <Toggle checked={b.crawlEnabled} onChange={(v) => setBranch(active, { crawlEnabled: v })} label="Also crawl their website" />
            {b.crawlEnabled && (
              <div className="grid md:grid-cols-[1fr_220px] gap-4">
                <Field label="Website URL">
                  <input className="nz-input nz-mono" value={b.crawlUrl} onChange={(e) => setBranch(active, { crawlUrl: e.target.value })} placeholder="https://clientwebsite.com" />
                </Field>
                <Field label="Frequency">
                  <select className="nz-input" value={b.crawlFrequency} onChange={(e) => setBranch(active, { crawlFrequency: e.target.value as Branch["crawlFrequency"] })}>
                    <option value="ondemand">On demand only</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </Field>
                <p className="md:col-span-2 text-xs text-[hsl(var(--text-tertiary))]">
                  Select which pages to index after the crawl completes.
                </p>
              </div>
            )}
          </div>
        </section>

        <section>
          <SectionTitle>Customise dashboard labels</SectionTitle>
          <p className="text-xs text-[hsl(var(--text-secondary))] -mt-2 mb-4">These appear in the client's analytics.</p>
          <div className="grid md:grid-cols-2 gap-4">
            {b.labels.map((label, i) => (
              <Field key={i} label={`Label ${i + 1}`}>
                <input className="nz-input" value={label} onChange={(e) => setLabel(i, e.target.value)} />
              </Field>
            ))}
          </div>
        </section>
      </div>
    </>
  );
};

export default Step5Knowledge;
