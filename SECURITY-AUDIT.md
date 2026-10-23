# DebateLab security audit

**Status:** partial, time-boxed pass (two rounds). Highest-risk surfaces were reviewed first, then the remaining edge functions, RLS and `SECURITY DEFINER` grants, storage, XSS sinks, collaboration, AI quota, headers, the service worker, and the lockfile advisory feed. This is not a claim that the rest of the repository is clean.

## Severity-ranked summary

No critical or high issue was confirmed. Two issues are medium, two are low, and one stays unranked because the runtime result was not observed.

| Rank | Severity | Finding | Concrete result |
|---|---|---|---|
| 1 | **Medium** | Discount caps are never consumed, and Checkout sets `allow_promotion_codes: true` | A signed-in user passes `max_redemptions` and the per-user check forever. Stripe then accepts any promotion code on the account. Pro still requires a signed webhook. |
| 2 | **Medium** | Anon policies on `keepalive_events` and `keepalive_heartbeat` | The publishable anon key can insert and read monitor rows and overwrite the two heartbeat rows. No session. |
| 3 | **Low** | `share` returns the thrown error text | A signed-in user receives PostgREST or Postgres text from `consume_daily_quota`. |
| 4 | **Low** | `create-portal` returns Stripe's error text | A signed-in user receives Stripe's `message` when portal session creation fails. |
| — | **Not assigned** | `import-source` checks DNS, then `fetch`es the name again | Rebinding to a private address is what the code comments describe. This pass did not run the fetch. |

**Source:** `2ac31e605e609728d1baa8f67426aa38987bc689` (`main`, clean worktree at the start of the audit).

**Method:** [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) `skills/security-audit` (SKILL.md, RECONNAISSANCE.md, HUNTING.md, ATTACK-CLASSES.md, VALIDATION-AND-REPORTING.md, plus the AI, web/auth, client, cloud, data-isolation, supply-chain, protocol, and resource-exhaustion companions). A candidate needs a lower-trust principal, a crossed control, and a concrete result. Missing best practice without that result is listed under hardening, not as a finding.

**Execution boundary:** source inspection only. No requests to `*.supabase.co`, `debate.pi-stack.org`, Stripe, OpenRouter, Exa, or ElevenLabs. Target code was not executed: this environment cannot provide the skill's OS sandbox (empty allowlisted environment, no external network, read-only target, scratch-only writes, and explicit resource limits) together. Postgres was not started. The second pass ran `npm audit --package-lock-only` (the npm advisory endpoint, not the hosts above). The lockfile reported 0 info, low, moderate, high, and critical advisories. `node_modules` was not installed, so this is the lockfile feed only.

**Profile:** closest to a `quick` pass over edge functions, RLS and grants, admin, payments and promos, secrets, and the AI and import sinks those depend on. No prior `coverage-ledger.json` or `findings.json` exists for this repo. A full six-phase ledger (every surface × boundary × attack class, isolated hunters, fresh verifiers, schema validators) was not finished before the time limit. Unreviewed areas are listed at the end.

**Severity** is assigned only where the source trace is complete. `needs_validation` items have no severity. Overall severity is not higher than the result the source actually shows.

---

## Findings

### 1. Discount promo caps are never consumed, and Checkout then enables every Stripe promotion code

| | |
|---|---|
| Severity | **Medium** |
| Verification | **Source-verified.** The function text and the Checkout caller were re-read. Not executed in Postgres. |
| Principal | Any signed-in user |
| Boundary | App-side promo expiry, per-user single use, and `max_redemptions`, and the binding between an app discount code and one Stripe discount |

**Where**

- `supabase/migrations/20261016120000_security_preship_hardening.sql:116-131` — `redeem_promo_code_atomic`
- `supabase/functions/create-checkout/index.ts:277-319` and `:347-360`
- `supabase/functions/create-checkout/checkout-security.ts:50-59` — the cap check the Checkout path thinks it shares with the RPC

**What the code does**

