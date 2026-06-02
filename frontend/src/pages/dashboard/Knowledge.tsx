import { useState, useRef, useCallback } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, Upload, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store'
import { useBranches, useKnowledgeSources, useDeleteKnowledgeSource } from '@/hooks'
import { organisationApi } from '@/api'

const Knowledge = () => {
  const { organisationId, tenantOrgId, branchId: storeBranchId } = useAuthStore()
  const activeOrgId = tenantOrgId ?? organisationId ?? ''

  // Org-level users have null branchId — fetch branches and use the first
  const { data: branches } = useBranches(
    storeBranchId ? '' : activeOrgId
  )
  const resolvedBranchId = storeBranchId ?? branches?.[0]?.id ?? null

  const { data: sources, isLoading: sourcesLoading, refetch } =
    useKnowledgeSources(resolvedBranchId)
  const { mutate: deleteSource, isPending: deleting } =
    useDeleteKnowledgeSource()

  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResults, setUploadResults] = useState<Array<{
    filename: string
    chunksCreated: number
    error?: string
  }> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [crawlUrl, setCrawlUrl] = useState('')
  const [crawling, setCrawling] = useState(false)
  const [crawlResult, setCrawlResult] = useState<{
    pagesIndexed: number
    chunksCreated: number
    errors: string[]
  } | null>(null)

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (!resolvedBranchId) {
      toast.error('Branch not found — cannot upload')
      return
    }

    const fileArray = Array.from(files)
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
    ]
    const invalid = fileArray.filter(f => !allowed.includes(f.type))
    if (invalid.length > 0) {
      toast.error(`Unsupported file type: ${invalid.map(f => f.name).join(', ')}`)
      return
    }

    const tooBig = fileArray.filter(f => f.size > 10 * 1024 * 1024)
    if (tooBig.length > 0) {
      toast.error(`Files over 10MB: ${tooBig.map(f => f.name).join(', ')}`)
      return
    }

    try {
      setUploading(true)
      setUploadResults(null)
      const result = await organisationApi.uploadDocuments(resolvedBranchId, fileArray)
      setUploadResults(result.results)
      const succeeded = result.results.filter(r => !r.error).length
      if (succeeded === result.results.length) {
        toast.success(`${succeeded} file(s) indexed — ${result.totalChunks} chunks created`)
      } else {
        toast.warning(`${succeeded} of ${result.results.length} files indexed`)
      }
      void refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [resolvedBranchId, refetch])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  const handleDelete = (sourceUrl: string) => {
    if (!resolvedBranchId) return
    deleteSource(
      { branchId: resolvedBranchId, sourceUrl },
      {
        onSuccess: () => toast.success('Document removed from knowledge base'),
        onError: () => toast.error('Failed to remove document'),
      }
    )
  }

  const handleCrawl = async () => {
    if (!crawlUrl.trim() || !resolvedBranchId) return

    try {
      new URL(crawlUrl)
    } catch {
      toast.error('Please enter a valid URL including https://')
      return
    }

    try {
      setCrawling(true)
      setCrawlResult(null)
      const result = await organisationApi.crawlWebsite({
        url: crawlUrl,
        branchId: resolvedBranchId,
        maxPages: 10,
      })
      setCrawlResult(result)
      if (result.pagesIndexed > 0) {
        toast.success(
          `Crawled ${result.pagesIndexed} page(s) — ${result.chunksCreated} chunks indexed`
        )
        void refetch()
      } else {
        toast.warning('No pages could be indexed from that URL')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Crawl failed')
    } finally {
      setCrawling(false)
    }
  }

  const getFilenameFromUrl = (url: string) => url.replace('upload://', '')

  return (
    <>
      <PageHeader
        eyebrow="Knowledge base"
        title="Documents"
        description="Upload documents to train your AI agent. Only approved content is used to answer customer questions."
      />

      {/* Upload zone */}
      <div
        className={[
          'rounded-lg border-2 border-dashed p-10 text-center',
          'transition-colors duration-150 cursor-pointer mb-8',
          isDragging
            ? 'border-primary bg-[#7A253510]'
            : 'border-border hover:border-[hsl(var(--text-tertiary))]',
          uploading ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md"
          className="hidden"
          onChange={e => {
            if (e.target.files) void handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <Upload
          className="mx-auto mb-4 text-[hsl(var(--text-tertiary))]"
          size={32}
          strokeWidth={1.5}
        />
        {uploading ? (
          <p className="text-sm text-[hsl(var(--text-secondary))]">
            Uploading and indexing…
          </p>
        ) : (
          <>
            <p className="text-sm text-foreground font-medium mb-1">
              Drop files here or click to browse
            </p>
            <p className="text-xs text-[hsl(var(--text-tertiary))]">
              PDF, Word (.docx), or plain text — up to 10MB per file, 5 files at once
            </p>
          </>
        )}
      </div>

      {/* Upload results */}
      {uploadResults && (
        <div className="rounded-lg border border-border bg-surface p-4 mb-8 space-y-2">
          <p className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] font-medium mb-3">
            Upload results
          </p>
          {uploadResults.map(r => (
            <div key={r.filename} className="flex items-center gap-3 text-sm">
              {r.error ? (
                <AlertCircle size={14} strokeWidth={1.5} className="text-destructive shrink-0" />
              ) : (
                <CheckCircle2 size={14} strokeWidth={1.5} className="text-[#4CAF50] shrink-0" />
              )}
              <span className="text-foreground flex-1 truncate">{r.filename}</span>
              <span className="text-[hsl(var(--text-tertiary))] nz-mono">
                {r.error ? r.error : `${r.chunksCreated} chunks`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Website crawl */}
      <div className="rounded-lg border border-border bg-surface p-6 mb-8">
        <p className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] font-medium mb-1">
          Website crawl
        </p>
        <p className="text-xs text-[hsl(var(--text-tertiary))] mb-4">
          Index your website so the AI can answer questions about your content. Up to 10 pages crawled.
          Works best with standard websites (WordPress, Webflow, static sites). For React or app-based sites, upload content as a document instead.
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={crawlUrl}
            onChange={e => setCrawlUrl(e.target.value)}
            placeholder="https://yourwebsite.com"
            disabled={crawling}
            className="flex-1 bg-[#0A0A08] border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-[hsl(var(--text-tertiary))] outline-none focus:border-primary transition-colors duration-150 disabled:opacity-50"
          />
          <button
            onClick={() => void handleCrawl()}
            disabled={crawling || !crawlUrl.trim() || !resolvedBranchId}
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 shrink-0"
          >
            {crawling ? 'Crawling...' : 'Start crawl'}
          </button>
        </div>

        {crawling && (
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-3">
            Crawling pages — this may take up to 30 seconds...
          </p>
        )}

        {crawlResult && (
          <div className="mt-3 p-3 rounded-lg bg-elevated border border-border text-xs space-y-1">
            <p className="text-foreground">
              {crawlResult.pagesIndexed} page(s) indexed,{' '}
              {crawlResult.chunksCreated} chunks created
            </p>
            {crawlResult.errors.length > 0 && (
              <p className="text-[hsl(var(--text-tertiary))]">
                {crawlResult.errors.length} page(s) could not be crawled
              </p>
            )}
          </div>
        )}
      </div>

      {/* Indexed documents */}
      <div className="rounded-lg border border-border bg-surface">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] font-medium">
            Indexed documents
          </p>
          <p className="text-xs text-[hsl(var(--text-tertiary))]">
            {sources?.length ?? 0} source(s)
          </p>
        </div>

        {sourcesLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !sources || sources.length === 0 ? (
          <div className="p-10 text-center">
            <FileText
              size={32}
              strokeWidth={1.5}
              className="mx-auto mb-3 text-[hsl(var(--text-tertiary))]"
            />
            <p className="text-sm text-[hsl(var(--text-secondary))]">
              No documents indexed yet
            </p>
            <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1">
              Upload files above to build your knowledge base
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sources.map(source => (
              <div
                key={source.source_url}
                className="flex items-center gap-4 px-4 py-3 hover:bg-elevated transition-colors duration-150"
              >
                <FileText
                  size={16}
                  strokeWidth={1.5}
                  className="text-[hsl(var(--text-tertiary))] shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">
                    {getFilenameFromUrl(source.source_url)}
                  </p>
                  <p className="text-xs text-[hsl(var(--text-tertiary))]">
                    {source.chunk_count} chunk(s) indexed
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(source.source_url)}
                  disabled={deleting}
                  className="p-1.5 h-auto text-[hsl(var(--text-tertiary))] hover:text-destructive"
                  title="Remove from knowledge base"
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-[hsl(var(--text-tertiary))] text-center">
        Your AI agent only answers questions using content indexed here.
        Questions outside this knowledge base are escalated to your team.
      </p>
    </>
  )
}

export default Knowledge
