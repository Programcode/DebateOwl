import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";

// These specs drive the real local stack: Supabase Auth, Postgres/RLS, every
// Edge Function, and a fake OpenRouter (e2e/full-stack/fake-openrouter.mjs).
// Only the paid model provider is replaced. `.superset/db-gate.sh` provides the
// environment below; without it the specs skip.
//
// This module is the Playwright-free half of stack.ts. The agentic suite in
// agentic/ runs under the e2e runner and cannot import @playwright/test.
const supabaseUrl = process.env.LOCAL_SUPABASE_URL;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const fakeUrl = process.env.FAKE_OPENROUTER_URL;
const demoPepper = process.env.DEMO_CODE_PEPPER;

export const MARK = "FAKE-PROVIDER";
export const stackReady = Boolean(supabaseUrl && serviceKey && fakeUrl && demoPepper);
// Only the locked gate loads these specs in CI; a skip there would read as a pass.
if (process.env.CI && !stackReady) throw new Error("Full-stack gate environment is incomplete");

export const admin = stackReady
  ? createClient(supabaseUrl!, serviceKey!, { auth: { persistSession: false } })
  : (null as never);

export type FakeRequest = { feature: string | null; model?: string; stream?: boolean; maxTokens?: number; system: string; user: string; continuation?: boolean };

export const fake = {
  async reset() {
    await fetch(`${fakeUrl}/__reset`, { method: "POST" });
  },
  async requests(): Promise<FakeRequest[]> {
    return (await fetch(`${fakeUrl}/__requests`)).json();
  },
  async fail(feature: string, status = 500, count = 1) {
    await fetch(`${fakeUrl}/__fail`, { method: "POST", body: JSON.stringify({ feature, status, count }) });
  },
  /** Cuts the next `count` replies for a feature off at max_tokens (fake mode only). */
  async truncate(feature: string, count = 1) {
    await fetch(`${fakeUrl}/__truncate`, { method: "POST", body: JSON.stringify({ feature, count }) });
  },
  /** Sets what the fake Stripe returns for GET /v1/subscriptions/:id. */
  async stripeSubscription(subscription: { id: string; status: string }) {
    await fetch(`${fakeUrl}/__subscription`, { method: "POST", body: JSON.stringify(subscription) });
  },
  /** Milliseconds between streamed chunks (fake mode only) until the next reset. */
  async streamDelay(ms: number) {
    await fetch(`${fakeUrl}/__stream-delay`, { method: "POST", body: JSON.stringify({ ms }) });
  },
};

export type DemoUser = { code: string; email: string; userId: () => Promise<string> };

async function userIdFor(email: string) {
  // The local project holds only test users, so one page covers it.
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((candidate) => candidate.email === email);
  if (!user) throw new Error(`No user for ${email}`);
  return user.id;
}

export async function createDemoUser(label: string): Promise<DemoUser & { codeId: string }> {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () => Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  const code = `DEMO-${part()}-${part()}`;
  const email = `${label}-${randomUUID()}@fullstack.test`;
  const codeHash = createHash("sha256").update(`${demoPepper}:${code}`).digest("hex");
  const { data, error } = await admin.from("demo_access_codes")
    .insert({ code_hash: codeHash, label, email, max_uses: 10 })
    .select("id")
    .single();
  if (error) throw error;
  return { code, email, codeId: data.id, userId: () => userIdFor(email) };
}

export async function deleteDemoUser(user: DemoUser & { codeId: string }) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const id = data?.users.find((candidate) => candidate.email === user.email)?.id;
  if (id) await admin.auth.admin.deleteUser(id);
  await admin.from("demo_access_codes").delete().eq("id", user.codeId);
}