For `extended_trial`, `extra_limit`, `free_month`, and `lifetime_pro`, the RPC locks the promo row, inserts `user_promos`, and increments `promo_codes.redemptions_count`. For `discount` it returns success immediately:

```116:131:supabase/migrations/20261016120000_security_preship_hardening.sql
    WHEN 'discount' THEN
      RETURN jsonb_build_object('success', true,
        'message', 'Discount code noted! Apply it at checkout for a discount.',
        'promoCodeId', v_promo.id, 'promoType', v_promo.type::text);
    ELSE
      RETURN jsonb_build_object('success', false, 'message', 'Unsupported promo code type');
  END CASE;

  INSERT INTO public.user_promos (user_id, promo_code_id) VALUES (v_user_id, v_promo.id)
  ...
  UPDATE public.promo_codes SET redemptions_count = COALESCE(redemptions_count, 0) + 1
```

`RETURN` leaves the function before the insert and the counter update. Nothing else in `supabase/functions/` writes `redemptions_count`. `create-checkout` then:

1. Loads the row with the service role (RLS does not apply).
2. Treats the code as exhausted only when `redemptions_count >= max_redemptions`. That counter stays 0 for every discount redemption, so a configured cap never trips.
3. Treats the code as already used only when a `user_promos` row exists. The discount branch never writes one, so the same user can pass this check forever.
4. Sets `allow_promotion_codes: true` on the Stripe Checkout Session. It does not send `promo.config`, a coupon id, or a promotion-code id. Stripe then shows its own promotion-code field, which accepts any promotion code on that Stripe account, not the string that was checked.

Checkout also answers expired and exhausted discount codes with different 400 bodies (`promo_expired` / `promo_exhausted`) and lets an unknown code fall through to a normal session. `redeem_promo_code_atomic` was written to give unknown, expired, and exhausted codes one answer and to stop after five failures in fifteen minutes. The Checkout lookup does not use that counter, so those guesses are outside the lockout.

**Exploit path**

1. Sign in (a normal account; no admin role).
2. `POST /functions/v1/redeem-promo` with `{ "code": "<active discount code>" }`. The response is success. Repeat. `user_promos` and `redemptions_count` do not change.
3. `POST /functions/v1/create-checkout` with the same `promoCode`, plus `successUrl` and `cancelUrl` on an origin in `ALLOWED_CHECKOUT_CALLBACKS`. The session is created with `allow_promotion_codes: true` even after `max_redemptions` would have been reached, and even on a later attempt by the same user.
4. On Stripe Checkout, enter any promotion code that exists on the DebateLab Stripe account. A code with a larger discount than the app code, or a 100% coupon, is accepted by Stripe if that code exists and is customer-facing. Whether any such extra code exists is a Stripe dashboard fact, not something this repo can show. The app-side cap bypass does not depend on that.

This does not grant Pro by itself. Pro still requires a completed Checkout Session, and `stripe-webhook` still checks the Stripe signature before `grantPro`. The defeated control is the app's discount limit and the binding to one code.

**Fix**

Keep one function, `redeem_promo_code_atomic`, as the only writer. Checkout calls it with the user-scoped client from `requireUser` (`auth.uid()` is null on the service-role client this function uses today). Store the Stripe promotion-code id in `promo_codes.config` under `stripe_promotion_code`. The id has to match `^promo_[A-Za-z0-9]+$`. A discount row without that id is the same failure as an unknown code.

Replace the early `RETURN` so the existing `user_promos` insert and `redemptions_count` update run. A second call by the same user, which Checkout makes after the promo screen, returns the stored id and does not increment again. Entitlement types stay single-use errors. Unknown, expired, exhausted, and malformed-config codes keep one message and the existing failure lock.

