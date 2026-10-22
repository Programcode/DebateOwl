import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";

type FetchListener = (event: { request: Request; respondWith: (response: unknown) => void }) => void;

/** Runs public/sw.js against stub globals and returns its fetch listener. */
function loadFetchListener(): FetchListener {
  const listeners: Record<string, FetchListener> = {};
  const self = {
    location: { origin: "https://debate.pi-stack.org" },
    addEventListener: (type: string, listener: FetchListener) => { listeners[type] = listener; },
    clients: { claim: vi.fn() },
  };
  const caches = { open: vi.fn(), match: vi.fn(), keys: vi.fn() };
  const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
  new Function("self", "caches", "fetch", source)(self, caches, vi.fn());
  return listeners.fetch;
}

function navigate(path: string) {
  const respondWith = vi.fn();
  const request = { method: "GET", mode: "navigate", url: `https://debate.pi-stack.org${path}`, destination: "document" } as unknown as Request;
  loadFetchListener()({ request, respondWith });
  return respondWith;
}

it("leaves embed navigations to the network, so an iframe never replaces or receives the cached app shell", () => {
  expect(navigate("/embed/debate-timer?format=bp")).not.toHaveBeenCalled();
  // Other navigations still go through the offline fallback.
  expect(navigate("/tools/debate-timer")).toHaveBeenCalledTimes(1);
  expect(navigate("/app")).toHaveBeenCalledTimes(1);
});
