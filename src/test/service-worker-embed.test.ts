import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";

type FetchListener = (event: { request: Request; respondWith: (response: unknown) => void }) => void;
type Listener = (event: { waitUntil: (promise: Promise<unknown>) => void }) => void;

/** Runs public/sw.js against stub globals on the given host and returns its listeners and stubs. */
function loadWorker(host = "debateowl.com") {
  const listeners: Record<string, unknown> = {};
  const client = { url: `https://${host}/app/history?x=1`, navigate: vi.fn(async () => undefined) };
  const self = {
    location: { origin: `https://${host}`, hostname: host },
    addEventListener: (type: string, listener: unknown) => { listeners[type] = listener; },
    skipWaiting: vi.fn(async () => undefined),
    registration: { unregister: vi.fn(async () => true) },
    clients: { claim: vi.fn(), matchAll: vi.fn(async () => [client]) },
  };
  const caches = { open: vi.fn(), match: vi.fn(), keys: vi.fn(async () => ["debate-lab-v6-abc-shell", "debate-lab-v6-abc-pages"]), delete: vi.fn(async () => true) };
  const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
  new Function("self", "caches", "fetch", source)(self, caches, vi.fn());
  return { listeners, self, caches, client };
}

function loadFetchListener(host?: string): FetchListener {
  return loadWorker(host).listeners.fetch as FetchListener;
}

function navigate(path: string, host = "debateowl.com") {
  const respondWith = vi.fn();
  const request = { method: "GET", mode: "navigate", url: `https://${host}${path}`, destination: "document" } as unknown as Request;
  loadFetchListener(host)({ request, respondWith });
  return respondWith;
}

it("leaves embed navigations to the network, so an iframe never replaces or receives the cached app shell", () => {
  expect(navigate("/embed/debate-timer?format=bp")).not.toHaveBeenCalled();
  // Other navigations still go through the offline fallback.
  expect(navigate("/tools/debate-timer")).toHaveBeenCalledTimes(1);
  expect(navigate("/app")).toHaveBeenCalledTimes(1);
});

it("on the previous domain, removes itself and reloads its tabs onto the redirect to debateowl.com", async () => {
  const { listeners, self, caches, client } = loadWorker("debate.pi-stack.org");
  const pending: Promise<unknown>[] = [];
  const waitUntil = (promise: Promise<unknown>) => { pending.push(promise); };

  (listeners.install as Listener)({ waitUntil });
  await Promise.all(pending);
  expect(self.skipWaiting).toHaveBeenCalled();
  expect(caches.open).not.toHaveBeenCalled();

  (listeners.activate as Listener)({ waitUntil });
  await Promise.all(pending);
  expect(caches.delete).toHaveBeenCalledTimes(2);
  expect(self.registration.unregister).toHaveBeenCalled();
  expect(client.navigate).toHaveBeenCalledWith("https://debate.pi-stack.org/app/history?x=1");

  // Every request goes straight to the network, which answers with the 301.
  expect(navigate("/app", "debate.pi-stack.org")).not.toHaveBeenCalled();
  expect(navigate("/tools/debate-timer", "debate.pi-stack.org")).not.toHaveBeenCalled();
});
