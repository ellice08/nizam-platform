import { supabase } from '../lib/supabase.js';
import { AppError } from '../utils/errors.js';

class BranchService {
  async getBranchesByOrg(orgId: string) {
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('organisation_id', orgId)
      .order('created_at', { ascending: true });

    if (error) throw new AppError(error.message);
    return data ?? [];
  }

  async getBranchById(branchId: string, orgId: string) {
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('id', branchId)
      .eq('organisation_id', orgId)
      .single();

    if (error || !data) throw new AppError('Branch not found', 404);
    return data;
  }

  async createBranch(orgId: string, data: { name: string; location?: string; timezone?: string }) {
    const { data: branch, error } = await supabase
      .from('branches')
      .insert({ ...data, organisation_id: orgId })
      .select()
      .single();

    if (error) throw new AppError(error.message);
    return branch;
  }

  async updateBranch(
    branchId: string,
    orgId: string,
    data: Partial<{ name: string; location: string; timezone: string; business_hours: unknown }>
  ) {
    const { data: branch, error } = await supabase
      .from('branches')
      .update(data)
      .eq('id', branchId)
      .eq('organisation_id', orgId)
      .select()
      .single();

    if (error || !branch) throw new AppError('Branch not found', 404);
    return branch;
  }
}

export const branchService = new BranchService();