```sql
-- Replace the unknown/expired/exhausted/already-redeemed IF.
-- A user who already holds the discount row must get the id back even when
-- redemptions_count is now at the cap; otherwise Checkout fails after a claim.
IF NOT FOUND
   OR (v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now()) THEN
  v_failure := 'Invalid or expired promo code';
ELSIF EXISTS (
  SELECT 1 FROM public.user_promos
  WHERE user_id = v_user_id AND promo_code_id = v_promo.id
) THEN
  IF v_promo.type::text = 'discount'
     AND COALESCE(v_promo.config->>'stripe_promotion_code', '') ~ '^promo_[A-Za-z0-9]+$' THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Discount code noted! Apply it at checkout for a discount.',
      'promoCodeId', v_promo.id,
      'promoType', 'discount',
      'stripePromotionCode', v_promo.config->>'stripe_promotion_code');
  END IF;
  v_failure := 'You''ve already redeemed this code';
ELSIF v_promo.max_redemptions IS NOT NULL
      AND COALESCE(v_promo.redemptions_count, 0) >= v_promo.max_redemptions THEN
  v_failure := 'Invalid or expired promo code';
END IF;

-- Replace WHEN 'discount' THEN RETURN ... with:
WHEN 'discount' THEN
  IF COALESCE(v_config->>'stripe_promotion_code', '') !~ '^promo_[A-Za-z0-9]+$' THEN
    INSERT INTO private.promo_redeem_failures (user_id) VALUES (v_user_id);
    RETURN jsonb_build_object('success', false, 'message', 'Invalid or expired promo code');
  END IF;
  -- No user_settings write. The insert and counter below record the claim.

-- Final return, so Checkout can read the id. redeem-promo already ignores extra keys.
RETURN jsonb_build_object(
  'success', true,
  'message', CASE WHEN v_promo.type::text = 'discount'
    THEN 'Discount code noted! Apply it at checkout for a discount.'
    ELSE 'Promo code applied!' END,
  'promoCodeId', v_promo.id,
  'promoType', v_promo.type::text,
  'stripePromotionCode', CASE WHEN v_promo.type::text = 'discount'
    THEN v_config->>'stripe_promotion_code' ELSE NULL END);
```

In `create-checkout`, delete the service-role `promo_codes` / `user_promos` lookup, `discountPromoRefusal`, and `allowPromotionCodes`. `allow_promotion_codes` and `discounts` cannot be set together; the session must send only the server-side id.

```ts
const auth = await requireUser(req);
const user = auth.user;
let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
if (promoCode) {
  const { data: result, error } = await auth.userClient.rpc("redeem_promo_code_atomic", {
    p_code: promoCode,
  });
  const promotionCode = result?.stripePromotionCode;
  const allowed = !error
    && result?.success === true
    && result?.promoType === "discount"
    && typeof promotionCode === "string"
    && /^promo_[A-Za-z0-9]+$/.test(promotionCode);
  if (!allowed) {
    return new Response(JSON.stringify({
      error: "Invalid or expired promo code",
      code: "promo_invalid",
    }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  discounts = [{ promotion_code: promotionCode }];
}

const sessionParams: Stripe.Checkout.SessionCreateParams = {
  // customer, line_items, urls, metadata unchanged
  ...(discounts ? { discounts } : {}),
};
```

Every RPC failure, including the lockout, becomes that one 400. Do not branch on `promo_expired` or `promo_exhausted`. A Stripe error after the RPC has committed still consumes a redemption; that is the direction that keeps the cap. Do not delete `user_promos` on a client disconnect.

Add a pgTAP case: the `max_redemptions`-th distinct user gets a `promo_` id back; the next user gets `success = false` and one message; `redemptions_count` equals the cap; a second call by an earlier user does not increment. Assert the Checkout params object contains `discounts[0].promotion_code` and has no `allow_promotion_codes` key.

---

### 2. Imported URLs are checked, then fetched again without pinning the address

| | |
|---|---|
| Severity | **Not assigned** (`needs_validation`) |
| Verification | **Source-verified gap. Runtime result not observed.** |
| Principal | Any signed-in user who can spend an import |
| Claimed result | The Edge Function connects to a private, link-local, or metadata address after `validateResolvedPublicHost` allowed the name |

**Where**

