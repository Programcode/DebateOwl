#!/usr/bin/env node
// Seeds the staging Supabase project with invented but realistic data: a few
// accounts on different plans, debates with sources and saved results, and a
// demo code for the Pro account. Safe to rerun: rows have fixed ids per owner
// and are upserted, so a rerun restores the seed without duplicating it.
//
// Staging only. The project URL is fixed, and the service-role key is fetched
// with the Supabase CLI and checked to belong to staging before any write.
//
// Reads and writes ~/.config/debatelab/staging-access.env (mode 600):
//   STAGING_OWNER_EMAIL     Adam's Google account; gets admin, Pro and the debates
//   STAGING_SEED_PRO_CODE   demo code for the seeded Pro account (written here)
//
// Usage:
//   node scripts/staging/seed.mjs                      seed or restore everything
//   node scripts/staging/seed.mjs --session <account>  print a session for a seeded
//        account (admin, pro, trial, expired, owner) as JSON for the browser's
//        `debate-auth-staging` localStorage key. Demo codes turn an account into
//        Pro, so this is how agents sign in as trial or expired.
//   node scripts/staging/seed.mjs --owner-tier <pro|trial|expired>
//        put Adam's account on another plan until the next seed run
// See docs/staging.md.

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DEBATES } from "./fixtures.mjs";

export const STAGING_REF = "brifeyypjauyusmkptkx";
const URL_BASE = `https://${STAGING_REF}.supabase.co`;
const ACCESS_FILE = process.env.STAGING_ACCESS_FILE ?? join(homedir(), ".config/debatelab/staging-access.env");
const DOMAIN = "staging.debatelab.test";
const PRO_CODE_LABEL = "Staging seed: Pro debater";

const DAY = 24 * 60 * 60 * 1000;

/** Seeded accounts. `prefix` keeps each owner's copy of the fixtures apart. */
export function seedAccounts(ownerEmail, now = Date.now()) {
  const accounts = [
    { key: "admin", email: `seed-admin@${DOMAIN}`, role: "admin", tier: "pro", prefix: null },
    { key: "pro", email: `seed-pro@${DOMAIN}`, role: "user", tier: "pro", prefix: "5eed0001", debates: "all" },
    { key: "trial", email: `seed-trial@${DOMAIN}`, role: "user", tier: "trial", trialEndsAt: new Date(now + 5 * DAY).toISOString(), prefix: "5eed0002", debates: [2] },
    { key: "expired", email: `seed-expired@${DOMAIN}`, role: "user", tier: "expired", trialEndsAt: new Date(now - 10 * DAY).toISOString(), prefix: "5eed0003", debates: [0] },
  ];
  if (ownerEmail) accounts.push({ key: "owner", email: ownerEmail.toLowerCase(), role: "admin", tier: "pro", prefix: "5eed0004", debates: "all" });
  return accounts;
}

/** Gives one owner their own copy of the fixture ids. */
export function ownedCopy(value, prefix) {
  return JSON.parse(JSON.stringify(value).replaceAll("5eed0000-", `${prefix}-`));
}

function readAccessFile() {
  if (!existsSync(ACCESS_FILE)) return {};
  return Object.fromEntries(readFileSync(ACCESS_FILE, "utf8").split("\n")
    .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map(([, key, value]) => [key, value]));
}

function writeAccessFile(values) {
  mkdirSync(dirname(ACCESS_FILE), { recursive: true, mode: 0o700 });
  const body = [
    "# Staging access for DebateLab. Staging only; never commit or paste these. See docs/staging.md.",
    ...Object.entries(values).map(([key, value]) => `${key}=${value}`),
    "",
  ].join("\n");
  writeFileSync(ACCESS_FILE, body, { mode: 0o600 });
  chmodSync(ACCESS_FILE, 0o600);
}

