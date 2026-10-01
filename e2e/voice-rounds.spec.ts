import { expect, test, type Page, type Route } from '@playwright/test';
import { setLocale, stubSupabaseSession } from './helpers/auth';
import { say, spokenByBrowser, stubSpeech } from './helpers/voice';

// Voice rounds without a microphone, a speech service, or an ElevenLabs key.
// The recogniser and speechSynthesis are scripted in the page, and the `voice`
// route either returns audio or says the key is missing. These tests prove
// the flow and the fallback, not how any voice sounds.

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const jsonHeaders = { ...corsHeaders, 'content-type': 'application/json' };

/** One and a half seconds of silence as a WAV file, enough for Web Audio to decode and play. */
function silentWav(): Buffer {
  const sampleRate = 8_000;
  const samples = sampleRate * 1.5;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples * 2, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples * 2, 40);
  return Buffer.concat([header, Buffer.alloc(samples * 2)]);
}

type VoiceRequest = { feature: string; text: string; token: string };

/** Serve the `voice` Edge Function: audio when `available`, otherwise the missing-key error. */
async function routeVoice(page: Page, available: boolean, requests: VoiceRequest[]) {
  await page.route('**/functions/v1/voice', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: 'ok' });
      return;
    }
    requests.push(route.request().postDataJSON() as VoiceRequest);
    if (available) {
      await route.fulfill({ status: 200, headers: { ...corsHeaders, 'content-type': 'audio/mpeg' }, body: silentWav() });
    } else {
      await route.fulfill({ status: 503, headers: jsonHeaders, body: JSON.stringify({ error: 'Voice is not configured', code: 'voice_unavailable' }) });
    }
  });
}

const scorecard = {
  action: 'score',
  scorecard: {
    userScore: 78,
    aiScore: 74,
    categories: [
      { name: 'Logic', userScore: 20, aiScore: 18, feedback: 'The causal chain was clear.' },
      { name: 'Evidence', userScore: 18, aiScore: 18, feedback: 'The factual warrant needed more support.' },
      { name: 'Delivery', userScore: 19, aiScore: 19, feedback: 'The constructive used the measured time well.' },
      { name: 'Strategy', userScore: 21, aiScore: 19, feedback: 'The user prioritized the central clash.' },
    ],
    overallFeedback: 'The user won a narrow edge.',
    keyMoments: ['The rebuttal answered the strongest objection.'],
    improvementAreas: ['Compare the alternative policy explicitly.'],
    winner: 'user',
    verdict: 'The user had the edge.',
  },
};

type SparringBody = { voice?: boolean; input: { action: string; speeches: Array<{ speaker: string; content: string; delivery?: Record<string, unknown> }> } };

/** Serve sparring: clean text in `output`, tagged and "signed" segments beside it for voice requests. */
async function routeSparring(page: Page, bodies: SparringBody[]) {
  let reply = 0;
  await page.route('**/functions/v1/ai**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: 'ok' });
      return;
    }
    const body = route.request().postDataJSON() as SparringBody;
    bodies.push(body);
    if (body.input.action === 'score') {
      await route.fulfill({ status: 200, headers: jsonHeaders, body: JSON.stringify({ output: scorecard }) });
      return;
    }
    reply += 1;
    const clean = `Opponent reply ${reply}: a narrower pass reaches the same riders for less.`;
    await route.fulfill({
      status: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        output: { action: 'respond', speech: { content: clean, strategy: 'Compare the alternative.', targetedPoints: ['The price barrier.'] } },
        ...(body.voice ? { voice: { segments: [{ text: `[sighs] ${clean}`, token: `token-${reply}` }] } } : {}),
      }),
    });
  });
}

async function startVoiceSparring(page: Page) {
  await page.goto('/app/sparring', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Motion').fill('This House would make public transport free at the point of use.');
  await page.getByRole('combobox', { name: 'Round format' }).click();
  await page.getByRole('option', { name: /Lincoln-Douglas · 5 speeches/ }).click();

  await page.getByTestId('voice-mode').click();
  const notice = page.getByTestId('voice-notice');
  await expect(notice).toContainText('DebateLab never records or stores your audio.');
  await expect(notice).toContainText('In Chrome, that sends your audio to Google');
  await expect(notice).toContainText('sent as text to ElevenLabs');
  await page.getByRole('button', { name: 'Turn on voice' }).click();
  await expect(page.getByTestId('voice-mode')).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: 'Start round' }).click();
  // No Current Debate yet: run this round once without saving it to a debate.
  await page.getByRole('button', { name: 'Use once without saving to a debate' }).click();
  await expect(page.getByText('Round in progress')).toBeVisible();
}

