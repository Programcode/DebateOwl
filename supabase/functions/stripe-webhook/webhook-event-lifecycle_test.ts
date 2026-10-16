import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";
import { type ClaimResult, processWebhookEvent } from "./webhook-event-lifecycle.ts";

Deno.test("a replayed webhook never retrieves or runs a handler", async () => {
  let calls = 0;
  const duplicate = await processWebhookEvent({ id: "evt-1", type: "customer.subscription.updated", data: { object: { id: "sub-1", status: "active" } } }, {
    claim: () => Promise.resolve<ClaimResult>("duplicate"),
    release: () => { throw new Error("must not release another delivery's claim"); },
    complete: () => { throw new Error("must not complete another delivery's claim"); },
    retrieveSubscription: () => { calls++; return Promise.resolve({ id: "sub-1", status: "canceled" }); },
    handle: () => { calls++; return Promise.resolve(); },
  });
  assertEquals(duplicate, "duplicate");
  assertEquals(calls, 0);
});

Deno.test("a failed webhook releases its claim so a retry can run", async () => {
  let claimed = false;
  let calls = 0;
  const deps = {
    claim: (): Promise<ClaimResult> => {
      if (claimed) return Promise.resolve("in_progress");
      claimed = true;
      return Promise.resolve("claimed");
    },
    release: () => { claimed = false; return Promise.resolve(); },
    complete: () => Promise.resolve(),
    retrieveSubscription: () => Promise.resolve({ id: "sub-1" }),
    handle: () => { if (++calls === 1) throw new Error("database failed"); return Promise.resolve(); },
  };
  const event = { id: "evt-1", type: "invoice.payment_failed", data: { object: { id: "invoice-1" } } };
  await assertRejects(() => processWebhookEvent(event, deps), Error, "database failed");
  assertEquals(claimed, false);
  assertEquals(await processWebhookEvent(event, deps), "processed");
  assertEquals(calls, 2);
});

Deno.test("a distinct stale active update after deletion applies current canceled state", async () => {
  let tier = "pro";
  const seen = new Set<string>();
  const deps = {
    claim: (id: string) => { seen.add(id); return Promise.resolve<ClaimResult>("claimed"); },
    release: () => Promise.resolve(),
    complete: () => Promise.resolve(),
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

Deno.test("a delivery that finds another one mid-flight runs nothing and is told to retry", async () => {
  let calls = 0;
  const outcome = await processWebhookEvent({ id: "evt-1", type: "checkout.session.completed", data: { object: { id: "cs-1" } } }, {
    claim: () => Promise.resolve<ClaimResult>("in_progress"),
    release: () => { throw new Error("must not release another delivery's claim"); },
    complete: () => { throw new Error("must not complete another delivery's claim"); },
    retrieveSubscription: () => { calls++; return Promise.resolve({ id: "sub-1" }); },
    handle: () => { calls++; return Promise.resolve(); },
  });
  assertEquals(outcome, "in_progress");
  assertEquals(calls, 0);
});
