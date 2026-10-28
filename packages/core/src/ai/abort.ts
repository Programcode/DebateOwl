// The error a cancelled request rejects with. Browsers expect a DOMException
// named AbortError, as fetch throws; Hermes may lack DOMException, so a plain
// Error with the same name stands in.

type DOMExceptionConstructor = new (message: string, name: string) => Error;

export function abortError(): Error {
  const DOMExceptionCtor = (globalThis as { DOMException?: DOMExceptionConstructor }).DOMException;
  if (typeof DOMExceptionCtor === 'function') return new DOMExceptionCtor('The request was canceled.', 'AbortError');
  const error = new Error('The request was canceled.');
  error.name = 'AbortError';
  return error;
}

