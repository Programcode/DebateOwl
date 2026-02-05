// src/test/stores/session-store-extended.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';

// Mock Supabase
vi.mock('@/lib/supabase/client', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
                    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
                order: vi.fn(() => Promise.resolve({ data: [], error: null })),
                in: vi.fn(() => ({
                    order: vi.fn(() => Promise.resolve({ data: [], error: null })),
                })),
            })),
            insert: vi.fn(() => ({
                select: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({
                        data: {
                            id: 'mock-id',
                            title: 'Test Source',
                            content: 'Content here',
                            type: 'url',
                            origin: 'https://example.com',
                            is_active: true,
                            created_at: new Date().toISOString(),
                        },
                        error: null,
                    })),
                })),
            })),
            update: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
            upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
            delete: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
                neq: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
        })),
        auth: {
            getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'test-user-id' } }, error: null })),
            onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        },
        channel: vi.fn(() => ({
            on: vi.fn(() => ({ subscribe: vi.fn() })),
        })),
    },
}));

// Import after mocking
import { useSessionStore } from '@/lib/stores/session-store';
import type { GenerateOutput } from '@/lib/ai/schemas/generate';
import type { AttackOutput } from '@/lib/ai/schemas/attack';
import type { BrainstormOutput } from '@/lib/ai/schemas/brainstorm';
import type { FactoidsOutput } from '@/lib/ai/schemas/factoids';

