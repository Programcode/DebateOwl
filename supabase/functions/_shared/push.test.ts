import { assert, assertEquals } from "jsr:@std/assert@1.0.19";
import {
  checkReceipts,
  deliverPush,
  EXPO_PUSH_RECEIPTS_URL,
  EXPO_PUSH_SEND_URL,
  type ExpoMessage,
  type PushStore,
  type PushTicketRow,
  type PushTokenRow,
  sendPush,
} from "./push.ts";

const ALICE = "a1111111-1111-4111-8111-111111111111";
const BOB = "b2222222-2222-4222-8222-222222222222";
const MALLORY = "c3333333-3333-4333-8333-333333333333";

function token(name: string): string {
  return `ExponentPushToken[${name.padEnd(22, "x")}]`;
}

type MemoryStore = PushStore & {
  tokens: Array<PushTokenRow & { enabled: boolean }>;
  tickets: PushTicketRow[];
  requestedUsers: string[][];
};

/**
 * An in-memory store. `leak` makes enabledTokens also return rows for users
 * nobody asked for, the way a broken query would, so the sender's own check is tested.
 */
function memoryStore(rows: PushTokenRow[], options: { leak?: boolean } = {}): MemoryStore {
  const store: MemoryStore = {
    tokens: rows.map((row) => ({ ...row, enabled: true })),
    tickets: [],
    requestedUsers: [],
    enabledTokens(userIds) {
      store.requestedUsers.push(userIds);
      return Promise.resolve(store.tokens.filter((row) => row.enabled && (options.leak || userIds.includes(row.user_id))));
    },
    disableTokens(tokens) {
      for (const row of store.tokens) if (tokens.includes(row.token)) row.enabled = false;
      return Promise.resolve();
    },
    saveTickets(tickets) {
      store.tickets.push(...tickets.map((ticket) => ({ ...ticket, created_at: new Date().toISOString() })));
      return Promise.resolve();
    },
    ticketsSentBefore(cutoff, limit) {
      return Promise.resolve(store.tickets.filter((ticket) => Date.parse(ticket.created_at) < cutoff.getTime()).slice(0, limit));
    },
    deleteTickets(ids) {
      store.tickets = store.tickets.filter((ticket) => !ids.includes(ticket.id));
      return Promise.resolve();
    },
  };
  return store;
}

type ExpoCall = { url: string; headers: Headers; body: unknown };

/** A fake Expo push service. `ticketFor` decides each message's ticket. */
function fakeExpo(handlers: {
  ticketFor?: (message: ExpoMessage, index: number) => unknown;
  receipts?: Record<string, unknown>;
  sendStatus?: number;
} = {}) {
  const calls: ExpoCall[] = [];
  let next = 0;
  const fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body));
    calls.push({ url, headers: new Headers(init?.headers), body });
    if (url === EXPO_PUSH_SEND_URL) {
      if (handlers.sendStatus) return Promise.resolve(new Response("busy", { status: handlers.sendStatus }));
      const data = (body as ExpoMessage[]).map((message, index) =>
        handlers.ticketFor?.(message, index) ?? { status: "ok", id: `ticket-${++next}` }
      );
      return Promise.resolve(Response.json({ data }));
    }
    if (url === EXPO_PUSH_RECEIPTS_URL) {
      const ids = (body as { ids: string[] }).ids;
      const data = Object.fromEntries(ids.flatMap((id) => (handlers.receipts?.[id] ? [[id, handlers.receipts[id]]] : [])));
      return Promise.resolve(Response.json({ data }));
    }
    throw new Error(`unexpected request to ${url}`);
  }) as typeof globalThis.fetch;
  return { fetch, calls, sends: () => calls.filter((call) => call.url === EXPO_PUSH_SEND_URL) };
}

