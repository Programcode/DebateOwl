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

// Request timeout in milliseconds (200 seconds)
const REQUEST_TIMEOUT_MS = 200 * 1000;

/**
 * Custom error for request timeouts.
 */
export class TimeoutError extends Error {
  constructor(message: string = 'Request timed out. Please try again.') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Checks if an error is a TimeoutError.
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError || (error instanceof Error && error.name === 'TimeoutError');
}

/**
 * Wraps a promise with a timeout. Rejects with TimeoutError if the promise
 * doesn't resolve within the specified time.
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

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

  // Wrap the API call with timeout
  const invokePromise = supabase.functions.invoke('ai', {
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

  const { data, error } = await withTimeout(invokePromise, REQUEST_TIMEOUT_MS);

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