describe('Session Store Extended', () => {
    beforeEach(() => {
        // Reset store state before each test
        act(() => {
            useSessionStore.setState({
                generateResult: null,
                attackResult: null,
                brainstormResult: null,
                factoidsResult: null,
                askMessages: [],
                sourceLibrary: [],
                generateLoading: false,
                attackLoading: false,
                brainstormLoading: false,
                factoidsLoading: false,
                askLoading: false,
                savedCases: [],
                savedAttacks: [],
                savedBrainstorms: [],
                savedFactoids: [],
                savedChats: [],
            });
        });
    });

    describe('Source Library', () => {
        it('adds source to library', async () => {
            const store = useSessionStore.getState();
            await act(async () => {
                await store.addSource({
                    type: 'url',
                    title: 'Test Source',
                    content: 'Content here',
                    origin: 'https://example.com',
                });
            });
            expect(useSessionStore.getState().sourceLibrary).toHaveLength(1);
            expect(useSessionStore.getState().sourceLibrary[0].type).toBe('url');
        });

        it('removes source from library', async () => {
            // First add a source
            await act(async () => {
                await useSessionStore.getState().addSource({
                    type: 'url',
                    title: 'Test Source',
                    content: 'Content',
                });
            });

            const sourceId = useSessionStore.getState().sourceLibrary[0].id;

            await act(async () => {
                await useSessionStore.getState().removeSource(sourceId);
            });

            expect(useSessionStore.getState().sourceLibrary).toHaveLength(0);
        });

        it('toggles source active state', async () => {
            // First add a source
            await act(async () => {
                await useSessionStore.getState().addSource({
                    type: 'url',
                    title: 'Test Source',
                    content: 'Content',
                });
            });

            const sourceId = useSessionStore.getState().sourceLibrary[0].id;
            expect(useSessionStore.getState().sourceLibrary[0].isActive).toBe(true);

            await act(async () => {
                await useSessionStore.getState().toggleSource(sourceId);
            });

            expect(useSessionStore.getState().sourceLibrary[0].isActive).toBe(false);
        });

        it('clears all sources', async () => {
            // Add multiple sources
            await act(async () => {
                await useSessionStore.getState().addSource({
                    type: 'url',
                    title: 'Source 1',
                    content: 'Content 1',
                });
                await useSessionStore.getState().addSource({
                    type: 'text',
                    title: 'Source 2',
                    content: 'Content 2',
                });
            });

            expect(useSessionStore.getState().sourceLibrary).toHaveLength(2);

            await act(async () => {
                await useSessionStore.getState().clearLibrary();
            });

            expect(useSessionStore.getState().sourceLibrary).toHaveLength(0);
        });
    });

    describe('Attack Results', () => {
        const mockAttackResult: AttackOutput = {
            overallAssessment: {
                score: 75,
                summary: 'Good case overall',
                strengthAreas: ['Evidence', 'Structure'],
            },
            weaknesses: [],
            fallaciesDetected: [],
            crossExQuestions: [],
            weighingAnalysis: {
                currentWeighing: 'Basic',
                missingComparisons: [],
                improvementSuggestions: [],
            },
        };

        it('sets attack result', () => {
            const store = useSessionStore.getState();
            act(() => {
                store.setAttackResult(mockAttackResult);
            });
            expect(useSessionStore.getState().attackResult).toEqual(mockAttackResult);
        });

        it('sets attack loading state', () => {
            const store = useSessionStore.getState();
            act(() => {
                store.setAttackLoading(true);
            });
            expect(useSessionStore.getState().attackLoading).toBe(true);
        });

        it('clears attack result', () => {
            act(() => {
                useSessionStore.setState({ attackResult: mockAttackResult });
            });
            const store = useSessionStore.getState();
            act(() => {
                store.setAttackResult(null);
            });
            expect(useSessionStore.getState().attackResult).toBeNull();
        });
    });

    describe('Brainstorm Results', () => {
        const mockBrainstormResult: BrainstormOutput = {
            needsMoreInfo: false,
            nextSteps: ['Research more'],
            warningsAndTradeoffs: [],
        };

        it('sets brainstorm result', () => {
            const store = useSessionStore.getState();
            act(() => {
                store.setBrainstormResult(mockBrainstormResult);
            });
            expect(useSessionStore.getState().brainstormResult).toEqual(mockBrainstormResult);
        });

        it('sets brainstorm loading state', () => {
            const store = useSessionStore.getState();
            act(() => {
                store.setBrainstormLoading(true);
            });
            expect(useSessionStore.getState().brainstormLoading).toBe(true);
        });
    });

    describe('Factoids Results', () => {
        const mockFactoidsResult: FactoidsOutput = {
            factoids: [],
            searchSuggestions: ['Try broader search'],
            warnings: [],
            verificationStatus: 'complete',
        };

        it('sets factoids result', () => {
            const store = useSessionStore.getState();
            act(() => {
                store.setFactoidsResult(mockFactoidsResult);
            });
            expect(useSessionStore.getState().factoidsResult).toEqual(mockFactoidsResult);
        });

        it('sets factoids loading state', () => {
            const store = useSessionStore.getState();
            act(() => {
                store.setFactoidsLoading(true);
            });
            expect(useSessionStore.getState().factoidsLoading).toBe(true);
        });
    });

    describe('Ask/Chat', () => {
        it('adds message to chat', () => {
            const store = useSessionStore.getState();
            act(() => {
                store.addAskMessage({
                    role: 'user',
                    content: 'How do I structure a rebuttal?',
                });
            });
            expect(useSessionStore.getState().askMessages).toHaveLength(1);
            expect(useSessionStore.getState().askMessages[0].content).toBe('How do I structure a rebuttal?');
        });

        it('adds multiple messages', () => {
            const store = useSessionStore.getState();
            act(() => {
                store.addAskMessage({ role: 'user', content: 'Question 1' });
                store.addAskMessage({ role: 'assistant', content: 'Answer 1' });
                store.addAskMessage({ role: 'user', content: 'Question 2' });
            });
            expect(useSessionStore.getState().askMessages).toHaveLength(3);
        });

        it('sets ask loading state', () => {
            const store = useSessionStore.getState();
            act(() => {
                store.setAskLoading(true);
            });
            expect(useSessionStore.getState().askLoading).toBe(true);
        });

        it('clears ask messages', () => {
            act(() => {
                useSessionStore.setState({
                    askMessages: [
                        { id: '1', role: 'user', content: 'Question', timestamp: Date.now() },
                        { id: '2', role: 'assistant', content: 'Answer', timestamp: Date.now() },
                    ],
                });
            });
            const store = useSessionStore.getState();
            act(() => {
                store.clearAskMessages();
            });
            expect(useSessionStore.getState().askMessages).toHaveLength(0);
        });
    });

    describe('Generate Results', () => {
        const mockGenerateResult: GenerateOutput = {
            caseStructure: {
                thesis: 'Technology improves education',
                framework: 'Utilitarian',
                keyDefinitions: ['Technology'],
                burdenOfProof: 'Net positive',
            },
            contentions: [],
            predictedOpponentCase: {
                likelyArguments: [],
                strategicWeaknesses: [],
                keyClashes: [],
            },
            counters: [],
            metadata: {
                side: 'pro',
                format: 'bp',
                generatedAt: new Date().toISOString(),
            },
        };

        it('sets generate result', () => {
            const store = useSessionStore.getState();
            act(() => {
                store.setGenerateResult(mockGenerateResult);
            });
            expect(useSessionStore.getState().generateResult).toEqual(mockGenerateResult);
        });

        it('sets generate loading state', () => {
            const store = useSessionStore.getState();
            act(() => {
                store.setGenerateLoading(true);
            });
            expect(useSessionStore.getState().generateLoading).toBe(true);
        });
    });

    describe('Session Management', () => {
        it('clears entire session', () => {
            act(() => {
                useSessionStore.setState({
                    generateResult: {
                        caseStructure: { thesis: 'test', framework: '', keyDefinitions: [], burdenOfProof: '' },
                        contentions: [],
                        predictedOpponentCase: { likelyArguments: [], strategicWeaknesses: [], keyClashes: [] },
                        counters: [],
                        metadata: { side: 'pro', format: 'bp', generatedAt: '' },
                    },
                    attackResult: {
                        overallAssessment: { score: 50, summary: '', strengthAreas: [] },
                        weaknesses: [],
                        fallaciesDetected: [],
                        crossExQuestions: [],
                        weighingAnalysis: { currentWeighing: '', missingComparisons: [], improvementSuggestions: [] },
                    },
                    askMessages: [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }],
                });
            });
            const store = useSessionStore.getState();
            act(() => {
                store.clearSession();
            });
            const state = useSessionStore.getState();
            expect(state.generateResult).toBeNull();
            expect(state.attackResult).toBeNull();
            expect(state.askMessages).toHaveLength(0);
        });
    });
});
