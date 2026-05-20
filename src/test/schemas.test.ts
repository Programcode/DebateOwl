// src/test/schemas.test.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { GenerateInputSchema, GenerateOutputSchema, ContentionSchema } from '@/lib/ai/schemas/generate';
import { AttackInputSchema, AttackOutputSchema, WeaknessSchema } from '@/lib/ai/schemas/attack';
import { BrainstormInputSchema, BrainstormOutputSchema, IdeaSchema, BucketSchema } from '@/lib/ai/schemas/brainstorm';
import { FactoidsInputSchema, FactoidsOutputSchema, FactoidSchema, CitationSchema } from '@/lib/ai/schemas/factoids';
import { AskInputSchema, AskOutputSchema } from '@/lib/ai/schemas/ask';

// ============================================================================
// GENERATE SCHEMA TESTS
// ============================================================================

describe('Generate Schema', () => {
    describe('GenerateInputSchema', () => {
        const validInput = {
            motion: 'This house believes technology improves education',
            side: 'pro',
            format: 'bp',
            role: 'intro',
            length: 'standard',
            audience: 'intermediate',
            tone: 'formal',
        };

        it('accepts valid input', () => {
            const result = GenerateInputSchema.safeParse(validInput);
            expect(result.success).toBe(true);
        });

        it('rejects missing motion', () => {
            const result = GenerateInputSchema.safeParse({ ...validInput, motion: '' });
            expect(result.success).toBe(false);
        });

        it('rejects invalid side', () => {
            const result = GenerateInputSchema.safeParse({ ...validInput, side: 'invalid' });
            expect(result.success).toBe(false);
        });

        it('rejects invalid format', () => {
            const result = GenerateInputSchema.safeParse({ ...validInput, format: 'invalid' });
            expect(result.success).toBe(false);
        });

        it('rejects invalid role', () => {
            const result = GenerateInputSchema.safeParse({ ...validInput, role: 'invalid' });
            expect(result.success).toBe(false);
        });

        it('rejects invalid length', () => {
            const result = GenerateInputSchema.safeParse({ ...validInput, length: 'invalid' });
            expect(result.success).toBe(false);
        });

        it('rejects invalid audience', () => {
            const result = GenerateInputSchema.safeParse({ ...validInput, audience: 'invalid' });
            expect(result.success).toBe(false);
        });

        it('rejects invalid tone', () => {
            const result = GenerateInputSchema.safeParse({ ...validInput, tone: 'invalid' });
            expect(result.success).toBe(false);
        });
    });

    describe('ContentionSchema', () => {
        const validContention = {
            id: 'c1',
            claim: 'Technology increases access to education',
            reasoning: 'Online platforms reach remote areas',
            evidence: 'UNESCO reports 50% increase in online learning',
            needsSource: true,
            sourceQuery: 'UNESCO online learning statistics',
            impact: 'More people can access quality education',
        };

        it('accepts valid contention', () => {
            expect(ContentionSchema.safeParse(validContention).success).toBe(true);
        });

        it('accepts contention without optional sourceQuery', () => {
            const { sourceQuery: _, ...withoutQuery } = validContention;
            expect(ContentionSchema.safeParse(withoutQuery).success).toBe(true);
        });

        it('rejects missing claim', () => {
            const result = ContentionSchema.safeParse({ ...validContention, claim: undefined });
            expect(result.success).toBe(false);
        });
    });

    describe('GenerateOutputSchema', () => {
        const validOutput = {
            caseStructure: {
                thesis: 'Technology fundamentally improves education',
                framework: 'Utilitarian - greatest good for greatest number',
                keyDefinitions: ['Technology', 'Education', 'Improvement'],
                burdenOfProof: 'Show net positive impact on learning outcomes',
            },
            contentions: [
                {
                    id: 'c1',
                    claim: 'Increases access',
                    reasoning: 'Online reaches more people',
                    evidence: 'UNESCO data',
                    needsSource: false,
                    impact: 'More educated population',
                },
            ],
            predictedOpponentCase: {
                likelyArguments: ['Digital divide', 'Screen time concerns'],
                strategicWeaknesses: ['Relies on infrastructure'],
                keyClashes: ['Definition of improvement'],
            },
            counters: [
                {
                    targetArgument: 'Digital divide',
                    counterpoint: 'Mobile adoption closing gap',
                    rebuttal: 'Infrastructure improving rapidly',
                },
            ],
            metadata: {
                side: 'pro',
                format: 'bp',
                generatedAt: '2024-01-01T00:00:00Z',
            },
        };

        it('accepts valid output', () => {
            expect(GenerateOutputSchema.safeParse(validOutput).success).toBe(true);
        });

        it('rejects missing caseStructure', () => {
            const { caseStructure: _, ...without } = validOutput;
            expect(GenerateOutputSchema.safeParse(without).success).toBe(false);
        });

        it('rejects missing contentions', () => {
            const { contentions: _, ...without } = validOutput;
            expect(GenerateOutputSchema.safeParse(without).success).toBe(false);
        });

        it('accepts empty contentions array', () => {
            expect(GenerateOutputSchema.safeParse({ ...validOutput, contentions: [] }).success).toBe(true);
        });

        it('rejects invalid metadata side', () => {
            const result = GenerateOutputSchema.safeParse({
                ...validOutput,
                metadata: { ...validOutput.metadata, side: 'invalid' },
            });
            expect(result.success).toBe(false);
        });
    });
});

