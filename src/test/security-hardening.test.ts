import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20260819000000_security_hardening.sql');
const advisorMigration = read('supabase/migrations/20260820090000_advisor_security_cleanup.sql');
const outputLanguageMigration = read('supabase/migrations/20260827000000_user_settings_output_language_privilege.sql');
const ai = read('supabase/functions/ai/index.ts');
const stream = read('supabase/functions/ai-stream/index.ts');
const importer = read('supabase/functions/import-source/index.ts');
const share = read('supabase/functions/share/index.ts');
const promo = read('supabase/functions/redeem-promo/index.ts');
const demoLogin = read('supabase/functions/demo-code-login/index.ts');

describe('security hardening regressions', () => {
  it('makes entitlements and usage ledger service-controlled and fails closed for missing state', () => {
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON public.user_settings');
    expect(migration).toContain('GRANT UPDATE (language, theme, feature_configs, custom_system_prompt, updated_at)');
    expect(outputLanguageMigration).toContain('GRANT UPDATE (output_language) ON public.user_settings TO authenticated');
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON public.ai_requests');
    expect(ai).toContain('if (!user) return { tier: "expired", dailyLimit: 0');
    expect(stream).toContain('if (!user) return { tier: "expired", dailyLimit: 0');

    const settingsStore = read('src/lib/stores/settings-store.ts');
    expect(settingsStore).toContain(".from('user_settings')\n    .update(");
    expect(settingsStore).not.toContain(".from('user_settings').upsert");
  });

  it('uses one server-only atomic quota reservation from every billable entrypoint', () => {
    expect(migration).toContain('ON CONFLICT (user_id, usage_date) DO UPDATE');
    expect(migration).toContain("auth.role() <> 'service_role'");
    for (const source of [ai, stream, importer]) expect(source).toContain('consume_daily_quota');
    expect(ai).toContain('Unable to verify your quota');
    expect(stream).toContain('Unable to verify your quota');
    expect(importer).toContain('Unable to verify your quota');
    expect(ai).not.toContain('return { allowed: true }; // Fail open');
    expect(stream).not.toContain('return { allowed: true };\n  } catch');
  });

  it('uses code-scoped sharing and disallows anonymous share creation', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "shared_items_select_public"');
    expect(migration).toContain('REVOKE ALL ON public.shared_items FROM anon, authenticated');
    expect(migration).toContain('FUNCTION public.get_shared_item(p_share_code text)');
    expect(share).toContain('if (!userId)');
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

  it('keeps source import behind fixed egress and bounds provider responses', () => {
    expect(importer).toContain('const EXA_CONTENTS_URL = "https://api.exa.ai/contents"');
    const fetchTargets = [...importer.matchAll(/\bfetch\(([^,\n]+)/g)].map((match) => match[1].trim());
    expect(fetchTargets).toEqual(['EXA_CONTENTS_URL']);
    expect(importer).toContain('readBoundedText(response, EXA_RESPONSE_BYTES, FETCH_TIMEOUT_MS)');
    const limits = read('supabase/functions/import-source/resource-limits.ts');
    expect(limits).toContain('MAX_RESPONSE_BYTES');
    expect(limits).toContain('MAX_RESPONSE_READ_MS');
  });

  it('uses allowlisted model/provider pairs and does not fetch model citation URLs', () => {
    expect(ai).toContain('function providerForModel');
    expect(ai).toContain('Unsupported model or provider combination');
    const research = read('supabase/functions/_shared/research.ts');
    expect(research).toContain('Do not fetch model-provided citation URLs');
    expect(research).toContain('return false;');
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
