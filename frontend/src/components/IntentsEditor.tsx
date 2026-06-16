import { Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgentIntent, IntentField } from '@/api'

interface Props {
  value: AgentIntent[]
  onChange: (next: AgentIntent[]) => void
}

function slugifyKey(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

// Each item in the editor carries a stable _tmpId so React keys never change on typing.
type EditorIntent = AgentIntent & { _tmpId: string }

function wrap(intents: AgentIntent[]): EditorIntent[] {
  return intents.map(i => ({ ...i, _tmpId: i.id ?? crypto.randomUUID() }))
}

function unwrap(intents: EditorIntent[]): AgentIntent[] {
  return intents.map(({ _tmpId, ...rest }) => rest)
}

export function IntentsEditor({ value, onChange }: Props) {
  const items: EditorIntent[] = value.map(i =>
    '_tmpId' in i ? (i as EditorIntent) : { ...i, _tmpId: i.id ?? crypto.randomUUID() }
  )

  const update = (next: EditorIntent[]) => onChange(unwrap(next))

  const addIntent = () => {
    const tmp: EditorIntent = {
      _tmpId: crypto.randomUUID(),
      key: '',
      label: '',
      description: '',
      fields: [],
      enabled: true,
    }
    update([...items, tmp])
  }

  const removeIntent = (tmpId: string) => update(items.filter(i => i._tmpId !== tmpId))

  const patchIntent = (tmpId: string, patch: Partial<AgentIntent>) => {
    update(items.map(i => i._tmpId === tmpId ? { ...i, ...patch } : i))
  }

  const handleLabelChange = (item: EditorIntent, newLabel: string) => {
    const prevDerived = slugifyKey(item.label)
    const autoKey = item.key === '' || item.key === prevDerived
    patchIntent(item._tmpId, {
      label: newLabel,
      ...(autoKey ? { key: slugifyKey(newLabel) } : {}),
    })
  }

  const handleKeyChange = (item: EditorIntent, rawKey: string) => {
    patchIntent(item._tmpId, { key: rawKey.toLowerCase().replace(/[^a-z0-9_]/g, '') })
  }

  const addField = (tmpId: string, fields: IntentField[]) => {
    patchIntent(tmpId, { fields: [...fields, { key: '', label: '', required: false }] })
  }

  const patchField = (tmpId: string, fields: IntentField[], idx: number, patch: Partial<IntentField>) => {
    const next = fields.map((f, i) => i === idx ? { ...f, ...patch } : f)
    patchIntent(tmpId, { fields: next })
  }

  const handleFieldLabelChange = (tmpId: string, fields: IntentField[], idx: number, newLabel: string) => {
    const prevDerived = slugifyKey(fields[idx]?.label ?? '')
    const autoKey = !fields[idx]?.key || fields[idx].key === prevDerived
    patchField(tmpId, fields, idx, {
      label: newLabel,
      ...(autoKey ? { key: slugifyKey(newLabel) } : {}),
    })
  }

  const removeField = (tmpId: string, fields: IntentField[], idx: number) => {
    patchIntent(tmpId, { fields: fields.filter((_, i) => i !== idx) })
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[hsl(var(--text-tertiary))]">
        General hand-offs are always handled automatically — you don't need to add a 'general' intent.
      </p>

      {items.length === 0 && (
        <p className="text-xs text-[hsl(var(--text-secondary))]">
          No intents configured. Add one to teach the agent how to handle specific customer actions.
        </p>
      )}

      {items.map((item) => (
        <div key={item._tmpId} className="rounded-lg border border-border bg-card p-4 space-y-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1">
                  Label
                </label>
                <input
                  className="nz-input h-9 w-full"
                  placeholder="e.g. Book a tour"
                  value={item.label}
                  onChange={e => handleLabelChange(item, e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1">
                  Key <span className="normal-case tracking-normal opacity-60">— machine identifier</span>
                </label>
                <input
                  className={cn('nz-input nz-mono h-9 w-full text-xs')}
                  placeholder="book_a_tour"
                  value={item.key}
                  onChange={e => handleKeyChange(item, e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => removeIntent(item._tmpId)}
              className="mt-5 h-9 w-9 shrink-0 rounded-md border border-border text-[hsl(var(--text-secondary))] hover:text-destructive hover:border-destructive/50 transition-colors flex items-center justify-center"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1">
              Description <span className="normal-case tracking-normal opacity-60">— optional, when does this apply?</span>
            </label>
            <input
              className="nz-input h-9 w-full"
              placeholder="e.g. Customer wants to schedule a property viewing"
              value={item.description ?? ''}
              onChange={e => patchIntent(item._tmpId, { description: e.target.value })}
            />
          </div>

          {/* Fields */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
              Fields to collect
            </label>
            <div className="space-y-2">
              {(item.fields ?? []).map((field, fi) => (
                <div key={fi} className="flex items-center gap-2">
                  <input
                    className="nz-input h-8 flex-1 text-sm"
                    placeholder="Field label (e.g. Property)"
                    value={field.label}
                    onChange={e => handleFieldLabelChange(item._tmpId, item.fields, fi, e.target.value)}
                  />
                  <input
                    className="nz-input nz-mono h-8 w-32 text-xs"
                    placeholder="field_key"
                    value={field.key}
                    onChange={e => patchField(item._tmpId, item.fields, fi, {
                      key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                    })}
                  />
                  <label className="flex items-center gap-1 text-xs text-[hsl(var(--text-secondary))] shrink-0 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={field.required ?? false}
                      onChange={e => patchField(item._tmpId, item.fields, fi, { required: e.target.checked })}
                    />
                    Req
                  </label>
                  <button
                    type="button"
                    onClick={() => removeField(item._tmpId, item.fields, fi)}
                    className="h-8 w-8 shrink-0 rounded-md border border-border text-[hsl(var(--text-secondary))] hover:text-destructive hover:border-destructive/50 transition-colors flex items-center justify-center"
                  >
                    <X className="h-3 w-3" strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => addField(item._tmpId, item.fields)}
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-[hsl(var(--text-secondary))] hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> Add field
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addIntent}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-transparent hover:bg-elevated text-foreground px-3 py-2 text-sm transition-colors duration-150"
      >
        <Plus className="h-4 w-4" strokeWidth={1.5} /> Add intent
      </button>
    </div>
  )
}

export default IntentsEditor
