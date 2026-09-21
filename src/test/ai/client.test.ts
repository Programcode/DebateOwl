
/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { supabaseMock, setMockInvokeResponse, resetMockState, setMockSessionToken } from '../mocks/supabase';
import { generateCase, attackCase, brainstorm, factoids, askChat, AIError, AIResponseError } from '@/lib/ai/client';
import type { ProviderConfig } from '@/lib/ai/providers/types';
import type { GenerateInput, GenerateOutput } from '@/lib/ai/schemas/generate';
import type { AttackInput, AttackOutput } from '@/lib/ai/schemas/attack';
import type { BrainstormInput } from '@/lib/ai/schemas/brainstorm';
import i18n from '@/i18n';

const clientMocks = vi.hoisted(() => ({
    toast: vi.fn(),
    settings: {
        customSystemPrompt: 'test-system-prompt',
        language: 'en',
        outputLanguage: 'en',
    },
    session: {
        sourceLibrary: [
            { title: 'Source 1', content: 'Content 1', origin: 'url1', type: 'web', isActive: true },
            { title: 'Source 2', content: 'Content 2', origin: 'url2', type: 'web', isActive: false },
        ],
        addSource: vi.fn(),
    },
}));

// Mock Supabase client - Importing the mock object directly
// We must use vi.hoisted or just inline for variables used in vi.mock
// But for imported modules like supabaseMock, valid in Vitest if module has no side effects?
// actually it's better to use doMock or inline return.

vi.mock('@/lib/supabase/client', () => ({
    supabase: supabaseMock
}));

// Mock Stores - Inline the implementation to avoid ReferenceError
vi.mock('@/lib/stores/settings-store', () => ({
    useSettingsStore: {
        getState: vi.fn(() => clientMocks.settings),
    },
}));

vi.mock('@/lib/stores/session-store', () => ({
    useSessionStore: {
        getState: vi.fn(() => clientMocks.session),
    },
}));

vi.mock('@/hooks/use-toast', () => ({ toast: clientMocks.toast }));

