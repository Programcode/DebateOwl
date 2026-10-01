import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({
  SUPABASE_URL: 'https://supabase.test',
  getActiveAccessToken: () => 'access-token',
  supabase: { auth: { getSession: vi.fn() } },
}));
vi.mock('@/lib/supabase/env', () => ({ SUPABASE_ANON_KEY: 'anon-key' }));

import { browserUtterances, opponentVoice, type OpponentUtterance } from '@/lib/voice/opponent-voice';
import { parseVoicePayload } from '@/lib/voice/payload';

// A stand-in for Web Audio: every buffer "plays" until the test ends it.
class FakeSource {
  static playing: FakeSource[] = [];
  buffer: unknown = null;
  onended: (() => void) | null = null;
  connect = vi.fn();
  start = vi.fn(() => { FakeSource.playing.push(this); });
  stop = vi.fn(() => this.end());
  end() {
    FakeSource.playing = FakeSource.playing.filter((source) => source !== this);
    this.onended?.();
  }
}

class FakeAudioContext {
  static state: AudioContextState = 'running';
  static decoded: number[] = [];
  destination = {};
  get state() { return FakeAudioContext.state; }
  resume = vi.fn(async () => undefined);
  createBufferSource = () => new FakeSource();
  decodeAudioData = vi.fn(async (bytes: ArrayBuffer) => {
    FakeAudioContext.decoded.push(bytes.byteLength);
    return { duration: 1 } as AudioBuffer;
  });
}

class FakeUtterance {
  lang = '';
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}

const spoken: FakeUtterance[] = [];
const speechSynthesisMock = {
  getVoices: () => [{ lang: 'es-ES', name: 'Spanish' }, { lang: 'en-GB', name: 'British' }],
  speak: vi.fn((utterance: FakeUtterance) => { spoken.push(utterance); }),
  cancel: vi.fn(() => { spoken.splice(0).forEach((utterance) => utterance.onend?.()); }),
};

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

function audioResponse(): Response {
  return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
}

function errorResponse(status: number, code?: string): Response {
  return new Response(JSON.stringify({ error: 'nope', ...(code ? { code } : {}) }), { status, headers: { 'Content-Type': 'application/json' } });
}

const TWO_SEGMENTS: OpponentUtterance = {
  feature: 'sparring',
  text: 'That is one reading. It is not the only one.',
  language: 'en',
  voice: {
    segments: [
      { text: '[sighs] That is one reading.', token: 'token-1' },
      { text: 'It is not the only one. [laughs]', token: 'token-2' },
    ],
  },
};

async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

function requestBodies(): Array<{ feature: string; text: string; token: string }> {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init.body)));
}

