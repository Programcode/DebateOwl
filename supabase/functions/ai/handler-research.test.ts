/* eslint-disable @typescript-eslint/no-explicit-any */

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test('Factoids handler carries filtered Exa research through to verified output and provenance', async () => {
  const previousEnv = {
    SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    EXA_API_KEY: Deno.env.get('EXA_API_KEY'),
    GOOGLE_API_KEY: Deno.env.get('GOOGLE_API_KEY'),
  };
  Deno.env.set('SUPABASE_URL', 'https://handler-test.supabase.co');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test');
  Deno.env.set('EXA_API_KEY', 'exa-test');
  Deno.env.set('GOOGLE_API_KEY', 'google-test');

  const userId = '00000000-0000-0000-0000-000000000123';
  const futureTrial = '2999-01-01T00:00:00.000Z';
  const makeQuery = (table: string) => {
    const query: any = {};
    query.select = () => query;
    query.eq = () => query;
    query.in = () => query;
    query.order = () => query;
    query.limit = () => query;
    query.is = () => query;
    query.single = async () => {
      if (table === 'user_roles') return { data: { role: 'user' }, error: null };
      if (table === 'user_settings') {
        return {
          data: {
            subscription_tier: 'trial',
            daily_limit_override: 50,
            trial_ends_at: futureTrial,
            grace_period_ends_at: null,
          },
          error: null,
        };
      }
      if (table === 'global_prompts') return { data: null, error: { message: 'not configured' } };
      return { data: null, error: null };
    };
    query.maybeSingle = async () => ({ data: null, error: null });
    query.insert = async () => ({ data: null, error: null });
    return query;
  };

  const edgeSupabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from: (table: string) => makeQuery(table),
    rpc: async (name: string) => {
      if (name !== 'consume_daily_quota') throw new Error(`Unexpected RPC: ${name}`);
      return { data: [{ allowed: true, current_count: 1 }], error: null };
    },
  };

  globalThis.__edgeSupabaseCreateClient = (() => edgeSupabase) as any;

  const loopbackFetch = globalThis.fetch;
  const exaSearchBodies: Array<Record<string, unknown>> = [];
  let googleCalls = 0;
  const sourceUrl = 'https://www.energy.gov/example-transit-policy-report';

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === '127.0.0.1' && url.port === '43111') {
      return loopbackFetch(input, init);
    }

    if (url.hostname === 'api.exa.ai' && url.pathname === '/search') {
      const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      exaSearchBodies.push(body);
      return new Response(JSON.stringify({
        results: [{
          title: 'Official transport affordability report',
          url: sourceUrl,
          text: 'Official government evidence about fare policy, access, ridership, and transport affordability with detailed methodology.',
          publishedDate: '2026-03-01',
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (url.hostname === 'api.exa.ai' && url.pathname === '/contents') {
      return new Response(JSON.stringify({
        results: [{
          title: 'Official transport affordability report',
          url: sourceUrl,
          text: 'The agency reports a 12 percent increase in ridership after the fare intervention. The report describes the study design and cautions that the result is specific to the measured program.',
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (url.hostname === 'generativelanguage.googleapis.com') {
      googleCalls += 1;
      const body = JSON.parse(String(init?.body || '{}')) as {
        systemInstruction?: { parts?: Array<{ text?: string }> };
      };
      const systemText = body.systemInstruction?.parts?.[0]?.text || '';
      const modelOutput = systemText.includes('research assistant')
        ? { queries: [] }
        : {
            factoids: [{
              id: 'fact-1',
              shortClaim: 'The measured fare intervention increased ridership.',
              keyFigure: '12%',
              context: 'The government report measured a ridership increase after the fare intervention.',
              limitations: 'The report concerns one measured program and should not be generalized without care.',
              citation: {
                title: 'Official transport affordability report',
                publisher: 'Government agency',
                date: '2026-03-01',
                url: sourceUrl,
                verified: 'pending',
              },
              howToUse: 'Use as a bounded empirical example, not a universal causal estimate.',
              relevanceScore: 91,
            }],
            searchSuggestions: [],
            warnings: ['Do not generalize beyond the measured program.'],
            researchSummary: 'The official source supports a bounded empirical example.',
            verificationStatus: 'pending',
          };

      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(modelOutput) }] } }],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10, totalTokenCount: 30 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    throw new Error(`Unexpected external request in handler-boundary test: ${url.toString()}`);
  }) as typeof fetch;

  try {
    await import('./index.ts?handler-research-test');

    const response = await globalThis.fetch('http://127.0.0.1:43111', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-user-token',
        origin: 'http://localhost:8080',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        feature: 'factoids',
        model: 'gemini-3-flash-preview',
        temperature: 0.3,
        input: {
          claim: 'Fare-free public transport can increase ridership',
          direction: 'for',
          region: 'United States',
          sourceType: 'government',
          timeframe: '2020-2026',
          sourceCount: 5,
          language: 'en',
        },
        sources: [],
      }),
    });

    assert(response.status === 200, `Expected handler 200, got ${response.status}: ${await response.text()}`);
    const payload = await response.json() as {
      output?: { factoids?: Array<{ citation?: { verified?: string; url?: string } }>; verificationStatus?: string };
      discoveredSources?: Array<{ url?: string; qualityLabel?: string; sourceType?: string; query?: string }>;
    };

    assert(payload.output?.factoids?.length === 1, 'Expected one verified factoid');
    assert(payload.output?.factoids?.[0]?.citation?.verified === 'verified', 'Fetched strong source should verify the citation');
    assert(payload.output?.verificationStatus === 'complete', 'Handler should finalize verification status');
    assert(payload.discoveredSources?.some((source) => source.url === sourceUrl && source.qualityLabel !== 'weak'), 'Expected consulted source provenance in handler response');
    assert(exaSearchBodies.some((body) => Array.isArray(body.includeDomains)), 'Expected a government includeDomains request at the handler boundary');
    assert(exaSearchBodies.every((body) => !String(body.query || '').includes('site:')), 'Handler must not emit site: query operators');
    assert(googleCalls >= 2, `Expected follow-up-decision and main model calls, got ${googleCalls}`);
  } finally {
    globalThis.fetch = loopbackFetch;
    globalThis.__edgeSupabaseCreateClient = undefined;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
