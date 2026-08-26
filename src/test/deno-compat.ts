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

  // Loopback Deno.serve replacement: instead of binding a real socket, the
  // shim records the handler and routes matching fetch calls to it directly.
  // Synchronous return with an addr object keeps Deno.serve call shapes valid.
  type LoopbackHandler = (request: Request) => Response | Promise<Response>;
  let loopback: { matches: (url: URL) => boolean; handler: LoopbackHandler } | null = null;
  const LOOPBACK_DEFAULT_PORT = 43111;

  if (!("__denoLoopbackFetchPatched" in globalThis)) {
    (globalThis as { __denoLoopbackFetchPatched?: boolean }).__denoLoopbackFetchPatched = true;
    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (loopback && loopback.matches(url)) {
        const response = await loopback.handler(new Request(url, init));
        // Native fetch binds the caller's signal to the body stream so an
        // aborted read rejects instead of stalling. Reproduce that here.
        const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
        if (!signal || !response.body) {
          return response;
        }
        const reader = response.body.getReader();
        const wired = new ReadableStream<Uint8Array>({
          start(controller) {
            const abort = () => {
              void reader.cancel().catch((): undefined => undefined);
              controller.error(
                signal.reason ?? new DOMException("The operation was aborted", "AbortError"),
              );
            };
            if (signal.aborted) {
              abort();
              return;
            }
            signal.addEventListener("abort", abort, { once: true });
            const pump = (): Promise<void> =>
              reader.read().then(({ done, value }) => {
                if (signal.aborted) {
                  return;
                }
                if (done) {
                  controller.close();
                  return;
                }
                controller.enqueue(value);
                return pump();
              }, (error) => controller.error(error));
            void pump();
          },
          cancel: (): Promise<void> => reader.cancel().catch((): undefined => undefined),
        });
        return new Response(wired, { status: response.status, headers: response.headers });
      }
      return originalFetch(input as Parameters<typeof originalFetch>[0], init);
    };
  }

  const serve = (
    options: { hostname?: string; port?: number },
    handler: LoopbackHandler,
  ): {
    addr: { transport: string; hostname: string; port: number };
    shutdown: () => Promise<void>;
    finished: Promise<void>;
  } => {
    const hostname = options?.hostname ?? "127.0.0.1";
    const port = options?.port && options.port > 0 ? options.port : LOOPBACK_DEFAULT_PORT;
    loopback = {
      matches: (url) => url.hostname === hostname && url.port === String(port),
      handler,
    };
    return {
      addr: { transport: "tcp", hostname, port },
      shutdown: async () => {
        loopback = null;
      },
      finished: Promise.resolve(),
    };
  };

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
      get: (key: string): string | undefined => process.env[key],
      set: (key: string, value: string): void => {
        process.env[key] = value;
      },
      delete: (key: string): void => {
        delete process.env[key];
      },
      toObject: (): Record<string, string> => ({ ...process.env }),
    },
    readTextFile,
    serve,
  };
}
