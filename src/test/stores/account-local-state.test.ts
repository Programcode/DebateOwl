import { beforeEach, describe, expect, it } from 'vitest';
import { mergePersistedDebateState, useDebateStore } from '@/lib/stores/debate-store';
import { mergePersistedSessionState, useSessionStore } from '@/lib/stores/session-store';
import { mergePersistedSettingsState, useSettingsStore } from '@/lib/stores/settings-store';
import { persistedSessionFromStorage } from '@/hooks/use-session-storage-sync';

describe('local state belongs to one account', () => {
  beforeEach(() => {
    useSessionStore.getState().resetLocalData();
    useSettingsStore.getState().resetLocalData();
    useDebateStore.getState().resetLocalData();
  });

  it('clears the previous account\'s drafts when a different person signs in', () => {
    useSessionStore.setState({
      ownerUserId: 'user-a',
      generateForm: { motion: 'User A private motion' },
      askMessages: [{ id: 'm1', role: 'user', content: 'User A secret', timestamp: 1 }],
    });
    useSettingsStore.setState({ ownerUserId: 'user-a', customSystemPrompt: 'User A private prompt' });

    useSessionStore.getState().prepareForUser('user-b');
    useSettingsStore.getState().prepareForUser('user-b');

    expect(useSessionStore.getState().ownerUserId).toBe('user-b');
    expect(useSessionStore.getState().generateForm).toEqual({});
    expect(useSessionStore.getState().askMessages).toEqual([]);
    expect(useSettingsStore.getState().customSystemPrompt).toBeUndefined();
    expect(useSettingsStore.getState().ownerUserId).toBe('user-b');
  });

  it('keeps drafts when the same account signs in again', () => {
    useSessionStore.getState().prepareForUser('user-a');
    useSessionStore.getState().setGenerateForm({ motion: 'My motion' });
    useSettingsStore.getState().prepareForUser('user-a');
    useSettingsStore.setState({ customSystemPrompt: 'My prompt' });

    useSessionStore.getState().prepareForUser('user-a');
    useSettingsStore.getState().prepareForUser('user-a');

    expect(useSessionStore.getState().generateForm.motion).toBe('My motion');
    expect(useSettingsStore.getState().customSystemPrompt).toBe('My prompt');
  });

  it('does not let a late rehydrate restore another account after binding', () => {
    useSessionStore.getState().prepareForUser('user-b');
    useSessionStore.getState().setGenerateForm({ motion: 'Mine' });
    const session = mergePersistedSessionState(
      { ownerUserId: 'user-a', generateForm: { motion: 'User A private motion' }, askMessages: [{ id: 'm1', role: 'user', content: 'secret', timestamp: 1 }] },
      useSessionStore.getState(),
    );
    expect(session.ownerUserId).toBe('user-b');
    expect(session.generateForm.motion).toBe('Mine');

    useDebateStore.getState().prepareForUser('user-b');
    const debate = mergePersistedDebateState(
      { ownerUserId: 'user-a', currentDebateId: 'debate-a', debates: [{ id: 'debate-a', motion: 'Secret', settings: {}, instructions: '', lastActivityAt: 1, createdAt: 1 }] },
      useDebateStore.getState(),
    );
    expect(debate.ownerUserId).toBe('user-b');
    expect(debate.debates).toEqual([]);

    useSettingsStore.getState().prepareForUser('user-b');
    const settings = mergePersistedSettingsState(
      { ownerUserId: 'user-a', customSystemPrompt: 'User A private prompt' },
      useSettingsStore.getState(),
    );
    expect(settings.customSystemPrompt).toBeUndefined();
  });

  it('ignores a cross-tab snapshot from a different account', () => {
    const foreign = JSON.stringify({
      state: { ownerUserId: 'user-a', askMessages: [{ id: 'm1', role: 'user', content: 'secret', timestamp: 1 }] },
    });
    expect(persistedSessionFromStorage(foreign, 'user-b')).toBeNull();

    const mine = JSON.stringify({
      state: { ownerUserId: 'user-b', generateForm: { motion: 'Mine' } },
    });
    expect(persistedSessionFromStorage(mine, 'user-b')?.generateForm).toEqual({ motion: 'Mine' });
  });
});