Deno.test("each user's tokens get only that user's notification, in that token's language", async () => {
  const store = memoryStore([
    { token: token("alice-phone"), user_id: ALICE, locale: "hu" },
    { token: token("alice-ipad"), user_id: ALICE, locale: "en" },
    { token: token("bob-phone"), user_id: BOB, locale: "es" },
    { token: token("mallory-phone"), user_id: MALLORY, locale: "en" },
  ], { leak: true });
  const expo = fakeExpo();

  const summary = await sendPush(store, [
    { kind: "sparring_scored", userId: ALICE, sessionId: "alice-session" },
    { kind: "sparring_scored", userId: BOB, sessionId: "bob-session" },
  ], { fetch: expo.fetch });

  const sent = expo.sends().flatMap((call) => call.body as ExpoMessage[]);
  assertEquals(summary.messages, 3);
  assertEquals(
    sent.map((message) => [message.to, "sessionId" in message.data ? message.data.sessionId : null, message.title]),
    [
      [token("alice-phone"), "alice-session", "Elkészült a forduló értékelése"],
      [token("alice-ipad"), "alice-session", "Your round is scored"],
      [token("bob-phone"), "bob-session", "Tu ronda ya está puntuada"],
    ],
  );
  assert(!sent.some((message) => message.to === token("mallory-phone")), "a token nobody asked for got a message");
  assertEquals(store.requestedUsers, [[ALICE, BOB]]);
  assertEquals(Object.keys(sent[0].data).sort(), ["kind", "sessionId"]);
});

Deno.test("a ready result names its tool only, in each token's language", async () => {
  const store = memoryStore([
    { token: token("alice-phone"), user_id: ALICE, locale: "es" },
    { token: token("bob-phone"), user_id: BOB, locale: "en" },
  ]);
  const expo = fakeExpo();

  await sendPush(store, [
    { kind: "result_ready", userId: ALICE, feature: "generate" },
    { kind: "result_ready", userId: BOB, feature: "factoids" },
  ], { fetch: expo.fetch });

  const sent = expo.sends().flatMap((call) => call.body as ExpoMessage[]);
  assertEquals(sent.map((message) => [message.to, message.title, message.data]), [
    [token("alice-phone"), "Tu caso está listo", { kind: "result_ready", feature: "generate" }],
    [token("bob-phone"), "Your evidence is ready", { kind: "result_ready", feature: "factoids" }],
  ]);
});

Deno.test("messages go out in batches of 100 and every ticket is kept with its token", async () => {
  const rows = Array.from({ length: 250 }, (_, index) => ({
    token: token(`user${index}`),
    user_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    locale: "en",
  }));
  const store = memoryStore(rows);
  const expo = fakeExpo();

  const summary = await sendPush(
    store,
    rows.map((row) => ({ kind: "sparring_scored" as const, userId: row.user_id, sessionId: `session-${row.user_id}` })),
    { fetch: expo.fetch },
  );

  assertEquals(expo.sends().map((call) => (call.body as unknown[]).length), [100, 100, 50]);
  assertEquals(summary, { messages: 250, tickets: 250, disabled: 0, failedBatches: 0 });
  assertEquals(store.tickets.length, 250);
  assertEquals(store.tickets[0].token, rows[0].token);
  assertEquals(store.tickets[249].token, rows[249].token);
});

Deno.test("a DeviceNotRegistered ticket turns the token off; other errors do not", async () => {
  const store = memoryStore([
    { token: token("gone"), user_id: ALICE, locale: "en" },
    { token: token("busy"), user_id: ALICE, locale: "en" },
    { token: token("fine"), user_id: ALICE, locale: "en" },
  ]);
  const expo = fakeExpo({
    ticketFor: (message) => {
      if (message.to === token("gone")) return { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } };
      if (message.to === token("busy")) return { status: "error", message: "slow down", details: { error: "MessageRateExceeded" } };
      return undefined;
    },
  });

  const summary = await sendPush(store, [{ kind: "sparring_scored", userId: ALICE, sessionId: "s" }], { fetch: expo.fetch });

  assertEquals(summary.disabled, 1);
  assertEquals(store.tokens.map((row) => [row.token, row.enabled]), [
    [token("gone"), false],
    [token("busy"), true],
    [token("fine"), true],
  ]);
  assertEquals(store.tickets.map((ticket) => ticket.token), [token("fine")]);

  // A disabled token is not sent to again.
  const again = fakeExpo();
  await sendPush(store, [{ kind: "sparring_scored", userId: ALICE, sessionId: "s" }], { fetch: again.fetch });
  assert(!again.sends().some((call) => (call.body as ExpoMessage[]).some((message) => message.to === token("gone"))));
});

