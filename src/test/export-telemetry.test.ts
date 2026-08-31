import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttackOutput } from '@/lib/ai/schemas/attack';
import type { BrainstormOutput } from '@/lib/ai/schemas/brainstorm';
import type { FactoidsOutput } from '@/lib/ai/schemas/factoids';
import type { GenerateOutput } from '@/lib/ai/schemas/generate';
import { buildSparringTurns } from '@/lib/sparring/formats';
import type { SparringSession } from '@/lib/stores/sparring-store';

const mocks = vi.hoisted(() => ({
  captureProductEvent: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/observability', () => ({
  captureProductEvent: mocks.captureProductEvent,
}));

vi.mock('@/lib/supabase/client', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
  supabase: { auth: { getSession: mocks.getSession } },
}));

vi.mock('docx', () => ({
  Document: vi.fn(function DocumentMock(options: Record<string, unknown>) {
    return { options };
  }),
  Packer: { toBlob: vi.fn().mockResolvedValue(new Blob(['docx'])) },
  Paragraph: vi.fn(function ParagraphMock(options: Record<string, unknown>) {
    return options;
  }),
  TextRun: vi.fn(function TextRunMock(options: Record<string, unknown> | string) {
    return typeof options === 'string' ? { text: options } : options;
  }),
  HeadingLevel: { HEADING_1: 'HEADING_1', HEADING_2: 'HEADING_2' },
  AlignmentType: { CENTER: 'CENTER' },
}));

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

vi.mock('jspdf', () => ({
  jsPDF: class MockJsPdf {
    constructor() {
      return {
        internal: { pageSize: { height: 297, width: 210 } },
        lastAutoTable: { finalY: 100 },
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
        splitTextToSize: vi.fn((text: string) => [text]),
        addPage: vi.fn(),
        getNumberOfPages: vi.fn(() => 1),
        setPage: vi.fn(),
        save: vi.fn(),
      };
    }
  },
}));

vi.mock('jspdf-autotable', () => ({
  default: vi.fn((doc: Record<string, unknown>) => {
    doc.lastAutoTable = { finalY: 100 };
  }),
}));

import {
  exportAttackToDocx,
  exportAttackToGoogleDocs,
  exportBrainstormToDocx,
  exportBrainstormToGoogleDocs,
  exportCaseToDocx,
  exportCaseToGoogleDocs,
  exportFactoidsToDocx,
  exportFactoidsToGoogleDocs,
  exportSparringToDocx,
} from '@/lib/export-utils';
import {
  exportAttackToPdf,
  exportBrainstormToPdf,
  exportCaseToPdf,
  exportFactoidsToPdf,
  exportSparringToPdf,
} from '@/lib/pdf-export-utils';

const validCase: GenerateOutput = {
  caseStructure: {
    thesis: 'Private thesis content',
    framework: 'Framework',
    keyDefinitions: [],
    burdenOfProof: 'Burden',
  },
  contentions: [],
  predictedOpponentCase: { likelyArguments: [], strategicWeaknesses: [], keyClashes: [] },
  counters: [],
  metadata: { side: 'pro', format: 'bp', generatedAt: '2026-01-01T00:00:00Z' },
};

const validAttack: AttackOutput = {
  overallAssessment: { score: 75, summary: 'Private summary content', strengthAreas: [] },
  weaknesses: [],
  fallaciesDetected: [],
  crossExQuestions: [],
  weighingAnalysis: { currentWeighing: '', missingComparisons: [], improvementSuggestions: [] },
};

const validBrainstorm: BrainstormOutput = {
  needsMoreInfo: false,
  mindmap: [],
  buckets: [],
  topFive: [],
  nextSteps: [],
  warningsAndTradeoffs: [],
};

const validFactoids: FactoidsOutput = {
  factoids: [],
  searchSuggestions: [],
  warnings: [],
  verificationStatus: 'complete',
};

const validSparringSession: SparringSession = {
  id: '00000000-0000-4000-8000-000000000010',
  motion: 'Private motion content',
  userSide: 'pro',
  format: 'pf',
  difficulty: 'hard',
  turns: buildSparringTurns('pf', 'pro'),
  speeches: [],
  currentTurnIndex: 0,
  phase: 'complete',
  draft: '',
  timerRemainingSeconds: 0,
  timerRunning: false,
  timerDeadline: null,
  createdAt: 0,
  updatedAt: 0,
};

describe('content export telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'app-token', provider_token: 'provider-token' } },
      error: null,
    });
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ documentUrl: 'https://docs.google.com/document/d/example' }), { status: 200 }));
  });

  it('records only enum-only format and tool values for successful exports', async () => {
    const exports = [
      { format: 'docx', tool: 'generate', run: () => exportCaseToDocx(validCase) },
      { format: 'docx', tool: 'attack', run: () => exportAttackToDocx(validAttack) },
      { format: 'docx', tool: 'brainstorm', run: () => exportBrainstormToDocx(validBrainstorm) },
      { format: 'docx', tool: 'factoids', run: () => exportFactoidsToDocx(validFactoids) },
      { format: 'docx', tool: 'sparring', run: () => exportSparringToDocx(validSparringSession) },
      { format: 'pdf', tool: 'generate', run: () => exportCaseToPdf(validCase) },
      { format: 'pdf', tool: 'attack', run: () => exportAttackToPdf(validAttack) },
      { format: 'pdf', tool: 'brainstorm', run: () => exportBrainstormToPdf(validBrainstorm) },
      { format: 'pdf', tool: 'factoids', run: () => exportFactoidsToPdf(validFactoids) },
      { format: 'pdf', tool: 'sparring', run: () => exportSparringToPdf(validSparringSession) },
      { format: 'google_docs', tool: 'generate', run: () => exportCaseToGoogleDocs(validCase) },
      { format: 'google_docs', tool: 'attack', run: () => exportAttackToGoogleDocs(validAttack) },
      { format: 'google_docs', tool: 'brainstorm', run: () => exportBrainstormToGoogleDocs(validBrainstorm) },
      { format: 'google_docs', tool: 'factoids', run: () => exportFactoidsToGoogleDocs(validFactoids) },
    ] as const;

    for (const exportOperation of exports) {
      await exportOperation.run();
    }

    expect(mocks.captureProductEvent).toHaveBeenCalledTimes(exports.length);
    exports.forEach(({ format, tool }, index) => {
      expect(mocks.captureProductEvent).toHaveBeenNthCalledWith(index + 1, 'content_exported', { format, tool });
    });
    expect(JSON.stringify(mocks.captureProductEvent.mock.calls)).not.toContain('Private thesis content');
    expect(JSON.stringify(mocks.captureProductEvent.mock.calls)).not.toContain('Private motion content');
  });

  it('does not record validation or request failures as exports', async () => {
    await exportCaseToDocx({ ...validCase, metadata: undefined } as unknown as GenerateOutput);
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await exportCaseToGoogleDocs(validCase);

    expect(mocks.captureProductEvent).not.toHaveBeenCalled();
  });
});
