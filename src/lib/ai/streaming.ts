import { supabase, SUPABASE_URL } from '@/lib/supabase/client';
import type { ProviderConfig } from './providers/types';
import type { AskOutput } from './schemas/ask';

export interface AskStreamOptions {
  citationMode?: boolean;
  webSearch?: boolean;
  prosConsMode?: boolean;
  argumentMapMode?: boolean;
}

export interface AskStreamHandlers {
  onDelta: (text: string) => void;
  onFinal?: (output: AskOutput) => void;
}

export type ParsedSSEEvent = {
  event: string;
  data: unknown;
};

export function isAskStreamingSupported(config: ProviderConfig, options: AskStreamOptions = {}) {
  const provider = config.provider === 'lovable' ? 'openai' : config.provider;
  const advancedStructuredMode = Boolean(
    options.citationMode ||
    options.webSearch ||
    options.prosConsMode ||
    options.argumentMapMode
  );

  return provider === 'openai' && !advancedStructuredMode;
}

function parseEventBlock(block: string): ParsedSSEEvent | null {
  const lines = block.split(/\r?\n/);
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  }

  if (dataLines.length === 0) return null;

  const rawData = dataLines.join('\n');
  try {
    return { event, data: JSON.parse(rawData) };
  } catch {
    return { event, data: rawData };
  }
}

export function consumeSSEChunk(buffer: string, chunk: string): { events: ParsedSSEEvent[]; buffer: string } {
  const normalized = `${buffer}${chunk}`.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';
  const events = parts
    .map(parseEventBlock)
    .filter((event): event is ParsedSSEEvent => event !== null);

  return { events, buffer: rest };
}

export async function streamAskChat(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  mode: string,
  config: ProviderConfig,
  options: AskStreamOptions,
  handlers: AskStreamHandlers
): Promise<AskOutput> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Please sign in to use AI features');

  const provider = config.provider === 'lovable' ? 'openai' : config.provider;
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      feature: 'ask',
      input: {
        message,
        history,
        mode,
        citationMode: Boolean(options.citationMode),
        webSearch: Boolean(options.webSearch),
        prosConsMode: Boolean(options.prosConsMode),
        argumentMapMode: Boolean(options.argumentMapMode),
      },
      provider,
      model: config.model,
      temperature: config.temperature,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Streaming request failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalOutput: AskOutput | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const parsed = consumeSSEChunk(buffer, decoder.decode(value, { stream: true }));
    buffer = parsed.buffer;

    for (const event of parsed.events) {
      if (event.event === 'delta' && typeof event.data === 'object' && event.data !== null && 'text' in event.data) {
        const text = String((event.data as { text?: unknown }).text ?? '');
        if (text) handlers.onDelta(text);
      }

      if (event.event === 'final' && typeof event.data === 'object' && event.data !== null && 'output' in event.data) {
        finalOutput = (event.data as { output: AskOutput }).output;
        handlers.onFinal?.(finalOutput);
      }

      if (event.event === 'error') {
        const message = typeof event.data === 'object' && event.data !== null && 'message' in event.data
          ? String((event.data as { message?: unknown }).message)
          : 'Streaming request failed';
        throw new Error(message);
      }
    }
  }

  const finalParsed = consumeSSEChunk('', `${buffer}\n\n`);
  for (const event of finalParsed.events) {
    if (event.event === 'final' && typeof event.data === 'object' && event.data !== null && 'output' in event.data) {
      finalOutput = (event.data as { output: AskOutput }).output;
      handlers.onFinal?.(finalOutput);
    }
  }

  if (!finalOutput) {
    throw new Error('Streaming request ended before a final response was received');
  }

  return finalOutput;
}
