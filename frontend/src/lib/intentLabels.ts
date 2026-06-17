import type { AgentIntent } from '@/api'

export function prettifyIntentKey(key: string): string {
  if (!key) return ''
  const s = key.replace(/_/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function buildIntentLabelMap(intents: AgentIntent[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const i of intents) if (i.key) map[i.key] = i.label
  return map
}

export function intentLabel(key: string | null | undefined, map: Record<string, string>): string {
  if (!key) return ''
  return map[key] ?? prettifyIntentKey(key)
}
