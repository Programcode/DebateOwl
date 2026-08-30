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
    expect(clearCrossfireDraftOnAuthChange('user-a', 'user-a', storage)).toBe(false);
    expect(storage.getItem(crossfireStorageKey('user-a'))).toBe('draft');
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
