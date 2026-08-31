import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { buildSparringTurns } from '@/lib/sparring/formats';
import type { SparringScorecard } from '@/lib/ai/schemas/sparring';
import type { SparringSession } from '@/lib/stores/sparring-store';

const exportMocks = vi.hoisted(() => {
  const paragraphs: Array<Record<string, unknown>> = [];
  const textRuns: Array<Record<string, unknown>> = [];
  const documents: Array<Record<string, unknown>> = [];
  const pdfDocuments: Array<Record<string, unknown>> = [];
  const autoTableCalls: Array<Record<string, unknown>> = [];
  return { paragraphs, textRuns, documents, pdfDocuments, autoTableCalls };
});

vi.mock('docx', () => ({
  Document: vi.fn(function DocumentMock(options: Record<string, unknown>) {
    exportMocks.documents.push(options);
    return { options };
  }),
  Packer: {
    toBlob: vi.fn().mockResolvedValue(new Blob(['sparring-docx'])),
  },
  Paragraph: vi.fn(function ParagraphMock(options: Record<string, unknown>) {
    exportMocks.paragraphs.push(options);
    return options;
  }),
  TextRun: vi.fn(function TextRunMock(options: Record<string, unknown> | string) {
    const normalized = typeof options === 'string' ? { text: options } : options;
    exportMocks.textRuns.push(normalized);
    return normalized;
  }),
  HeadingLevel: { HEADING_1: 'HEADING_1', HEADING_2: 'HEADING_2' },
  AlignmentType: { CENTER: 'CENTER' },
}));

vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

vi.mock('jspdf', () => ({
  jsPDF: class MockJsPdf {
    constructor() {
      let page = 1;
      const doc: Record<string, unknown> = {
        internal: { pageSize: { height: 297, width: 210 } },
        lastAutoTable: { finalY: 100 },
        setFillColor: vi.fn(),
        rect: vi.fn(),
        setTextColor: vi.fn(),
        setFontSize: vi.fn(),
        setFont: vi.fn(),
        text: vi.fn((text: unknown) => {
          const calls = (doc.textCalls as unknown[] | undefined) ?? [];
          calls.push(text);
          doc.textCalls = calls;
        }),
        textCalls: [],
        setDrawColor: vi.fn(),
        setLineWidth: vi.fn(),
        line: vi.fn(),
        getTextWidth: vi.fn(() => 10),
        splitTextToSize: vi.fn((text: string) => [text]),
        addPage: vi.fn(() => { page += 1; }),
        getNumberOfPages: vi.fn(() => page),
        setPage: vi.fn(),
        save: vi.fn(),
      };
      exportMocks.pdfDocuments.push(doc);
      return doc;
    }
  },
}));

vi.mock('jspdf-autotable', () => ({
  default: vi.fn((doc: Record<string, unknown>, options: Record<string, unknown>) => {
    exportMocks.autoTableCalls.push(options);
    doc.lastAutoTable = { finalY: 100 };
  }),
}));

import { saveAs } from 'file-saver';
import { exportSparringToDocx } from '@/lib/export-utils';
import { exportSparringToPdf } from '@/lib/pdf-export-utils';

const SCORECARD: SparringScorecard = {
  userScore: 78,
  aiScore: 74,
  categories: [
    { name: 'Logic', userScore: 20, aiScore: 18, feedback: 'The causal chain was clear.' },
    { name: 'Evidence', userScore: 18, aiScore: 18, feedback: 'The factual warrant needed more support.' },
    { name: 'Delivery', userScore: 19, aiScore: 19, feedback: 'Judged from organization, not vocal performance.' },
    { name: 'Strategy', userScore: 21, aiScore: 19, feedback: 'The user prioritized the central clash.' },
  ],
  overallFeedback: 'The user won a narrow edge by weighing the main mechanism.',
  keyMoments: ['The rebuttal answered the opponent’s strongest objection.'],
  improvementAreas: ['Compare the alternative policy explicitly.'],
  winner: 'user',
  verdict: 'The user had the edge.',
};