- `supabase/functions/import-source/index.ts:82-108` — `validateResolvedPublicHost`, then `fetch` with `redirect: "manual"`, then the same checks on each hop
- `supabase/functions/import-source/url-validation.ts:42-65` — the file states the runtime cannot pin the checked address
- `docs/standards/security.md:28` — recorded residual from the 2026-08-19 review; still open

Literal private hosts, obfuscated IPv4, and IPv4-mapped IPv6 are rejected in `supabase/functions/_shared/url-validation.ts` before DNS. Redirects are not followed blindly. Citation URLs from the model are not fetched (`verifyUrl` in `supabase/functions/_shared/research.ts:412-418` returns false). The remaining hole is the one the code comments on: `Deno.resolveDns` and the later `fetch` are separate lookups. A name that answers with a public address for the check and a blocked address for the connection is not stopped by this function.

**Blocker:** whether the deployed Supabase Edge `fetch` re-resolves DNS, and whether that second answer is used for the TCP connection. This audit did not run the function.

**Safe check (local only):** point `import-source` at a hostname whose first `A`/`AAAA` answer is public and whose next answer is `127.0.0.1` or a dummy listener on a blocked range. Use a local resolver and a local listener. Do not aim this at cloud metadata, production, or staging.

**Fix**

Do not call `fetch(currentUrl)`. Dial one address that just passed `isPrivateIpv4` / `isPrivateIpv6`, and set SNI and `Host` to the original name. Re-run the same pin on every redirect hop. `Deno.connect` to the IP avoids a second lookup. `Deno.startTls` is the TLS handshake with the original hostname. If the Edge runtime rejects raw sockets, put the same dial in an egress proxy and have the function call only that proxy.

```ts
async function publicAddresses(hostname: string, signal: AbortSignal): Promise<string[]> {
  const settled = await Promise.allSettled([
    Deno.resolveDns(hostname, "A", { signal }),
    Deno.resolveDns(hostname, "AAAA", { signal }),
  ]);
  const addresses = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  if (addresses.length === 0) throw new Error("Could not resolve host.");
  if (addresses.some((address) => isPrivateIpv4(address) || isPrivateIpv6(address))) {
    throw new Error("Private and local network URLs cannot be imported.");
  }
  return addresses;
}

async function pinnedConnection(url: URL, signal: AbortSignal): Promise<Deno.Conn> {
  const ip = (await publicAddresses(url.hostname, signal))[0];
  const port = url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);
  const tcp = await Deno.connect({ hostname: ip, port, signal });
  if (url.protocol !== "https:") return tcp;
  return await Deno.startTls(tcp, { hostname: url.hostname });
}
```

Write the HTTP/1.1 request on that connection with `Host: url.host`. Read the status line. On a 3xx, cancel the body, resolve `Location` against `url`, run `validatePublicHttpUrl`, and call `pinnedConnection` again. Never pass the hostname to `fetch`.

The proxy form, if sockets are blocked:

```ts
await fetch(Deno.env.get("IMPORT_EGRESS_PROXY")!, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url: currentUrl.toString() }),
  signal,
  redirect: "manual",
});
```

The proxy resolves, rejects any address `isPrivateIpv4` / `isPrivateIpv6` accepts as blocked, connects to a remaining address, and applies the same rule to each hop. It is the only host the function may dial. Keep the literal checks in `validatePublicHttpUrl` in front of either path.

The safe local check is unchanged: a resolver that answers the first lookup with a public address and the connection lookup with `127.0.0.1` or a dummy listener on a blocked range. Confirm the pinned dial hits the public address and the proxy refuses the second answer. Do not aim either at cloud metadata, production, or staging. Until that run succeeds, this item stays `needs_validation` and has no severity.

---

### 3. Share failures return the thrown error text to the caller

| | |
|---|---|
| Severity | **Low** |
| Verification | **Source-verified.** Not triggered. |
| Principal | Any signed-in user |
| Result | Database or internal error text is copied into the HTTP body |

**Where:** `supabase/functions/share/index.ts:69-75` throws the PostgREST error from `consume_daily_quota`, and the handler returns it:

```201:206:supabase/functions/share/index.ts
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[SHARE API ERROR]", message);
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
```

