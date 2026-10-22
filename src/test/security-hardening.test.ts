import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20260819000000_security_hardening.sql');
const advisorMigration = read('supabase/migrations/20260820090000_advisor_security_cleanup.sql');
// The ai function is split into an entrypoint and focused modules; check
// every non-test source file it ships.
const ai = (readdirSync(resolve(root, 'supabase/functions/ai'), { recursive: true }) as string[])
  .filter((path) => path.endsWith('.ts') && !/[._]test\.ts$/.test(path))
  .sort()
  .map((path) => read(`supabase/functions/ai/${path}`))
  .join('\n');
const stream = read('supabase/functions/ai-stream/index.ts');
const modelCatalog = read('supabase/functions/_shared/model-catalog.ts');
const importer = read('supabase/functions/import-source/index.ts');
// Entitlement and rate-limit logic is shared by ai/ and ai-stream/ since the
// two copies drifted. Behaviour is covered by _shared/entitlements.test.ts;
// these assertions only pin the fail-closed shape at its single source.
const entitlements = read('supabase/functions/_shared/entitlements.ts');
const share = read('supabase/functions/share/index.ts');
const promo = read('supabase/functions/redeem-promo/index.ts');
const demoLogin = read('supabase/functions/demo-code-login/index.ts');

describe('security hardening regressions', () => {
  it('makes entitlements and usage ledger service-controlled and fails closed for missing state', () => {
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON public.user_settings');
    expect(migration).toContain('GRANT UPDATE (language, theme, feature_configs, custom_system_prompt, updated_at)');
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON public.ai_requests');
    expect(entitlements).toContain('if (!user) return { tier: "expired", dailyLimit: 0');
    for (const source of [ai, stream]) expect(source).toContain('from "../_shared/entitlements.ts"');
  });

  it('uses one server-only atomic quota reservation from every billable entrypoint', () => {
    expect(migration).toContain('ON CONFLICT (user_id, usage_date) DO UPDATE');
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(entitlements).toContain('consume_ai_quota');
    expect(importer).toContain('consume_daily_quota');
    expect(entitlements).toContain('Unable to verify your quota');
    expect(entitlements).not.toContain('return { allowed: true }; // Fail open');
    expect(entitlements).not.toContain('return { allowed: true };\n  } catch');
  });

  it('uses code-scoped sharing and disallows anonymous share creation', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "shared_items_select_public"');
    expect(migration).toContain('FUNCTION public.get_shared_item(p_share_code text)');
    // requireUser refuses a missing, empty, or rejected token with 401, so the
    // creator is always a verified user. share/auth_test.ts covers the behavior.
    expect(share).toContain('userId = (await requireUser(req)).user.id');
    expect(share).toContain('created_by: userId');
    expect(share).toContain('crypto.getRandomValues');
    const sharedPage = read('src/pages/SharedPage.tsx');
    expect(sharedPage).toContain("rpc('get_shared_item'");
    expect(migration).toContain('SET view_count = public.shared_items.view_count + 1');
    expect(sharedPage).not.toContain("rpc('increment_share_view'");
  });

  it('requires admin authorization for sensitive analytics RPCs', () => {
    expect(migration).toContain('FUNCTION public.require_admin()');
    expect(migration.match(/PERFORM public\.require_admin\(\);/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('binds promo redemption to the JWT subject rather than a caller-supplied user id', () => {
    expect(migration).toContain('v_user_id uuid := auth.uid()');
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.redeem_promo_code_atomic(uuid, text)');
    const promoRpc = migration.slice(migration.indexOf('FUNCTION public.redeem_promo_code_atomic'));
    expect(promoRpc).not.toContain('p_user_id uuid');
    expect(promo).toContain('userClient.rpc("redeem_promo_code_atomic", { p_code: code })');
  });

  // Importer DNS checks, body caps and the deadline are covered by behavior in
  // import-source/url-validation.test.ts, import-source/deadline_test.ts and
  // _shared/bounded-body.test.ts.

  it('uses allowlisted model/provider pairs and SSRF-safe citation verification', () => {
    expect(modelCatalog).toContain('id: "z-ai/glm-5.3-flash"');
    expect(modelCatalog).toContain('id: "anthropic/claude-haiku-5.5"');
    expect(modelCatalog).toContain('id: "openai/gpt-6-luna"');
    expect(modelCatalog).toContain('id: "google/gemini-3.8-flash"');
    expect(ai).toContain('function modelForRequest');
    expect(stream).toContain('isModelSelection(rawModel)');
    expect(stream).toContain('resolveModelSelection({');
    expect(ai).toContain('const provider: Provider = OPENROUTER_PROVIDER');
    expect(stream).toContain('const OPENROUTER_PROVIDER = "openrouter"');
    expect(entitlements).not.toContain('api.anthropic.com');
    expect(entitlements).not.toContain('api.openai.com');
    expect(ai).toContain('`${OPENROUTER_API_URL}/v1/chat/completions`');
    expect(stream).toContain('`${OPENROUTER_API_URL}/v1/chat/completions`');
    expect(read('supabase/functions/_shared/research.ts')).toContain('Deno.env.get("OPENROUTER_API_URL") || "https://openrouter.ai/api"');
    expect(ai).not.toContain('api.anthropic.com');
    expect(ai).not.toContain('api.openai.com');
    expect(stream).not.toContain('api.anthropic.com');
    expect(stream).not.toContain('api.openai.com');
    expect(ai).toContain('Unsupported model or provider combination');
    expect(stream).toContain('Unsupported model or provider combination');
    // SSRF-safe verification now lives in the shared research module.
    expect(read('supabase/functions/_shared/research.ts')).toContain('Do not fetch model-provided citation URLs');
    expect(ai).not.toContain('fetchWithTimeout(currentUrl.toString(), { method: "HEAD"');
  });

  it('reserves demo-code uses atomically before issuing a session handoff', () => {
    expect(demoLogin).toContain('consume_demo_access_code');
    expect(demoLogin).not.toContain('use_count: demoCode.use_count + 1');
    expect(read('supabase/migrations/20260820080000_security_scan_fixes.sql')).toContain('use_count = use_count + 1');
  });

  it('keeps trigger and internal security-definer functions out of the Data API', () => {
    expect(advisorMigration).toContain('REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated');
    expect(advisorMigration).toContain('REVOKE ALL ON FUNCTION public.increment_share_view(text) FROM PUBLIC, anon, authenticated');
    expect(advisorMigration).toContain('REVOKE ALL ON FUNCTION public.require_admin() FROM PUBLIC, anon, authenticated');
    expect(advisorMigration).toContain('REVOKE ALL ON FUNCTION public.redeem_promo_code_atomic(text) FROM PUBLIC, anon');
    expect(advisorMigration).toContain('GRANT EXECUTE ON FUNCTION public.redeem_promo_code_atomic(text) TO authenticated');
  });
});
