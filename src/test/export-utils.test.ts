// src/test/export-utils.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GenerateOutput } from '@/lib/ai/schemas/generate';

// Mock docx and file-saver
vi.mock('docx', () => ({
    Document: vi.fn().mockImplementation(() => ({})),
    Packer: {
        toBlob: vi.fn().mockResolvedValue(new Blob(['test'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })),
    },
    Paragraph: vi.fn().mockImplementation(() => ({})),
    TextRun: vi.fn().mockImplementation(() => ({})),
    HeadingLevel: { HEADING_1: 'HEADING_1', HEADING_2: 'HEADING_2' },
    AlignmentType: { CENTER: 'CENTER' },
}));

vi.mock('file-saver', () => ({
    saveAs: vi.fn(),
}));

// Import after mocking
import { exportCaseToDocx } from '@/lib/export-utils';
import { saveAs } from 'file-saver';

describe('Export Utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createValidOutput = (overrides: Partial<GenerateOutput> = {}): GenerateOutput => ({
        caseStructure: {
            thesis: 'Technology improves education significantly.',
            framework: 'Utilitarian analysis',
            keyDefinitions: ['Technology', 'Education'],
            burdenOfProof: 'Net positive impact',
        },
        contentions: [
            {
                id: 'c1',
                claim: 'Increases access',
                reasoning: 'Online reaches more people',
                evidence: 'UNESCO data shows 50% increase',
                needsSource: false,
                impact: 'More educated population',
            },
        ],
        predictedOpponentCase: {
            likelyArguments: ['Digital divide concerns'],
            strategicWeaknesses: ['Infrastructure dependency'],
            keyClashes: ['Definition of improvement'],
        },
        counters: [
            {
                targetArgument: 'Digital divide',
                counterpoint: 'Mobile adoption closing gap',
                rebuttal: 'Infrastructure improving',
            },
        ],
        metadata: {
            side: 'pro',
            format: 'bp',
            generatedAt: '2024-01-01T00:00:00Z',
        },
        ...overrides,
    });

    describe('exportCaseToDocx', () => {
        it('exports valid case successfully', async () => {
            const result = await exportCaseToDocx(createValidOutput());
            expect(result).toBe(true);
            expect(saveAs).toHaveBeenCalled();
        });

        it('generates correct filename for pro side', async () => {
            await exportCaseToDocx(createValidOutput({ metadata: { side: 'pro', format: 'bp', generatedAt: '2024-01-01' } }));
            expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), 'DebateCase_pro.docx');
        });

        it('generates correct filename for con side', async () => {
            await exportCaseToDocx(createValidOutput({ metadata: { side: 'con', format: 'bp', generatedAt: '2024-01-01' } }));
            expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), 'DebateCase_con.docx');
        });

        it('returns false when metadata is missing', async () => {
            const result = await exportCaseToDocx({ ...createValidOutput(), metadata: undefined } as unknown as GenerateOutput);
            expect(result).toBe(false);
        });

        it('returns false when caseStructure is missing', async () => {
            const result = await exportCaseToDocx({ ...createValidOutput(), caseStructure: undefined } as unknown as GenerateOutput);
            expect(result).toBe(false);
        });

        it('returns false when contentions is not an array', async () => {
            const result = await exportCaseToDocx({ ...createValidOutput(), contentions: null } as unknown as GenerateOutput);
            expect(result).toBe(false);
        });

        it('returns false when predictedOpponentCase is missing', async () => {
            const result = await exportCaseToDocx({ ...createValidOutput(), predictedOpponentCase: undefined } as unknown as GenerateOutput);
            expect(result).toBe(false);
        });

        it('returns false when counters is not an array', async () => {
            const result = await exportCaseToDocx({ ...createValidOutput(), counters: null } as unknown as GenerateOutput);
            expect(result).toBe(false);
        });

        it('handles empty contentions array', async () => {
            const result = await exportCaseToDocx(createValidOutput({ contentions: [] }));
            expect(result).toBe(true);
        });

        it('handles empty counters array', async () => {
            const result = await exportCaseToDocx(createValidOutput({ counters: [] }));
            expect(result).toBe(true);
        });

        it('handles empty predicted arguments array', async () => {
            const result = await exportCaseToDocx(createValidOutput({
                predictedOpponentCase: {
                    likelyArguments: [],
                    strategicWeaknesses: [],
                    keyClashes: [],
                },
            }));
            expect(result).toBe(true);
        });

        it('handles missing thesis gracefully', async () => {
            const result = await exportCaseToDocx(createValidOutput({
                caseStructure: {
                    thesis: '',
                    framework: 'Test',
                    keyDefinitions: [],
                    burdenOfProof: 'Test',
                },
            }));
            expect(result).toBe(true);
        });

        it('handles invalid date in generatedAt', async () => {
            const result = await exportCaseToDocx(createValidOutput({
                metadata: { side: 'pro', format: 'bp', generatedAt: 'invalid-date' },
            }));
            expect(result).toBe(true);
        });

        it('handles contention with missing optional fields', async () => {
            const result = await exportCaseToDocx(createValidOutput({
                contentions: [
                    {
                        id: 'c1',
                        claim: '',
                        reasoning: '',
                        evidence: '',
                        needsSource: false,
                        impact: '',
                    },
                ],
            }));
            expect(result).toBe(true);
        });
    });
});
