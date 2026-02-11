
/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { supabaseMock, setMockInvokeResponse, resetMockState, setMockSessionToken } from '../mocks/supabase';
import { generateCase, attackCase, brainstorm, factoids, askChat, AIError } from '@/lib/ai/client';
import type { ProviderConfig } from '@/lib/ai/providers/types';
import type { GenerateInput } from '@/lib/ai/schemas/generate';
import type { AttackInput } from '@/lib/ai/schemas/attack';
import type { BrainstormInput } from '@/lib/ai/schemas/brainstorm';

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
        getState: vi.fn(() => ({
            customSystemPrompt: 'test-system-prompt',
        })),
    },
}));

vi.mock('@/lib/stores/session-store', () => ({
    useSessionStore: {
        getState: vi.fn(() => ({
            sourceLibrary: [
                { title: 'Source 1', content: 'Content 1', origin: 'url1', type: 'web', isActive: true },
                { title: 'Source 2', content: 'Content 2', origin: 'url2', type: 'web', isActive: false }, // Inactive should be filtered
            ],
        })),
    },
}));

describe('AI Client Integration', () => {
    const mockConfig: ProviderConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        temperature: 0.8,
    };

    beforeEach(() => {
        resetMockState();
        setMockSessionToken('valid-token');
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('generateCase', () => {
        it('should call supabase.functions.invoke with correct parameters', async () => {
            // Mock successful response
            const mockResponse = {
                output: {
                    caseStructure: { thesis: 'Test Thesis' },
                    contentions: [] as any[],
                    predictedOpponentCase: {},
                    counters: [] as any[],
                    metadata: { side: 'pro' },
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
                language: 'en'
            };

            await generateCase(input, mockConfig);

            expect(supabaseMock.functions.invoke).toHaveBeenCalledTimes(1);
            expect(supabaseMock.functions.invoke).toHaveBeenCalledWith('ai', {
                headers: { Authorization: expect.stringContaining('Bearer') },
                body: expect.objectContaining({
                    feature: 'generate',
                    provider: 'openai',
                    model: 'gpt-4o',
                    temperature: 0.8,
                    input: input,
                    customSystemPrompt: 'test-system-prompt',
                    sources: expect.arrayContaining([
                        expect.objectContaining({ title: 'Source 1' }) // Only active source
                    ])
                }),
            });

            // Verify sources count
            const callArgs = (supabaseMock.functions.invoke.mock.calls[0] as any[])[1];
            expect(callArgs.body.sources).toHaveLength(1);
        });

        it('should use "openai" provider when "lovable" is selected (legacy mapping)', async () => {
            const lovableConfig: ProviderConfig = { ...mockConfig, provider: 'lovable' };
            // Mock response
            const mockResponse = {
                output: {
                    caseStructure: {},
                    contentions: [] as any[],
                    predictedOpponentCase: {},
                    counters: [] as any[],
                    metadata: { side: 'pro' },
                }
            };
            setMockInvokeResponse(mockResponse);

            await generateCase({ motion: 'test', side: 'pro' } as GenerateInput, lovableConfig);

            expect(supabaseMock.functions.invoke).toHaveBeenCalledWith('ai', expect.objectContaining({
                body: expect.objectContaining({
                    provider: 'openai' // Should be mapped
                })
            }));
        });

        it('should use local mock provider logic when provider is "mock"', async () => {
            const mockProviderConfig: ProviderConfig = { ...mockConfig, provider: 'mock' };

            const result = await generateCase({ motion: 'Test Motion', side: 'pro' } as GenerateInput, mockProviderConfig);

            // Should NOT call Supabase
            expect(supabaseMock.functions.invoke).not.toHaveBeenCalled();

            // Should return mock data
            expect(result.caseStructure.thesis).toContain('Test Motion');
            expect(result.metadata.format).toBe('bp');
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
        it('should pass correct params for attackCase', async () => {
            const mockResponse = { output: { overallAssessment: { score: 80 } } };
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
                    provider: 'openai',
                    model: 'gpt-4o',
                    input: expect.objectContaining(input),
                })
            }));
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
                { citationMode: true, webSearch: true }
            );

            expect(supabaseMock.functions.invoke).toHaveBeenCalledWith('ai', expect.objectContaining({
                body: expect.objectContaining({
                    feature: 'ask',
                    input: expect.objectContaining({
                        message: 'What are recent examples?',
                        mode: 'general',
                        citationMode: true,
                        webSearch: true,
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
                region: 'United States',
                sourceType: 'government',
                timeframe: '2020-2025',
                language: 'en',
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
