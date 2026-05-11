import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/nizam/Badge";
import { UploadCloud, FileText, Globe } from "lucide-react";
import { toast } from 'sonner'
import { useAuthStore } from '@/store'
import { useOrganisation } from '@/hooks'

const Knowledge = () => {
  const { organisationId } = useAuthStore()
  const { data: org } = useOrganisation(organisationId ?? '')

  const handleUploadClick = () => {
    toast.info(
      'Knowledge base upload coming soon. Contact your Ellice Systems administrator to update your knowledge base.'
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Library"
        title="Knowledge base"
        description={
          org
            ? `Knowledge base for ${org.name}.`
            : 'The agent only answers from the content you approve here.'
        }
      />

      {/* Upload zone */}
      <section className="mb-10">
        <div
          onClick={handleUploadClick}
          className="rounded-lg border border-dashed border-border bg-surface px-8 py-12 flex flex-col items-center text-center cursor-pointer hover:bg-elevated transition-colors duration-150 ease-nz"
        >
          <UploadCloud className="h-8 w-8 text-[hsl(var(--text-tertiary))]" strokeWidth={1.5} />
          <p className="mt-4 text-foreground">Drop files here, or click to upload</p>
          <p className="mt-1 text-xs text-[hsl(var(--text-secondary))]">PDF, DOCX, TXT — up to 25MB each</p>
          <div className="mt-4 flex items-center gap-2">
            {["PDF", "DOCX", "TXT", "MD"].map((t) => (
              <Badge key={t} variant="neutral">{t}</Badge>
            ))}
          </div>
        </div>
      </section>

      {/* Documents list */}
      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium mb-4">
          Indexed documents
        </h2>
        <div className="rounded-lg border border-border bg-surface py-16 flex flex-col items-center text-center">
          <FileText className="h-8 w-8 text-[hsl(var(--text-tertiary))]" strokeWidth={1.5} />
          <p className="mt-3 text-sm text-[hsl(var(--text-secondary))]">No documents indexed yet.</p>
          <p className="mt-1 text-xs text-[hsl(var(--text-tertiary))] max-w-sm">
            Your knowledge base will appear here once documents are uploaded by your administrator.
          </p>
        </div>
      </section>

      {/* Website crawl */}
      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium mb-4">
          Website crawl
        </h2>
        <div className="rounded-lg border border-border bg-surface p-6 flex flex-col md:flex-row md:items-start gap-4">
          <Globe className="h-5 w-5 text-[hsl(var(--text-secondary))] shrink-0 mt-1" strokeWidth={1.5} />
          <div className="flex-1">
            <label className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))]">Source URL</label>
            <input
              placeholder="https://yourwebsite.com"
              className="nz-input mt-2 opacity-50 cursor-not-allowed"
              disabled
            />
            <p className="mt-2 text-xs text-[hsl(var(--text-tertiary))]">
              Website crawling is configured during setup.
            </p>
          </div>
        </div>
      </section>
    </>
  );
};

export default Knowledge;
