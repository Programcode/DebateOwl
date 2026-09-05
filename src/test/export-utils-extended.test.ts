/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GenerateOutput } from '@/lib/ai/schemas/generate';
import type { AttackOutput } from '@/lib/ai/schemas/attack';
import type { BrainstormOutput } from '@/lib/ai/schemas/brainstorm';
import type { FactoidsOutput } from '@/lib/ai/schemas/factoids';

vi.mock('docx', () => ({
  Document: vi.fn(function DocumentMock() {}),
  Packer: {
    toBlob: vi.fn().mockResolvedValue(new Blob(['test'])),
  },
  Paragraph: vi.fn(function ParagraphMock() {}),
  TextRun: vi.fn(function TextRunMock() {}),
  HeadingLevel: { HEADING_1: 'HEADING_1', HEADING_2: 'HEADING_2' },
  AlignmentType: { CENTER: 'CENTER' },
}));

vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
    from: vi.fn(() => ({ upsert: vi.fn(async () => ({ data: null, error: null })) })),
  },
  SUPABASE_URL: 'http://localhost',
}));

import {
  exportCaseToDocx,
  exportAttackToDocx,
  exportBrainstormToDocx,
  exportFactoidsToDocx,
  exportCaseToGoogleDocs,
  exportAttackToGoogleDocs,
  exportBrainstormToGoogleDocs,
  exportFactoidsToGoogleDocs,
} from '@/lib/export-utils';
import i18n from '@/i18n';

