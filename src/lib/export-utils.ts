import type { GenerateOutput } from './ai/schemas/generate';
import type { AttackOutput } from './ai/schemas/attack';
import type { BrainstormOutput } from './ai/schemas/brainstorm';
import type { FactoidsOutput } from './ai/schemas/factoids';

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
    const thesisTitle = thesis.split('.')[0] || thesis;
    const framework = result.caseStructure.framework?.trim() || 'No framework provided.';
    const burdenOfProof = result.caseStructure.burdenOfProof?.trim() || 'No burden of proof provided.';
    const sideLabel = result.metadata.side === 'pro'
      ? 'Proposition'
      : result.metadata.side === 'con'
        ? 'Opposition'
        : 'Unknown';
    const formatLabel = result.metadata.format ? result.metadata.format.toUpperCase() : 'UNKNOWN';
    const generatedAtDate = result.metadata.generatedAt ? new Date(result.metadata.generatedAt) : null;
    const generatedAtText = generatedAtDate && !Number.isNaN(generatedAtDate.getTime())
      ? generatedAtDate.toLocaleDateString()
      : 'Unknown';

    const contentions = Array.isArray(result.contentions) ? result.contentions : [];
    const contentionsSection = contentions.length > 0
      ? contentions.flatMap((c, i) => {
        const claim = c?.claim || 'Untitled contention';
        const reasoning = c?.reasoning || 'No reasoning provided.';
        const evidence = c?.evidence || 'No evidence provided.';
        const impact = c?.impact || 'No impact provided.';
        return [
          new Paragraph({
            children: [new TextRun({ text: `Contention ${i + 1}: ${claim}`, bold: true, size: 28 })],
            spacing: { before: 200, after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: "Reasoning: ", italics: true }), new TextRun(reasoning)],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: "Evidence: ", italics: true }), new TextRun(evidence)],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: "Impact: ", italics: true }), new TextRun(impact)],
            spacing: { after: 300 },
          }),
        ];
      })
      : [new Paragraph({ text: "No contentions provided.", spacing: { after: 200 } })];

    const predictedArguments = Array.isArray(result.predictedOpponentCase.likelyArguments)
      ? result.predictedOpponentCase.likelyArguments
      : [];
    const predictedSection = predictedArguments.length > 0
      ? predictedArguments.map(arg => new Paragraph({ text: "• " + arg, spacing: { after: 100 } }))
      : [new Paragraph({ text: "No predicted opponent arguments provided.", spacing: { after: 100 } })];

    const counters = Array.isArray(result.counters) ? result.counters : [];
    const countersSection = counters.length > 0
      ? counters.flatMap(c => {
        const target = c?.targetArgument || 'Unknown target';
        const counterpoint = c?.counterpoint || 'No counterpoint provided.';
        const rebuttal = c?.rebuttal || 'No rebuttal provided.';
        return [
          new Paragraph({
            children: [new TextRun({ text: "Target: ", bold: true }), new TextRun(target)],
          }),
          new Paragraph({
            children: [new TextRun({ text: "Counter: ", italics: true }), new TextRun(counterpoint)],
          }),
          new Paragraph({
            children: [new TextRun({ text: "Rebuttal: ", italics: true }), new TextRun(rebuttal)],
            spacing: { after: 200 },
          }),
        ];
      })
      : [new Paragraph({ text: "No counters provided.", spacing: { after: 200 } })];

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            // Title
            new Paragraph({
              text: "Debate Case: " + thesisTitle,
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),

            // Metadata
            new Paragraph({
              children: [
                new TextRun({ text: "Side: ", bold: true }),
                new TextRun(sideLabel),
                new TextRun({ text: " | Format: ", bold: true }),
                new TextRun(formatLabel),
                new TextRun({ text: " | Date: ", bold: true }),
                new TextRun(generatedAtText),
              ],
              spacing: { after: 400 },
            }),

            // Thesis & Framework
            new Paragraph({ text: "THESIS", heading: HeadingLevel.HEADING_2 }),
            new Paragraph({ text: thesis, spacing: { after: 200 } }),

            new Paragraph({ text: "FRAMEWORK", heading: HeadingLevel.HEADING_2 }),
            new Paragraph({ text: framework, spacing: { after: 200 } }),

            new Paragraph({ text: "BURDEN OF PROOF", heading: HeadingLevel.HEADING_2 }),
            new Paragraph({ text: burdenOfProof, spacing: { after: 400 } }),

            // Contentions
            new Paragraph({ text: "CONTENTIONS", heading: HeadingLevel.HEADING_2 }),
            ...contentionsSection,

            // Predictions
            new Paragraph({ text: "PREDICTED OPPONENT CASE", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
            ...predictedSection,

            // Counters
            new Paragraph({ text: "PREPARED COUNTERS", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
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
          children: [new TextRun({ text: "Why Weak: ", italics: true }), new TextRun(w.whyWeak || '')],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: "How Opponent Attacks: ", italics: true }), new TextRun(w.howOpponentAttacks || '')],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: "Improved Version: ", italics: true }), new TextRun(w.improvedVersion || '')],
          spacing: { after: 200 },
        }),
      ])
      : [new Paragraph({ text: "No weaknesses identified.", spacing: { after: 200 } })];

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
      : [new Paragraph({ text: "No fallacies detected.", spacing: { after: 200 } })];

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
      : [new Paragraph({ text: "No cross-examination questions provided.", spacing: { after: 200 } })];

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: "Case Attack Analysis",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Overall Score: ", bold: true }),
              new TextRun(`${result.overallAssessment.score}/100`),
            ],
            spacing: { after: 200 },
          }),
          new Paragraph({ text: result.overallAssessment.summary, spacing: { after: 400 } }),

          new Paragraph({ text: "WEAKNESSES IDENTIFIED", heading: HeadingLevel.HEADING_2 }),
          ...weaknessesSection,

          new Paragraph({ text: "FALLACIES DETECTED", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
          ...fallaciesSection,

          new Paragraph({ text: "CROSS-EXAMINATION QUESTIONS", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
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
        text: "Brainstorm Results",
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
          children: [new TextRun({ text: "Why Top: ", italics: true }), new TextRun(item.whyTop || '')],
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
          children: [new TextRun({ text: "Key Figure: ", italics: true }), new TextRun(f.keyFigure || '')],
          spacing: { after: 50 },
        }),
        new Paragraph({
          children: [new TextRun({ text: "Context: ", italics: true }), new TextRun(f.context || '')],
          spacing: { after: 50 },
        }),
        new Paragraph({
          children: [new TextRun({ text: "How to Use: ", italics: true }), new TextRun(f.howToUse || '')],
          spacing: { after: 50 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Source: ", italics: true }),
            new TextRun(`${f.citation?.title || 'Unknown'} - ${f.citation?.publisher || 'Unknown'}`),
          ],
          spacing: { after: 200 },
        }),
      ])
      : [new Paragraph({ text: "No factoids found.", spacing: { after: 200 } })];

    const warnings = result.warnings || [];
    const warningsSection = warnings.length > 0
      ? warnings.map(w => new Paragraph({ text: `⚠ ${w}`, spacing: { after: 75 } }))
      : [];

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: "Research Factoids",
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

    const providerToken = session.provider_token;
    if (!providerToken) {
      return {
        success: false,
        error: 'Google Drive access not granted. Please sign out and sign back in.',
        requiresReauth: true,
      };
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/export-gdoc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ mode, data, accessToken: providerToken }),
    });

    const respData = await response.json();

    if (!response.ok) {
      if (respData.code === 'AUTH_EXPIRED' || response.status === 401) {
        return { success: false, error: respData.error || 'Authorization expired.', requiresReauth: true };
      }
      return { success: false, error: respData.error || 'Failed to export to Google Docs' };
    }

    return { success: true, documentUrl: respData.documentUrl };
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

