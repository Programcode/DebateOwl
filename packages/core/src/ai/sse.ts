// Server-sent events parsing for the ai-stream Edge Function, shared by the website and the app.

export type ParsedSSEEvent = {
  event: string;
  data: unknown;
};

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
