import { useRef } from 'react'
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

export function IntentsEditor({ value, onChange }: Props) {
  // WeakMap gives each AgentIntent object a stable string key that persists across
  // renders. Server rows use their `id`; new (unsaved) rows use a uuid assigned once
  // at creation time and carried forward via replaceRow.
  const keyMap = useRef(new WeakMap<object, string>())

  const keyFor = (intent: AgentIntent): string => {
    if (intent.id) return intent.id
    let k = keyMap.current.get(intent)
    if (!k) { k = crypto.randomUUID(); keyMap.current.set(intent, k) }
    return k
  }

  // Immutably replace the matching row, carrying its stable key to the new object
  // so keyFor(newObj) returns the same key and React preserves the DOM node (focus).
  const replaceRow = (key: string, transform: (i: AgentIntent) => AgentIntent) => {
    const next = value.map(i => {
      if (keyFor(i) !== key) return i
      const updated = transform(i)
      keyMap.current.set(updated, key)
      return updated
    })
    onChange(next)
  }

  const addIntent = () => {
    const fresh: AgentIntent = { key: '', label: '', description: '', fields: [], enabled: true }
    keyMap.current.set(fresh, crypto.randomUUID())
    onChange([...value, fresh])
  }

  const removeIntent = (key: string) => onChange(value.filter(i => keyFor(i) !== key))

  const handleLabelChange = (intent: AgentIntent, newLabel: string) => {
    const prevDerived = slugifyKey(intent.label)
    const autoKey = intent.key === '' || intent.key === prevDerived
    replaceRow(keyFor(intent), i => ({
      ...i,
      label: newLabel,
      ...(autoKey ? { key: slugifyKey(newLabel) } : {}),
    }))
  }

  const handleKeyChange = (intent: AgentIntent, rawKey: string) => {
    replaceRow(keyFor(intent), i => ({ ...i, key: rawKey.toLowerCase().replace(/[^a-z0-9_]/g, '') }))
  }

  const handleDescriptionChange = (intent: AgentIntent, description: string) => {
    replaceRow(keyFor(intent), i => ({ ...i, description }))
  }

  const addField = (intent: AgentIntent) => {
    replaceRow(keyFor(intent), i => ({
      ...i,
      fields: [...(i.fields ?? []), { key: '', label: '', required: false }],
    }))
  }

  const patchField = (intent: AgentIntent, idx: number, patch: Partial<IntentField>) => {
    replaceRow(keyFor(intent), i => ({
      ...i,
      fields: (i.fields ?? []).map((f, fi) => fi === idx ? { ...f, ...patch } : f),
    }))
  }

  const handleFieldLabelChange = (intent: AgentIntent, idx: number, newLabel: string) => {
    const fields = intent.fields ?? []
    const prevDerived = slugifyKey(fields[idx]?.label ?? '')
    const autoKey = !fields[idx]?.key || fields[idx].key === prevDerived
    patchField(intent, idx, {
      label: newLabel,
      ...(autoKey ? { key: slugifyKey(newLabel) } : {}),
    })
  }

  const removeField = (intent: AgentIntent, idx: number) => {
    replaceRow(keyFor(intent), i => ({
      ...i,
      fields: (i.fields ?? []).filter((_, fi) => fi !== idx),
    }))
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[hsl(var(--text-tertiary))]">
        General hand-offs are always handled automatically — you don't need to add a 'general' intent.
      </p>

      {value.length === 0 && (
        <p className="text-xs text-[hsl(var(--text-secondary))]">
          No intents configured. Add one to teach the agent how to handle specific customer actions.
        </p>
      )}

      {value.map((intent) => {
        const rowKey = keyFor(intent)
        return (
          <div key={rowKey} className="rounded-lg border border-border bg-card p-4 space-y-3">
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
                    value={intent.label}
                    onChange={e => handleLabelChange(intent, e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1">
                    Key <span className="normal-case tracking-normal opacity-60">— machine identifier</span>
                  </label>
                  <input
                    className={cn('nz-input nz-mono h-9 w-full text-xs')}
                    placeholder="book_a_tour"
                    value={intent.key}
                    onChange={e => handleKeyChange(intent, e.target.value)}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeIntent(rowKey)}
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
                value={intent.description ?? ''}
                onChange={e => handleDescriptionChange(intent, e.target.value)}
              />
            </div>

            {/* Fields */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
                Fields to collect
              </label>
              <div className="space-y-2">
                {(intent.fields ?? []).map((field, fi) => (
                  <div key={fi} className="flex items-center gap-2">
                    <input
                      className="nz-input h-8 flex-1 text-sm"
                      placeholder="Field label (e.g. Property)"
                      value={field.label}
                      onChange={e => handleFieldLabelChange(intent, fi, e.target.value)}
                    />
                    <input
                      className="nz-input nz-mono h-8 w-32 text-xs"
                      placeholder="field_key"
                      value={field.key}
                      onChange={e => patchField(intent, fi, {
                        key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                      })}
                    />
                    <label className="flex items-center gap-1 text-xs text-[hsl(var(--text-secondary))] shrink-0 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={field.required ?? false}
                        onChange={e => patchField(intent, fi, { required: e.target.checked })}
                      />
                      Req
                    </label>
                    <button
                      type="button"
                      onClick={() => removeField(intent, fi)}
                      className="h-8 w-8 shrink-0 rounded-md border border-border text-[hsl(var(--text-secondary))] hover:text-destructive hover:border-destructive/50 transition-colors flex items-center justify-center"
                    >
                      <X className="h-3 w-3" strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => addField(intent)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-[hsl(var(--text-secondary))] hover:text-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> Add field
              </button>
            </div>
          </div>
        )
      })}

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