async function speakSpeech(page: Page, turnLabel: string, words: string) {
  const draft = page.getByRole('textbox', { name: `Draft for ${turnLabel}` });
  await expect(draft).toBeVisible();
  await page.getByTestId('voice-mic').click();
  await expect(page.getByText('Listening')).toBeVisible();
  await say(page, words);
  await expect(draft).toHaveValue(words);
  await page.getByRole('button', { name: 'Submit speech' }).click();
}

test.beforeEach(async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
});

test('a spoken sparring round works on the browser voice when the server has no ElevenLabs key', async ({ page }) => {
  const aiBodies: SparringBody[] = [];
  const voiceRequests: VoiceRequest[] = [];
  await stubSpeech(page);
  await routeSparring(page, aiBodies);
  await routeVoice(page, false, voiceRequests);
  await startVoiceSparring(page);

  await speakSpeech(page, 'Affirmative constructive', 'Um, universal access removes the price barrier for every rider.');
  await expect(page.getByText('Opponent reply 1:')).toBeVisible();
  // The browser voice reads the reply, without the audio tag.
  await expect.poll(() => spokenByBrowser(page)).toBe('Opponent reply 1: a narrower pass reaches the same riders for less.');
  expect(voiceRequests).toHaveLength(1);
  expect(voiceRequests[0]).toEqual({ feature: 'sparring', text: '[sighs] Opponent reply 1: a narrower pass reaches the same riders for less.', token: 'token-1' });

  await speakSpeech(page, 'First affirmative rebuttal', 'A pass still leaves an eligibility gap, you know.');
  await expect(page.getByText('Opponent reply 2:')).toBeVisible();
  await expect.poll(() => spokenByBrowser(page)).toContain('Opponent reply 2:');
  // After the missing-key answer the page does not ask the voice function again.
  expect(voiceRequests).toHaveLength(1);

  await speakSpeech(page, 'Second affirmative rebuttal', 'Every marginal trip is covered, so the universal policy is more reliable.');
  await expect(page.getByRole('heading', { name: 'Here is what happened in the room.' })).toBeVisible();

  // Every opponent request asked for a spoken reply; the judge got the measurements.
  expect(aiBodies.map((body) => body.input.action)).toEqual(['respond', 'respond', 'score']);
  expect(aiBodies[0].voice).toBe(true);
  const judged = aiBodies[2].input.speeches;
  expect(judged[0].delivery).toMatchObject({ wordCount: 10, fillerCount: 1 });
  expect(judged[2].delivery).toMatchObject({ fillerCount: 1 });
  expect(judged.filter((speech) => speech.speaker === 'ai').every((speech) => !speech.content.includes('['))).toBe(true);

  const panel = page.getByTestId('spoken-delivery');
  await expect(panel).toContainText('Spoken delivery, measured');
  await expect(panel).toContainText('Nobody listened for tone, confidence or volume');
  await expect(panel).toContainText('words per minute');
  await expect(page.getByText('measured, not heard')).toBeVisible();

  // No audio tag is shown, spoken by the browser, or kept in the saved round.
  await page.getByRole('button', { name: 'Show transcript' }).click();
  await expect(page.getByText('Opponent reply 2: a narrower pass reaches the same riders for less.')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('[sighs]');
  expect(await spokenByBrowser(page)).not.toContain('[');
  const stored = await page.evaluate(() => `${JSON.stringify({ ...window.sessionStorage })}${JSON.stringify({ ...window.localStorage })}`);
  expect(stored).toContain('Opponent reply 1');
  expect(stored).not.toContain('[sighs]');
});

test('a spoken Crossfire exchange plays ElevenLabs audio through the voice function', async ({ page }) => {
  const voiceRequests: VoiceRequest[] = [];
  const aiVoiceFlags: Array<boolean | undefined> = [];
  await stubSpeech(page);
  await routeVoice(page, true, voiceRequests);
  await page.route('**/functions/v1/ai**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: 'ok' });
      return;
    }
    const body = route.request().postDataJSON() as { voice?: boolean; input: { transcript: Array<Record<string, unknown>> } };
    aiVoiceFlags.push(body.voice);
    // The server accepts only the turn fields it knows; measurements stay in the browser.
    expect(body.input.transcript.every((turn) => !('delivery' in turn))).toBe(true);
    await route.fulfill({
      status: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        output: { type: 'answer', text: 'Traffic counts show fewer vehicle trips.' },
        voice: { segments: [{ text: '[scoffs] Traffic counts show fewer vehicle trips.', token: 'crossfire-token' }] },
      }),
    });
  });

  await page.goto('/app/crossfire', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('crossfire-resolution').fill('Resolved: cities should ban private cars downtown.');
  await page.getByTestId('crossfire-argument').fill('Private cars create congestion and unsafe streets.');
  await page.getByTestId('voice-mode').click();
  await page.getByRole('button', { name: 'Turn on voice' }).click();
  await page.getByTestId('start-crossfire').click();
  await page.getByRole('button', { name: 'Use once without saving to a debate' }).click();

  await page.getByTestId('voice-mic').click();
  await expect(page.getByText('Listening')).toBeVisible();
  await say(page, 'What evidence supports the congestion claim?');
  await expect(page.getByTestId('crossfire-input')).toHaveValue('What evidence supports the congestion claim?');
  await page.getByTestId('submit-turn').click();

  await expect(page.getByText('Traffic counts show fewer vehicle trips.')).toBeVisible();
  // The audio comes from the voice function, which received the tagged text and its token.
  await expect(page.locator('[data-testid="opponent-voice"][data-engine="elevenlabs"][data-status="speaking"]')).toBeVisible();
  expect(aiVoiceFlags).toEqual([true]);
  expect(voiceRequests).toEqual([{ feature: 'crossfire', text: '[scoffs] Traffic counts show fewer vehicle trips.', token: 'crossfire-token' }]);
  expect(await spokenByBrowser(page)).toBe('');

  // The student can cut the opponent off.
  await page.getByTestId('opponent-voice-stop').click();
  await expect(page.getByTestId('opponent-voice')).toHaveCount(0);

  await expect(page.locator('body')).not.toContainText('[scoffs]');
  const stored = await page.evaluate(() => JSON.stringify({ ...window.localStorage }));
  expect(stored).toContain('Traffic counts show fewer vehicle trips.');
  expect(stored).not.toContain('[scoffs]');
});

