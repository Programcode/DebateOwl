// src/lib/ai/providers/types.ts

export interface AIProvider {
  id: string;
  name: string;
  models: AIModel[];
  isAvailable: () => boolean;
  requiresKey?: boolean;
}

export interface AIModel {
  id: string;
  name: string;
  description: string;
  maxTokens: number;
}

export interface AIRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

export interface AIResponse {
  content: string;
  model: string;
  provider: string;
  latency: number;
  tokensUsed?: number;
}

export interface ProviderConfig {
  provider: string;
  model: string;
  temperature: number;
  apiKey?: string;
  baseUrl?: string;
}

export const DEFAULT_PROVIDERS: AIProvider[] = [
  {
    id: 'mock',
    name: 'Mock AI (Demo)',
    models: [
      { id: 'mock-standard', name: 'Standard', description: 'Fast demo responses', maxTokens: 4000 },
      { id: 'mock-detailed', name: 'Detailed', description: 'More detailed demo responses', maxTokens: 8000 },
    ],
    isAvailable: () => true,
  },
  {
    id: 'lovable',
    name: 'Legacy Cloud',
    models: [
      { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash', description: 'Fast and capable', maxTokens: 8000 },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Most capable', maxTokens: 32000 },
      { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', description: 'Balanced performance', maxTokens: 8000 },
    ],
    isAvailable: () => true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable OpenAI model', maxTokens: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and affordable', maxTokens: 128000 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Legacy standard', maxTokens: 16000 },
    ],
    isAvailable: () => true,
    requiresKey: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [
      { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', description: 'Exceptional reasoning and coding', maxTokens: 200000 },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Fastest and most compact', maxTokens: 200000 },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Most powerful Anthropic model', maxTokens: 200000 },
    ],
    isAvailable: () => true,
    requiresKey: true,
  },
  {
    id: 'google',
    name: 'Google Gemini',
    models: [
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', description: 'Next-generation intelligence (Preview)', maxTokens: 2000000 },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', description: 'Next-generation speed (Preview)', maxTokens: 1000000 },
      { id: 'gemini-2.0-pro-exp', name: 'Gemini 2.0 Pro', description: 'Highly capable reasoning (Preview)', maxTokens: 2000000 },
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', description: 'Fast and intelligent (Preview)', maxTokens: 1000000 },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Stable reasoning model', maxTokens: 2000000 },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Stable fast model', maxTokens: 1000000 },
    ],
    isAvailable: () => true,
    requiresKey: true,
  },
];
