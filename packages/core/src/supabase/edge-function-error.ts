export interface EdgeFunctionError {
  /** The function's own `error` text, or the client's message when it is more than the generic non-2xx one. */
  message?: string;
  /** The stable `code` the function sent beside its English text, for the browser to translate. */
  code?: string;
  status?: number;
  /** The parsed JSON body, for functions that answer with other fields (redeem-promo's `message`). */
  body?: Record<string, unknown>;
}

/** What a failed supabase.functions.invoke call said: its status, JSON body, text and code. */
export async function readEdgeFunctionError(error: unknown): Promise<EdgeFunctionError> {
  if (!error) return {};

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

  const body = bodyObj && typeof bodyObj === 'object' && !Array.isArray(bodyObj)
    ? bodyObj as Record<string, unknown>
    : undefined;
  const bodyError = body?.error;
  const msg = typeof err.message === 'string' ? err.message : '';
  const message = typeof bodyError === 'string' && bodyError.trim()
    ? bodyError
    : msg && msg !== 'Edge Function returned a non-2xx status code' ? msg : undefined;
  const code = typeof body?.code === 'string' ? body.code : undefined;

  return { message, code, status, body };
}

export async function getEdgeFunctionErrorMessage(error: unknown): Promise<string> {
  if (!error) return 'Request failed';
  const { message, status } = await readEdgeFunctionError(error);
  if (message) return message;
  if (status) return `Request failed (HTTP ${status})`;
  return 'Request failed';
}