describe('Export Utils - Extended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validCase: GenerateOutput = {
    caseStructure: {
      thesis: 'Test thesis.',
      framework: 'Utilitarian',
      keyDefinitions: ['A'],
      burdenOfProof: 'Net positive',
    },
    contentions: [{ id: 'c1', claim: 'Claim', reasoning: 'R', evidence: 'E', needsSource: false, impact: 'I' }],
    predictedOpponentCase: { likelyArguments: ['Arg'], strategicWeaknesses: ['W'], keyClashes: ['K'] },
    counters: [{ targetArgument: 'T', counterpoint: 'C', rebuttal: 'R' }],
    metadata: { side: 'pro', format: 'bp', generatedAt: '2024-01-01T00:00:00Z' },
  };

  const validAttack: AttackOutput = {
    overallAssessment: { score: 75, summary: 'Decent case', strengthAreas: ['Clear framework'] },
    weaknesses: [{ id: 'weakness-1', type: 'logical', description: 'Weak point', severity: 'major', whyWeak: 'Because', howOpponentAttacks: 'Like this', improvedVersion: 'Better' }],
    fallaciesDetected: [],
    crossExQuestions: [],
    weighingAnalysis: {
      currentWeighing: 'None',
      missingComparisons: [],
      improvementSuggestions: [],
    },
  };

  const validBrainstorm: BrainstormOutput = {
    topFive: [{ rank: 1, idea: { title: 'Idea', description: 'Desc' }, whyTop: 'Good' }],
    mindmap: [{ category: 'Cat', items: [{ title: 'T', description: 'D' }] }],
    buckets: [{ name: 'B', keyInsight: 'K', ideas: [{ title: 'I' }] }],
    nextSteps: ['Step 1'],
  } as any;

  const validFactoids: FactoidsOutput = {
    factoids: [{ shortClaim: 'Claim', keyFigure: '50%', context: 'Ctx', howToUse: 'Use', relevanceScore: 80, citation: { title: 'T', publisher: 'P', verified: 'verified' } }],
    warnings: [],
  } as any;

  describe('exportAttackToDocx', () => {
    it('exports valid attack successfully', async () => {
      const result = await exportAttackToDocx(validAttack);
      expect(result).toBe(true);
    });

    it('returns false when overallAssessment is missing', async () => {
      const result = await exportAttackToDocx({ ...validAttack, overallAssessment: undefined } as any);
      expect(result).toBe(false);
    });

    it('returns false when weaknesses is not an array', async () => {
      const result = await exportAttackToDocx({ ...validAttack, weaknesses: null } as any);
      expect(result).toBe(false);
    });

    it('handles empty weaknesses array', async () => {
      const result = await exportAttackToDocx({ ...validAttack, weaknesses: [] });
      expect(result).toBe(true);
    });

    it('handles empty fallaciesDetected', async () => {
      const result = await exportAttackToDocx({ ...validAttack, fallaciesDetected: [] });
      expect(result).toBe(true);
    });

    it('handles empty crossExQuestions', async () => {
      const result = await exportAttackToDocx({ ...validAttack, crossExQuestions: [] });
      expect(result).toBe(true);
    });
  });

  describe('exportBrainstormToDocx', () => {
    it('exports valid brainstorm successfully', async () => {
      const result = await exportBrainstormToDocx(validBrainstorm);
      expect(result).toBe(true);
    });

    it('handles empty topFive', async () => {
      const result = await exportBrainstormToDocx({ ...validBrainstorm, topFive: [] });
      expect(result).toBe(true);
    });

    it('handles empty mindmap', async () => {
      const result = await exportBrainstormToDocx({ ...validBrainstorm, mindmap: [] });
      expect(result).toBe(true);
    });

    it('handles empty buckets', async () => {
      const result = await exportBrainstormToDocx({ ...validBrainstorm, buckets: [] });
      expect(result).toBe(true);
    });

    it('handles empty nextSteps', async () => {
      const result = await exportBrainstormToDocx({ ...validBrainstorm, nextSteps: [] });
      expect(result).toBe(true);
    });
  });

  describe('exportFactoidsToDocx', () => {
    it('exports valid factoids successfully', async () => {
      const result = await exportFactoidsToDocx(validFactoids);
      expect(result).toBe(true);
    });

    it('returns false when factoids is not an array', async () => {
      const result = await exportFactoidsToDocx({ factoids: null } as any);
      expect(result).toBe(false);
    });

    it('handles empty factoids array', async () => {
      const result = await exportFactoidsToDocx({ factoids: [], warnings: [] } as any);
      expect(result).toBe(true);
    });

    it('handles factoids with warnings', async () => {
      const result = await exportFactoidsToDocx({ ...validFactoids, warnings: ['Warning 1'] } as any);
      expect(result).toBe(true);
    });
  });

  describe('export with different languages', () => {
    it('exports case with Spanish language active', async () => {
      await i18n.changeLanguage('es');
      const result = await exportCaseToDocx(validCase);
      expect(result).toBe(true);
      await i18n.changeLanguage('en');
    });

    it('exports case with Hungarian language active', async () => {
      await i18n.changeLanguage('hu');
      const result = await exportCaseToDocx(validCase);
      expect(result).toBe(true);
      await i18n.changeLanguage('en');
    });

    it('exports attack with Spanish language', async () => {
      await i18n.changeLanguage('es');
      const result = await exportAttackToDocx(validAttack);
      expect(result).toBe(true);
      await i18n.changeLanguage('en');
    });

    it('exports brainstorm with Hungarian language', async () => {
      await i18n.changeLanguage('hu');
      const result = await exportBrainstormToDocx(validBrainstorm);
      expect(result).toBe(true);
      await i18n.changeLanguage('en');
    });
  });

  describe('Google Docs exports - validation', () => {
    it('exportCaseToGoogleDocs rejects missing metadata', async () => {
      const result = await exportCaseToGoogleDocs({ ...validCase, metadata: undefined } as any);
      expect(result.success).toBe(false);
    });

    it('exportCaseToGoogleDocs rejects missing caseStructure', async () => {
      const result = await exportCaseToGoogleDocs({ ...validCase, caseStructure: undefined } as any);
      expect(result.success).toBe(false);
    });

    it('exportCaseToGoogleDocs rejects non-array contentions', async () => {
      const result = await exportCaseToGoogleDocs({ ...validCase, contentions: null } as any);
      expect(result.success).toBe(false);
    });

    it('exportAttackToGoogleDocs rejects missing overallAssessment', async () => {
      const result = await exportAttackToGoogleDocs({ ...validAttack, overallAssessment: undefined } as any);
      expect(result.success).toBe(false);
    });

    it('exportAttackToGoogleDocs rejects non-array weaknesses', async () => {
      const result = await exportAttackToGoogleDocs({ ...validAttack, weaknesses: null } as any);
      expect(result.success).toBe(false);
    });

    it('exportFactoidsToGoogleDocs rejects non-array factoids', async () => {
      const result = await exportFactoidsToGoogleDocs({ factoids: null } as any);
      expect(result.success).toBe(false);
    });
  });

});
