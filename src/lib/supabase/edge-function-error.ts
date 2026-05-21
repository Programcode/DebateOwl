export async function getEdgeFunctionErrorMessage(error: unknown): Promise<string> {
  if (!error) return 'Request failed';

  const err = error as {
    message?: unknown;
    context?: unknown;
  };

  const context = err.context;
  let status: number | undefined;
  let bodyObj: unknown;

  const maybeResponse = context as { status?: unknown; text?: () => Promise<string> };
  if (maybeResponse && typeof maybeResponse.status === 'number') {
    status = maybeResponse.status;
    if (typeof maybeResponse.text === 'function') {
      try {
        const text = await maybeResponse.text();
        if (text) bodyObj = JSON.parse(text);
      } catch {
        bodyObj = undefined;
      }
    }
  } else if (context && typeof context === 'object') {
    const plainContext = context as { status?: unknown; body?: unknown };
    status = typeof plainContext.status === 'number' ? plainContext.status : undefined;
    const body = plainContext.body;
    if (typeof body === 'string' && body) {
      try {
        bodyObj = JSON.parse(body);
      } catch {
        bodyObj = undefined;
      }
    } else if (body && typeof body === 'object') {
      bodyObj = body;
    }
  }

  const bodyError = bodyObj && typeof bodyObj === 'object' && 'error' in bodyObj
    ? (bodyObj as { error?: unknown }).error
    : undefined;

  if (typeof bodyError === 'string' && bodyError.trim()) return bodyError;

  const msg = typeof err.message === 'string' ? err.message : '';
  if (msg && msg !== 'Edge Function returned a non-2xx status code') return msg;

  if (status) return `Request failed (HTTP ${status})`;
  return 'Request failed';
}
