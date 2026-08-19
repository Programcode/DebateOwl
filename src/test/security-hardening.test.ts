import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20260819000000_security_hardening.sql');
const ai = read('supabase/functions/ai/index.ts');
const stream = read('supabase/functions/ai-stream/index.ts');
const importer = read('supabase/functions/import-source/index.ts');
const share = read('supabase/functions/share/index.ts');
const promo = read('supabase/functions/redeem-promo/index.ts');

describe('security hardening regressions', () => {
  it('makes entitlements and usage ledger service-controlled and fails closed for missing state', () => {
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON public.user_settings');
    expect(migration).toContain('GRANT UPDATE (language, theme, feature_configs, custom_system_prompt, updated_at)');
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON public.ai_requests');
    expect(ai).toContain('if (!user) return { tier: "expired", dailyLimit: 0');
    expect(stream).toContain('if (!user) return { tier: "expired", dailyLimit: 0');
  });

  it('uses one server-only atomic quota reservation from every billable entrypoint', () => {
    expect(migration).toContain('ON CONFLICT (user_id, usage_date) DO UPDATE');
    expect(migration).toContain("auth.role() <> 'service_role'");
    for (const source of [ai, stream, importer]) expect(source).toContain('consume_daily_quota');
    expect(ai).toContain('Unable to verify your quota');
    expect(stream).toContain('Unable to verify your quota');
  });

  it('uses code-scoped sharing and disallows anonymous share creation', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "shared_items_select_public"');
    expect(migration).toContain('FUNCTION public.get_shared_item(p_share_code text)');
    expect(share).toContain('if (!userId)');
    expect(share).toContain('crypto.getRandomValues');
    expect(read('src/pages/SharedPage.tsx')).toContain("rpc('get_shared_item'");
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

  it('resolves DNS and bounds importer bodies before processing', () => {
    expect(importer).toContain('validateResolvedPublicHost(currentUrl)');
    expect(importer).toContain('readBoundedText(response)');
    expect(read('supabase/functions/import-source/resource-limits.ts')).toContain('MAX_RESPONSE_BYTES');
  });

  it('uses allowlisted model/provider pairs and SSRF-safe citation verification', () => {
    expect(ai).toContain('function providerForModel');
    expect(ai).toContain('Unsupported model or provider combination');
    expect(ai).toContain('validatePublicHttpUrl(url)');
    expect(ai).toContain('redirect: "manual"');
  });
});