test('voice mode is hidden with a reason where the browser cannot recognise speech', async ({ page }) => {
  await stubSpeech(page, { recognition: false });
  await page.goto('/app/sparring', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Sparring' })).toBeVisible();
  await expect(page.getByTestId('voice-mode')).toHaveCount(0);
  await expect(page.getByTestId('voice-unavailable')).toHaveText('Voice rounds are not available here because this browser has no speech recognition. Typing works as usual.');

  await page.goto('/app/crossfire', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('crossfire-resolution')).toBeVisible();
  await expect(page.getByTestId('voice-mode')).toHaveCount(0);
  await expect(page.getByTestId('voice-unavailable')).toBeVisible();
});

for (const [locale, label, noticeLine, privacyLine] of [
  ['es', 'Ronda con voz', 'DebateLab nunca graba ni guarda tu audio.', 'ElevenLabs para la voz del oponente'],
  ['hu', 'Hangos kör', 'A DebateLab soha nem rögzíti és nem tárolja a hangodat.', 'az ElevenLabsszel az ellenfél hangjához'],
] as const) {
  test(`the voice notice and the privacy page are translated (${locale})`, async ({ page }) => {
    await setLocale(page, locale);
    await stubSpeech(page);
    await page.goto('/app/sparring', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    await page.getByTestId('voice-mode').click();
    await expect(page.getByTestId('voice-notice')).toContainText(noticeLine);
    await expect(page.getByTestId('voice-notice')).toContainText('Google');
    await expect(page.getByTestId('voice-notice')).toContainText('ElevenLabs');

    await page.goto('/privacy', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toContainText(privacyLine);
    await expect(page.locator('main')).toContainText('Google');
  });
}
