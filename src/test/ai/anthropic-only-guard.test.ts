// DebateLab's model spend must land on the Anthropic key (BYOK in OpenRouter),
// which Adam's Claude plan covers. Anything else bills OpenRouter credits. This
// guard fails when a default, the Auto pools, the test harness, or a request
// payload could send a call to a non-Anthropic model or let OpenRouter fall
// back to another provider or model. A student picking a non-Claude model by
// hand is the one deliberate exception; the model matrix (LIVE_MODEL=as-requested)
// is the one deliberate test exception.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  BACKGROUND_MODEL,
  DEFAULT_MODEL,
  DEFAULT_PRO_MODEL,
} from '../../../supabase/functions/_shared/model-catalog';
import { openRouterProviderOptions } from '../../../supabase/functions/_shared/provider-routing';

const root = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const isClaude = (id: string) => id.startsWith('anthropic/');

function sourceFiles(dir: string): string[] {
  return readdirSync(resolve(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules') return [];
    if (statSync(resolve(root, path)).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mjs|js|sh)$/.test(name) ? [path] : [];
  });
}

describe('Anthropic BYOK only', () => {
  it('app defaults and the research background model are Claude', () => {
    for (const id of [DEFAULT_MODEL, DEFAULT_PRO_MODEL, BACKGROUND_MODEL]) expect(isClaude(id), id).toBe(true);
  });

  it('Claude is pinned to the Anthropic provider with fallbacks off', () => {
    for (const id of [DEFAULT_MODEL, DEFAULT_PRO_MODEL, BACKGROUND_MODEL]) {
      const options = openRouterProviderOptions(id);
      expect(options.only).toEqual(['anthropic']);
      expect(options.allow_fallbacks).toBe(false);
    }
  });

  it('Auto Fast and Auto Pro route only among Claude models', () => {
    const router = read('supabase/functions/_shared/auto-model-router.ts');
    for (const pool of ['FAST_CANDIDATES', 'PRO_CANDIDATES']) {
      const body = new RegExp(`export const ${pool} = \\{([\\s\\S]*?)\\} as const;`).exec(router)?.[1];
      expect(body, `${pool} not found`).toBeTruthy();
      const ids = [...body!.matchAll(/^\s*"([^"]+)":/gm)].map((match) => match[1]);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(isClaude(id), `${pool} has ${id}`).toBe(true);
    }
    expect(router).toMatch(/fallbackFor[\s\S]*?"anthropic\/claude-haiku-5\.5" : "anthropic\/claude-sonnet-5\.5"/);
  });

  it('the agentic testing agent runs on Claude pinned to Anthropic: Haiku acts, Sonnet judges', () => {
    const config = read('e2e.config.ts');
    expect(config).toContain('const E2E_ACTOR_DEFAULT = "anthropic/claude-haiku-5.5";');
    expect(config).toContain('const E2E_JUDGE_DEFAULT = "anthropic/claude-sonnet-5.5";');
    expect(config).toContain('claudeOnly(process.env.E2E_AGENT_MODEL || E2E_ACTOR_DEFAULT)');
    expect(config).toContain('claudeOnly(process.env.E2E_JUDGE_MODEL || E2E_JUDGE_DEFAULT)');
    expect(config).toContain('provider: { only: ["anthropic"], allow_fallbacks: false }');
    expect(config).toContain('if (!id.startsWith("anthropic/"))');
    // No other model ID literal can slip in as a default.
    const vendors = /"((?:anthropic|openai|google|meta|meta-llama|deepseek|z-ai|x-ai|mistralai|qwen|inclusionai|moonshotai|minimax|nousresearch|cohere|amazon|microsoft)\/[^"]+)"/g;
    const ids = [...config.matchAll(vendors)].map((match) => match[1]);
    expect(ids).toContain('anthropic/claude-haiku-5.5');
    for (const id of ids) expect(isClaude(id), id).toBe(true);
  });

  it('live verification and the live gate default to Claude and refuse other families', () => {
    const verify = read('.claude/skills/verify-debatelab/bin/verify.sh');
    expect(verify).toMatch(/^LIVE_MODEL="\$\{VERIFY_LIVE_MODEL:-anthropic\/[^}]+\}"$/m);
    expect(verify).toMatch(/case "\$LIVE_MODEL" in anthropic\/\*\) ;; \*\)/);
    const gate = read('.superset/db-gate.sh');
    expect(gate).toMatch(/^LIVE_MODEL="\$\{LIVE_MODEL:-anthropic\/[^}]+\}"/m);
    expect(gate).toMatch(/case "\$LIVE_MODEL" in anthropic\/\*\|as-requested\) ;; \*\)/);
    const proxy = read('e2e/full-stack/fake-openrouter.mjs');
    expect(proxy).toContain('const ANTHROPIC_ONLY = { only: ["anthropic"], allow_fallbacks: false };');
    expect(proxy).toContain('liveModel !== "as-requested" && !liveModel.startsWith("anthropic/")');
  });

  it('no request payload enables provider fallbacks or a non-Claude models list', () => {
    const files = [
      ...sourceFiles('supabase/functions'),
      ...sourceFiles('scripts'),
      ...sourceFiles('agentic'),
      ...sourceFiles('e2e'),
      ...sourceFiles('.claude/skills/verify-debatelab'),
      ...sourceFiles('src/lib'),
      'e2e.config.ts',
    ].filter((path) => !/(\.test|_test|\.spec)\.(ts|tsx|mjs)$/.test(path));
    expect(files.length).toBeGreaterThan(50);
    for (const path of files) {
      const text = read(path);
      expect(text, `${path} enables allow_fallbacks`).not.toMatch(/["']?allow_fallbacks["']?\s*:\s*true/);
      for (const match of text.matchAll(/["']?\bmodels["']?\s*:\s*\[([^\]]*)\]/g)) {
        const ids = [...match[1].matchAll(/["']([^"']+)["']/g)].map((id) => id[1]);
        for (const id of ids) expect(isClaude(id), `${path} lists fallback model ${id}`).toBe(true);
      }
    }
  });
});