// ============================================================================
// ATTACK SCHEMA TESTS
// ============================================================================

describe('Attack Schema', () => {
    describe('AttackInputSchema', () => {
        const validInput = {
            caseText: 'This is a debate case about technology in education...',
            aggressiveness: 'moderate',
            judgeParadigm: 'logic',
            detectFallacies: true,
            analyzeWeighing: true,
        };

        it('accepts valid input', () => {
            expect(AttackInputSchema.safeParse(validInput).success).toBe(true);
        });

        it('rejects empty caseText', () => {
            expect(AttackInputSchema.safeParse({ ...validInput, caseText: '' }).success).toBe(false);
        });

        it('rejects invalid aggressiveness', () => {
            expect(AttackInputSchema.safeParse({ ...validInput, aggressiveness: 'extreme' }).success).toBe(false);
        });

        it('rejects invalid judgeParadigm', () => {
            expect(AttackInputSchema.safeParse({ ...validInput, judgeParadigm: 'invalid' }).success).toBe(false);
        });

        it('accepts all valid aggressiveness levels', () => {
            expect(AttackInputSchema.safeParse({ ...validInput, aggressiveness: 'mild' }).success).toBe(true);
            expect(AttackInputSchema.safeParse({ ...validInput, aggressiveness: 'moderate' }).success).toBe(true);
            expect(AttackInputSchema.safeParse({ ...validInput, aggressiveness: 'ruthless' }).success).toBe(true);
        });

        it('accepts all valid judgeParadigms', () => {
            expect(AttackInputSchema.safeParse({ ...validInput, judgeParadigm: 'logic' }).success).toBe(true);
            expect(AttackInputSchema.safeParse({ ...validInput, judgeParadigm: 'values' }).success).toBe(true);
            expect(AttackInputSchema.safeParse({ ...validInput, judgeParadigm: 'policy' }).success).toBe(true);
        });
    });

    describe('WeaknessSchema', () => {
        const validWeakness = {
            id: 'w1',
            severity: 'major',
            type: 'logical',
            description: 'Circular reasoning detected',
            whyWeak: 'Assumes the conclusion',
            howOpponentAttacks: 'Point out the circularity',
            improvedVersion: 'Add independent premises',
            affectedQuote: 'Technology is good because it helps',
        };

        it('accepts valid weakness', () => {
            expect(WeaknessSchema.safeParse(validWeakness).success).toBe(true);
        });

        it('accepts without optional affectedQuote', () => {
            const { affectedQuote: _, ...without } = validWeakness;
            expect(WeaknessSchema.safeParse(without).success).toBe(true);
        });

        it('rejects invalid severity', () => {
            expect(WeaknessSchema.safeParse({ ...validWeakness, severity: 'catastrophic' }).success).toBe(false);
        });

        it('rejects invalid type', () => {
            expect(WeaknessSchema.safeParse({ ...validWeakness, type: 'invalid' }).success).toBe(false);
        });
    });

    describe('AttackOutputSchema', () => {
        const validOutput = {
            overallAssessment: {
                score: 75,
                summary: 'Solid case with some logical gaps',
                strengthAreas: ['Evidence quality', 'Clear structure'],
            },
            weaknesses: [] as any[],
            fallaciesDetected: [] as any[],
            crossExQuestions: [] as any[],
            weighingAnalysis: {
                currentWeighing: 'Basic comparison provided',
                missingComparisons: ['Timeframe comparison'],
                improvementSuggestions: ['Add magnitude analysis'],
            },
        };

        it('accepts valid output', () => {
            expect(AttackOutputSchema.safeParse(validOutput).success).toBe(true);
        });

        it('rejects score below 0', () => {
            const result = AttackOutputSchema.safeParse({
                ...validOutput,
                overallAssessment: { ...validOutput.overallAssessment, score: -1 },
            });
            expect(result.success).toBe(false);
        });

        it('rejects score above 100', () => {
            const result = AttackOutputSchema.safeParse({
                ...validOutput,
                overallAssessment: { ...validOutput.overallAssessment, score: 101 },
            });
            expect(result.success).toBe(false);
        });

        it('accepts score at boundaries', () => {
            expect(AttackOutputSchema.safeParse({
                ...validOutput,
                overallAssessment: { ...validOutput.overallAssessment, score: 0 },
            }).success).toBe(true);
            expect(AttackOutputSchema.safeParse({
                ...validOutput,
                overallAssessment: { ...validOutput.overallAssessment, score: 100 },
            }).success).toBe(true);
        });
    });
});