function jwtClaims(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

/** Fetches staging's anon and service-role keys and proves they belong to staging. */
function stagingKeys() {
  const result = spawnSync("supabase", ["projects", "api-keys", "--project-ref", STAGING_REF, "--output-format", "json"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`supabase projects api-keys failed: ${result.stderr.split("\n").find((line) => line.trim()) ?? ""}`);
  const parsed = JSON.parse(result.stdout);
  const keys = Array.isArray(parsed) ? parsed : parsed.keys ?? [];
  const find = (name) => keys.find((key) => key.name === name)?.api_key;
  const anon = find("anon");
  const service = find("service_role");
  for (const [token, role] of [[anon, "anon"], [service, "service_role"]]) {
    const claims = jwtClaims(token ?? "");
    if (claims.ref !== STAGING_REF || claims.role !== role) throw new Error(`Refusing: the ${role} key is not staging's.`);
  }
  return { anon, service };
}

function client({ anon, service }) {
  async function request(path, { method = "GET", body, token = service, prefer, apikey = service } = {}) {
    const response = await fetch(`${URL_BASE}${path}`, {
      method,
      headers: {
        apikey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path.split("?")[0]} answered ${response.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }
  const upsert = (table, rows, onConflict = "id") => rows.length === 0 ? null : request(
    `/rest/v1/${table}?on_conflict=${onConflict}`,
    { method: "POST", body: rows, prefer: "resolution=merge-duplicates,return=minimal" },
  );
  return { request, upsert, anon };
}

async function listUsers(api) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { users: batch } = await api.request(`/auth/v1/admin/users?page=${page}&per_page=200`);
    users.push(...batch);
    if (batch.length < 200) return users;
  }
}

async function ensureUser(api, existing, email, appMetadata) {
  const found = existing.find((user) => user.email?.toLowerCase() === email);
  if (found) {
    if (appMetadata && Object.entries(appMetadata).some(([key, value]) => found.app_metadata?.[key] !== value)) {
      return api.request(`/auth/v1/admin/users/${found.id}`, {
        method: "PUT",
        body: { app_metadata: { ...found.app_metadata, ...appMetadata } },
      });
    }
    return found;
  }
  return api.request("/auth/v1/admin/users", {
    method: "POST",
    body: { email, email_confirm: true, app_metadata: appMetadata ?? {}, user_metadata: { seeded: true } },
  });
}

/** A session for a seeded account, minted with the service role without sending mail. */
async function sessionFor(api, email) {
  const link = await api.request("/auth/v1/admin/generate_link", { method: "POST", body: { type: "magiclink", email } });
  const tokenHash = link.hashed_token ?? link.properties?.hashed_token;
  const session = await api.request("/auth/v1/verify", {
    method: "POST",
    body: { type: "magiclink", token_hash: tokenHash },
    token: api.anon,
    apikey: api.anon,
  });
  return session;
}

/** Makes sure the seeded Pro account has a demo code we know. */
async function ensureProCode(api, access, adminEmail, proEmail) {
  const rows = await api.request(`/rest/v1/demo_access_codes?select=id,disabled_at&email=eq.${encodeURIComponent(proEmail)}`);
  const row = rows[0];
  if (row && !row.disabled_at && access.STAGING_SEED_PRO_CODE) return row.id;
  // The raw code is shown only once. If we lost it, replace the row.
  if (row) await api.request(`/rest/v1/demo_access_codes?id=eq.${row.id}`, { method: "DELETE" });
  const { access_token: token } = await sessionFor(api, adminEmail);
  const created = await api.request("/functions/v1/admin?action=create-demo-code", {
    method: "POST",
    token,
    apikey: api.anon,
    body: { label: PRO_CODE_LABEL, email: proEmail },
  });
  access.STAGING_SEED_PRO_CODE = created.code;
  writeAccessFile(access);
  return created.demoCode.id;
}

async function seedContent(api, userId, prefix, debateIndexes) {
  const debates = (debateIndexes === "all" ? DEBATES : debateIndexes.map((index) => DEBATES[index]))
    .map((debate) => ownedCopy(debate, prefix));
  const owned = (row) => ({ ...row, user_id: userId });
  await api.upsert("debates", debates.map(({ id, motion, settings, instructions }) => owned({ id, motion, settings, instructions })));
  for (const debate of debates) {
    const inDebate = (row) => owned({ ...row, debate_id: debate.id });
    await api.upsert("sources", debate.sources.map(inDebate));
    for (const table of ["cases", "attacks", "brainstorms", "factoids"]) {
      await api.upsert(table, debate.results[table].map(({ id, title, side, output }) => inDebate({ id, title, side, input: {}, output })));
    }
    await api.upsert("chats", debate.chats.map(({ id, title, side }) => inDebate({ id, title, side })));
    // Chats load ordered by created_at alone, so give each message its own time.
    const base = Date.parse("2026-09-28T18:00:00Z");
    await api.upsert("messages", debate.chats.flatMap((chat) => chat.messages.map((message, index) => ({
      ...message,
      chat_id: chat.id,
      output: null,
      created_at: new Date(base + index * 60_000).toISOString(),
    }))));
  }
  if (debates[0]) await api.upsert("current_debates", [{ user_id: userId, debate_id: debates[0].id }], "user_id");
  return debates.length;
}

export async function seed({ log = console.log } = {}) {
  const access = readAccessFile();
  const api = client(stagingKeys());
  const accounts = seedAccounts(access.STAGING_OWNER_EMAIL);
  const byKey = Object.fromEntries(accounts.map((account) => [account.key, account]));
  let users = await listUsers(api);

  const admin = await ensureUser(api, users, byKey.admin.email);
  await api.upsert("user_roles", [{ user_id: admin.id, role: "admin" }], "user_id");
  const codeId = await ensureProCode(api, access, byKey.admin.email, byKey.pro.email);
  users = await listUsers(api);

  for (const account of accounts) {
    const metadata = account.key === "pro" ? { demo_access_code_id: codeId } : undefined;
    const user = await ensureUser(api, users, account.email, metadata);
    await api.upsert("user_roles", [{ user_id: user.id, role: account.role }], "user_id");
    await api.upsert("user_settings", [{ user_id: user.id, ...tierSettings(account) }], "user_id");
    const count = account.prefix ? await seedContent(api, user.id, account.prefix, account.debates) : 0;
    log(`${account.key}: ${account.tier}${account.role === "admin" ? ", admin" : ""}, ${count} debate(s)`);
  }
  if (!access.STAGING_OWNER_EMAIL) log(`No STAGING_OWNER_EMAIL in ${ACCESS_FILE}; skipped the owner account.`);
  log(`Seeded staging. Access details: ${ACCESS_FILE}`);
}

/** Plan fields for a seeded account, as the seed writes them. */
function tierSettings(account) {
  return {
    subscription_tier: account.tier,
    trial_ends_at: account.trialEndsAt ?? null,
    daily_limit_override: account.tier === "pro" ? 200 : null,
    grace_period_ends_at: account.tier === "pro" ? "9999-12-31T23:59:59.999Z" : null,
  };
}

async function printSession(key) {
  const account = seedAccounts(readAccessFile().STAGING_OWNER_EMAIL).find((candidate) => candidate.key === key);
  if (!account) throw new Error(`Unknown account "${key}". Use admin, pro, trial, expired or owner.`);
  const api = client(stagingKeys());
  if (!(await listUsers(api)).some((user) => user.email?.toLowerCase() === account.email)) {
    throw new Error(`${account.email} is not on staging yet. Run the seed first.`);
  }
  process.stdout.write(`${JSON.stringify(await sessionFor(api, account.email))}\n`);
}

async function setOwnerTier(tier) {
  const access = readAccessFile();
  const owner = seedAccounts(access.STAGING_OWNER_EMAIL).find((account) => account.key === "owner");
  if (!owner) throw new Error(`No STAGING_OWNER_EMAIL in ${ACCESS_FILE}.`);
  const template = seedAccounts(null).find((account) => account.tier === tier);
  if (!template) throw new Error(`Unknown plan "${tier}". Use pro, trial or expired.`);
  const api = client(stagingKeys());
  const user = (await listUsers(api)).find((candidate) => candidate.email?.toLowerCase() === owner.email);
  if (!user) throw new Error("The owner account is not on staging yet. Sign in with Google once, or run the seed.");
  await api.upsert("user_settings", [{ user_id: user.id, ...tierSettings(template) }], "user_id");
  console.log(`Owner account is on ${tier} until the next seed run.`);
}

function main(argv) {
  if (argv[0] === "--session" && argv[1]) return printSession(argv[1]);
  if (argv[0] === "--owner-tier" && argv[1]) return setOwnerTier(argv[1]);
  if (argv.length > 0) throw new Error(`Unknown arguments: ${argv.join(" ")}`);
  return seed();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  Promise.resolve().then(() => main(process.argv.slice(2))).catch((error) => {
    console.error(`scripts/staging/seed.mjs failed: ${error.message}`);
    process.exit(1);
  });
}