Insert failures earlier in the function use a fixed string. This path does not. A quota or schema failure can put Postgres or PostgREST text in the response. That is disclosure to a user who already has an account. It does not by itself read another user's rows.

**Fix:** respond with a fixed message, as `create-checkout` and `account` already do. Keep the raw message in the server log, truncated, which this function already does.

---

### 4. The anon key can read and write the keepalive tables

| | |
|---|---|
| Severity | **Medium** |
| Verification | **Source-verified.** Policies and grants were re-read. Not executed against Postgres. |
| Principal | Anyone who has the publishable anon key (it ships in the client) |
| Boundary | Operator uptime rows are writable and readable with no session |

**Where**

- `supabase/migrations/20260820070000_reconcile_prod_only_objects.sql:141-170`
- `supabase/migrations/20260923191320_explicit_legacy_table_grants.sql:31` — sequence `USAGE` for `anon`
- `supabase/migrations/20261016120000_security_preship_hardening.sql:141` — revokes `TRUNCATE`, `TRIGGER`, and `REFERENCES` from `anon` and `authenticated`. It does not revoke `INSERT`, `SELECT`, or `UPDATE`.

**What the code does**

Both tables have RLS on. The policies that exist are `TO anon` only, and the predicate is a string that is written in the migration:

- `keepalive_events`: `INSERT` and `SELECT` when `source = 'external-keepalive-monitor'`. `details` is unbounded `jsonb`.
- `keepalive_heartbeat`: `INSERT`, `SELECT`, and `UPDATE` when `id` is `external-keepalive` or `rpc-keepalive`.

`GRANT ALL` is given to `anon`, `authenticated`, and `service_role`. There is no `DELETE` policy, so `DELETE` is denied by RLS even though the grant includes it. There is no `authenticated` policy, so a signed-in JWT is also denied. The anon role is not. No later migration drops these policies or revokes `INSERT`/`SELECT`/`UPDATE`.

**Exploit path**

1. Take the anon key from the client bundle (`src/lib/supabase/projects.ts`). No user session.
2. `POST /rest/v1/keepalive_events` with `{"source":"external-keepalive-monitor","details":{...}}`. PostgREST accepts it. Repeat with a large `details` object. Each row stays.
3. `GET /rest/v1/keepalive_events?source=eq.external-keepalive-monitor` returns every such row, including whatever the real monitor has written into `details`.
4. `PATCH /rest/v1/keepalive_heartbeat?id=eq.external-keepalive` sets `touched_at`, `source`, and `details`. A monitor that treats a fresh `touched_at` as "the stack is up" can be shown a healthy beat while the stack is down, or the previous beat can be overwritten.

This is not another user's debate, library, or billing row. The concrete result is unauthenticated read and write of the operator heartbeat, plus unbounded inserts into `keepalive_events`.

**Fix**

```sql
REVOKE ALL ON TABLE public.keepalive_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.keepalive_heartbeat FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.keepalive_events_id_seq FROM anon, authenticated;
DROP POLICY IF EXISTS "keepalive_events_anon_insert" ON public.keepalive_events;
DROP POLICY IF EXISTS "keepalive_events_anon_select" ON public.keepalive_events;
DROP POLICY IF EXISTS "keepalive_heartbeat_anon_insert" ON public.keepalive_heartbeat;
DROP POLICY IF EXISTS "keepalive_heartbeat_anon_select" ON public.keepalive_heartbeat;
DROP POLICY IF EXISTS "keepalive_heartbeat_anon_update" ON public.keepalive_heartbeat;
```

Accept monitor writes only from a `SECURITY DEFINER` function granted to `service_role`, with `SET search_path = ''`, a dedicated secret compared in constant time, a fixed `source`, and a size cap on `details` (for example `octet_length(details::text) <= 1024`). Do not reuse `SUPABASE_SERVICE_ROLE_KEY` as that secret. The external monitor calls the function with the service role, or a private Edge Function that checks the secret and then writes with the service role.

---

### 5. Billing-portal failures return Stripe's error text

