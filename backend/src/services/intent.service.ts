import { supabase } from '../lib/supabase.js';
import { AppError } from '../utils/errors.js';

interface IntentField {
  key: string;
  label: string;
  required?: boolean;
}

interface CreateIntentInput {
  key: string;
  label: string;
  description?: string;
  fields?: IntentField[];
  position?: number;
  enabled?: boolean;
}

interface UpdateIntentInput {
  key?: string;
  label?: string;
  description?: string;
  fields?: IntentField[];
  position?: number;
  enabled?: boolean;
}

class IntentService {
  async listByAgent(agentId: string) {
    const { data, error } = await supabase
      .from('intents')
      .select('*')
      .eq('agent_id', agentId)
      .order('position', { ascending: true });
    if (error) throw new AppError(error.message, 500);
    return data ?? [];
  }

  async create(agentId: string, input: CreateIntentInput) {
    if (input.fields !== undefined && !Array.isArray(input.fields)) {
      throw new AppError('fields must be an array', 400);
    }
    const { data, error } = await supabase
      .from('intents')
      .insert({ agent_id: agentId, ...input })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') throw new AppError('Intent key already exists for this agent', 409);
      throw new AppError(error.message, 500);
    }
    return data;
  }

  async update(id: string, patch: UpdateIntentInput) {
    if (patch.fields !== undefined && !Array.isArray(patch.fields)) {
      throw new AppError('fields must be an array', 400);
    }
    const { data, error } = await supabase
      .from('intents')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      if (error.code === '23505') throw new AppError('Intent key already exists for this agent', 409);
      throw new AppError(error.message, 500);
    }
    if (!data) throw new AppError('Intent not found', 404);
    return data;
  }

  async remove(id: string) {
    const { error } = await supabase
      .from('intents')
      .delete()
      .eq('id', id);
    if (error) throw new AppError(error.message, 500);
  }
}

export const intentService = new IntentService();