// ============================================================================
// BRAINSTORM SCHEMA TESTS
// ============================================================================

describe('Brainstorm Schema', () => {
    describe('BrainstormInputSchema', () => {
        const validInput = {
            motion: 'Universal basic income should be implemented',
            side: 'both',
            context: 'For a policy debate',
            outputMode: 'mindmap',
        };

        it('accepts valid input', () => {
            expect(BrainstormInputSchema.safeParse(validInput).success).toBe(true);
        });

        it('accepts without optional context', () => {
            const { context: _, ...without } = validInput;
            expect(BrainstormInputSchema.safeParse(without).success).toBe(true);
        });

        it('rejects empty motion', () => {
            expect(BrainstormInputSchema.safeParse({ ...validInput, motion: '' }).success).toBe(false);
        });

        it('rejects invalid side', () => {
            expect(BrainstormInputSchema.safeParse({ ...validInput, side: 'neutral' }).success).toBe(false);
        });

        it('rejects invalid outputMode', () => {
            expect(BrainstormInputSchema.safeParse({ ...validInput, outputMode: 'list' }).success).toBe(false);
        });

        it('accepts all valid sides', () => {
            expect(BrainstormInputSchema.safeParse({ ...validInput, side: 'pro' }).success).toBe(true);
            expect(BrainstormInputSchema.safeParse({ ...validInput, side: 'con' }).success).toBe(true);
            expect(BrainstormInputSchema.safeParse({ ...validInput, side: 'both' }).success).toBe(true);
        });

        it('accepts all valid outputModes', () => {
            expect(BrainstormInputSchema.safeParse({ ...validInput, outputMode: 'mindmap' }).success).toBe(true);
            expect(BrainstormInputSchema.safeParse({ ...validInput, outputMode: 'buckets' }).success).toBe(true);
            expect(BrainstormInputSchema.safeParse({ ...validInput, outputMode: 'topfive' }).success).toBe(true);
        });
    });

    describe('IdeaSchema', () => {
        const validIdea = {
            id: 'i1',
            title: 'Economic security',
            description: 'Provides financial safety net',
            side: 'pro',
            strength: 'strong',
            tradeoffs: ['Inflation risk', 'Tax burden'],
            relatedTo: ['i2', 'i3'],
        };

        it('accepts valid idea', () => {
            expect(IdeaSchema.safeParse(validIdea).success).toBe(true);
        });

        it('accepts empty tradeoffs', () => {
            expect(IdeaSchema.safeParse({ ...validIdea, tradeoffs: [] }).success).toBe(true);
        });

        it('accepts empty relatedTo', () => {
            expect(IdeaSchema.safeParse({ ...validIdea, relatedTo: [] }).success).toBe(true);
        });

        it('rejects invalid side', () => {
            expect(IdeaSchema.safeParse({ ...validIdea, side: 'both' }).success).toBe(false);
        });

        it('rejects invalid strength', () => {
            expect(IdeaSchema.safeParse({ ...validIdea, strength: 'very-strong' }).success).toBe(false);
        });
    });

    describe('BucketSchema', () => {
        const validBucket = {
            name: 'Economic Arguments',
            ideas: [] as any[],
            keyInsight: 'Focus on long-term economic impact',
        };

        it('accepts valid bucket', () => {
            expect(BucketSchema.safeParse(validBucket).success).toBe(true);
        });

        it('rejects missing name', () => {
            const { name: _, ...without } = validBucket;
            expect(BucketSchema.safeParse(without).success).toBe(false);
        });
    });

    describe('BrainstormOutputSchema', () => {
        const validOutput = {
            needsMoreInfo: false,
            nextSteps: ['Research economic data', 'Find case studies'],
            warningsAndTradeoffs: ['May be politically controversial'],
        };

        it('accepts valid output', () => {
            expect(BrainstormOutputSchema.safeParse(validOutput).success).toBe(true);
        });

        it('accepts with optional mindmap', () => {
            expect(BrainstormOutputSchema.safeParse({
                ...validOutput,
                mindmap: [{ category: 'Economics', items: [] }],
            }).success).toBe(true);
        });

        it('accepts with optional buckets', () => {
            expect(BrainstormOutputSchema.safeParse({
                ...validOutput,
                buckets: [{ name: 'Economic', ideas: [], keyInsight: 'Focus on jobs' }],
            }).success).toBe(true);
        });

        it('accepts with optional clarifyingQuestions', () => {
            expect(BrainstormOutputSchema.safeParse({
                ...validOutput,
                clarifyingQuestions: ['What country?', 'What amount?'],
            }).success).toBe(true);
        });
    });
});