| | |
|---|---|
| Severity | **Low** |
| Verification | **Source-verified.** Not triggered. |
| Principal | Any signed-in user who can reach portal session creation |
| Result | Stripe's `message` is copied into the HTTP body |

**Where:** `supabase/functions/create-portal/index.ts:59-84` and `:156-162`.

`classifyStripeError` returns `stripeErr.message` for Stripe 4xx and 5xx responses. The handler sends that string to the browser. `resource_missing` is replaced with a fixed `no_active_subscription` body. Other Stripe failures are not. A portal create can fail with a message that names the customer id, the parameter Stripe rejected, or a request id. The secret key is not in that message. `create-checkout` already answers its own failures with a fixed string.

**Fix:** return a fixed `error` and `code` to the client. Log `message` and Stripe's `requestId` on the server, truncated.

---

## Reviewed, no boundary violation found

These were traced because they are the usual failure points. The source shows a control on the path. They are not findings.

**Edge authentication.** `supabase/config.toml` sets `verify_jwt = false` on the browser-called functions and on `stripe-webhook` and `demo-code-login`. Each browser function calls `requireUser` (`supabase/functions/_shared/auth.ts:57-73`), which checks a Bearer token with `auth.getUser` using the service role and then builds a user-scoped client with the anon key. `stripe-webhook` has no user JWT; it requires `stripe-signature` and `constructEventAsync` before any write (`supabase/functions/stripe-webhook/index.ts:48-62`). `demo-code-login` is pre-session by design.

**Admin.** `supabase/functions/admin/index.ts:98-114` requires a user and `user_roles.role = 'admin'` before any action. Role changes and prompt edits call `assertCurrentAdmin` again. Admin reporting RPCs are revoked from `anon` and `authenticated` and granted to `service_role` (`20261016120000_security_preship_hardening.sql:180-187`).

**Service role.** The service-role key is read from the function environment. It is not referenced under `src/`. Debate and library reads that use it filter `user_id` to the caller (`supabase/functions/_shared/debate-context-loader.ts:109-116`, `supabase/functions/ai/index.ts:372-377`). Account export and delete take the id from `requireUser`, not from the body (`supabase/functions/account/index.ts:119-135`).

**Entitlement columns.** Clients may update only `language`, `theme`, `feature_configs`, `custom_system_prompt`, `updated_at`, and `output_language` on `user_settings` (`20260819000000_security_hardening.sql:6-9`, `20260923190000_user_settings_output_language_grant.sql`). `subscription_tier`, `daily_limit_override`, `trial_ends_at`, and `grace_period_ends_at` are not in that grant. Later explicit grants do not give `authenticated` full update on that table (`20260923191320_explicit_legacy_table_grants.sql:27-28`). Quota RPCs reject any caller whose `auth.role()` is not `service_role`.

**Other promo types.** Non-discount redemption takes a per-user advisory lock, locks the promo row, and refuses to lower an existing entitlement (`20261016120000_security_preship_hardening.sql:44-115`).

**Checkout price and redirect.** Client `priceId` / `lookupKey` are ignored (`create-checkout/index.ts:228-230`). `successUrl` and `cancelUrl` must match an allowlisted origin (`checkout-security.ts:11-28`). A second open subscription is refused before a new session is created.

**Webhook user binding.** `checkout.session.completed` uses `metadata.user_id` set by Checkout, then retrieves the subscription from Stripe. Later invoice and subscription events resolve the user from the stored `stripe_subscription_id`, not from client-supplied metadata (`stripe-webhook/handlers.ts:103-168`).

**Demo codes.** `getDemoLoginRole` maps an `admin` code role to `user` (`supabase/functions/_shared/demo-code.ts:17`). Sign-in refuses when the email belongs to a non-demo user or to an account that is already `admin` or `banned` (`demo-code-login/index.ts:232-254`). `demo_access_codes` is revoked from `anon` and `authenticated`.

**Import and research SSRF, aside from finding 2.** Protocols other than http(s), localhost, and special-purpose ranges are rejected. Research page text comes from Exa's API with the server key. Model-supplied citation URLs are not fetched by the function.

