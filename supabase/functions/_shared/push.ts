// Push notifications through the Expo push service (exp.host), which serves
// Expo Go tokens today and development and store builds later.
//
// A notification names one user. Tokens are read for the named users with the
// service role, and every message is built from the notification of the user
// who owns the token row, so one user's content never reaches another user's
// phone. Messages carry fixed copy and IDs only, never debate content, because
// they show on a lock screen.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";

export const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_PUSH_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

/** Expo accepts at most 100 messages per send request. */
export const SEND_BATCH_SIZE = 100;
/** Expo accepts at most 1,000 ticket IDs per receipts request. */
export const RECEIPT_BATCH_SIZE = 1_000;
/** Expo asks senders to wait about 15 minutes before reading a receipt. */
export const RECEIPT_DELAY_MS = 15 * 60_000;
/** Expo keeps receipts for 24 hours; a ticket older than that has none left to read. */
export const RECEIPT_TTL_MS = 24 * 60 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

export type PushNotification = {
  kind: "sparring_scored";
  userId: string;
  sessionId: string;
};

type PushLocale = "en" | "es" | "hu";

const COPY: Record<PushNotification["kind"], Record<PushLocale, { title: string; body: string }>> = {
  sparring_scored: {
    en: { title: "Your round is scored", body: "See the judge's feedback in DebateLab." },
    es: { title: "Tu ronda ya está puntuada", body: "Mira los comentarios del juez en DebateLab." },
    hu: { title: "Elkészült a forduló értékelése", body: "Nézd meg a bíró visszajelzését a DebateLabben." },
  },
};

export type PushTokenRow = { token: string; user_id: string; locale: string };
export type PushTicketRow = { id: string; token: string; created_at: string };

/** The database operations the sender needs, all done with the service role. */
export interface PushStore {
  enabledTokens(userIds: string[]): Promise<PushTokenRow[]>;
  disableTokens(tokens: string[]): Promise<void>;
  saveTickets(tickets: Array<{ id: string; token: string }>): Promise<void>;
  ticketsSentBefore(cutoff: Date, limit: number): Promise<PushTicketRow[]>;
  deleteTickets(ids: string[]): Promise<void>;
}

export type PushOptions = {
  fetch?: typeof fetch;
  /** Only needed when "enhanced push security" is on for the Expo project. */
  accessToken?: string;
  now?: () => Date;
};

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  data: { kind: PushNotification["kind"]; sessionId: string };
};

