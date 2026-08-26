import { deepResearch, exaSearch } from './research.ts';
import { GOVERNMENT_SEARCH_DOMAINS } from './source-quality.ts';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test('exaSearch sends documented includeDomains/category request fields', async () => {
  const previousApiKey = Deno.env.get('EXA_API_KEY');
  const originalFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  Deno.env.set('EXA_API_KEY', 'test-key');

  globalThis.fetch = (async (_input: Request | URL | string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>);
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    await exaSearch('energy reliability data', undefined, {
      includeDomains: ['energy.gov'],
      category: 'news',
    });

    const body = bodies[0];
    assert(body.query === 'energy reliability data', 'query missing');
    assert(body.numResults === 10, `Expected numResults=10, got ${String(body.numResults)}`);
    assert(Array.isArray(body.includeDomains) && body.includeDomains[0] === 'energy.gov', 'includeDomains missing');
    assert(body.category === 'news', 'category missing');
    assert(!('num_results' in body), 'legacy num_results field should not be sent');
    const contents = body.contents as { text?: { maxCharacters?: number; max_characters?: number } };
    assert(contents?.text?.maxCharacters === 10000, 'text.maxCharacters missing');
    assert(contents?.text?.max_characters === undefined, 'legacy max_characters should not be sent');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) Deno.env.delete('EXA_API_KEY');
    else Deno.env.set('EXA_API_KEY', previousApiKey);
  }
});

Deno.test('government filtered search retries unfiltered when the domain filter has zero recall', async () => {
  const previousApiKey = Deno.env.get('EXA_API_KEY');
  const originalFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  Deno.env.set('EXA_API_KEY', 'test-key');

  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = String(input);
    if (!url.includes('/search')) throw new Error(`Unexpected network target: ${url}`);
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
    bodies.push(body);
    const filtered = Array.isArray(body.includeDomains);
    return new Response(JSON.stringify({
      results: filtered ? [] : [{
        title: 'Federal procurement guidance',
        url: 'https://www.gsa.gov/policy-regulations/procurement-policy',
        text: 'Official federal procurement guidance with enough detail to rank as a government source.',
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  try {
    const result = await deepResearch(
      'federal procurement reform',
      'United States',
      {
        provider: 'google',
        model: 'test-model',
        callModel: async () => ({ output: { queries: [] } }),
      },
      {
        maxFollowUpQueries: 0,
        maxUrlsToRead: 0,
        maxSeedQueries: 1,
        overallTimeoutMs: 1000,
        preferredSourceType: 'government',
      },
    );

    assert(bodies.length === 2, `Expected filtered request + unfiltered fallback, got ${bodies.length}`);
    assert(Array.isArray(bodies[0].includeDomains), 'first request should use includeDomains');
    assert((bodies[0].includeDomains as string[]).length === GOVERNMENT_SEARCH_DOMAINS.length, 'government filter list drifted');
    assert(bodies[1].includeDomains === undefined, 'fallback must remove the domain filter');
    assert(result.rankedResults.some((item) => item.url?.includes('gsa.gov')), 'fallback result was not retained');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) Deno.env.delete('EXA_API_KEY');
    else Deno.env.set('EXA_API_KEY', previousApiKey);
  }
});
