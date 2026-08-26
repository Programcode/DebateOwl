// Minimal stand-in for the deno.land/std assert module used by supabase
// function tests. Mapped over the exact import specifier via resolve.alias in
// vitest.config.ts. The same files keep working under `deno test`.

export function assertStringIncludes(actual: string, expected: string, msg = ""): void {
  if (!actual.includes(expected)) {
    throw new Error(
      msg || `Expected string to include:\n  ${expected}\nActual string:\n  ${actual}`,
    );
  }
}
