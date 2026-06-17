import { apiClient } from '@/lib/axios'

export interface IntentCount { intent: string; count: number }

export interface PerClient {
  org_id: string
  org_name: string
  total_conversations: number
  leads_captured: number
  conversion_rate: number
}

export interface AnalyticsOverview {
  total_conversations: number
  leads_captured: number
  conversion_rate: number
  escalations: number
  escalation_rate: number
  intent_breakdown: IntentCount[]
  per_client?: PerClient[]
}

export interface VolumePoint { date: string; conversations: number }

const qs = (from?: string, to?: string): string => {
  const p = new URLSearchParams()
  if (from) p.set('from', from)
  if (to) p.set('to', to)
  const s = p.toString()
  return s ? `?${s}` : ''
}

function toIntentArray(breakdown: Record<string, number>): IntentCount[] {
  return Object.entries(breakdown).map(([intent, count]) => ({ intent, count }))
}

export const analyticsApi = {
  overview: async (from?: string, to?: string): Promise<AnalyticsOverview> => {
    const { data } = await apiClient.get(`/api/analytics/overview${qs(from, to)}`)
    const raw = data?.data ?? data

    // Cross-client: backend returns an array of per-org rows
    if (Array.isArray(raw)) {
      const per_client: PerClient[] = raw.map((r: Record<string, unknown>) => ({
        org_id: r['org_id'] as string,
        org_name: r['org_name'] as string,
        total_conversations: r['total_conversations'] as number,
        leads_captured: r['leads_captured'] as number,
        conversion_rate: r['conversion_rate'] as number,
      }))
      const total_conversations = raw.reduce((s: number, r: Record<string, unknown>) => s + (r['total_conversations'] as number), 0)
      const leads_captured = raw.reduce((s: number, r: Record<string, unknown>) => s + (r['leads_captured'] as number), 0)
      const escalations = raw.reduce((s: number, r: Record<string, unknown>) => s + (r['escalations'] as number), 0)
      const conversion_rate = total_conversations > 0 ? Math.round((leads_captured / total_conversations) * 1000) / 10 : 0
      const escalation_rate = total_conversations > 0 ? Math.round((escalations / total_conversations) * 1000) / 10 : 0
      const merged: Record<string, number> = {}
      for (const r of raw as Array<Record<string, unknown>>) {
        for (const [k, v] of Object.entries((r['intent_breakdown'] as Record<string, number>) ?? {})) {
          merged[k] = (merged[k] ?? 0) + v
        }
      }
      return {
        total_conversations,
        leads_captured,
        conversion_rate,
        escalations,
        escalation_rate,
        intent_breakdown: toIntentArray(merged),
        per_client,
      }
    }

    // Single-org: intent_breakdown is a plain object
    return {
      ...(raw as Omit<AnalyticsOverview, 'intent_breakdown'>),
      intent_breakdown: toIntentArray((raw as Record<string, unknown>)['intent_breakdown'] as Record<string, number> ?? {}),
    }
  },

  volume: async (from?: string, to?: string): Promise<VolumePoint[]> => {
    const { data } = await apiClient.get(`/api/analytics/volume${qs(from, to)}`)
    const raw = data?.data ?? data
    const points = (raw?.volume ?? raw ?? []) as Array<{ date: string; count: number }>
    return points.map(p => ({ date: p.date, conversations: p.count }))
  },
}
