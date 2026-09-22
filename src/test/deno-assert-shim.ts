// Minimal stand-in for the deno.land/std assert module used by supabase
// function tests. Mapped over the exact import specifier via resolve.alias in
// vitest.config.ts. The same files keep working under `deno test`.

import { isDeepStrictEqual } from "node:util";

export function assert(condition: unknown, msg = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(msg);
}

export function assertStringIncludes(actual: string, expected: string, msg = ""): void {
  if (!actual.includes(expected)) {
    throw new Error(
      msg || `Expected string to include:\n  ${expected}\nActual string:\n  ${actual}`,
    );
  }
}

export function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(
      msg || `Expected values to be equal:\n  ${JSON.stringify(expected)}\nActual value:\n  ${JSON.stringify(actual)}`,
    );
  }
}

export async function assertRejects(
  fn: () => Promise<unknown>,
  ErrorClass: typeof Error = Error,
  msgIncludes = "",
): Promise<Error> {
  try {
    await fn();
  } catch (error) {
    if (!(error instanceof ErrorClass)) throw error;
    if (msgIncludes && !error.message.includes(msgIncludes)) {
      throw new Error(`Expected error message to include: ${msgIncludes}\nActual message: ${error.message}`);
    }
    return error;
  }
  throw new Error("Expected function to reject");
}