// ============================================================================
// FACTOIDS SCHEMA TESTS
// ============================================================================

describe('Factoids Schema', () => {
    describe('FactoidsInputSchema', () => {
        const validInput = {
            claim: 'Renewable energy is more cost effective',
            region: 'United States',
            sourceType: 'academic',
            timeframe: '2020-2024',
        };

        it('accepts valid input', () => {
            expect(FactoidsInputSchema.safeParse(validInput).success).toBe(true);
        });

        it('accepts without optional timeframe', () => {
            const { timeframe: _, ...without } = validInput;
            expect(FactoidsInputSchema.safeParse(without).success).toBe(true);
        });

        it('rejects empty claim', () => {
            expect(FactoidsInputSchema.safeParse({ ...validInput, claim: '' }).success).toBe(false);
        });

        it('accepts empty region (defaults to Global)', () => {
            expect(FactoidsInputSchema.safeParse({ ...validInput, region: '' }).success).toBe(true);
        });

        it('rejects invalid sourceType', () => {
            expect(FactoidsInputSchema.safeParse({ ...validInput, sourceType: 'blog' }).success).toBe(false);
        });

        it('accepts all valid sourceTypes', () => {
            expect(FactoidsInputSchema.safeParse({ ...validInput, sourceType: 'academic' }).success).toBe(true);
            expect(FactoidsInputSchema.safeParse({ ...validInput, sourceType: 'government' }).success).toBe(true);
            expect(FactoidsInputSchema.safeParse({ ...validInput, sourceType: 'news' }).success).toBe(true);
            expect(FactoidsInputSchema.safeParse({ ...validInput, sourceType: 'any' }).success).toBe(true);
        });
    });

    describe('CitationSchema', () => {
        const validCitation = {
            title: 'Renewable Energy Cost Analysis 2024',
            publisher: 'Nature Energy',
            date: '2024-01-15',
            url: 'https://nature.com/energy/2024/cost-analysis',
            verified: 'verified',
            verifiedAt: '2024-01-20T10:00:00Z',
        };

        it('accepts valid citation', () => {
            expect(CitationSchema.safeParse(validCitation).success).toBe(true);
        });

        it('accepts without optional fields', () => {
            expect(CitationSchema.safeParse({
                title: 'Report',
                publisher: 'Publisher',
                verified: 'pending',
            }).success).toBe(true);
        });

        it('rejects invalid verified status', () => {
            expect(CitationSchema.safeParse({ ...validCitation, verified: 'unknown' }).success).toBe(false);
        });

        it('accepts all verified statuses', () => {
            expect(CitationSchema.safeParse({ ...validCitation, verified: 'verified' }).success).toBe(true);
            expect(CitationSchema.safeParse({ ...validCitation, verified: 'unverified' }).success).toBe(true);
            expect(CitationSchema.safeParse({ ...validCitation, verified: 'pending' }).success).toBe(true);
        });
    });

    describe('FactoidSchema', () => {
        const validFactoid = {
            id: 'f1',
            shortClaim: 'Solar costs dropped 90% since 2010',
            keyFigure: '90%',
            context: 'Global average for utility-scale solar',
            limitations: 'Varies by region',
            citation: {
                title: 'IRENA Report',
                publisher: 'IRENA',
                verified: 'verified',
            },
            howToUse: 'Use in opening to establish economic viability',
            relevanceScore: 85,
        };

        it('accepts valid factoid', () => {
            expect(FactoidSchema.safeParse(validFactoid).success).toBe(true);
        });

        it('rejects relevanceScore below 0', () => {
            expect(FactoidSchema.safeParse({ ...validFactoid, relevanceScore: -1 }).success).toBe(false);
        });

        it('rejects relevanceScore above 100', () => {
            expect(FactoidSchema.safeParse({ ...validFactoid, relevanceScore: 101 }).success).toBe(false);
        });

        it('accepts relevanceScore at boundaries', () => {
            expect(FactoidSchema.safeParse({ ...validFactoid, relevanceScore: 0 }).success).toBe(true);
            expect(FactoidSchema.safeParse({ ...validFactoid, relevanceScore: 100 }).success).toBe(true);
        });
    });

    describe('FactoidsOutputSchema', () => {
        const validOutput = {
            factoids: [] as any[],
            searchSuggestions: ['Try searching for specific years'],
            warnings: ['Limited data available'],
            verificationStatus: 'pending',
        };

        it('accepts valid output', () => {
            expect(FactoidsOutputSchema.safeParse(validOutput).success).toBe(true);
        });

        it('rejects invalid verificationStatus', () => {
            expect(FactoidsOutputSchema.safeParse({ ...validOutput, verificationStatus: 'done' }).success).toBe(false);
        });

        it('accepts all valid verificationStatuses', () => {
            expect(FactoidsOutputSchema.safeParse({ ...validOutput, verificationStatus: 'pending' }).success).toBe(true);
            expect(FactoidsOutputSchema.safeParse({ ...validOutput, verificationStatus: 'inProgress' }).success).toBe(true);
            expect(FactoidsOutputSchema.safeParse({ ...validOutput, verificationStatus: 'complete' }).success).toBe(true);
        });
    });
});

