// src/lib/ai/providers/types.ts

export interface AIProvider {
  id: string;
  name: string;
  models: AIModel[];
  isAvailable: () => boolean;
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
    name: 'Lovable AI',
    models: [
      { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash', description: 'Fast and capable', maxTokens: 8000 },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Most capable', maxTokens: 32000 },
      { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', description: 'Balanced performance', maxTokens: 8000 },
    ],
    isAvailable: () => true,
  },
  {
    id: 'openai',
    name: 'OpenAI Compatible',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Latest OpenAI model', maxTokens: 8000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and affordable', maxTokens: 4000 },
    ],
    isAvailable: () => false,
  },
];
