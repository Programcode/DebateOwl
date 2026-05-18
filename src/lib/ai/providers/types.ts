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
  isProOnly?: boolean;
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
    id: 'openai',
    name: 'OpenAI',
    models: [
      { id: 'gpt-5.5', name: 'GPT-5.5', description: '', maxTokens: 128000, isProOnly: true },
      { id: 'gpt-5.4', name: 'GPT-5.4', description: '', maxTokens: 128000, isProOnly: true },
      { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', description: '', maxTokens: 128000 },
    ],
    isAvailable: () => true,
    requiresKey: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', description: '', maxTokens: 200000, isProOnly: true },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: '', maxTokens: 200000, isProOnly: true },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', description: '', maxTokens: 200000 },
    ],
    isAvailable: () => true,
    requiresKey: true,
  },
  {
    id: 'google',
    name: 'Google Gemini',
    models: [
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', description: '', maxTokens: 2000000, isProOnly: true },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', description: '', maxTokens: 1000000 },
      { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite', description: '', maxTokens: 1000000 },
    ],
    isAvailable: () => true,
    requiresKey: true,
  },
];
