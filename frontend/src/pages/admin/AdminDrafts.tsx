import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { formatDistanceToNow } from "date-fns"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { FileText, Trash2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"

type Draft = {
  id: string
  step_completed: number
  draft_data: Record<string, unknown>
  status: string
  last_saved_at: string
  created_at: string
}

const AdminDrafts = () => {
  const navigate = useNavigate()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDrafts = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('onboarding_drafts')
        .select('*')
        .eq('status', 'in_progress')
        .order('last_saved_at', { ascending: false })
      if (error) throw error
      setDrafts((data ?? []) as Draft[])
    } catch {
      toast.error('Failed to load drafts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchDrafts() }, [])

  const handleDelete = async (id: string) => {
    try {
      await supabase.from('onboarding_drafts').delete().eq('id', id)
      toast.success('Draft deleted')
      void fetchDrafts()
    } catch {
      toast.error('Failed to delete draft')
    }
  }

  const draftName = (d: Draft): string => {
    const step1 = d.draft_data?.step1 as { name?: string } | undefined
    return step1?.name || 'Untitled draft'
  }

  return (
    <>
      <PageHeader
        eyebrow="Clients"
        title="Onboarding drafts"
        description="Resume incomplete client onboarding sessions."
      />

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : drafts.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-6 py-10 text-center text-muted-foreground">
          No saved drafts. Start onboarding a client and your progress will be saved here.
        </div>
      ) : (
        <div className="space-y-2">
          {drafts.map((d) => (
            <div key={d.id}
              className="flex items-center gap-4 rounded-lg border border-border bg-card px-6 py-4">
              <div className="h-10 w-10 rounded-md border border-border bg-muted/30 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{draftName(d)}</p>
                <p className="text-xs text-muted-foreground">
                  Step {d.step_completed} of 7 · saved {formatDistanceToNow(new Date(d.last_saved_at), { addSuffix: true })}
                </p>
              </div>
              <Button variant="outline" size="sm"
                onClick={() => navigate(`/admin/onboard?draft=${d.id}`)}>
                Resume
              </Button>
              <button
                onClick={() => void handleDelete(d.id)}
                className="h-9 w-9 rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors flex items-center justify-center"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export default AdminDrafts
