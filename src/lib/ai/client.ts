import { mockGenerateCase, mockAttackCase, mockBrainstorm, mockFactoids, mockAsk } from './providers/mock-provider';
import type { ProviderConfig } from './providers/types';
import type { GenerateInput, GenerateOutput } from './schemas/generate';
import type { AttackOutput, AttackInput } from './schemas/attack';
import type { BrainstormOutput, BrainstormInput } from './schemas/brainstorm';
import type { FactoidsOutput, FactoidsInput } from './schemas/factoids';
import type { AskOutput } from './schemas/ask';
import { useSettingsStore } from '../stores/settings-store';
import { useSessionStore } from '../stores/session-store';
import { supabase } from '@/lib/supabase/client';

async function callSupabaseAI(
  feature: 'generate' | 'attack' | 'brainstorm' | 'factoids' | 'ask',
  input: Record<string, unknown>,
  config: ProviderConfig
) {
  const settings = useSettingsStore.getState();
  const session = useSessionStore.getState();

  const activeSources = session.sourceLibrary
    .filter((s) => s.isActive)
    .map((s) => ({ title: s.title, content: s.content, origin: s.origin, type: s.type }));

  const provider = config.provider === 'lovable' ? 'openai' : config.provider;
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const { data, error } = await supabase.functions.invoke('ai', {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: {
      feature,
      input,
      provider,
      model: config.model,
      temperature: config.temperature,
      customSystemPrompt: settings.customSystemPrompt || null,
      sources: activeSources,
    },
  });

  if (error) throw new Error(error.message);
  if (!data?.output) throw new Error('AI response missing output');
  return data.output;
}

export async function generateCase(input: GenerateInput, config: ProviderConfig): Promise<GenerateOutput> {
  if (config.provider === 'mock') return mockGenerateCase(input.motion, input.side);
  return callSupabaseAI('generate', input as Record<string, unknown>, config);
}

export async function attackCase(input: AttackInput, config: ProviderConfig): Promise<AttackOutput> {
  if (config.provider === 'mock') return mockAttackCase(input.caseText);
  return callSupabaseAI('attack', input as Record<string, unknown>, config);
}

export async function brainstorm(input: BrainstormInput, config: ProviderConfig): Promise<BrainstormOutput> {
  if (config.provider === 'mock') return mockBrainstorm(input.motion, input.outputMode);
  return callSupabaseAI('brainstorm', input as Record<string, unknown>, config);
}

export async function factoids(input: FactoidsInput, config: ProviderConfig): Promise<FactoidsOutput> {
  if (config.provider === 'mock') return mockFactoids(input.claim);
  return callSupabaseAI('factoids', input as Record<string, unknown>, config);
}

export async function askChat(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  mode: string,
  config: ProviderConfig
): Promise<AskOutput> {
  if (config.provider === 'mock') return mockAsk(message, mode);
  return callSupabaseAI('ask', { message, history, mode }, config);
}