type ExpoTicket = { status: "ok"; id: string } | { status: "error"; message?: string; details?: { error?: string } };
type ExpoReceipt = { status: "ok" } | { status: "error"; message?: string; details?: { error?: string } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function localeOf(value: string): PushLocale {
  return value === "es" || value === "hu" ? value : "en";
}

function message(notification: PushNotification, row: PushTokenRow): ExpoMessage {
  const copy = COPY[notification.kind][localeOf(row.locale)];
  return {
    to: row.token,
    title: copy.title,
    body: copy.body,
    sound: "default",
    data: { kind: notification.kind, sessionId: notification.sessionId },
  };
}

/**
 * One message per notification per enabled token of the user it names. A row
 * for any other user is dropped, whatever the store returned.
 */
export function buildMessages(notifications: PushNotification[], rows: PushTokenRow[]): ExpoMessage[] {
  const byUser = new Map<string, PushNotification[]>();
  for (const notification of notifications) {
    byUser.set(notification.userId, [...(byUser.get(notification.userId) ?? []), notification]);
  }
  return rows.flatMap((row) => (byUser.get(row.user_id) ?? []).map((notification) => message(notification, row)));
}

async function postJson(url: string, body: unknown, options: PushOptions): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
  const response = await (options.fetch ?? fetch)(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Expo push service answered ${response.status}`);
  }
  return await response.json();
}

function isDeviceNotRegistered(result: ExpoTicket | ExpoReceipt): boolean {
  return result.status === "error" && result.details?.error === "DeviceNotRegistered";
}

export type SendSummary = { messages: number; tickets: number; disabled: number; failedBatches: number };

/** Sends the notifications and keeps the tickets for a later receipts check. */
export async function sendPush(store: PushStore, notifications: PushNotification[], options: PushOptions = {}): Promise<SendSummary> {
  const summary: SendSummary = { messages: 0, tickets: 0, disabled: 0, failedBatches: 0 };
  const userIds = [...new Set(notifications.map((notification) => notification.userId))];
  if (userIds.length === 0) return summary;

  const messages = buildMessages(notifications, await store.enabledTokens(userIds));
  summary.messages = messages.length;
  const tickets: Array<{ id: string; token: string }> = [];
  const unregistered = new Set<string>();

  for (const batch of chunks(messages, SEND_BATCH_SIZE)) {
    let data: unknown;
    try {
      const body = await postJson(EXPO_PUSH_SEND_URL, batch, options);
      data = isRecord(body) ? body.data : undefined;
    } catch (error) {
      console.error("[PUSH] Send failed", error instanceof Error ? error.message : "unknown error");
      summary.failedBatches += 1;
      continue;
    }
    // Tickets come back in the order of the messages sent.
    if (!Array.isArray(data) || data.length !== batch.length) {
      console.error("[PUSH] Send answered without a ticket per message");
      summary.failedBatches += 1;
      continue;
    }
    data.forEach((value, index) => {
      if (!isRecord(value)) return;
      const ticket = value as ExpoTicket;
      if (ticket.status === "ok" && typeof ticket.id === "string" && ticket.id) {
        tickets.push({ id: ticket.id, token: batch[index].to });
      } else if (isDeviceNotRegistered(ticket)) {
        unregistered.add(batch[index].to);
      } else if (ticket.status === "error") {
        console.warn("[PUSH] Message rejected", ticket.details?.error ?? "unknown");
      }
    });
  }

  if (tickets.length > 0) await store.saveTickets(tickets);
  if (unregistered.size > 0) await store.disableTokens([...unregistered]);
  summary.tickets = tickets.length;
  summary.disabled = unregistered.size;
  return summary;
}

export type ReceiptSummary = { checked: number; disabled: number; deleted: number };

/**
 * Reads the receipts of tickets sent at least 15 minutes ago, turns off tokens
 * whose device is no longer registered, and forgets tickets whose receipt was
 * read or has expired. A ticket with no receipt yet waits for the next check.
 */
export async function checkReceipts(store: PushStore, options: PushOptions = {}): Promise<ReceiptSummary> {
  const now = (options.now ?? (() => new Date()))();
  const due = await store.ticketsSentBefore(new Date(now.getTime() - RECEIPT_DELAY_MS), RECEIPT_BATCH_SIZE);
  const summary: ReceiptSummary = { checked: due.length, disabled: 0, deleted: 0 };
  if (due.length === 0) return summary;

  const body = await postJson(EXPO_PUSH_RECEIPTS_URL, { ids: due.map((ticket) => ticket.id) }, options);
  const receipts = isRecord(body) && isRecord(body.data) ? body.data : {};
  const expiredBefore = now.getTime() - RECEIPT_TTL_MS;
  const unregistered = new Set<string>();
  const done: string[] = [];
  for (const ticket of due) {
    const receipt = receipts[ticket.id];
    if (isRecord(receipt)) {
      if (isDeviceNotRegistered(receipt as ExpoReceipt)) unregistered.add(ticket.token);
      done.push(ticket.id);
    } else if (Date.parse(ticket.created_at) < expiredBefore) {
      done.push(ticket.id);
    }
  }

  if (unregistered.size > 0) await store.disableTokens([...unregistered]);
  if (done.length > 0) await store.deleteTickets(done);
  summary.disabled = unregistered.size;
  summary.deleted = done.length;
  return summary;
}

/**
 * Checks earlier receipts, then sends. There is no scheduled receipts job yet,
 * so each send also settles the receipts that are due. Never throws: a push is
 * a courtesy, and must not fail the request that triggered it.
 */
export async function deliverPush(store: PushStore, notifications: PushNotification[], options: PushOptions = {}): Promise<void> {
  try {
    await checkReceipts(store, options);
  } catch (error) {
    console.error("[PUSH] Receipts check failed", error instanceof Error ? error.message : "unknown error");
  }
  try {
    const summary = await sendPush(store, notifications, options);
    if (summary.messages > 0) console.log(JSON.stringify({ message: "[PUSH] Send finished", ...summary }));
  } catch (error) {
    console.error("[PUSH] Send failed", error instanceof Error ? error.message : "unknown error");
  }
}

function throwOnError(result: { error: { code?: string; message: string } | null }, action: string) {
  if (result.error) throw new Error(`${action} failed (${result.error.code ?? "unknown"})`);
}

/** The PushStore over the service-role client. Never pass a user-scoped client. */
export function supabasePushStore(client: SupabaseClient): PushStore {
  return {
    async enabledTokens(userIds) {
      const result = await client
        .from("push_tokens")
        .select("token,user_id,locale")
        .in("user_id", userIds)
        .eq("enabled", true);
      throwOnError(result, "Reading push tokens");
      return (result.data ?? []) as PushTokenRow[];
    },
    async disableTokens(tokens) {
      const result = await client
        .from("push_tokens")
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .in("token", tokens);
      throwOnError(result, "Disabling push tokens");
    },
    async saveTickets(tickets) {
      // A token can be deleted between the send and here; its tickets have nothing left to check.
      const result = await client.from("push_tickets").upsert(tickets, { onConflict: "id", ignoreDuplicates: true });
      if (result.error?.code === "23503") return;
      throwOnError(result, "Saving push tickets");
    },
    async ticketsSentBefore(cutoff, limit) {
      const result = await client
        .from("push_tickets")
        .select("id,token,created_at")
        .lt("created_at", cutoff.toISOString())
        .order("created_at", { ascending: true })
        .limit(limit);
      throwOnError(result, "Reading push tickets");
      return (result.data ?? []) as PushTicketRow[];
    },
    async deleteTickets(ids) {
      const result = await client.from("push_tickets").delete().in("id", ids);
      throwOnError(result, "Deleting push tickets");
    },
  };
}

/** Optional: set only when enhanced push security is on for the Expo project. */
export function expoAccessToken(): string | undefined {
  return Deno.env.get("EXPO_ACCESS_TOKEN")?.trim() || undefined;
}
