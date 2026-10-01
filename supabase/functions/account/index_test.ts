import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);

const { HttpError } = await import("../_shared/auth.ts");
const { cancelLiveSubscriptions, createHandler } = await import("./index.ts");
type AccountDeps = import("./index.ts").AccountDeps;

const caller = { id: "11111111-1111-4111-8111-111111111111", email: "student@example.test" };
const otherUserId = "22222222-2222-4222-8222-222222222222";

function harness(overrides: Partial<AccountDeps> = {}) {
  const calls: string[] = [];
  const deps: AccountDeps = {
    authenticate: () => Promise.resolve(caller),
    exportData: (userId) => {
      calls.push(`export:${userId}`);
      return Promise.resolve({ account: { id: userId } });
    },
    deletionPlan: (userId) => {
      calls.push(`plan:${userId}`);
      return Promise.resolve({
        stripe_customer_ids: ["cus_1"],
        storage_objects: [{ bucket_id: "files", name: `${userId}/a.pdf` }],
      });
    },
    cancelSubscriptions: (customerIds) => {
      calls.push(`cancel:${customerIds.join(",")}`);
      return Promise.resolve(1);
    },
    removeStorageObjects: (objects) => {
      calls.push(`storage:${objects.map((object) => object.name).join(",")}`);
      return Promise.resolve();
    },
    prepareDeletion: (userId) => {
      calls.push(`prepare:${userId}`);
      return Promise.resolve();
    },
    deleteAuthUser: (userId) => {
      calls.push(`delete:${userId}`);
      return Promise.resolve();
    },
    ...overrides,
  };
  const handler = createHandler(deps);
  const post = (body: unknown) => handler(new Request("https://edge.test/account", {
    method: "POST",
    headers: { authorization: "Bearer token", "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { calls, handler, post };
}

Deno.test("export returns the caller's own data and ignores a user id in the body", async () => {
  const { calls, post } = harness();
  const response = await post({ action: "export", userId: otherUserId, p_user_id: otherUserId });
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { account: { id: caller.id } });
  assertEquals(calls, [`export:${caller.id}`]);
});

Deno.test("delete removes only the caller's account, after billing and files", async () => {
  const { calls, post } = harness();
  const response = await post({ action: "delete", confirmation: caller.email, userId: otherUserId });
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { deleted: true, canceledSubscriptions: 1 });
  assertEquals(calls, [
    `plan:${caller.id}`,
    "cancel:cus_1",
    `storage:${caller.id}/a.pdf`,
    `prepare:${caller.id}`,
    `delete:${caller.id}`,
  ]);
});

Deno.test("delete without the typed confirmation deletes nothing", async () => {
  for (const confirmation of [undefined, "", "STUDENT@example.test", "DELETE"]) {
    const { calls, post } = harness();
    const response = await post({ action: "delete", confirmation });
    assertEquals(response.status, 400);
    assertEquals(calls, []);
  }
});

Deno.test("an account without an email confirms with DELETE", async () => {
  const { calls, post } = harness({ authenticate: () => Promise.resolve({ id: caller.id, email: null }) });
  assertEquals((await post({ action: "delete", confirmation: "DELETE" })).status, 200);
  assertEquals(calls.at(-1), `delete:${caller.id}`);
});

Deno.test("a billing failure stops deletion before any data is touched", async () => {
  const { calls, post } = harness({
    cancelSubscriptions: () => Promise.reject(new HttpError(502, "Could not cancel your subscription")),
  });
  const response = await post({ action: "delete", confirmation: caller.email });
  assertEquals(response.status, 502);
  assertEquals((await response.json()).error, "Could not cancel your subscription");
  assertEquals(calls, [`plan:${caller.id}`]);
});

Deno.test("a Storage failure keeps the account", async () => {
  const { calls, post } = harness({
    removeStorageObjects: () => Promise.reject(new HttpError(500, "Could not delete your stored files")),
  });
  assertEquals((await post({ action: "delete", confirmation: caller.email })).status, 500);
  assertEquals(calls.some((call) => call.startsWith("prepare:") || call.startsWith("delete:")), false);
});

Deno.test("unexpected errors do not leak internal messages", async () => {
  const { post } = harness({ exportData: () => Promise.reject(new Error("relation secret_table does not exist")) });
  const response = await post({ action: "export" });
  assertEquals(response.status, 500);
  assertEquals((await response.json()).error, "Something went wrong. Please try again.");
});

Deno.test("requests without a valid session reach no data", async () => {
  const { calls, post } = harness({
    authenticate: () => Promise.reject(new HttpError(401, "Authentication required")),
  });
  for (const body of [{ action: "export" }, { action: "delete", confirmation: caller.email }]) {
    assertEquals((await post(body)).status, 401);
  }
  assertEquals(calls, []);
});

Deno.test("only POST export and delete are accepted", async () => {
  const { calls, handler, post } = harness();
  assertEquals((await post({ action: "erase" })).status, 400);
  assertEquals((await handler(new Request("https://edge.test/account", { method: "GET" }))).status, 405);
  assertEquals((await handler(new Request("https://edge.test/account", { method: "OPTIONS" }))).status, 200);
  assertEquals(calls, []);
});

Deno.test("cancellation stops every live subscription and skips ended ones", async () => {
  const canceled: string[] = [];
  const subscriptions: Record<string, Array<{ id: string; status: string }>> = {
    cus_1: [
      { id: "sub_active", status: "active" },
      { id: "sub_old", status: "canceled" },
      { id: "sub_expired", status: "incomplete_expired" },
    ],
    cus_2: [{ id: "sub_past_due", status: "past_due" }, { id: "sub_trial", status: "trialing" }],
  };
  const count = await cancelLiveSubscriptions({
    list: async function* (customerId) {
      yield* subscriptions[customerId];
    },
    cancel: (id) => Promise.resolve(canceled.push(id)),
  }, ["cus_1", "cus_2"]);
  assertEquals(count, 3);
  assertEquals(canceled, ["sub_active", "sub_past_due", "sub_trial"]);
});

Deno.test("cancellation skips customers Stripe already deleted but fails on other errors", async () => {
  const missing = Object.assign(new Error("No such customer"), { code: "resource_missing" });
  const outage = Object.assign(new Error("Stripe is down"), { code: "api_error" });
  const api = (error: Error) => ({
    list: () => ({ [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }) }),
    cancel: () => Promise.resolve(),
  });
  assertEquals(await cancelLiveSubscriptions(api(missing), ["cus_gone"]), 0);
  await assertRejects(() => cancelLiveSubscriptions(api(outage), ["cus_1"]), Error, "Stripe is down");
});