Deno.test("receipts are read only once due, turn off unregistered devices, and expire after a day", async () => {
  const now = new Date("2026-10-14T12:00:00.000Z");
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  const store = memoryStore([
    { token: token("gone"), user_id: ALICE, locale: "en" },
    { token: token("fine"), user_id: BOB, locale: "en" },
  ]);
  store.tickets = [
    { id: "fresh", token: token("fine"), created_at: minutesAgo(5) },
    { id: "unregistered", token: token("gone"), created_at: minutesAgo(20) },
    { id: "delivered", token: token("fine"), created_at: minutesAgo(30) },
    { id: "pending", token: token("fine"), created_at: minutesAgo(40) },
    { id: "expired", token: token("fine"), created_at: minutesAgo(25 * 60) },
  ];
  const expo = fakeExpo({
    receipts: {
      unregistered: { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
      delivered: { status: "ok" },
    },
  });

  const summary = await checkReceipts(store, { fetch: expo.fetch, now: () => now });

  assertEquals(expo.calls.length, 1);
  assertEquals((expo.calls[0].body as { ids: string[] }).ids.sort(), ["delivered", "expired", "pending", "unregistered"]);
  assertEquals(summary, { checked: 4, disabled: 1, deleted: 3 });
  assertEquals(store.tickets.map((ticket) => ticket.id).sort(), ["fresh", "pending"]);
  assertEquals(store.tokens.find((row) => row.token === token("gone"))?.enabled, false);
  assertEquals(store.tokens.find((row) => row.token === token("fine"))?.enabled, true);
});

Deno.test("a failed send keeps nothing and never throws to the caller", async () => {
  const store = memoryStore([{ token: token("alice"), user_id: ALICE, locale: "en" }]);
  const expo = fakeExpo({ sendStatus: 503 });
  const originalError = console.error;
  console.error = () => {};
  try {
    await deliverPush(store, [{ kind: "sparring_scored", userId: ALICE, sessionId: "s" }], { fetch: expo.fetch });
  } finally {
    console.error = originalError;
  }
  assertEquals(expo.sends().length, 1);
  assertEquals(store.tickets, []);
  assertEquals(store.tokens[0].enabled, true);
});

Deno.test("the access token is sent only when one is configured", async () => {
  const store = memoryStore([{ token: token("alice"), user_id: ALICE, locale: "en" }]);
  const without = fakeExpo();
  await sendPush(store, [{ kind: "sparring_scored", userId: ALICE, sessionId: "s" }], { fetch: without.fetch });
  assertEquals(without.calls[0].headers.get("authorization"), null);

  const withToken = fakeExpo();
  await sendPush(store, [{ kind: "sparring_scored", userId: ALICE, sessionId: "s" }], { fetch: withToken.fetch, accessToken: "expo-test-token" });
  assertEquals(withToken.calls[0].headers.get("authorization"), "Bearer expo-test-token");
});

Deno.test("nothing is read or sent when no one is named", async () => {
  const store = memoryStore([{ token: token("alice"), user_id: ALICE, locale: "en" }]);
  const expo = fakeExpo();
  await sendPush(store, [], { fetch: expo.fetch });
  assertEquals(store.requestedUsers, []);
  assertEquals(expo.calls, []);
});
