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

  // Require authentication for AI features
  if (!accessToken) {
    throw new Error('Please sign in to use AI features');
  }

  // Wrap the API call with timeout
  const invokePromise = supabase.functions.invoke('ai', {
    headers: { Authorization: `Bearer ${accessToken}` },
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

/**
 * Transforms AI generate response from various formats to the expected GenerateOutput schema.
 * This handles cases where the AI returns a different structure than requested.
 */
function transformGenerateResponse(response: Record<string, unknown>): GenerateOutput {
  // If already in correct format, return as-is
  if (response.caseStructure && response.contentions && response.predictedOpponentCase && response.counters && response.metadata) {
    return response as unknown as GenerateOutput;
  }

  // Transform from wrong format to correct format
  const wrongFormatContentions = response.contentions as Array<{
    title?: string;
    claim?: string;
    points?: string[];
    evidence?: string[] | string;
    analysis?: string;
    reasoning?: string;
    impact?: string;
  }> || [];

  const transformedContentions = wrongFormatContentions.map((c, i) => ({
    id: String(i + 1),
    claim: c.claim || c.title || 'Argument',
    reasoning: c.reasoning || c.analysis || (Array.isArray(c.points) ? c.points.join(' ') : ''),
    evidence: Array.isArray(c.evidence) ? c.evidence.join(' ') : (c.evidence || ''),
    needsSource: false,
    sourceQuery: '',
    impact: c.impact || c.analysis || '',
  }));

  // Transform rebuttals to counters
  const rebuttals = (response.rebuttals as Array<{ attack?: string; response?: string }>) || [];
  const counters = rebuttals.map(r => ({
    targetArgument: r.attack || '',
    counterpoint: r.response || '',
    rebuttal: r.response || '',
  }));

  // Transform potentialWeaknesses to predictedOpponentCase
  const weaknesses = (response.potentialWeaknesses as string[]) || [];

  return {
    caseStructure: {
      thesis: (response.thesis as string) || (response.title as string) || '',
      framework: 'General framework',
      keyDefinitions: [],
      burdenOfProof: 'We must prove that ' + ((response.thesis as string) || '').slice(0, 50),
    },
    contentions: transformedContentions.length > 0 ? transformedContentions : [{
      id: '1',
      claim: 'Main argument',
      reasoning: 'Reasoning here',
      evidence: 'Evidence here',
      needsSource: false,
      sourceQuery: '',
      impact: 'Impact here',
    }],
    predictedOpponentCase: {
      likelyArguments: weaknesses.slice(0, 3),
      strategicWeaknesses: weaknesses,
      keyClashes: ['Main clash point'],
    },
    counters: counters.length > 0 ? counters : [{
      targetArgument: 'Opponent argument',
      counterpoint: 'Our counter',
      rebuttal: 'Rebuttal text',
    }],
    metadata: {
      side: (response.side as 'pro' | 'con') || 'pro',
      format: 'custom',
      generatedAt: new Date().toISOString(),
    },
  };
}

export async function generateCase(input: GenerateInput, config: ProviderConfig): Promise<GenerateOutput> {
  if (config.provider === 'mock') return mockGenerateCase(input.motion, input.side);
  const rawResponse = await callSupabaseAI('generate', input as Record<string, unknown>, config);
  return transformGenerateResponse(rawResponse as Record<string, unknown>);
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