// ============================================================================
// ASK SCHEMA TESTS
// ============================================================================

describe('Ask Schema', () => {
    describe('AskInputSchema', () => {
        const validInput = {
            message: 'How should I structure my rebuttal?',
            mode: 'general',
            citationMode: true,
            conversationHistory: [
                { role: 'user', content: 'I need help with my case' },
                { role: 'assistant', content: 'What topic are you working on?' },
            ],
        };

        it('accepts valid input', () => {
            expect(AskInputSchema.safeParse(validInput).success).toBe(true);
        });

        it('rejects empty message', () => {
            expect(AskInputSchema.safeParse({ ...validInput, message: '' }).success).toBe(false);
        });

        it('rejects invalid mode', () => {
            expect(AskInputSchema.safeParse({ ...validInput, mode: 'invalid' }).success).toBe(false);
        });

        it('accepts all valid modes', () => {
            expect(AskInputSchema.safeParse({ ...validInput, mode: 'general' }).success).toBe(true);
            expect(AskInputSchema.safeParse({ ...validInput, mode: 'clarify' }).success).toBe(true);
            expect(AskInputSchema.safeParse({ ...validInput, mode: 'summarize' }).success).toBe(true);
            expect(AskInputSchema.safeParse({ ...validInput, mode: 'proscons' }).success).toBe(true);
            expect(AskInputSchema.safeParse({ ...validInput, mode: 'argumentmap' }).success).toBe(true);
        });

        it('accepts empty conversationHistory', () => {
            expect(AskInputSchema.safeParse({ ...validInput, conversationHistory: [] }).success).toBe(true);
        });

        it('accepts optional webSearch flag', () => {
            expect(AskInputSchema.safeParse({ ...validInput, webSearch: true }).success).toBe(true);
            expect(AskInputSchema.safeParse({ ...validInput, webSearch: false }).success).toBe(true);
        });

        it('rejects invalid role in conversationHistory', () => {
            expect(AskInputSchema.safeParse({
                ...validInput,
                conversationHistory: [{ role: 'system', content: 'test' }],
            }).success).toBe(false);
        });
    });

    describe('AskOutputSchema', () => {
        const validOutput = {
            response: 'Here is how you can structure your rebuttal...',
            followUpQuestions: ['What is your main argument?', 'Who is your opponent?'],
            uncertainties: ['May depend on judge preferences'],
        };

        it('accepts valid output', () => {
            expect(AskOutputSchema.safeParse(validOutput).success).toBe(true);
        });

        it('accepts with optional citations', () => {
            expect(AskOutputSchema.safeParse({
                ...validOutput,
                citations: [{ claim: 'Debate structure matters', verified: true }],
            }).success).toBe(true);
        });

        it('accepts with optional prosConsAnalysis', () => {
            expect(AskOutputSchema.safeParse({
                ...validOutput,
                prosConsAnalysis: {
                    pros: ['Clear structure', 'Good flow'],
                    cons: ['Time consuming'],
                },
            }).success).toBe(true);
        });

        it('accepts with optional argumentMap', () => {
            expect(AskOutputSchema.safeParse({
                ...validOutput,
                argumentMap: {
                    mainClaim: 'Rebuttals need structure',
                    supportingPoints: ['Helps judge follow'],
                    counterpoints: ['May seem formulaic'],
                    assumptions: ['Judge values organization'],
                },
            }).success).toBe(true);
        });

        it('accepts empty arrays', () => {
            expect(AskOutputSchema.safeParse({
                ...validOutput,
                followUpQuestions: [],
                uncertainties: [],
            }).success).toBe(true);
        });
    });
});
