export interface JevSmokeSummary {
  model: string;
  answers: { fit: 'specific' | 'vague' };
  latencyMs: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

export function runJevSmoke(options?: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<JevSmokeSummary>;
