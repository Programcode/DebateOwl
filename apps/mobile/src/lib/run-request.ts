/** Keep request error handling and cleanup outside render functions for React Compiler. */
export async function runRequest<T, E = never>(work: () => Promise<T>, failed?: (cause: unknown) => E | Promise<E>, settled?: () => void): Promise<T | E> {
  try {
    return await work();
  } catch (cause) {
    if (!failed) throw cause;
    return await failed(cause);
  } finally {
    settled?.();
  }
}
