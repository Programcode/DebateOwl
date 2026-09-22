import { pathToFileURL } from 'node:url';

const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
const JEV_MODEL = 'typesafe/jev-1.13';

export async function runJevSmoke({
  apiKey = process.env.OPENROUTER_API_KEY,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
} = {}) {
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');
  const startedAt = now();
  const response = await fetchImpl(DECISIONS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: JEV_MODEL,
      state: { text: 'DebateLab smoke test: label this request.' },
      questions: {
        fit: {
          type: 'choice',
          instructions: 'Is this request specific or vague?',
          criteria: { specific: 'The request is concrete', vague: 'The request is ambiguous' },
        },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`OpenRouter Jev smoke failed with ${response.status}`);
  const payload = await response.json();
  const answer = payload?.answers?.fit;
  if (typeof payload?.model !== 'string' || !payload.model.startsWith(JEV_MODEL) || answer?.type !== 'choice' ||
    (answer.choice !== 'specific' && answer.choice !== 'vague')) {
    throw new Error('OpenRouter Jev smoke returned a malformed response');
  }
  const inputTokens = payload.usage?.input_tokens ?? payload.usage?.prompt_tokens;
  const outputTokens = payload.usage?.output_tokens ?? payload.usage?.completion_tokens;
  return {
    model: payload.model,
    answers: { fit: answer.choice },
    latencyMs: Math.max(0, now() - startedAt),
    usage: {
      inputTokens: Number.isFinite(inputTokens) ? inputTokens : null,
      outputTokens: Number.isFinite(outputTokens) ? outputTokens : null,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runJevSmoke()
    .then((summary) => console.log(JSON.stringify(summary)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Jev smoke failed');
      process.exitCode = 1;
    });
}