**Voice.** ElevenLabs is called only after `verifyVoiceToken` binds user, feature, and text (`voice/index.ts:126-128`, `voice-token.ts:74-83`). The browser cannot speak arbitrary text on the operator key.

**Share links.** Creation requires `requireUser`. Public read is `get_shared_item(text)` only; table grants for clients were removed. Codes are 16 CSPRNG bytes. The function requires an expiry.

**RLS shape on user content.** Owner policies for cases, sources, chats, and messages checked in the initial migration use `auth.uid()` and, for messages, a chat the caller owns. This pass did not re-execute the full migration chain to prove production matches that source. The 2026-10-23 drop of drifted `shared_items`, `user_roles`, and `ai_requests` policies is in `20261023080000_drop_legacy_policies.sql` and refuses to run if the kept policies are not own-row selects.

**Client rendering.** AI markdown goes through `react-markdown` 9 without `rehype-raw`. Images are turned into links so a model cannot trigger a fetch of a source URL (`src/components/ui/markdown.tsx:33-39`). JSON-LD escapes `<` (`src/lib/seo/tool-pages.ts:125-128`). Announcement bodies are rendered as text nodes.

**Headers.** `vercel.json` sets `nosniff`, HSTS, a CSP with `object-src 'none'` and `frame-ancestors 'none'` except the timer embed, and `script-src 'self' https://js.jam.dev`. `style-src 'unsafe-inline'` is present and is not, by itself, a cross-user script injection.

**Secrets in tree.** Stripe values under tests and `.superset/workspace-test.env` are local fixtures (`sk_test_...`, `whsec_local-...`). `src/lib/supabase/projects.ts` contains anon JWTs. The payloads in that file use `"role":"anon"`. Anon keys are the publishable client key. No service-role JWT was found in source.

**CI.** Workflows that load staging, live-provider, or production-canary secrets are the ones AGENTS.md already names. This pass did not re-prove each job's ref guard.

**Second pass, edge functions.** Every `supabase/functions/*/index.ts` entry was checked for an auth gate. `requireUser` runs before work in `voice`, `workspace-invites`, `announcements`, `create-checkout`, `create-portal`, `export-gdoc`, `import-source`, `redeem-promo`, `share`, `ai`, `ai-stream`, `account`, and `admin`. `stripe-webhook` verifies the signature before writes. `demo-code-login` is the pre-session function. `export-gdoc` rejects a refresh token in the body and uses the caller's Google access token for that user's export. `announcements` reads and dismisses through the user-scoped client. `ai-stream` `normalizeHistory` keeps only `user` and `assistant` (`ai-stream/index.ts:87-95`). Workspace invite redemption is by digest after `requireUser`.

**Second pass, RLS and definer functions.** A scan of `CREATE FUNCTION` bodies in `supabase/migrations` found 71 `SECURITY DEFINER` definitions. Each one includes a `search_path` assignment (`''` or `public`), including `handle_new_user` (`SET search_path = public` after the body, `20260208000000_stripe_schema.sql:86`). The scan can miss a definition whose header is split in a way the script did not see; it did not miss a definer function that lacked the string `search_path`. `GRANT ALL` to `anon` on `curated_sources`, `evidence_cards`, and `sparring_sessions` has no `TO anon` policy. RLS denies those. The policies that allow `anon` are the keepalive policies in finding 4, plus `EXECUTE` on `get_shared_item(text)`, which is the public share read. `ai_usage_today()` is granted to `authenticated` and filters `auth.uid()` (`20261022220000_ai_quota_sessions.sql:223-237`). Quota claim, consume, and refund functions require `auth.role() = 'service_role'` (`:69`, `:146`, `:190`).

