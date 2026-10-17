import { describe, expect, it } from 'vitest';
import { useSessionStore } from '@/lib/stores/session-store';

describe('signing out', () => {
  it('drops tool drafts, so the next person on this browser starts with empty forms', () => {
    const store = useSessionStore.getState();
    store.setGenerateForm({ motion: 'Previous user motion' });
    store.setAttackForm({ caseText: 'Previous user case' });
    store.setBrainstormForm({ motion: 'Previous user brainstorm' });
    store.setFactoidsForm({ claim: 'Previous user claim' });

    // AuthProvider calls this on sign-out and when a different user signs in.
    useSessionStore.getState().resetLocalData();

    const state = useSessionStore.getState();
    expect([state.generateForm, state.attackForm, state.brainstormForm, state.factoidsForm]).toEqual([{}, {}, {}, {}]);
  });
});
