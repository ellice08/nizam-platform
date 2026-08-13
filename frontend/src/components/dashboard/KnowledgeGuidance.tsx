import { useState } from 'react'
import { Download, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Guidance panel above the Knowledge uploader. Poor document structure is the
// documented root cause of bad agent answers (CLAUDE.md §4), so the three
// rules are ALWAYS visible; the worked examples and caveats sit behind
// "Show more" to keep the uploader itself above the fold.
export function KnowledgeGuidance({ defaultExpanded = false }: { defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="rounded-lg border border-border bg-surface px-5 py-4">
      <h3 className="text-sm font-medium text-foreground">
        Writing knowledge your agent can actually use
      </h3>

      <p className="text-xs text-[hsl(var(--text-secondary))] leading-relaxed mt-2">
        Your agent can only state facts that are written explicitly in your knowledge. How you
        structure a document matters as much as what's in it.
      </p>

      <ol className="mt-3 space-y-1.5 text-xs text-[hsl(var(--text-secondary))] leading-relaxed">
        <li>
          <span className="text-foreground font-medium">1. One item per block.</span>{' '}
          Give each product, service, price, or policy its own short block.
        </li>
        <li>
          <span className="text-foreground font-medium">2. Separate blocks with a blank line.</span>{' '}
          This is how your agent splits knowledge into retrievable pieces — blocks run together
          become one confusing piece.
        </li>
        <li>
          <span className="text-foreground font-medium">3. Repeat the context in every block.</span>{' '}
          Write "Marina — 3-bedroom apartment at Hutu Orchards, Abuja", not "Marina" under a
          heading. Each block has to make sense on its own.
        </li>
      </ol>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Button
          size="sm"
          variant="outline"
          asChild
          className="border-border text-[hsl(var(--text-secondary))]"
        >
          <a href="/nizam-knowledge-template.txt" download="nizam-knowledge-template.txt">
            <Download className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />
            Download the template
          </a>
        </Button>
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 text-xs text-[hsl(var(--text-secondary))] hover:text-foreground transition-colors duration-150"
        >
          {expanded
            ? <><ChevronUp className="h-3.5 w-3.5" strokeWidth={1.5} /> Hide example</>
            : <><ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} /> See a full example</>
          }
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] font-medium mb-2">
              Good example
            </p>
            <pre className="nz-mono text-[11px] bg-background border border-border rounded-md p-3 overflow-x-auto text-[hsl(var(--text-secondary))] whitespace-pre">
{`Marina — 3-Bedroom Apartment at Hutu Orchards
Project: Hutu Orchards, Airport Road, Abuja
Price: ₦77,805,000
Size: 900 SQM. 3 bedrooms, 4 bathrooms, 2 parking spaces.
Status: Available

Brook — 2-Bedroom Apartment at Hutu Orchards
Project: Hutu Orchards, Airport Road, Abuja
Price: ₦64,837,000
...`}
            </pre>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] font-medium mb-2">
              Poor example
            </p>
            <pre className="nz-mono text-[11px] bg-background border border-border rounded-md p-3 overflow-x-auto text-[hsl(var(--text-secondary))] whitespace-pre">
{`OUR PROPERTIES
We have a range of beautiful homes including Marina, Brook and Tide,
with prices from ₦30M, set in our flagship estate...`}
            </pre>
            <p className="text-xs text-[hsl(var(--text-secondary))] leading-relaxed mt-2">
              Why it fails: the prices aren't attached to specific items, everything sits in one
              block, and "Marina" only makes sense if you already read the heading above it.
            </p>
          </div>

          <p className="text-xs text-[hsl(var(--text-secondary))] leading-relaxed">
            <span className="text-foreground font-medium">If two items share a name,</span> state
            each one fully and add a line making the difference explicit: "There are two units named
            Tide: one at Hutu Orchards (350 SQM, ₦30,257,000) and one at Monrovia Orchards (400 SQM,
            ₦46,200,000)." Your agent will ask the customer which one they mean rather than guessing.
          </p>

          <p className="text-xs text-[hsl(var(--text-secondary))] leading-relaxed">
            <span className="text-foreground font-medium">File format.</span> Plain text (.txt) or
            Word (.docx) work best. PDFs are accepted, but PDF text extraction can merge or reflow
            your layout — if you have the choice, upload plain text.
          </p>

          <p className="text-xs text-[hsl(var(--text-secondary))] leading-relaxed">
            <span className="text-foreground font-medium">Keep it current.</span> If a price
            changes, update the block and re-upload — then delete the old document. Two documents
            with conflicting facts will produce inconsistent answers.
          </p>
        </div>
      )}
    </div>
  )
}

export default KnowledgeGuidance
