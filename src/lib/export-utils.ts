import i18n from '@/i18n';
import type { GenerateOutput } from './ai/schemas/generate';
import type { AttackOutput } from './ai/schemas/attack';
import type { BrainstormOutput } from './ai/schemas/brainstorm';
import type { FactoidsOutput } from './ai/schemas/factoids';
import type { SparringSession } from './stores/sparring-store';
import { formatEuropeanDate, formatEuropeanDateTime } from './date-format';

function formatSparringDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function getSparringSideLabel(side: SparringSession['userSide']): string {
  return side === 'pro' ? i18n.t('export.proposition') : i18n.t('export.opposition');
}

function getSparringWinnerLabel(session: SparringSession): string {
  const winner = session.scorecard?.winner;
  if (winner === 'user') return i18n.t('export.sparringUser');
  if (winner === 'ai') return i18n.t('export.sparringOpponent');
  return i18n.t('export.sparringTie');
}

function getSparringCategoryLabel(category: string): string {
  return i18n.t(`sparring.category.${category}`, category);
}

function getSparringTurnLabel(speech: SparringSession['speeches'][number]): string {
  return i18n.t(`sparring.turns.${speech.turnId}`, speech.role);
}

export async function exportCaseToDocx(result: GenerateOutput): Promise<boolean> {
  try {
    if (
      !result?.metadata ||
      !result.caseStructure ||
      !Array.isArray(result.contentions) ||
      !result.predictedOpponentCase ||
      !Array.isArray(result.counters)
    ) {
      throw new Error('Missing required case data for export.');
    }

    // Dynamically import heavy libraries only when needed
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx');
    const { saveAs } = await import('file-saver');

    const thesis = result.caseStructure.thesis?.trim() || 'Untitled Thesis';
    const motion = (result.metadata as Record<string, unknown>)?.motion as string | undefined;
    const thesisTitle = motion || thesis.split('.')[0] || thesis;
    const framework = result.caseStructure.framework?.trim() || 'No framework provided.';
    const burdenOfProof = result.caseStructure.burdenOfProof?.trim() || 'No burden of proof provided.';
    const sideLabel = result.metadata.side === 'pro'
      ? i18n.t('export.proposition')
      : result.metadata.side === 'con'
        ? i18n.t('export.opposition')
        : 'Unknown';
    const formatLabel = result.metadata.format ? result.metadata.format.toUpperCase() : 'UNKNOWN';
    const generatedAtDate = result.metadata.generatedAt ? new Date(result.metadata.generatedAt) : null;
    const generatedAtText = generatedAtDate && !Number.isNaN(generatedAtDate.getTime())
      ? formatEuropeanDate(generatedAtDate)
      : 'Unknown';

    const contentions = Array.isArray(result.contentions) ? result.contentions : [];
    const contentionsSection = contentions.length > 0
      ? contentions.flatMap((c, i) => {
        const claim = c?.claim || 'Untitled argument';
        const reasoning = c?.reasoning || 'No reasoning provided.';
        const evidence = c?.evidence || 'No evidence provided.';
        const impact = c?.impact || 'No impact provided.';
        return [
          new Paragraph({
            children: [new TextRun({ text: `Argument ${i + 1}: ${claim}`, bold: true, size: 28 })],
            spacing: { before: 200, after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `${i18n.t('export.reasoning')}: `, italics: true }), new TextRun(reasoning)],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `${i18n.t('export.evidence')}: `, italics: true }), new TextRun(evidence)],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: `${i18n.t('export.impact')}: `, italics: true }), new TextRun(impact)],
            spacing: { after: 300 },
          }),
        ];
      })
      : [new Paragraph({ text: i18n.t('export.noArguments'), spacing: { after: 200 } })];

    const predictedArguments = Array.isArray(result.predictedOpponentCase.likelyArguments)
      ? result.predictedOpponentCase.likelyArguments
      : [];
    const predictedSection = predictedArguments.length > 0
      ? predictedArguments.map(arg => new Paragraph({ text: "• " + arg, spacing: { after: 100 } }))
      : [new Paragraph({ text: i18n.t('export.noOpponentArgs'), spacing: { after: 100 } })];

    const counters = Array.isArray(result.counters) ? result.counters : [];
    const countersSection = counters.length > 0
      ? counters.flatMap(c => {
        const target = c?.targetArgument || 'Unknown target';
        const counterpoint = c?.counterpoint || 'No counterpoint provided.';
        const rebuttal = c?.rebuttal || 'No rebuttal provided.';
        return [
          new Paragraph({
            children: [new TextRun({ text: `${i18n.t('export.target')}: `, bold: true }), new TextRun(target)],
          }),
          new Paragraph({
            children: [new TextRun({ text: `${i18n.t('export.counter')}: `, italics: true }), new TextRun(counterpoint)],
          }),
          new Paragraph({
            children: [new TextRun({ text: `${i18n.t('export.rebuttal')}: `, italics: true }), new TextRun(rebuttal)],
            spacing: { after: 200 },
          }),
        ];
      })
      : [new Paragraph({ text: i18n.t('export.noCounters'), spacing: { after: 200 } })];

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            // Title
            new Paragraph({
              text: i18n.t('export.debateCase') + ": " + thesisTitle,
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),

            // Metadata
            new Paragraph({
              children: [
                new TextRun({ text: `${i18n.t('export.side')}: `, bold: true }),
                new TextRun(sideLabel),
                new TextRun({ text: " | Format: ", bold: true }),
                new TextRun(formatLabel),
                new TextRun({ text: " | Date: ", bold: true }),
                new TextRun(generatedAtText),
              ],
              spacing: { after: 400 },
            }),

            // Exordio (if present)
            ...(result.exordio ? [
              new Paragraph({ text: i18n.t('export.exordio').toUpperCase(), heading: HeadingLevel.HEADING_2 }),
              new Paragraph({
                children: [new TextRun({ text: `${i18n.t('export.hook')}: `, bold: true }), new TextRun(result.exordio.hook || '')],
                spacing: { after: 100 },
              }),
              new Paragraph({
                children: [new TextRun({ text: `${i18n.t('export.transition')}: `, bold: true }), new TextRun(result.exordio.transition || '')],
                spacing: { after: 400 },
              }),
            ] : []),

            // Thesis & Framework
            new Paragraph({ text: i18n.t('export.thesis').toUpperCase(), heading: HeadingLevel.HEADING_2 }),
            new Paragraph({ text: thesis, spacing: { after: 200 } }),

            new Paragraph({ text: i18n.t('export.framework').toUpperCase(), heading: HeadingLevel.HEADING_2 }),
            new Paragraph({ text: framework, spacing: { after: 200 } }),

            new Paragraph({ text: i18n.t('export.burdenOfProof').toUpperCase(), heading: HeadingLevel.HEADING_2 }),
            new Paragraph({ text: burdenOfProof, spacing: { after: 400 } }),

            // Contentions
            new Paragraph({ text: i18n.t('export.arguments').toUpperCase(), heading: HeadingLevel.HEADING_2 }),
            ...contentionsSection,

            // Predictions
            new Paragraph({ text: i18n.t('export.predictedOpponent').toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
            ...predictedSection,

            // Counters
            new Paragraph({ text: i18n.t('export.counters').toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
            ...countersSection,
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    const fileSuffix = result.metadata.side || 'case';
    saveAs(blob, `DebateCase_${fileSuffix}.docx`);
    return true;
  } catch (error) {
    console.error('Failed to export case to DOCX:', error);
    return false;
  }
}

// ============================================================
// ATTACK DOCX EXPORT
// ============================================================
export async function exportAttackToDocx(result: AttackOutput): Promise<boolean> {
  try {
    if (!result?.overallAssessment || !Array.isArray(result.weaknesses)) {
      throw new Error('Missing required attack data for export.');
    }

    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx');
    const { saveAs } = await import('file-saver');

    const weaknesses = result.weaknesses || [];
    const weaknessesSection = weaknesses.length > 0
      ? weaknesses.flatMap((w, i) => [
        new Paragraph({
          children: [new TextRun({ text: `${i + 1}. [${w.severity?.toUpperCase()}] ${w.description}`, bold: true })],
          spacing: { before: 200, after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `${i18n.t('export.whyWeak')}: `, italics: true }), new TextRun(w.whyWeak || '')],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `${i18n.t('export.howOpponentAttacks')}: `, italics: true }), new TextRun(w.howOpponentAttacks || '')],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `${i18n.t('export.improvedVersion')}: `, italics: true }), new TextRun(w.improvedVersion || '')],
          spacing: { after: 200 },
        }),
      ])
      : [new Paragraph({ text: i18n.t('export.noWeaknesses'), spacing: { after: 200 } })];

    const fallacies = result.fallaciesDetected || [];
    const fallaciesSection = fallacies.length > 0
      ? fallacies.flatMap(f => [
        new Paragraph({
          children: [new TextRun({ text: f.name, bold: true })],
          spacing: { before: 100, after: 50 },
        }),
        new Paragraph({ text: `Location: ${f.location}`, spacing: { after: 50 } }),
        new Paragraph({ text: f.explanation, spacing: { after: 150 } }),
      ])
      : [new Paragraph({ text: i18n.t('export.noFallacies'), spacing: { after: 200 } })];

    const crossEx = result.crossExQuestions || [];
    const crossExSection = crossEx.length > 0
      ? crossEx.flatMap((q, i) => [
        new Paragraph({
          children: [new TextRun({ text: `Q${i + 1}: ${q.question}`, bold: true })],
          spacing: { before: 100, after: 50 },
        }),
        new Paragraph({ text: `Purpose: ${q.purpose}`, spacing: { after: 50 } }),
        new Paragraph({ text: `Expected Trap: ${q.expectedTrap}`, spacing: { after: 150 } }),
      ])
      : [new Paragraph({ text: i18n.t('export.noCrossEx'), spacing: { after: 200 } })];

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: i18n.t('export.caseAttack'),
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `${i18n.t('export.overallScore')}: `, bold: true }),
              new TextRun(`${result.overallAssessment.score}/100`),
            ],
            spacing: { after: 200 },
          }),
          new Paragraph({ text: result.overallAssessment.summary, spacing: { after: 400 } }),

          new Paragraph({ text: i18n.t('export.weaknesses').toUpperCase(), heading: HeadingLevel.HEADING_2 }),
          ...weaknessesSection,

          new Paragraph({ text: i18n.t('export.fallacies').toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
          ...fallaciesSection,

          new Paragraph({ text: i18n.t('export.crossExQuestions').toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
          ...crossExSection,
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `AttackAnalysis_${new Date().toISOString().split('T')[0]}.docx`);
    return true;
  } catch (error) {
    console.error('Failed to export attack to DOCX:', error);
    return false;
  }
}

// ============================================================
// BRAINSTORM DOCX EXPORT
// ============================================================
export async function exportBrainstormToDocx(result: BrainstormOutput): Promise<boolean> {
  try {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx');
    const { saveAs } = await import('file-saver');

    const children: InstanceType<typeof Paragraph>[] = [
      new Paragraph({
        text: i18n.t('export.brainstormResults'),
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
    ];

    // Top Five
    const topFive = result.topFive || [];
    if (topFive.length > 0) {
      children.push(new Paragraph({ text: "TOP 5 ARGUMENT ANGLES", heading: HeadingLevel.HEADING_2 }));
      topFive.forEach(item => {
        children.push(new Paragraph({
          children: [new TextRun({ text: `#${item.rank}: ${item.idea?.title || 'Untitled'}`, bold: true })],
          spacing: { before: 150, after: 50 },
        }));
        children.push(new Paragraph({ text: item.idea?.description || '', spacing: { after: 50 } }));
        children.push(new Paragraph({
          children: [new TextRun({ text: `${i18n.t('export.whyTop')}: `, italics: true }), new TextRun(item.whyTop || '')],
          spacing: { after: 150 },
        }));
      });
    }

    // Mind Map
    const mindmap = result.mindmap || [];
    if (mindmap.length > 0) {
      children.push(new Paragraph({ text: "ARGUMENT MAP", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }));
      mindmap.forEach(category => {
        children.push(new Paragraph({
          children: [new TextRun({ text: category.category, bold: true })],
          spacing: { before: 200, after: 100 },
        }));
        category.items?.forEach(idea => {
          children.push(new Paragraph({
            text: `• ${idea.title}: ${idea.description}`,
            spacing: { after: 75 },
          }));
        });
      });
    }

    // Buckets
    const buckets = result.buckets || [];
    if (buckets.length > 0) {
      children.push(new Paragraph({ text: "ARGUMENT BUCKETS", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }));
      buckets.forEach(bucket => {
        children.push(new Paragraph({
          children: [new TextRun({ text: bucket.name, bold: true })],
          spacing: { before: 200, after: 50 },
        }));
        children.push(new Paragraph({ text: bucket.keyInsight || '', spacing: { after: 100 } }));
        bucket.ideas?.forEach(idea => {
          children.push(new Paragraph({ text: `• ${idea.title}`, spacing: { after: 50 } }));
        });
      });
    }

    // Next Steps
    const nextSteps = result.nextSteps || [];
    if (nextSteps.length > 0) {
      children.push(new Paragraph({ text: "NEXT STEPS", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }));
      nextSteps.forEach((step, i) => {
        children.push(new Paragraph({ text: `${i + 1}. ${step}`, spacing: { after: 75 } }));
      });
    }

    const doc = new Document({ sections: [{ properties: {}, children }] });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Brainstorm_${new Date().toISOString().split('T')[0]}.docx`);
    return true;
  } catch (error) {
    console.error('Failed to export brainstorm to DOCX:', error);
    return false;
  }
}

// ============================================================
// FACTOIDS DOCX EXPORT
// ============================================================
export async function exportFactoidsToDocx(result: FactoidsOutput): Promise<boolean> {
  try {
    if (!Array.isArray(result.factoids)) {
      throw new Error('Missing required factoids data for export.');
    }

    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx');
    const { saveAs } = await import('file-saver');

    const factoids = result.factoids || [];
    const factoidsSection = factoids.length > 0
      ? factoids.flatMap((f, i) => [
        new Paragraph({
          children: [new TextRun({ text: `${i + 1}. ${f.shortClaim}`, bold: true })],
          spacing: { before: 200, after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `${i18n.t('export.keyFigure')}: `, italics: true }), new TextRun(f.keyFigure || '')],
          spacing: { after: 50 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `${i18n.t('export.context')}: `, italics: true }), new TextRun(f.context || '')],
          spacing: { after: 50 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `${i18n.t('export.howToUse')}: `, italics: true }), new TextRun(f.howToUse || '')],
          spacing: { after: 50 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `${i18n.t('export.source')}: `, italics: true }),
            new TextRun(`${f.citation?.title || 'Unknown'} - ${f.citation?.publisher || 'Unknown'}`),
          ],
          spacing: { after: 200 },
        }),
      ])
      : [new Paragraph({ text: i18n.t('export.noFactoids'), spacing: { after: 200 } })];

    const warnings = result.warnings || [];
    const warningsSection = warnings.length > 0
      ? warnings.map(w => new Paragraph({ text: `⚠ ${w}`, spacing: { after: 75 } }))
      : [];

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: i18n.t('export.researchFactoids'),
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          new Paragraph({ text: "FACTS & EVIDENCE", heading: HeadingLevel.HEADING_2 }),
          ...factoidsSection,
          ...(warningsSection.length > 0 ? [
            new Paragraph({ text: "WARNINGS", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
            ...warningsSection,
          ] : []),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Factoids_${new Date().toISOString().split('T')[0]}.docx`);
    return true;
  } catch (error) {
    console.error('Failed to export factoids to DOCX:', error);
    return false;
  }
}

// ============================================================
// GOOGLE DOCS EXPORTS
// ============================================================

export interface GoogleDocsExportResult {
  success: boolean;
  documentUrl?: string;
  error?: string;
  requiresReauth?: boolean;
}

const GOOGLE_DOCS_EXPORT_TIMEOUT_MS = 30_000;
const GOOGLE_DOCS_EXPORT_TIMEOUT_MESSAGE = 'Google Docs export timed out. Please try again.';

async function callGoogleDocsEdgeFunction(
  mode: 'generate' | 'attack' | 'brainstorm' | 'factoids',
  data: GenerateOutput | AttackOutput | BrainstormOutput | FactoidsOutput
): Promise<GoogleDocsExportResult> {
  try {
    const { supabase, SUPABASE_URL } = await import('@/lib/supabase/client');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return { success: false, error: 'Not authenticated. Please sign in.', requiresReauth: true };
    }

    // Supabase only provides provider_token immediately after OAuth. The fallback
    // is scoped to this browser session so access tokens do not survive restarts.
    let providerToken = session.provider_token;
    const tokenSource = providerToken ? 'session' : 'sessionStorage';
    if (!providerToken) {
      providerToken = sessionStorage.getItem('google_provider_token');
    }

    console.debug('[GDocs Export] Token source:', tokenSource, 'Token present:', Boolean(providerToken));

    if (!providerToken) {
      return {
        success: false,
        error: 'Google Drive access not granted. Please sign out and sign back in.',
        requiresReauth: true,
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GOOGLE_DOCS_EXPORT_TIMEOUT_MS);
    let response: Response;
    let respData: Record<string, unknown>;
    try {
      response = await fetch(`${SUPABASE_URL}/functions/v1/export-gdoc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          mode,
          data,
          accessToken: providerToken,
        }),
        signal: controller.signal,
      });
      respData = await response.json().catch(() => ({}));
      if (controller.signal.aborted) {
        return { success: false, error: GOOGLE_DOCS_EXPORT_TIMEOUT_MESSAGE };
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return { success: false, error: GOOGLE_DOCS_EXPORT_TIMEOUT_MESSAGE };
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      console.error('[GDocs Export] Error response:', response.status, respData);
      if (
        respData.code === 'AUTH_EXPIRED' ||
        respData.code === 'REFRESH_FAILED' ||
        respData.code === 'DRIVE_SCOPE_REQUIRED' ||
        response.status === 401 ||
        response.status === 403
      ) {
        return { success: false, error: typeof respData.error === 'string' ? respData.error : 'Authorization expired.', requiresReauth: true };
      }
      return { success: false, error: typeof respData.error === 'string' ? respData.error : 'Failed to export to Google Docs' };
    }

    if (typeof respData.newAccessToken === 'string') {
      sessionStorage.setItem('google_provider_token', respData.newAccessToken);
    }

    return { success: true, documentUrl: typeof respData.documentUrl === 'string' ? respData.documentUrl : undefined };
  } catch (error) {
    console.error('Failed to export to Google Docs:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function exportCaseToGoogleDocs(result: GenerateOutput): Promise<GoogleDocsExportResult> {
  if (
    !result?.metadata ||
    !result.caseStructure ||
    !Array.isArray(result.contentions) ||
    !result.predictedOpponentCase ||
    !Array.isArray(result.counters)
  ) {
    return { success: false, error: 'Missing required case data for export.' };
  }
  return callGoogleDocsEdgeFunction('generate', result);
}

export async function exportAttackToGoogleDocs(result: AttackOutput): Promise<GoogleDocsExportResult> {
  if (!result?.overallAssessment || !Array.isArray(result.weaknesses)) {
    return { success: false, error: 'Missing required attack data for export.' };
  }
  return callGoogleDocsEdgeFunction('attack', result);
}

export async function exportBrainstormToGoogleDocs(result: BrainstormOutput): Promise<GoogleDocsExportResult> {
  return callGoogleDocsEdgeFunction('brainstorm', result);
}

export async function exportFactoidsToGoogleDocs(result: FactoidsOutput): Promise<GoogleDocsExportResult> {
  if (!Array.isArray(result?.factoids)) {
    return { success: false, error: 'Missing required factoids data for export.' };
  }
  return callGoogleDocsEdgeFunction('factoids', result);
}

// ============================================================
// SPARRING TRANSCRIPT DOCX EXPORT
// ============================================================
export async function exportSparringToDocx(session: SparringSession): Promise<boolean> {
  try {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx');
    const { saveAs } = await import('file-saver');
    const totalTimeUsedSeconds = session.speeches.reduce((total, speech) => total + speech.timeUsedSeconds, 0);
    const totalTimeLimitSeconds = session.speeches.reduce((total, speech) => total + speech.timeLimitSeconds, 0);
    const scorecard = session.scorecard;
    const metadata = [
      [i18n.t('export.motion'), session.motion],
      [i18n.t('export.sparringFormat'), session.format.toUpperCase()],
      [i18n.t('export.side'), getSparringSideLabel(session.userSide)],
      [i18n.t('export.sparringDifficulty'), i18n.t(`sparring.difficulty.${session.difficulty}`, session.difficulty)],
      [i18n.t('export.sparringCompleted'), formatEuropeanDateTime(session.updatedAt)],
      [i18n.t('export.sparringTimeUsed'), `${formatSparringDuration(totalTimeUsedSeconds)} / ${formatSparringDuration(totalTimeLimitSeconds)}`],
    ].map(([label, value]) => new Paragraph({
      children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value)],
      spacing: { after: 100 },
    }));

    const scorecardContent = scorecard
      ? [
        new Paragraph({ text: i18n.t('export.sparringTotals').toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } }),
        new Paragraph({
          children: [
            new TextRun({ text: `${i18n.t('export.sparringUser')}: `, bold: true }),
            new TextRun(`${scorecard.userScore}/100`),
            new TextRun({ text: `   ${i18n.t('export.sparringOpponent')}: `, bold: true }),
            new TextRun(`${scorecard.aiScore}/100`),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `${i18n.t('export.sparringWinner')}: `, bold: true }), new TextRun(getSparringWinnerLabel(session))],
          spacing: { after: 200 },
        }),
        new Paragraph({ text: i18n.t('export.sparringCategories').toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 150 } }),
        ...scorecard.categories.flatMap((category) => [
          new Paragraph({
            children: [new TextRun({ text: `${getSparringCategoryLabel(category.name)}: `, bold: true }), new TextRun(`${category.userScore}/25 ${i18n.t('export.sparringUser').toLowerCase()} | ${category.aiScore}/25 ${i18n.t('export.sparringOpponent').toLowerCase()}`)],
            spacing: { after: 75 },
          }),
          new Paragraph({ text: category.feedback, spacing: { after: 150 } }),
        ]),
        new Paragraph({ text: i18n.t('export.sparringFeedback').toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 150 } }),
        new Paragraph({ text: scorecard.verdict, spacing: { after: 100 } }),
        new Paragraph({ text: scorecard.overallFeedback, spacing: { after: 150 } }),
        ...(scorecard.keyMoments.length > 0
          ? [
            new Paragraph({ text: i18n.t('export.sparringKeyMoments'), heading: HeadingLevel.HEADING_2, spacing: { before: 150, after: 75 } }),
            ...scorecard.keyMoments.map((moment) => new Paragraph({ text: `• ${moment}`, spacing: { after: 75 } })),
          ]
          : []),
        ...(scorecard.improvementAreas.length > 0
          ? [
            new Paragraph({ text: i18n.t('export.sparringImprovementAreas'), heading: HeadingLevel.HEADING_2, spacing: { before: 150, after: 75 } }),
            ...scorecard.improvementAreas.map((area) => new Paragraph({ text: `• ${area}`, spacing: { after: 75 } })),
          ]
          : []),
      ]
      : [
        new Paragraph({ text: i18n.t('export.sparringScorecardUnavailable'), spacing: { before: 300, after: 150 } }),
      ];

    const transcriptContent = session.speeches.length > 0
      ? session.speeches.flatMap((speech, index) => [
        new Paragraph({
          children: [new TextRun({ text: `${index + 1}. ${getSparringTurnLabel(speech)}`, bold: true })],
          spacing: { before: 200, after: 75 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `${i18n.t('export.side')}: `, bold: true }),
            new TextRun(getSparringSideLabel(speech.side)),
            new TextRun({ text: `   ${i18n.t('export.sparringTimeUsed')}: `, bold: true }),
            new TextRun(`${formatSparringDuration(speech.timeUsedSeconds)} / ${formatSparringDuration(speech.timeLimitSeconds)}`),
          ],
          spacing: { after: 75 },
        }),
        new Paragraph({ text: speech.content, spacing: { after: 150 } }),
      ])
      : [new Paragraph({ text: i18n.t('export.sparringNoTranscript'), spacing: { after: 150 } })];

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: i18n.t('export.sparringTranscript'),
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 250 },
          }),
          ...metadata,
          ...scorecardContent,
          new Paragraph({ text: i18n.t('export.sparringTranscript').toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } }),
          ...transcriptContent,
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `SparringTranscript_${new Date(session.updatedAt).toISOString().slice(0, 10)}.docx`);
    return true;
  } catch (error) {
    console.error('Failed to export sparring transcript to DOCX:', error);
    return false;
  }
}
