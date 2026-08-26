// Vitest compatibility shim for the Deno-style test suites under
// supabase/functions. Registers globalThis.Deno so `Deno.test` cases collect
// as vitest tests without changing how the same files run under `deno test`.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

if (!("Deno" in globalThis)) {
  // Under vitest, paths reach Deno.readTextFile in several shapes: real file
  // URLs, vite "@fs" URLs, and (via vite's rewrite of `new URL(rel,
  // import.meta.url)`) root-relative paths that lost the project prefix. Map
  // every shape to a real filesystem path, falling back to the vitest working
  // directory when a candidate does not exist on disk.
  const toFilePath = (input: string | URL): string => {
    const href = input instanceof URL ? input.href : input;
    const isFileUrl = input instanceof URL ? input.protocol === "file:" : href.startsWith("file:");
    let candidate: string;
    if (isFileUrl) {
      candidate = fileURLToPath(input instanceof URL ? input : new URL(href));
    } else {
      const atFsIndex = href.indexOf("/@fs/");
      if (atFsIndex !== -1) {
        candidate = decodeURIComponent(href.slice(atFsIndex + 4));
      } else if (/^https?:\/\//i.test(href)) {
        candidate = decodeURIComponent(new URL(href).pathname);
      } else {
        candidate = href;
      }
    }
    if (!existsSync(candidate) && candidate.startsWith("/") && existsSync(`${process.cwd()}${candidate}`)) {
      return `${process.cwd()}${candidate}`;
    }
    return candidate;
  };

  const readTextFile = async (input: string | URL): Promise<string> =>
    readFileSync(toFilePath(input), "utf8");

  (globalThis as { Deno?: Record<string, unknown> }).Deno = {
    test: (...args: unknown[]): void => {
      const fn = args.filter((arg) => typeof arg === "function").pop() as
        | (() => unknown)
        | undefined;
      if (!fn) throw new Error("Deno.test shim requires a test function argument");
      const first = args[0];
      const name =
        typeof first === "string"
          ? first
          : first && typeof first === "object" && "name" in first && typeof first.name === "string"
            ? first.name
            : "unnamed deno test";
      it(name, () => {
        return fn();
      });
    },
    env: {
      get: (_key: string): string | undefined => undefined,
      toObject: (): Record<string, string> => ({}),
    },
    readTextFile,
  };
}
