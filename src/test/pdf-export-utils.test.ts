import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import type { AttackOutput } from '@/lib/ai/schemas/attack';
import type { GenerateOutput } from '@/lib/ai/schemas/generate';

const pdfMocks = vi.hoisted(() => {
  const docs: Array<Record<string, unknown>> = [];
  const autoTableCalls: Array<Record<string, unknown>> = [];
  return { docs, autoTableCalls };
});

vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor() {
      let page = 1;
      const accentBars: Array<{ page: number; y: number; height: number }> = [];
      const doc = {
        internal: { pageSize: { height: 297, width: 210 } },
        accentBars,
        setFillColor: vi.fn(),
        rect: vi.fn(),
        setTextColor: vi.fn(),
        setFontSize: vi.fn(),
        setFont: vi.fn(),
        text: vi.fn(),
        setDrawColor: vi.fn(),
        setLineWidth: vi.fn(),
        line: vi.fn(),
        getTextWidth: vi.fn(() => 10),
        splitTextToSize: vi.fn((text: string) => text.startsWith('LONG') ? Array(60).fill('line') : [text]),
        addPage: vi.fn(() => { page += 1; }),
        roundedRect: vi.fn((_x: number, y: number, _width: number, height: number) => {
          accentBars.push({ page, y, height });
        }),
        getNumberOfPages: vi.fn(() => page),
        setPage: vi.fn(),
        save: vi.fn(),
      };
      pdfMocks.docs.push(doc);
      return doc;
    }
  },
}));

vi.mock('jspdf-autotable', () => ({
  default: vi.fn((doc: Record<string, unknown>, options: Record<string, unknown>) => {
    pdfMocks.autoTableCalls.push(options);
    doc.lastAutoTable = { finalY: 100 };
  }),
}));

import { exportAttackToPdf, exportCaseToPdf } from '@/lib/pdf-export-utils';

const caseWithLongContention: GenerateOutput = {
  caseStructure: {
    thesis: 'Thesis',
    framework: 'Framework',
    keyDefinitions: [],
    burdenOfProof: 'Burden',
  },
  contentions: [{
    id: 'contention',
    claim: 'Claim',
    reasoning: 'LONG reasoning',
    evidence: '',
    needsSource: false,
    impact: '',
  }],
  predictedOpponentCase: { likelyArguments: [], strategicWeaknesses: [], keyClashes: [] },
  counters: [],
  metadata: { side: 'pro', format: 'bp', generatedAt: '2026-01-01T00:00:00Z' },
};

const attackWithTables: AttackOutput = {
  overallAssessment: { score: 75, summary: 'Summary', strengthAreas: [] },
  weaknesses: [{
    id: 'weakness',
    severity: 'major',
    type: 'logical',
    description: 'Description',
    whyWeak: 'Why',
    howOpponentAttacks: 'Attack',
    improvedVersion: 'Improve',
  }],
  fallaciesDetected: [{ name: 'Long named fallacy', location: 'Location', explanation: 'Explanation' }],
  crossExQuestions: [],
  weighingAnalysis: { currentWeighing: '', missingComparisons: [], improvementSuggestions: [] },
};

describe('PDF export utilities', () => {
  beforeEach(() => {
    pdfMocks.docs.length = 0;
    pdfMocks.autoTableCalls.length = 0;
    return i18n.changeLanguage('en');
  });

  it('draws contention accent bars on every page segment', async () => {
    await expect(exportCaseToPdf(caseWithLongContention)).resolves.toBe(true);

    const accentBars = pdfMocks.docs[0].accentBars as Array<{ page: number; height: number }>;
    expect(accentBars.map(({ page }) => page)).toEqual([1, 2]);
    expect(accentBars.every(({ height }) => height >= 0)).toBe(true);
  });

  it('limits only compact table lead columns', async () => {
    await expect(exportAttackToPdf(attackWithTables)).resolves.toBe(true);

    expect(pdfMocks.autoTableCalls[0].columnStyles).toEqual({ 0: { cellWidth: 22 } });
    expect(pdfMocks.autoTableCalls[1].columnStyles).toBeUndefined();
  });

  it('uses a stable side value in the PDF filename', async () => {
    await i18n.changeLanguage('es');
    await expect(exportCaseToPdf(caseWithLongContention)).resolves.toBe(true);

    expect(pdfMocks.docs[0].save).toHaveBeenCalledWith('DebateCase_pro.pdf');
    await i18n.changeLanguage('en');
  });

  it('localizes PDF footer boilerplate and date for Hungarian exports', async () => {
    await i18n.changeLanguage('hu');
    await expect(exportCaseToPdf(caseWithLongContention)).resolves.toBe(true);

    const footerText = (pdfMocks.docs[0].text as ReturnType<typeof vi.fn>).mock.calls
      .map(([text]) => text)
      .filter((text): text is string => typeof text === 'string');
    expect(footerText).toContainEqual(expect.stringContaining('A DebateLab készítette'));
    expect(footerText).toContainEqual(expect.stringMatching(/Oldal 1 \/ \d+/));
    expect(footerText).toContain('1. érv');
    expect(pdfMocks.docs[0].setFont).toHaveBeenCalledWith('LiberationSans', 'normal');
  });
});