describe('AI Client Integration', () => {
    const mockConfig: ProviderConfig = {
        provider: 'openrouter',
        model: 'gpt-4o',
        temperature: 0.8,
    };

    beforeEach(async () => {
        resetMockState();
        setMockSessionToken('valid-token');
        vi.clearAllMocks();
        clientMocks.settings.language = 'en';
        clientMocks.settings.outputLanguage = 'en';
        clientMocks.session.addSource.mockResolvedValue(undefined);
        await i18n.changeLanguage('en');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('generateCase', () => {
        it('should call supabase.functions.invoke with correct parameters', async () => {
            // Mock successful response
            const mockResponse: { output: GenerateOutput } = {
                output: {
                    caseStructure: {
                        thesis: 'Test Thesis',
                        framework: 'Framework',
                        keyDefinitions: [],
                        burdenOfProof: 'Burden',
                    },
                    contentions: [
                        { id: '1', claim: 'Claim 1', reasoning: 'Reasoning 1', evidence: 'Evidence 1', needsSource: false, impact: 'Impact 1' },
                        { id: '2', claim: 'Claim 2', reasoning: 'Reasoning 2', evidence: 'Evidence 2', needsSource: false, impact: 'Impact 2' },
                    ],
                    predictedOpponentCase: {
                        likelyArguments: [],
                        strategicWeaknesses: [],
                        keyClashes: [],
                    },
                    counters: [],
                    metadata: { side: 'pro', format: 'bp', generatedAt: '2026-01-01T00:00:00.000Z' },
                }
            };
            setMockInvokeResponse(mockResponse);

            const input: GenerateInput = {
                motion: 'Test Motion',
                side: 'pro',
                format: 'bp',
                role: 'intro',
                length: 'brief',
                audience: 'advanced',
                tone: 'formal',
            };

            await generateCase(input, mockConfig);

            expect(supabaseMock.functions.invoke).toHaveBeenCalledTimes(1);
            expect(supabaseMock.functions.invoke).toHaveBeenCalledWith('ai', expect.objectContaining({
                headers: { Authorization: expect.stringContaining('Bearer') },
                body: expect.objectContaining({
                    feature: 'generate',
                    provider: 'openrouter',
                    model: 'gpt-4o',
                    temperature: 0.8,
                    input: expect.objectContaining(input),
                    customSystemPrompt: 'test-system-prompt',
                    sources: expect.arrayContaining([
                        expect.objectContaining({ title: 'Source 1' }) // Only active source
                    ])
                }),
            }));

            // Verify sources count
            const callArgs = (supabaseMock.functions.invoke.mock.calls[0] as any[])[1];
            expect(callArgs.body.sources).toHaveLength(1);
        });

        it('sends the configured reasoning effort in the non-streaming request', async () => {
            const mockResponse: { output: GenerateOutput } = {
                output: {
                    caseStructure: {
                        thesis: 'Test Thesis',
                        framework: 'Framework',
                        keyDefinitions: [],
                        burdenOfProof: 'Burden',
                    },
                    contentions: [
                        { id: '1', claim: 'Claim 1', reasoning: 'Reasoning 1', evidence: 'Evidence 1', needsSource: false, impact: 'Impact 1' },
                        { id: '2', claim: 'Claim 2', reasoning: 'Reasoning 2', evidence: 'Evidence 2', needsSource: false, impact: 'Impact 2' },
                    ],
                    predictedOpponentCase: {
                        likelyArguments: [],
                        strategicWeaknesses: [],
                        keyClashes: [],
                    },
                    counters: [],
                    metadata: { side: 'pro', format: 'bp', generatedAt: '2026-01-01T00:00:00.000Z' },
                },
            };
            setMockInvokeResponse(mockResponse);

            await generateCase(
                { motion: 'Test Motion', side: 'pro', format: 'bp', role: 'intro', length: 'brief', audience: 'advanced', tone: 'formal' },
                { ...mockConfig, reasoningEffort: 'high' },
            );

            expect(supabaseMock.functions.invoke).toHaveBeenCalledWith('ai', expect.objectContaining({
                body: expect.objectContaining({ reasoningEffort: 'high' }),
            }));
        });

        it('canonicalizes legacy providers to OpenRouter', async () => {
            const lovableConfig: ProviderConfig = { ...mockConfig, provider: 'lovable' };
            // Mock response
            const mockResponse: { output: GenerateOutput } = {
                output: {
                    caseStructure: {
                        thesis: 'Test Thesis',
                        framework: 'Framework',
                        keyDefinitions: [],
                        burdenOfProof: 'Burden',
                    },
                    contentions: [
                        { id: '1', claim: 'Claim 1', reasoning: 'Reasoning 1', evidence: 'Evidence 1', needsSource: false, impact: 'Impact 1' },
                        { id: '2', claim: 'Claim 2', reasoning: 'Reasoning 2', evidence: 'Evidence 2', needsSource: false, impact: 'Impact 2' },
                    ],
                    predictedOpponentCase: {
                        likelyArguments: [],
                        strategicWeaknesses: [],
                        keyClashes: [],
                    },
                    counters: [],
                    metadata: { side: 'pro', format: 'bp', generatedAt: '2026-01-01T00:00:00.000Z' },
                }
            };
            setMockInvokeResponse(mockResponse);

            await generateCase({ motion: 'test', side: 'pro' } as GenerateInput, lovableConfig);

            expect(supabaseMock.functions.invoke).toHaveBeenCalledWith('ai', expect.objectContaining({
                body: expect.objectContaining({
                    provider: 'openrouter'
                })
            }));
        });

        it('should use local mock provider logic when provider is "mock"', async () => {
            const mockProviderConfig: ProviderConfig = { ...mockConfig, provider: 'mock' };

            const { result } = await generateCase({
                motion: 'Test Motion',
                side: 'pro',
                format: 'bp',
                role: 'intro',
                length: 'brief',
                audience: 'beginner',
                tone: 'formal',
            }, mockProviderConfig);

            // Should NOT call Supabase
            expect(supabaseMock.functions.invoke).not.toHaveBeenCalled();

            // Should return mock data
            expect(result.caseStructure.thesis).toContain('Test Motion');
            expect(result.metadata.format).toBe('bp');
        });

        it.each([
            ['brief', 2],
            ['standard', 3],
            ['comprehensive', 4],
        ] as const)('returns %s mock output with %d contentions', async (length, expectedCount) => {
            const mockProviderConfig: ProviderConfig = { ...mockConfig, provider: 'mock' };
            const input: GenerateInput = {
                motion: 'Test Motion',
                side: 'pro',
                format: 'bp',
                role: 'intro',
                length,
                audience: 'beginner',
                tone: 'formal',
            };

            const { result } = await generateCase(input, mockProviderConfig);

            expect(result.contentions).toHaveLength(expectedCount);
        }, 15000);

        it('localizes the truncated-input notification in Hungarian', async () => {
            clientMocks.settings.language = 'hu';
            clientMocks.settings.outputLanguage = 'hu';
            await i18n.changeLanguage('hu');
            setMockInvokeResponse({
                output: {
                    caseStructure: { thesis: 'T', framework: 'F', keyDefinitions: [], burdenOfProof: 'B' },
                    contentions: [
                        { id: '1', claim: 'A', reasoning: 'R', evidence: 'E', needsSource: false, impact: 'I' },
                        { id: '2', claim: 'B', reasoning: 'R', evidence: 'E', needsSource: false, impact: 'I' },
                    ],
                    predictedOpponentCase: { likelyArguments: [], strategicWeaknesses: [], keyClashes: [] },
                    counters: [],
                    metadata: { side: 'pro', format: 'custom', generatedAt: '2026-01-01T00:00:00.000Z' },
                },
                meta: { truncated: true },
            });

            await generateCase({ motion: 'M', side: 'pro', length: 'brief' } as GenerateInput, mockConfig);

            expect(clientMocks.toast).toHaveBeenCalledWith({
                title: 'A bemenet rövidítve lett',
                description: 'A kérés túl nagy volt, ezért csak az elküldhető rész került az MI-hez.',
            });
        });
    });

    describe('Error Handling', () => {
        it('should throw AIAuthError when no session token exists', async () => {
            setMockSessionToken(null);
            // Supabase getUser might return null session in getSession
            supabaseMock.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null } as any);

            await expect(generateCase({} as GenerateInput, mockConfig))
                .rejects
                .toThrow('Please sign in to use AI features');
        });

        it('should throw AIError when Supabase function returns an error', async () => {
            setMockInvokeResponse(null, { message: 'Function error' });

            await expect(generateCase({} as GenerateInput, mockConfig))
                .rejects
                .toThrow('Function error');
        });

        it('should throw correct error when backend returns specific error structure', async () => {
            // Backend returns data: { error: "Some error" } even if http 200 sometimes, 
            // but typically mapped to client error. 
            // client.ts handles `data?.error`.

            setMockInvokeResponse({ error: 'Rate limit exceeded' });

            await expect(generateCase({} as GenerateInput, mockConfig))
                .rejects
                .toThrow('Rate limit exceeded');
        });
    });

    describe('attackCase', () => {
        const validAttackOutput: AttackOutput = {
            overallAssessment: { score: 80, summary: 'Solid case', strengthAreas: ['evidence'] },
            weaknesses: [],
            fallaciesDetected: [],
            crossExQuestions: [],
            weighingAnalysis: { currentWeighing: 'none', missingComparisons: [], improvementSuggestions: [] },
        };

        it('should pass correct params for attackCase', async () => {
            const mockResponse = { output: validAttackOutput };
            setMockInvokeResponse(mockResponse);

            const input = {
                caseText: 'test',
                aggressiveness: 'moderate',
                judgeParadigm: 'logic',
                detectFallacies: true,
                analyzeWeighing: true
            } as AttackInput;

            await attackCase(input, mockConfig);

            expect(supabaseMock.functions.invoke).toHaveBeenCalledWith('ai', expect.objectContaining({
                body: expect.objectContaining({
                    feature: 'attack',
                    provider: 'openrouter',
                    model: 'gpt-4o',
                    input: expect.objectContaining(input),
                })
            }));
        });

        it('returns discovered sources alongside the validated attack result', async () => {
            const discoveredSources = [{
                title: 'Study',
                url: 'https://edu.example/study',
                content: 'x',
                sourceType: 'academic',
                qualityLabel: 'strong' as const,
                qualityScore: 85,
                query: 'study query',
            }];
            setMockInvokeResponse({ output: validAttackOutput, discoveredSources });

            const outcome = await attackCase({ caseText: 'c' } as AttackInput, mockConfig);

            expect(outcome.result.overallAssessment.score).toBe(80);
            expect(outcome.discoveredSources).toEqual(discoveredSources);
        });

        it('localizes new auto-saved sources and save failures in Hungarian', async () => {
            clientMocks.settings.language = 'hu';
            clientMocks.settings.outputLanguage = 'hu';
            await i18n.changeLanguage('hu');
            const discoveredSources = [{
                title: 'Study',
                url: 'https://edu.example/study',
                content: 'Provider content',
                sourceType: 'academic',
                qualityLabel: 'strong' as const,
                qualityScore: 85,
                query: 'study query',
            }];
            setMockInvokeResponse({ output: validAttackOutput, discoveredSources });

            await attackCase({ caseText: 'c' } as AttackInput, mockConfig);
            expect(clientMocks.session.addSource).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Study',
                content: 'Provider content',
                folder: 'Automatikusan mentett',
            }));

            clientMocks.session.addSource.mockRejectedValueOnce(new Error('save failed'));
            await attackCase({ caseText: 'c' } as AttackInput, mockConfig);
            expect(clientMocks.toast).toHaveBeenCalledWith({
                title: 'A forrás mentése sikertelen',
                description: 'Nem sikerült a(z) „Study” forrást a könyvtárba menteni.',
                variant: 'destructive',
            });
        });

        it('throws AIResponseError when attack output does not match the schema', async () => {
            setMockInvokeResponse({ output: { overallAssessment: { score: 80 } } });

            await expect(attackCase({ caseText: 'c' } as AttackInput, mockConfig))
                .rejects
                .toThrow(AIResponseError);
        });
    });

    // Basic check for other functions to ensure they wired up correctly
    describe('brainstorm', () => {
        it('should pass correct params', async () => {
            setMockInvokeResponse({ output: { ideas: [] } });
            await brainstorm({ motion: 'm', side: 'pro', outputMode: 'buckets' } as BrainstormInput, mockConfig);
            expect(supabaseMock.functions.invoke).toHaveBeenCalledWith('ai', expect.objectContaining({
                body: expect.objectContaining({ feature: 'brainstorm' })
            }));
        });
    });

    describe('askChat', () => {
        it('passes citation and web search flags to the ask payload', async () => {
            setMockInvokeResponse({
                output: {
                    response: 'Test response',
                    followUpQuestions: [] as string[],
                    uncertainties: [] as string[],
                }
            });

            await askChat(
                'What are recent examples?',
                [],
                'general',
                mockConfig,
                { citationMode: true, webSearch: true, prosConsMode: true, argumentMapMode: true }
            );

            expect(supabaseMock.functions.invoke).toHaveBeenCalledWith('ai', expect.objectContaining({
                body: expect.objectContaining({
                    feature: 'ask',
                    input: expect.objectContaining({
                        message: 'What are recent examples?',
                        mode: 'general',
                        citationMode: true,
                        webSearch: true,
                        prosConsMode: true,
                        argumentMapMode: true,
                    }),
                }),
            }));
        });
    });

    describe('factoids', () => {
        it('passes source filters to the factoids payload', async () => {
            setMockInvokeResponse({
                output: {
                    factoids: [] as any[],
                    searchSuggestions: [] as string[],
                    warnings: [] as string[],
                    verificationStatus: 'complete',
                }
            });

            await factoids({
                claim: 'Solar is cheaper than coal',
                direction: 'for',
                region: 'United States',
                sourceType: 'government',
                sourceCount: 5,
                timeframe: '2020-2025',
            }, mockConfig);

            expect(supabaseMock.functions.invoke).toHaveBeenCalledWith('ai', expect.objectContaining({
                body: expect.objectContaining({
                    feature: 'factoids',
                    input: expect.objectContaining({
                        claim: 'Solar is cheaper than coal',
                        region: 'United States',
                        sourceType: 'government',
                        timeframe: '2020-2025',
                        language: 'en',
                    }),
                }),
            }));
        });
    });

});
