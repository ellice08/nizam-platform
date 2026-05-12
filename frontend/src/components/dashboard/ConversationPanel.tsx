import { useState } from 'react'
import {
  X, Phone, MessageSquare, MessageCircle,
  CheckCircle2, AlertCircle, PhoneCall,
  User, Bot, Plus, Check,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { formatDistanceToNow, format } from 'date-fns'
import { useConversation, useUpdateConversation } from '@/hooks'
import { useAuthStore } from '@/store'

interface ConversationPanelProps {
  conversationId: string | null
  onClose: () => void
}

const ConversationPanel = ({ conversationId, onClose }: ConversationPanelProps) => {
  const { data: conversation, isLoading } = useConversation(conversationId ?? '')
  const { mutate: updateConversation, isPending } = useUpdateConversation()
  const { user } = useAuthStore()

  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  const channelIcon = (channel: string) => {
    if (channel === 'voice') return <Phone size={14} strokeWidth={1.5} />
    if (channel === 'whatsapp') return <MessageCircle size={14} strokeWidth={1.5} />
    return <MessageSquare size={14} strokeWidth={1.5} />
  }

  const handleResolve = () => {
    if (!conversation) return
    updateConversation(
      {
        id: conversation.id,
        data: {
          resolved: !conversation.resolved,
          actioned_by: user?.id,
          actioned_at: new Date().toISOString(),
        },
      },
      {
        onSuccess: () => toast.success(
          conversation.resolved ? 'Marked as unresolved' : 'Marked as resolved'
        ),
        onError: () => toast.error('Failed to update'),
      }
    )
  }

  const handleMarkHandled = () => {
    if (!conversation) return
    updateConversation(
      {
        id: conversation.id,
        data: {
          requires_human: false,
          actioned_by: user?.id,
          actioned_at: new Date().toISOString(),
        },
      },
      {
        onSuccess: () => toast.success('Marked as handled'),
        onError: () => toast.error('Failed to update'),
      }
    )
  }

  const handleAddNote = () => {
    if (!newNote.trim() || !conversation) return
    const existingNotes = conversation.notes ?? []
    const updatedNotes = [
      ...existingNotes,
      {
        text: newNote.trim(),
        added_by: user?.email ?? 'Team member',
        added_at: new Date().toISOString(),
      },
    ]
    updateConversation(
      { id: conversation.id, data: { notes: updatedNotes } },
      {
        onSuccess: () => {
          setNewNote('')
          setAddingNote(false)
          toast.success('Note added')
        },
        onError: () => toast.error('Failed to add note'),
      }
    )
  }

  if (!conversationId) return null

  return (
    <div className="flex flex-col h-full bg-surface border-l border-border overflow-hidden">

      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          {!isLoading && conversation && (
            <>
              <span className="text-[hsl(var(--text-tertiary))]">
                {channelIcon(conversation.channel)}
              </span>
              <span className="text-sm font-medium text-foreground">
                {conversation.lead_name ?? 'Unknown'}
              </span>
              {conversation.resolved && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#0F1F0F] text-[#4CAF50] border border-[#4CAF50]/30">
                  Resolved
                </span>
              )}
              {conversation.requires_human && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#1A0F0F] text-[#F0C5CC] border border-[#F0C5CC]/30">
                  Needs attention
                </span>
              )}
            </>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded text-[hsl(var(--text-tertiary))] hover:text-foreground hover:bg-elevated transition-colors duration-150"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      {isLoading ? (
        <div className="p-5 space-y-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !conversation ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-[hsl(var(--text-secondary))]">Conversation not found</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">

          {/* Lead info */}
          <div className="px-5 py-4 border-b border-border space-y-2">
            <p className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] font-medium mb-3">
              Lead details
            </p>
            {[
              { label: 'Name',    value: conversation.lead_name },
              { label: 'Phone',   value: conversation.lead_phone },
              { label: 'Email',   value: conversation.lead_email },
              { label: 'Channel', value: conversation.channel },
              {
                label: 'Time',
                value: format(new Date(conversation.created_at), 'dd MMM yyyy, HH:mm'),
              },
            ].filter(r => r.value).map(row => (
              <div key={row.label} className="flex gap-3 text-sm">
                <span className="text-[hsl(var(--text-tertiary))] w-14 shrink-0">{row.label}</span>
                <span className="text-foreground">{row.value}</span>
              </div>
            ))}
          </div>

          {/* Niche fields */}
          {conversation.niche_fields && Object.keys(conversation.niche_fields).length > 0 && (
            <div className="px-5 py-4 border-b border-border">
              <p className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] font-medium mb-3">
                Captured details
              </p>
              <div className="space-y-2">
                {Object.entries(conversation.niche_fields).map(([key, value]) => (
                  <div key={key} className="flex gap-3 text-sm">
                    <span className="text-[hsl(var(--text-tertiary))] w-28 shrink-0 capitalize">
                      {key.replace(/_/g, ' ')}
                    </span>
                    <span className="text-foreground">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transcript */}
          <div className="px-5 py-4 border-b border-border">
            <p className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] font-medium mb-4">
              Conversation
            </p>
            {!conversation.messages || conversation.messages.length === 0 ? (
              <p className="text-sm text-[hsl(var(--text-tertiary))]">No messages recorded</p>
            ) : (
              <div className="space-y-3">
                {conversation.messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="h-6 w-6 rounded-full bg-elevated border border-border flex items-center justify-center shrink-0 mt-0.5">
                        <Bot size={12} strokeWidth={1.5} className="text-[hsl(var(--text-secondary))]" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-primary/20 text-foreground border border-primary/30'
                          : 'bg-elevated text-foreground border border-border'
                      }`}
                    >
                      {msg.content}
                    </div>
                    {msg.role === 'user' && (
                      <div className="h-6 w-6 rounded-full bg-elevated border border-border flex items-center justify-center shrink-0 mt-0.5">
                        <User size={12} strokeWidth={1.5} className="text-[hsl(var(--text-secondary))]" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recording */}
          {conversation.recording_url && (
            <div className="px-5 py-4 border-b border-border">
              <p className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] font-medium mb-3">
                Recording
              </p>
              <audio controls src={conversation.recording_url} className="w-full h-10" />
            </div>
          )}

          {/* Actions */}
          <div className="px-5 py-4 border-b border-border">
            <p className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] font-medium mb-3">
              Actions
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={conversation.resolved ? 'outline' : 'default'}
                onClick={handleResolve}
                disabled={isPending}
                className={conversation.resolved
                  ? 'border-border text-[hsl(var(--text-secondary))]'
                  : 'bg-primary hover:bg-primary-hover text-primary-foreground'
                }
              >
                <CheckCircle2 size={13} strokeWidth={1.5} className="mr-1.5" />
                {conversation.resolved ? 'Mark unresolved' : 'Mark resolved'}
              </Button>

              {conversation.requires_human && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleMarkHandled}
                  disabled={isPending}
                  className="border-[#F0C5CC]/40 text-[#F0C5CC] hover:bg-[#1A0F0F]"
                >
                  <AlertCircle size={13} strokeWidth={1.5} className="mr-1.5" />
                  Mark handled
                </Button>
              )}

              {conversation.callback_requested && !conversation.callback_completed && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    updateConversation(
                      { id: conversation.id, data: { callback_completed: true } },
                      { onSuccess: () => toast.success('Callback marked complete') }
                    )
                  }
                  disabled={isPending}
                  className="border-border text-[hsl(var(--text-secondary))]"
                >
                  <PhoneCall size={13} strokeWidth={1.5} className="mr-1.5" />
                  Mark callback done
                </Button>
              )}
            </div>

            {conversation.actioned_by && conversation.actioned_at && (
              <p className="text-xs text-[hsl(var(--text-tertiary))] mt-3">
                Actioned {formatDistanceToNow(new Date(conversation.actioned_at), { addSuffix: true })}
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] font-medium">
                Notes
              </p>
              <button
                onClick={() => setAddingNote(true)}
                className="text-xs text-[hsl(var(--text-secondary))] hover:text-foreground flex items-center gap-1 transition-colors duration-150"
              >
                <Plus size={12} strokeWidth={1.5} />
                Add note
              </button>
            </div>

            {addingNote && (
              <div className="mb-3">
                <textarea
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="Add a note about this conversation…"
                  rows={3}
                  className="w-full bg-[#0A0A08] border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-[hsl(var(--text-tertiary))] resize-none outline-none focus:border-primary transition-colors duration-150"
                  autoFocus
                />
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    onClick={handleAddNote}
                    disabled={!newNote.trim() || isPending}
                    className="bg-primary hover:bg-primary-hover text-primary-foreground"
                  >
                    <Check size={12} strokeWidth={1.5} className="mr-1" />
                    Save note
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAddingNote(false)
                      setNewNote('')
                    }}
                    className="border-border text-[hsl(var(--text-secondary))]"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {!conversation.notes || conversation.notes.length === 0 ? (
              <p className="text-sm text-[hsl(var(--text-tertiary))]">No notes yet</p>
            ) : (
              <div className="space-y-3">
                {conversation.notes.map((note, i) => (
                  <div key={i} className="bg-elevated rounded-lg p-3 border border-border">
                    <p className="text-sm text-foreground leading-relaxed">{note.text}</p>
                    <p className="text-xs text-[hsl(var(--text-tertiary))] mt-2">
                      {note.added_by} · {formatDistanceToNow(new Date(note.added_at), { addSuffix: true })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

export default ConversationPanel
