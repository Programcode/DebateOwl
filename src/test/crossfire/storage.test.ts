import { describe, expect, it } from 'vitest';
import { createCrossfireSetupState, crossfireReducer } from '@/lib/crossfire/reducer';
import {
  MAX_CROSSFIRE_STORAGE_CHARS,
  clearCrossfireDraftOnAuthChange,
  clearCrossfireDraft,
  loadCrossfireDraft,
  saveCrossfireDraft,
  crossfireStorageKey,
} from '@/lib/crossfire/storage';
import type { CrossfireState } from '@/lib/crossfire/schemas';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe('Crossfire draft storage', () => {
  it('round-trips a schema-validated unfinished setup for the same account', () => {
    const storage = new MemoryStorage();
    const state = createCrossfireSetupState({ resolution: 'Resolved: test', argument: 'Case text' });
    expect(saveCrossfireDraft('user-a', state, storage, 10)).toBe(true);
    expect(loadCrossfireDraft('user-a', storage)).toEqual(state);
  });

  it('round-trips version-one drafts containing optional answer signals', () => {
    const storage = new MemoryStorage();
    let state = crossfireReducer(createCrossfireSetupState({ resolution: 'Resolved: test', argument: 'Case text' }), { type: 'session-started', sessionId: 's', now: 1 });
    state = crossfireReducer(state, { type: 'user-turn-submitted', turn: { id: 'T1', sequence: 1, speaker: 'user', kind: 'question', text: 'Why?', createdAt: 1 }, expectedReply: 'answer' });
    state = crossfireReducer(state, {
      type: 'ai-turn-received',
      turn: { id: 'T2', sequence: 2, speaker: 'ai', kind: 'answer', text: 'Because.', createdAt: 2 },
      signal: { answerTurnId: 'T2', answerQuality: 'direct', answerQualityConfidence: 0.9, concession: 'none', concessionConfidence: 0.8, followUpOpportunity: 0.75 },
    });
    expect(saveCrossfireDraft('user-a', state, storage, 10)).toBe(true);
    expect(loadCrossfireDraft('user-a', storage)).toEqual(state);
  });

  it('round-trips a voice round with measured facts, and still loads drafts saved before voice rounds', () => {
    const storage = new MemoryStorage();
    const delivery = { speakingSeconds: 4, wordCount: 8, wordsPerMinute: 120, fillerCount: 0, fillers: [] as Array<{ word: string; count: number }>, longPauses: 1, longestPauseSeconds: 3 };
    let state = crossfireReducer(createCrossfireSetupState({ resolution: 'Resolved: test', argument: 'Case text' }), { type: 'voice-toggled', voice: true });
    state = crossfireReducer(state, { type: 'session-started', sessionId: 's', now: 1 });
    state = crossfireReducer(state, { type: 'user-turn-submitted', turn: { id: 'T1', sequence: 1, speaker: 'user', kind: 'question', text: 'Why?', createdAt: 1, delivery }, expectedReply: 'answer' });
    expect(saveCrossfireDraft('user-a', state, storage, 10)).toBe(true);
    expect(loadCrossfireDraft('user-a', storage)).toEqual(state);

    // A draft written by the app before voice rounds existed.
    const legacy = {
      version: 1,
      ownerId: 'user-b',
      savedAt: 5,
      state: {
        phase: 'active',
        sessionId: 'legacy',
        config: { resolution: 'Resolved: test', argument: 'Case text', mode: 'question-ai', style: 'cooperative', durationSeconds: 180, useSourceLibrary: false, seedQuestions: [] as string[] },
        turns: [{ id: 'T1', sequence: 1, speaker: 'user', kind: 'question', text: 'Why?', createdAt: 1 }],
        startedAt: 1,
        endsAt: 181_000,
        request: { status: 'pending', expectedReply: 'answer' },
      },
    };
    storage.setItem(crossfireStorageKey('user-b'), JSON.stringify(legacy));
    expect(loadCrossfireDraft('user-b', storage)).toEqual(legacy.state);
  });

  it('clears malformed, oversized, or differently owned data', () => {
    const malformed = new MemoryStorage();
    malformed.setItem(crossfireStorageKey('user-a'), '{broken');
    expect(loadCrossfireDraft('user-a', malformed)).toBeNull();
    expect(malformed.getItem(crossfireStorageKey('user-a'))).toBeNull();

    const oversized = new MemoryStorage();
    oversized.setItem(crossfireStorageKey('user-a'), 'x'.repeat(MAX_CROSSFIRE_STORAGE_CHARS + 1));
    expect(loadCrossfireDraft('user-a', oversized)).toBeNull();
    expect(oversized.getItem(crossfireStorageKey('user-a'))).toBeNull();

    const differentOwner = new MemoryStorage();
    expect(saveCrossfireDraft('user-a', createCrossfireSetupState(), differentOwner)).toBe(true);
    expect(loadCrossfireDraft('user-b', differentOwner)).toBeNull();
    expect(differentOwner.getItem(crossfireStorageKey('user-a'))).not.toBeNull();
  });

  it('clears account-bound data on sign-out or account switch, not token refresh', () => {
    const storage = new MemoryStorage();
    storage.setItem(crossfireStorageKey('user-a'), 'draft');
    storage.setItem(crossfireStorageKey('user-b'), 'incoming draft');
    expect(clearCrossfireDraftOnAuthChange(undefined, 'user-b', storage)).toBe(true);
    expect(storage.getItem(crossfireStorageKey('user-b'))).toBe('incoming draft');
    expect(clearCrossfireDraftOnAuthChange('user-a', 'user-a', storage)).toBe(false);
    expect(storage.getItem(crossfireStorageKey('user-a'))).toBe('draft');
    expect(clearCrossfireDraftOnAuthChange('user-a', 'user-b', storage)).toBe(true);
    expect(storage.getItem(crossfireStorageKey('user-a'))).toBeNull();
    expect(storage.getItem(crossfireStorageKey('user-b'))).toBe('incoming draft');
    storage.setItem(crossfireStorageKey('user-a'), 'new draft');
    expect(clearCrossfireDraftOnAuthChange('user-a', undefined, storage)).toBe(true);
    expect(storage.getItem(crossfireStorageKey('user-a'))).toBeNull();
  });

  it('removes a finished session instead of persisting it', () => {
    const storage = new MemoryStorage();
    storage.setItem(crossfireStorageKey('user-a'), 'old');
    const complete: CrossfireState = {
      phase: 'complete',
      sessionId: 'session-1',
      config: {
        resolution: 'Resolved: test',
        argument: 'Case text',
        mode: 'question-ai',
        style: 'cooperative',
        durationSeconds: 180,
        useSourceLibrary: false,
        seedQuestions: [],
      },
      turns: [{ id: 'T1', sequence: 1, speaker: 'user', kind: 'question', text: 'Why?', createdAt: 1 }],
      startedAt: 1,
      endedAt: 2,
      endedReason: 'manual',
      debrief: {
        concessionsSecured: [],
        controlledQuestions: [],
        weakOrRepetitiveQuestions: [],
        evasiveOrIncompleteAnswers: [],
        missedFollowUps: [],
        betterFollowUpQuestions: [],
        strongestExchange: null,
      },
    };
    expect(saveCrossfireDraft('user-a', complete, storage)).toBe(true);
    expect(storage.getItem(crossfireStorageKey('user-a'))).toBeNull();
  });

  it('fails closed when browser storage is unavailable', () => {
    const unavailable = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(loadCrossfireDraft('user-a', unavailable)).toBeNull();
    expect(saveCrossfireDraft('user-a', createCrossfireSetupState(), unavailable)).toBe(false);
    expect(() => clearCrossfireDraftOnAuthChange('user-a', 'user-b', unavailable)).not.toThrow();
  });

  it('removes schema-invalid envelopes and owner mismatches from the user namespace', () => {
    const storage = new MemoryStorage();
    storage.setItem(crossfireStorageKey('user-a'), JSON.stringify({ version: 1 }));
    expect(loadCrossfireDraft('user-a', storage)).toBeNull();
    expect(storage.getItem(crossfireStorageKey('user-a'))).toBeNull();

    storage.setItem(crossfireStorageKey('user-a'), JSON.stringify({
      version: 1,
      ownerId: 'user-b',
      savedAt: 1,
      state: createCrossfireSetupState(),
    }));
    expect(loadCrossfireDraft('user-a', storage)).toBeNull();
    expect(storage.getItem(crossfireStorageKey('user-a'))).toBeNull();
  });

  it('handles explicit clearing, invalid state, and failed completed-state removal', () => {
    const storage = new MemoryStorage();
    storage.setItem(crossfireStorageKey('user-a'), 'draft');
    clearCrossfireDraft('user-a', storage);
    expect(storage.getItem(crossfireStorageKey('user-a'))).toBeNull();
    expect(() => clearCrossfireDraft('', storage)).not.toThrow();

    expect(saveCrossfireDraft('user-a', { phase: 'setup', config: {} } as CrossfireState, storage)).toBe(false);

    const unavailableRemove = {
      getItem: (): string | null => null,
      setItem: (): void => undefined,
      removeItem: (): void => { throw new Error('blocked'); },
    };
    const state = createCrossfireSetupState({ resolution: 'Resolved: test', argument: 'Case' });
    const active = crossfireReducer(state, { type: 'session-started', sessionId: 's', now: 1 });
    const withQuestion = crossfireReducer(active, {
      type: 'user-turn-submitted',
      turn: { id: 'T1', sequence: 1, speaker: 'user', kind: 'question', text: 'Why?', createdAt: 1 },
      expectedReply: 'answer',
    });
    const withAnswer = crossfireReducer(withQuestion, {
      type: 'ai-turn-received',
      turn: { id: 'T2', sequence: 2, speaker: 'ai', kind: 'answer', text: 'Because.', createdAt: 2 },
    });
    const debriefing = crossfireReducer(withAnswer, { type: 'session-ended', now: 3, reason: 'manual' });
    const complete = crossfireReducer(debriefing, {
      type: 'debrief-received',
      debrief: {
        concessionsSecured: [], controlledQuestions: [], weakOrRepetitiveQuestions: [], evasiveOrIncompleteAnswers: [],
        missedFollowUps: [], betterFollowUpQuestions: [], strongestExchange: null,
      },
    });
    expect(saveCrossfireDraft('user-a', complete, unavailableRemove)).toBe(false);
  });
});
