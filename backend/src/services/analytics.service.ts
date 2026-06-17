import { supabase } from '../lib/supabase.js';
import logger from '../utils/logger.js';

interface DateRange { from?: string; to?: string }

interface RawConversation {
  id: string;
  branch_id: string;
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  intent: string | null;
  requires_human: boolean | null;
  resolved: boolean | null;
  created_at: string;
}

function dateOnly(s: string): string { return s.slice(0, 10); }

function toIsoEnd(dateStr: string): string {
  return `${dateOnly(dateStr)}T23:59:59.999Z`;
}

function toIsoStart(dateStr: string): string {
  return `${dateOnly(dateStr)}T00:00:00.000Z`;
}

function aggregateOverview(rows: RawConversation[]) {
  const total = rows.length;
  const leads_captured = rows.filter(r => r.lead_name || r.lead_phone || r.lead_email).length;
  const escalations = rows.filter(r => r.requires_human).length;
  const intent_breakdown: Record<string, number> = {};
  for (const r of rows) {
    const key = r.intent ?? 'general';
    intent_breakdown[key] = (intent_breakdown[key] ?? 0) + 1;
  }
  return {
    total_conversations: total,
    leads_captured,
    conversion_rate: total > 0 ? Math.round((leads_captured / total) * 1000) / 10 : 0,
    escalations,
    escalation_rate: total > 0 ? Math.round((escalations / total) * 1000) / 10 : 0,
    intent_breakdown,
  };
}

function aggregateVolume(rows: RawConversation[], from?: string, to?: string) {
  if (rows.length === 0) return [];

  const counts: Record<string, number> = {};
  for (const r of rows) {
    const day = r.created_at.slice(0, 10);
    counts[day] = (counts[day] ?? 0) + 1;
  }

  const days = Object.keys(counts).sort();
  const startDay = from ? dateOnly(from) : days[0];
  const endDay   = to   ? dateOnly(to)   : days[days.length - 1];

  const cursorDate = new Date(`${startDay}T00:00:00Z`);
  const endDate    = new Date(`${endDay}T00:00:00Z`);

  if (isNaN(cursorDate.getTime()) || isNaN(endDate.getTime())) {
    return days.map(day => ({ date: day, count: counts[day] }));
  }

  const volume: Array<{ date: string; count: number }> = [];
  const cursor = cursorDate;
  while (cursor <= endDate) {
    const day = cursor.toISOString().slice(0, 10);
    volume.push({ date: day, count: counts[day] ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return volume;
}

async function fetchConversations(branchIds: string[], range: DateRange): Promise<RawConversation[]> {
  if (branchIds.length === 0) return [];
  let q = supabase
    .from('conversations')
    .select('id, branch_id, lead_name, lead_phone, lead_email, intent, requires_human, resolved, created_at')
    .in('branch_id', branchIds);
  if (range.from) q = q.gte('created_at', toIsoStart(range.from));
  if (range.to)   q = q.lte('created_at', toIsoEnd(range.to));
  const { data, error } = await q;
  if (error) logger.error(`analytics: fetchConversations failed: ${error.message}`);
  return (data ?? []) as RawConversation[];
}

class AnalyticsService {
  async resolveBranchIds(orgId: string): Promise<string[]> {
    const { data, error } = await supabase.from('branches').select('id').eq('organisation_id', orgId);
    if (error) logger.error(`analytics: resolveBranchIds failed: ${error.message}`);
    return (data ?? []).map(b => (b as Record<string, unknown>)['id'] as string);
  }

  async getAllBranchIds(): Promise<string[]> {
    const { data, error } = await supabase.from('branches').select('id');
    if (error) logger.error(`analytics: getAllBranchIds failed: ${error.message}`);
    return (data ?? []).map(b => (b as Record<string, unknown>)['id'] as string);
  }

  async getOverview(branchIds: string[], rangeInput?: DateRange) {
    const range: DateRange = { from: rangeInput?.from, to: rangeInput?.to };
    const rows = await fetchConversations(branchIds, range);
    return { ...aggregateOverview(rows), from: range.from, to: range.to };
  }

  async getVolume(branchIds: string[], rangeInput?: DateRange) {
    const range: DateRange = { from: rangeInput?.from, to: rangeInput?.to };
    const rows = await fetchConversations(branchIds, range);
    return { volume: aggregateVolume(rows, range.from, range.to), from: range.from, to: range.to };
  }

  async getCrossClientOverview(rangeInput?: DateRange) {
    const range: DateRange = { from: rangeInput?.from, to: rangeInput?.to };

    const { data: orgs } = await supabase.from('organisations').select('id, name');
    const { data: branches } = await supabase.from('branches').select('id, organisation_id');

    const orgMap: Record<string, string> = {};
    for (const o of (orgs ?? []) as Array<{ id: string; name: string }>) {
      orgMap[o.id] = o.name;
    }

    const branchToOrg: Record<string, string> = {};
    const allBranchIds: string[] = [];
    for (const b of (branches ?? []) as Array<{ id: string; organisation_id: string }>) {
      branchToOrg[b.id] = b.organisation_id;
      allBranchIds.push(b.id);
    }

    const rows = await fetchConversations(allBranchIds, range);

    const byOrg: Record<string, RawConversation[]> = {};
    for (const r of rows) {
      const orgId = branchToOrg[r.branch_id];
      if (!orgId) continue;
      byOrg[orgId] = byOrg[orgId] ?? [];
      byOrg[orgId].push(r);
    }

    return Object.entries(orgMap).map(([orgId, orgName]) => ({
      org_id: orgId,
      org_name: orgName,
      ...aggregateOverview(byOrg[orgId] ?? []),
    }));
  }
}

export const analyticsService = new AnalyticsService();