describe('opponent voice', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSource.playing = [];
    FakeAudioContext.state = 'running';
    FakeAudioContext.decoded = [];
    spoken.length = 0;
    fetchMock.mockReset();
    speechSynthesisMock.speak.mockClear();
    speechSynthesisMock.cancel.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', speechSynthesisMock);
    opponentVoice.reset();
  });

  afterEach(() => {
    opponentVoice.reset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('plays each signed segment through the voice function, in order, then ends once', async () => {
    fetchMock.mockImplementation(async () => audioResponse());
    const onEnd = vi.fn();
    opponentVoice.speak(TWO_SEGMENTS, onEnd);
    await settle();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://supabase.test/functions/v1/voice');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer access-token', apikey: 'anon-key' });
    // ElevenLabs gets the tags; the second segment is fetched while the first plays.
    expect(requestBodies()).toEqual([
      { feature: 'sparring', text: '[sighs] That is one reading.', token: 'token-1' },
      { feature: 'sparring', text: 'It is not the only one. [laughs]', token: 'token-2' },
    ]);
    expect(opponentVoice.getState()).toMatchObject({ status: 'speaking', engine: 'elevenlabs' });
    expect(FakeSource.playing).toHaveLength(1);

    FakeSource.playing[0].end();
    await settle();
    expect(FakeSource.playing).toHaveLength(1);
    expect(onEnd).not.toHaveBeenCalled();

    FakeSource.playing[0].end();
    await settle();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(opponentVoice.getState()).toMatchObject({ status: 'idle', engine: null, notice: null });
    expect(speechSynthesisMock.speak).not.toHaveBeenCalled();
  });

  it('falls back to the browser voice without audio tags when the key is missing, and stops asking', async () => {
    fetchMock.mockImplementation(async () => errorResponse(503, 'voice_unavailable'));
    const onEnd = vi.fn();
    opponentVoice.speak(TWO_SEGMENTS, onEnd);
    await settle();

    expect(opponentVoice.getState()).toMatchObject({ status: 'speaking', engine: 'browser', notice: null });
    expect(spoken.map((utterance) => utterance.text).join(' ')).toBe('That is one reading. It is not the only one.');
    expect(spoken[0].lang).toBe('en-GB');
    expect(spoken[0].voice).toMatchObject({ name: 'British' });

    spoken.splice(0).forEach((utterance) => utterance.onend?.());
    await settle();
    expect(onEnd).toHaveBeenCalledTimes(1);

    // The next reply does not call the voice function again this session.
    const callsBefore = fetchMock.mock.calls.length;
    opponentVoice.speak(TWO_SEGMENTS);
    await settle();
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    expect(opponentVoice.getState().engine).toBe('browser');
  });

  it('tells the student when the daily allowance is used up and keeps reading with the browser voice', async () => {
    fetchMock.mockImplementation(async () => errorResponse(402, 'voice_limit_reached'));
    opponentVoice.speak(TWO_SEGMENTS);
    await settle();
    expect(opponentVoice.getState()).toMatchObject({ engine: 'browser', notice: 'limit' });
    expect(spoken.map((utterance) => utterance.text).join(' ')).not.toContain('[');
  });

  it('hands the rest of a reply to the browser voice when a later segment fails', async () => {
    fetchMock
      .mockImplementationOnce(async () => audioResponse())
      .mockImplementationOnce(async () => { throw new TypeError('network down'); });
    const onEnd = vi.fn();
    opponentVoice.speak(TWO_SEGMENTS, onEnd);
    await settle();
    expect(opponentVoice.getState().engine).toBe('elevenlabs');

    FakeSource.playing[0].end();
    await settle();
    expect(opponentVoice.getState()).toMatchObject({ status: 'speaking', engine: 'browser' });
    // Only the part ElevenLabs did not speak, and without its tag.
    expect(spoken.map((utterance) => utterance.text)).toEqual(['It is not the only one.']);

    // A one-off failure does not switch the provider off for the session.
    spoken.splice(0).forEach((utterance) => utterance.onend?.());
    await settle();
    expect(onEnd).toHaveBeenCalledTimes(1);
    fetchMock.mockImplementation(async () => audioResponse());
    opponentVoice.speak(TWO_SEGMENTS);
    await settle();
    expect(opponentVoice.getState().engine).toBe('elevenlabs');
  });

  it('hands the rest of the round to the browser voice after a provider error, and tries again next round', async () => {
    fetchMock.mockImplementation(async () => errorResponse(502, 'voice_provider_error'));
    opponentVoice.speak(TWO_SEGMENTS);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(opponentVoice.getState().engine).toBe('browser');
    spoken.splice(0).forEach((utterance) => utterance.onend?.());
    await settle();

    // Every request may cost a clip, so the next reply in this round does not ask again.
    opponentVoice.speak(TWO_SEGMENTS);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(opponentVoice.getState().engine).toBe('browser');
    expect(spoken.map((utterance) => utterance.text).join(' ')).toBe('That is one reading. It is not the only one.');

    // A new round gives ElevenLabs another chance.
    opponentVoice.beginRound();
    fetchMock.mockImplementation(async () => audioResponse());
    opponentVoice.speak(TWO_SEGMENTS);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(opponentVoice.getState().engine).toBe('elevenlabs');
  });

  it('clears the allowance notice when a new round starts', async () => {
    fetchMock.mockImplementation(async () => errorResponse(402, 'voice_limit_reached'));
    opponentVoice.speak(TWO_SEGMENTS);
    await settle();
    expect(opponentVoice.getState().notice).toBe('limit');
    opponentVoice.beginRound();
    expect(opponentVoice.getState()).toMatchObject({ status: 'idle', notice: null });
  });

  it('keeps ElevenLabs for the next reply when only a token was refused', async () => {
    fetchMock.mockImplementationOnce(async () => errorResponse(403, 'voice_token_invalid'));
    opponentVoice.speak(TWO_SEGMENTS);
    await settle();
    expect(opponentVoice.getState().engine).toBe('browser');
    spoken.splice(0).forEach((utterance) => utterance.onend?.());
    await settle();

    fetchMock.mockImplementation(async () => audioResponse());
    opponentVoice.speak(TWO_SEGMENTS);
    await settle();
    expect(opponentVoice.getState().engine).toBe('elevenlabs');
  });

  it('reads the unsigned rest of a long reply with the browser voice after the signed segments', async () => {
    fetchMock.mockImplementation(async () => audioResponse());
    const onEnd = vi.fn();
    opponentVoice.speak({ ...TWO_SEGMENTS, voice: { ...TWO_SEGMENTS.voice!, overflow: 'And here is the rest.' } }, onEnd);
    await settle();
    FakeSource.playing[0].end();
    await settle();
    FakeSource.playing[0].end();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(opponentVoice.getState()).toMatchObject({ status: 'speaking', engine: 'browser' });
    expect(spoken.map((utterance) => utterance.text)).toEqual(['And here is the rest.']);
    expect(onEnd).not.toHaveBeenCalled();

    spoken.splice(0).forEach((utterance) => utterance.onend?.());
    await settle();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('reads the signed segments and the unsigned rest when ElevenLabs is off', async () => {
    fetchMock.mockImplementation(async () => errorResponse(503, 'voice_unavailable'));
    opponentVoice.speak({ ...TWO_SEGMENTS, voice: { ...TWO_SEGMENTS.voice!, overflow: 'And here is the rest.' } });
    await settle();
    expect(spoken.map((utterance) => utterance.text).join(' ')).toBe('That is one reading. It is not the only one. And here is the rest.');
  });

  it('reads the clean reply with the browser voice when the server sent no segments', async () => {
    opponentVoice.speak({ feature: 'crossfire', text: '¿Qué estudio lo demuestra?', language: 'es' });
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(spoken.map((utterance) => utterance.text)).toEqual(['¿Qué estudio lo demuestra?']);
    expect(spoken[0].lang).toBe('es-ES');
  });

  it('stops mid-reply, ends once, and ignores audio that arrives afterwards', async () => {
    fetchMock.mockImplementation(async () => audioResponse());
    const onEnd = vi.fn();
    opponentVoice.speak(TWO_SEGMENTS, onEnd);
    await settle();
    const playing = FakeSource.playing[0];

    opponentVoice.stop();
    await settle();
    expect(playing.stop).toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(opponentVoice.getState().status).toBe('idle');
    expect(FakeSource.playing).toHaveLength(0);
    expect(speechSynthesisMock.speak).not.toHaveBeenCalled();
  });

  it('abandons a request the student speaks over, and still asks ElevenLabs for the next reply', async () => {
    // The request stays open until it is aborted, like a voice function that has not answered yet.
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const onEnd = vi.fn();
    opponentVoice.speak(TWO_SEGMENTS, onEnd);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(opponentVoice.getState().status).toBe('loading');

    opponentVoice.stop();
    await settle();
    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(opponentVoice.getState().status).toBe('idle');
    expect(speechSynthesisMock.speak).not.toHaveBeenCalled();

    // An abandoned request is not a refusal, so the provider stays on.
    fetchMock.mockImplementation(async () => audioResponse());
    opponentVoice.speak(TWO_SEGMENTS);
    await settle();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(opponentVoice.getState()).toMatchObject({ status: 'speaking', engine: 'elevenlabs' });
  });

  it('a new reply replaces the one still playing', async () => {
    fetchMock.mockImplementation(async () => audioResponse());
    const firstEnd = vi.fn();
    const secondEnd = vi.fn();
    opponentVoice.speak(TWO_SEGMENTS, firstEnd);
    await settle();
    opponentVoice.speak({ ...TWO_SEGMENTS, voice: { segments: [{ text: 'A new reply.', token: 'token-3' }] } }, secondEnd);
    await settle();
    expect(firstEnd).toHaveBeenCalledTimes(1);
    expect(secondEnd).not.toHaveBeenCalled();
    expect(FakeSource.playing).toHaveLength(1);
    FakeSource.playing[0].end();
    await settle();
    expect(secondEnd).toHaveBeenCalledTimes(1);
  });

  it('waits for a tap before it requests audio when the browser blocks autoplay', async () => {
    FakeAudioContext.state = 'suspended';
    fetchMock.mockImplementation(async () => audioResponse());
    opponentVoice.speak(TWO_SEGMENTS);
    await vi.advanceTimersByTimeAsync(200);
    expect(opponentVoice.getState().status).toBe('blocked');
    expect(fetchMock).not.toHaveBeenCalled();

    FakeAudioContext.state = 'running';
    opponentVoice.unlock();
    await settle();
    expect(fetchMock).toHaveBeenCalled();
    expect(opponentVoice.getState().status).toBe('speaking');
  });

  it('ends a reply that was stopped while it waited for a tap', async () => {
    FakeAudioContext.state = 'suspended';
    const onEnd = vi.fn();
    opponentVoice.speak(TWO_SEGMENTS, onEnd);
    await vi.advanceTimersByTimeAsync(200);
    expect(opponentVoice.getState().status).toBe('blocked');

    opponentVoice.stop();
    await settle();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(opponentVoice.getState().status).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(speechSynthesisMock.speak).not.toHaveBeenCalled();
  });

  it('moves on when the browser never reports the end of an utterance', async () => {
    const onEnd = vi.fn();
    opponentVoice.speak({ feature: 'crossfire', text: 'Which study shows that?', language: 'en' }, onEnd);
    await settle();
    expect(opponentVoice.getState()).toMatchObject({ status: 'speaking', engine: 'browser' });

    const cancelsBefore = speechSynthesisMock.cancel.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(opponentVoice.getState().status).toBe('idle');
    // The stalled utterance is dropped, so it cannot play after the clock restarts.
    expect(speechSynthesisMock.cancel.mock.calls.length).toBeGreaterThan(cancelsBefore);
  });

  it('stays silent, and still ends, in a browser with no voice at all', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('speechSynthesis', undefined);
    Reflect.deleteProperty(window, 'speechSynthesis');
    const onEnd = vi.fn();
    opponentVoice.speak(TWO_SEGMENTS, onEnd);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('accepts only well-formed voice payloads', () => {
    expect(parseVoicePayload({ segments: [{ text: 'Hello.', token: 'abc' }] })).toEqual({ segments: [{ text: 'Hello.', token: 'abc' }] });
    expect(parseVoicePayload(undefined)).toBeUndefined();
    expect(parseVoicePayload({ segments: [] })).toBeUndefined();
    expect(parseVoicePayload({ segments: [{ text: 'x'.repeat(1_001), token: 'abc' }] })).toBeUndefined();
    expect(parseVoicePayload({ segments: [{ text: 'Hello.' }] })).toBeUndefined();
    expect(parseVoicePayload({ segments: [{ text: 'Hello.', token: 'abc' }], overflow: 'The rest.' }))
      .toEqual({ segments: [{ text: 'Hello.', token: 'abc' }], overflow: 'The rest.' });
    expect(parseVoicePayload({ segments: [{ text: 'Hello.', token: 'abc' }], overflow: 7 })).toBeUndefined();
  });

  it('cuts browser speech into short utterances at sentence ends', () => {
    const sentence = 'This sentence is here to fill the utterance up to its limit.';
    const parts = browserUtterances(Array.from({ length: 12 }, () => sentence).join(' '));
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(220);
      expect(part.endsWith('.')).toBe(true);
    }
    expect(browserUtterances('   ')).toEqual([]);
  });

  it('cuts one overlong sentence at clause breaks, then at spaces', () => {
    const clause = 'because the evidence on ridership points the other way for most cities';
    const sentence = `${Array.from({ length: 8 }, () => clause).join(', ')}.`;
    const parts = browserUtterances(sentence);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(220);
    // Clause breaks win over plain spaces where one fits.
    for (const part of parts.slice(0, -1)) expect(part.endsWith(',')).toBe(true);
    expect(parts.join(' ')).toBe(sentence);

    const unbroken = `${'word '.repeat(120).trim()}.`;
    const words = browserUtterances(unbroken);
    for (const part of words) expect(part.length).toBeLessThanOrEqual(220);
    expect(words.join(' ')).toBe(unbroken);

    const oneToken = 'x'.repeat(500);
    expect(browserUtterances(oneToken).join('')).toBe(oneToken);
    for (const part of browserUtterances(oneToken)) expect(part.length).toBeLessThanOrEqual(220);
  });
});