const SESSION: SparringSession = {
  id: '00000000-0000-4000-8000-000000000010',
  motion: 'This House would make public transport free at the point of use.',
  userSide: 'pro',
  format: 'pf',
  difficulty: 'hard',
  turns: buildSparringTurns('pf', 'pro'),
  speeches: [
    {
      id: 'speech-1',
      turnId: 'pf-1',
      speaker: 'user',
      side: 'pro',
      role: 'Pro constructive',
      content: 'Universal access removes the direct price barrier to participation.',
      createdAt: 1_000,
      timeLimitSeconds: 240,
      timeUsedSeconds: 45,
    },
    {
      id: 'speech-2',
      turnId: 'pf-2',
      speaker: 'ai',
      side: 'con',
      role: 'Con constructive',
      content: 'Targeted support can preserve access while funding service quality.',
      createdAt: 2_000,
      timeLimitSeconds: 240,
      timeUsedSeconds: 60,
    },
  ],
  currentTurnIndex: 8,
  phase: 'complete',
  draft: '',
  timerRemainingSeconds: 0,
  timerRunning: false,
  timerDeadline: null,
  scorecard: SCORECARD,
  createdAt: 1_000,
  updatedAt: 3_000,
};

const SCHOOL_SESSION: SparringSession = {
  ...SESSION,
  format: 'standard',
  turns: buildSparringTurns('standard', 'pro'),
  speeches: [
    { ...SESSION.speeches[0], turnId: 'standard-1', role: 'Pro Introductor' },
    { ...SESSION.speeches[1], turnId: 'standard-2', role: 'Con Introductor' },
  ],
};

describe('sparring transcript exports', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    exportMocks.paragraphs.length = 0;
    exportMocks.textRuns.length = 0;
    exportMocks.documents.length = 0;
    exportMocks.pdfDocuments.length = 0;
    exportMocks.autoTableCalls.length = 0;
    await i18n.changeLanguage('en');
  });

  it('exports a translated DOCX transcript with motion, turn, and category labels', async () => {
    await i18n.changeLanguage('es');

    await expect(exportSparringToDocx(SESSION)).resolves.toBe(true);
    expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), 'SparringTranscript_1970-01-01.docx');

    const paragraphText = exportMocks.paragraphs
      .map((paragraph) => paragraph.text)
      .filter((value): value is string => typeof value === 'string');
    const runText = exportMocks.textRuns
      .map((run) => run.text)
      .filter((value): value is string => typeof value === 'string');

    const documentText = runText.join('');
    expect(documentText).toContain('Moción:');
    expect(documentText).toContain(SESSION.motion);
    expect(documentText).toContain('1. Constructivo a favor');
    expect(runText).toContain('2. Constructivo en contra');
    expect(runText.some((value) => value.startsWith('Lógica:'))).toBe(true);
    expect(runText).toContain('A favor');
    expect(paragraphText).toContain('PUNTUACIONES POR CATEGORÍA');
  });

  it('exports a translated PDF with category rows and translated turn headings', async () => {
    await i18n.changeLanguage('hu');

    await expect(exportSparringToPdf(SESSION)).resolves.toBe(true);
    const pdf = exportMocks.pdfDocuments[0];
    expect(pdf.save).toHaveBeenCalledWith('SparringTranscript_1970-01-01.pdf');

    const textCalls = (pdf.textCalls as unknown[]).flatMap((value) => Array.isArray(value) ? value : [value]);
    expect(textCalls).toContain('Vitapárbaj átirata');
    expect(textCalls).toContain('1. Pro érvelés');
    expect(textCalls).toContain('2. Kontra érvelés');
    expect(textCalls).toContain('Indítvány: This House would make public transport free at the point of use.');

    const categoryTable = exportMocks.autoTableCalls.find((call) => {
      const body = call.body;
      return Array.isArray(body) && body.some((row) => Array.isArray(row) && row[0] === 'Logika');
    });
    expect(categoryTable).toBeDefined();
  });

  it('names the school format and speaker roles in DOCX and PDF exports', async () => {
    await expect(exportSparringToDocx(SCHOOL_SESSION)).resolves.toBe(true);
    const docxText = exportMocks.textRuns.map((run) => run.text).filter((value): value is string => typeof value === 'string');
    expect(docxText).toContain('School 4-6-6-3');
    expect(docxText).toContain('1. Pro Introductor');

    await expect(exportSparringToPdf(SCHOOL_SESSION)).resolves.toBe(true);
    const pdf = exportMocks.pdfDocuments.at(-1);
    const textCalls = ((pdf?.textCalls as unknown[] | undefined) ?? []).flatMap((value) => Array.isArray(value) ? value : [value]);
    expect(textCalls.some((value) => typeof value === 'string' && value.includes('School 4-6-6-3'))).toBe(true);
    expect(textCalls).toContain('1. Pro Introductor');
  });
});