**Second pass, storage.** No `storage.objects` or `storage.buckets` policy appears in `supabase/migrations` or `config.toml`. With RLS on and no policy, a client JWT cannot read or write objects. `source_files.storage_key` is updatable by the owner (`owner_scoped_tables_rls_test.sql`). Account deletion deletes storage by `storage.objects.owner` / `owner_id`, and the migration says it does not follow `storage_key` (`20261001100000_account_deletion_and_export.sql:255-261`). That does not grant a cross-tenant object read. Whether a hosted bucket is public is not in this repo, so it is not a finding.

**Second pass, XSS and URLs.** `dangerouslySetInnerHTML` in `src/` is the JSON-LD script in `ToolPageLayout.tsx:149`, and `jsonLd` escapes `<`. Markdown uses `react-markdown` 9 with no `rehype-raw` and no custom `urlTransform`. Images are links. The auth callback tests reject a `javascript:` redirect. No `supabase.channel` or `postgres_changes` subscription exists under `src/`.

**Second pass, collaboration.** `services/collaboration/src/index.ts` verifies the Supabase JWT, then `postgres-store.ts:73-96` allows the room only when `workspace_members.user_id` matches, the document epoch matches, and a write also requires `workspace.status = 'active'`. The room name is not enough.

**Second pass, AI quota.** Session keys are client-supplied. `claim_ai_session_quota` is service-role only and the server passes the session cap and TTL. A client key does not reset the daily counter. The refund path returns units only when the session still has `calls_used = 1` and the charge id matches (`20261022220000_ai_quota_sessions.sql:146-168`). That is the cancelled-run refund, not a second charge for the same call.

**Second pass, headers and the worker.** `vercel.json:149-167` sets the CSP above. The timer embed uses `frame-ancestors *` and `script-src 'self'`. `public/sw.js` sends `/auth/v1`, `/rest/v1`, `/functions/v1`, `/storage/v1`, and `/auth/callback` through the network. Cached asset messages stay on this origin and under `/assets/`. No secret is in `vercel.json`.

**Second pass, dependencies.** `npm audit --package-lock-only` reported zero advisories. Deno `esm.sh` imports were not fed to an advisory database.

---

## Hardening (not findings)

- Voice tokens fall back to an HMAC derived from `SUPABASE_SERVICE_ROLE_KEY` when `SPARRING_INTEGRITY_SECRET` is unset (`voice-token.ts:52-59`). Forging a token then requires the service-role key, which is already full database access. The coding standard still says not to derive signing keys from it, so a missing dedicated secret is an operational footgun on rotation.
- `stripe-webhook` answers signature failure with `Webhook Error: ${message}` (`index.ts:60-62`). The Stripe library message is about the signature check, not the webhook secret. A fixed body would still be better.
- `get_shared_item` hashes the viewer IP with no secret (`20261023060000_share_view_dedup.sql:61-65`). Only `service_role` can read `share_views`. The comment in that migration already says an IPv4 address can be recovered from the hash by the operator.
- `share` share-code generation uses `byte % alphabetLength` (`share/index.ts:20-27`). The bias is too small to brute-force a 16-character code.
- Checkout's origin allowlist is stricter than CORS (no Vercel preview origins). That blocks preview checkouts; it is not an open redirect.

---

## Coverage gap

Still not reviewed deeply enough to call covered:

- The body of every workspace RPC. Membership checks were read on `create_workspace`-style functions and on the collaboration store. Each statement of each workspace function was not re-proved.
- Auth hook configuration that exists only in the hosted project.
- Whether any hosted storage bucket is public. Source has no bucket policy.
- Deno `esm.sh` URL advisories, and git history for secrets removed after commit.
- A dynamic pass for DOM XSS, open redirects, and prompt injection against a running app. `react-markdown` 9's default `urlTransform` was not read from an installed package (`node_modules` is absent).
- Effective production RLS. Source can drift from a database that had policies applied by hand. `20261023080000_drop_legacy_policies.sql` is the repo's attempt to close one such drift; this audit did not query a database.
- The import rebinding fetch (finding 2). The gap is in the source. The connection was not observed.

No confirmed critical or high issue was established in the surfaces that were read: unauthenticated code execution, service-role use from the client, cross-user debate or workspace reads, webhook forgery, or self-service admin grant.
