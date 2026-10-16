import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";
import { processWebhookEvent } from "./webhook-event-lifecycle.ts";

Deno.test("a replayed webhook never retrieves or runs a handler", async () => {
  let calls = 0;
  const duplicate = await processWebhookEvent({ id: "evt-1", type: "customer.subscription.updated", data: { object: { id: "sub-1", status: "active" } } }, {
    claim: () => Promise.resolve(false),
    release: () => { throw new Error("must not release another delivery's claim"); },
    retrieveSubscription: () => { calls++; return Promise.resolve({ id: "sub-1", status: "canceled" }); },
    handle: () => { calls++; return Promise.resolve(); },
  });
  assertEquals(duplicate, true);
  assertEquals(calls, 0);
});

Deno.test("a failed webhook releases its claim so a retry can run", async () => {
  let claimed = false;
  let calls = 0;
  const deps = {
    claim: () => { if (claimed) return Promise.resolve(false); claimed = true; return Promise.resolve(true); },
    release: () => { claimed = false; return Promise.resolve(); },
    retrieveSubscription: () => Promise.resolve({ id: "sub-1" }),
    handle: () => { if (++calls === 1) throw new Error("database failed"); return Promise.resolve(); },
  };
  const event = { id: "evt-1", type: "invoice.payment_failed", data: { object: { id: "invoice-1" } } };
  await assertRejects(() => processWebhookEvent(event, deps), Error, "database failed");
  assertEquals(claimed, false);
  assertEquals(await processWebhookEvent(event, deps), false);
  assertEquals(calls, 2);
});

Deno.test("a distinct stale active update after deletion applies current canceled state", async () => {
  let tier = "pro";
  const seen = new Set<string>();
  const deps = {
    claim: (id: string) => { seen.add(id); return Promise.resolve(true); },
    release: () => Promise.resolve(),
    retrieveSubscription: (id: string) => Promise.resolve({ id, status: "canceled" }),
    handle: (_type: string, subscription: { id: string; status?: string }) => {
      tier = subscription.status === "active" ? "pro" : "expired";
      return Promise.resolve();
    },
  };
  await processWebhookEvent({ id: "deleted", type: "customer.subscription.deleted", data: { object: { id: "sub-1", status: "canceled" } } }, deps);
  assertEquals(tier, "expired");
  await processWebhookEvent({ id: "stale-update", type: "customer.subscription.updated", data: { object: { id: "sub-1", status: "active" } } }, deps);
  assertEquals(tier, "expired");
  assertEquals(seen.size, 2);
});
