// The Word documents both clients export. Each builder lays out one result as a
// `docx` Document and names the file as the website always has; the client
// imports the `docx` library itself (lazily: it is large), passes it in, and
// packs and saves or shares the Document its own way. Strings come through
// `ctx.t` with the website's `export.*` keys, so both clients print the same
// labels in every language.
import { readCase, sourceLine } from '../ai/case-view';
import type { AttackOutput } from '../ai/schemas/attack';
import type { BrainstormOutput } from '../ai/schemas/brainstorm';
import type { FactoidsOutput } from '../ai/schemas/factoids';
import type { GenerateOutput } from '../ai/schemas/generate';
import type { SparringSession } from '../sparring/session';

/** The `docx` module namespace, as `await import('docx')` returns it. */
export type DocxModule = typeof import('docx');
type DocxDocument = InstanceType<DocxModule['Document']>;
type DocxParagraph = InstanceType<DocxModule['Paragraph']>;

export interface DocxContext {
  t: (key: string, options?: Record<string, unknown>) => string;
  /** A day, as the website's formatEuropeanDate shows it. */
  formatDate: (date: Date) => string;
  /** A day and time, as the website's formatEuropeanDateTime shows it. */
  formatDateTime: (date: Date) => string;
}

export interface BuiltDocx {
  doc: DocxDocument;
  fileName: string;
}

/** Today's date as the file names use it: 2026-10-28. */
function isoDay(date = new Date()): string {
  return date.toISOString().split('T')[0];
}

/** What every case export needs; the older sections are optional. */
export function hasCaseData(result: GenerateOutput | undefined): result is GenerateOutput {
  return Boolean(result?.metadata && result.caseStructure && Array.isArray(result.contentions) && Array.isArray(result.counters));
}

export function buildCaseDocx(docx: DocxModule, result: GenerateOutput, ctx: DocxContext): BuiltDocx {
  if (!hasCaseData(result)) {
    throw new Error('Missing required case data for export.');
  }
  const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
  const { t } = ctx;

  const view = readCase(result);
  const roadmap = view.opening.roadmap || t('export.untitledCase');
  const motion = (result.metadata as Record<string, unknown>)?.motion as string | undefined;
  const caseTitle = motion || roadmap.split('.')[0] || roadmap;
  const sideLabel = result.metadata.side === 'pro'
    ? t('export.proposition')
    : result.metadata.side === 'con'
      ? t('export.opposition')
      : 'Unknown';
  const formatLabel = result.metadata.format ? result.metadata.format.toUpperCase() : 'UNKNOWN';
  const generatedAtDate = result.metadata.generatedAt ? new Date(result.metadata.generatedAt) : null;
  const generatedAtText = generatedAtDate && !Number.isNaN(generatedAtDate.getTime())
    ? ctx.formatDate(generatedAtDate)
    : 'Unknown';

  const heading = (text: string, before = 0) =>
    new Paragraph({ text: text.toUpperCase(), heading: HeadingLevel.HEADING_2, ...(before ? { spacing: { before } } : {}) });
  const labelled = (label: string, text: string, after = 100, bold = false) => new Paragraph({
    children: [new TextRun({ text: `${label}: `, ...(bold ? { bold: true } : { italics: true }) }), new TextRun(text)],
    spacing: { after },
  });
  const bullets = (items: string[]) => items.map((item) => new Paragraph({ text: '• ' + item, spacing: { after: 100 } }));
  const legacyBlock = (label: string, text: string | undefined) => text ? [labelled(label, text, 200, true)] : [];

  const openingSection = [
    ...(view.opening.hook ? [new Paragraph({ children: [new TextRun({ text: view.opening.hook, italics: true })], spacing: { after: 200 } })] : []),
    ...(view.opening.definition ? [labelled(t('export.definition'), view.opening.definition, 200, true)] : []),
    ...(view.opening.roadmap ? [new Paragraph({ text: view.opening.roadmap, spacing: { after: 200 } })] : []),
    ...legacyBlock(t('export.legacyJudgeBy'), view.legacy.framework),
    ...legacyBlock(t('export.legacyMustShow'), view.legacy.burdenOfProof),
    ...(view.legacy.definitions.length ? [labelled(t('export.legacyDefinitions'), view.legacy.definitions.join('; '), 200, true)] : []),
  ];

  const argumentsSection = view.arguments.flatMap((argument, i) => [
    new Paragraph({
      children: [new TextRun({ text: `${t('export.argumentNumber', { number: i + 1 })}: ${argument.title ?? argument.point}`, bold: true, size: 28 })],
      spacing: { before: 200, after: 100 },
    }),
    ...(argument.title && argument.point ? [labelled(t('export.point'), argument.point)] : []),
    ...(argument.explanation ? [labelled(t('export.explanation'), argument.explanation)] : []),
    ...(argument.evidence ? [labelled(t('export.evidence'), argument.evidence)] : []),
    ...(argument.whyItMatters ? [labelled(t('export.whyItMatters'), argument.whyItMatters, 300)] : []),
  ]);

  // R2: each earlier argument it backs up, then the spoken paragraph.
  const reinforceSection = view.reinforce.flatMap((item) => [
    ...(item.argument ? [new Paragraph({ children: [new TextRun({ text: item.argument, bold: true })], spacing: { before: 200, after: 100 } })] : []),
    new Paragraph({ text: item.text, spacing: { after: 200 } }),
  ]);

  const answersSection = view.ifTheySay.flatMap((answer) => [
    new Paragraph({
      children: [new TextRun({ text: `${t('export.theySay')}: `, bold: true }), new TextRun(answer.theySay)],
    }),
    labelled(t('export.weAnswer'), answer.weAnswer, answer.inRound || answer.source ? 100 : 200),
    ...(answer.inRound ? [labelled(t('export.legacySayItLike'), answer.inRound, answer.source ? 100 : 200)] : []),
    ...(answer.source ? [labelled(t('export.source'), answer.source, 200)] : []),
  ]);

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // Title
          new Paragraph({
            text: t('export.debateCase') + ": " + caseTitle,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),

          // Metadata
          new Paragraph({
            children: [
              new TextRun({ text: `${t('export.side')}: `, bold: true }),
              new TextRun(sideLabel),
              new TextRun({ text: " | Format: ", bold: true }),
              new TextRun(formatLabel),
              new TextRun({ text: " | Date: ", bold: true }),
              new TextRun(generatedAtText),
            ],
            spacing: { after: 400 },
          }),

          ...(openingSection.length ? [heading(t('export.opening')), ...openingSection] : []),
          ...(argumentsSection.length ? [heading(t('export.arguments'), 200), ...argumentsSection] : []),
          ...(reinforceSection.length ? [heading(t('export.reinforce'), 200), ...reinforceSection] : []),
          ...(view.whyWeWin.length ? [heading(t('export.whyWeWin'), 200), ...bullets(view.whyWeWin)] : []),
          ...(answersSection.length || view.legacy.likelyArguments.length ? [
            heading(t('export.ifTheySay'), 400),
            ...answersSection,
            ...(view.legacy.likelyArguments.length ? [new Paragraph({ children: [new TextRun({ text: t('export.legacyAlsoSay'), bold: true })], spacing: { before: 200, after: 100 } }), ...bullets(view.legacy.likelyArguments)] : []),
          ] : []),
          ...(view.closingLine ? [heading(t('export.closingLine'), 400), new Paragraph({ children: [new TextRun({ text: view.closingLine, bold: true })], spacing: { after: 200 } })] : []),
          ...(view.sources.length ? [heading(t('export.sources'), 400), ...bullets(view.sources.map(sourceLine))] : []),
        ],
      },
    ],
  });

  return { doc, fileName: `DebateCase_${result.metadata.side || 'case'}.docx` };
}

export function buildAttackDocx(docx: DocxModule, result: AttackOutput, ctx: DocxContext): BuiltDocx {
  if (!result?.overallAssessment || !Array.isArray(result.weaknesses)) {
    throw new Error('Missing required attack data for export.');
  }
  const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
  const { t } = ctx;

  const weaknesses = result.weaknesses || [];
  const weaknessesSection = weaknesses.length > 0
    ? weaknesses.flatMap((w, i) => [
      new Paragraph({
        children: [new TextRun({ text: `${i + 1}. [${w.severity?.toUpperCase()}] ${w.description}`, bold: true })],
        spacing: { before: 200, after: 100 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `${t('export.whyWeak')}: `, italics: true }), new TextRun(w.whyWeak || '')],
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `${t('export.howOpponentAttacks')}: `, italics: true }), new TextRun(w.howOpponentAttacks || '')],
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `${t('export.improvedVersion')}: `, italics: true }), new TextRun(w.improvedVersion || '')],
        spacing: { after: 200 },
      }),
    ])
    : [new Paragraph({ text: t('export.noWeaknesses'), spacing: { after: 200 } })];

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
    : [new Paragraph({ text: t('export.noFallacies'), spacing: { after: 200 } })];

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
    : [new Paragraph({ text: t('export.noCrossEx'), spacing: { after: 200 } })];

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: t('export.caseAttack'),
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `${t('export.overallScore')}: `, bold: true }),
            new TextRun(`${result.overallAssessment.score}/100`),
          ],
          spacing: { after: 200 },
        }),
        new Paragraph({ text: result.overallAssessment.summary, spacing: { after: 400 } }),

        new Paragraph({ text: t('export.weaknesses').toUpperCase(), heading: HeadingLevel.HEADING_2 }),
        ...weaknessesSection,

        new Paragraph({ text: t('export.fallacies').toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
        ...fallaciesSection,

        new Paragraph({ text: t('export.crossExQuestions').toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
        ...crossExSection,
      ],
    }],
  });

  return { doc, fileName: `AttackAnalysis_${isoDay()}.docx` };
}

export function buildBrainstormDocx(docx: DocxModule, result: BrainstormOutput, ctx: DocxContext): BuiltDocx {
  const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
  const { t } = ctx;

  const children: DocxParagraph[] = [
    new Paragraph({
      text: t('export.brainstormResults'),
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
        children: [new TextRun({ text: `${t('export.whyTop')}: `, italics: true }), new TextRun(item.whyTop || '')],
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
  return { doc, fileName: `Brainstorm_${isoDay()}.docx` };
}

export function buildFactoidsDocx(docx: DocxModule, result: FactoidsOutput, ctx: DocxContext): BuiltDocx {
  if (!Array.isArray(result.factoids)) {
    throw new Error('Missing required factoids data for export.');
  }
  const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
  const { t } = ctx;

  const factoids = result.factoids || [];
  const factoidsSection = factoids.length > 0
    ? factoids.flatMap((f, i) => [
      new Paragraph({
        children: [new TextRun({ text: `${i + 1}. ${f.shortClaim}`, bold: true })],
        spacing: { before: 200, after: 100 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `${t('export.keyFigure')}: `, italics: true }), new TextRun(f.keyFigure || '')],
        spacing: { after: 50 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `${t('export.context')}: `, italics: true }), new TextRun(f.context || '')],
        spacing: { after: 50 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `${t('export.howToUse')}: `, italics: true }), new TextRun(f.howToUse || '')],
        spacing: { after: 50 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `${t('export.source')}: `, italics: true }),
          new TextRun(`${f.citation?.title || 'Unknown'} - ${f.citation?.publisher || 'Unknown'}`),
        ],
        spacing: { after: 200 },
      }),
    ])
    : [new Paragraph({ text: t('export.noFactoids'), spacing: { after: 200 } })];

  const warnings = result.warnings || [];
  const warningsSection = warnings.length > 0
    ? warnings.map(w => new Paragraph({ text: `⚠ ${w}`, spacing: { after: 75 } }))
    : [];

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: t('export.researchFactoids'),
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

  return { doc, fileName: `Factoids_${isoDay()}.docx` };
}

// The website's src/lib/export-sparring-labels.ts reads these through its i18n
// instance for the PDF export too; these take `t` so core stays i18n-free.
function sparringDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function sparringSideLabel(t: DocxContext['t'], side: SparringSession['userSide']): string {
  return side === 'pro' ? t('export.proposition') : t('export.opposition');
}

function sparringWinnerLabel(t: DocxContext['t'], session: SparringSession): string {
  const winner = session.scorecard?.winner;
  if (winner === 'user') return t('export.sparringUser');
  if (winner === 'ai') return t('export.sparringOpponent');
  return t('export.sparringTie');
}

export function buildSparringDocx(docx: DocxModule, session: SparringSession, ctx: DocxContext): BuiltDocx {
  const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
  const { t } = ctx;

  const totalTimeUsedSeconds = session.speeches.reduce((total, speech) => total + speech.timeUsedSeconds, 0);
  const totalTimeLimitSeconds = session.speeches.reduce((total, speech) => total + speech.timeLimitSeconds, 0);
  const scorecard = session.scorecard;
  const metadata = [
    [t('export.motion'), session.motion],
    [t('export.sparringFormat'), t(`sparring.format.${session.format}`, { defaultValue: session.format.toUpperCase() })],
    [t('export.side'), sparringSideLabel(t, session.userSide)],
    [t('export.sparringDifficulty'), t(`sparring.difficulty.${session.difficulty}`, { defaultValue: session.difficulty })],
    [t('export.sparringCompleted'), ctx.formatDateTime(new Date(session.updatedAt))],
    [t('export.sparringTimeUsed'), `${sparringDuration(totalTimeUsedSeconds)} / ${sparringDuration(totalTimeLimitSeconds)}`],
  ].map(([label, value]) => new Paragraph({
    children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value)],
    spacing: { after: 100 },
  }));

  const scorecardContent = scorecard
    ? [
      new Paragraph({ text: t('export.sparringTotals').toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } }),
      new Paragraph({
        children: [
          new TextRun({ text: `${t('export.sparringUser')}: `, bold: true }),
          new TextRun(`${scorecard.userScore}/100`),
          new TextRun({ text: `   ${t('export.sparringOpponent')}: `, bold: true }),
          new TextRun(`${scorecard.aiScore}/100`),
        ],
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `${t('export.sparringWinner')}: `, bold: true }), new TextRun(sparringWinnerLabel(t, session))],
        spacing: { after: 200 },
      }),
      new Paragraph({ text: t('export.sparringCategories').toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 150 } }),
      ...scorecard.categories.flatMap((category) => [
        new Paragraph({
          children: [new TextRun({ text: `${t(`sparring.category.${category.name}`, { defaultValue: category.name })}: `, bold: true }), new TextRun(`${category.userScore}/25 ${t('export.sparringUser').toLowerCase()} | ${category.aiScore}/25 ${t('export.sparringOpponent').toLowerCase()}`)],
          spacing: { after: 75 },
        }),
        new Paragraph({ text: category.feedback, spacing: { after: 150 } }),
      ]),
      new Paragraph({ text: t('export.sparringFeedback').toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 150 } }),
      new Paragraph({ text: scorecard.verdict, spacing: { after: 100 } }),
      new Paragraph({ text: scorecard.overallFeedback, spacing: { after: 150 } }),
      ...(scorecard.keyMoments.length > 0
        ? [
          new Paragraph({ text: t('export.sparringKeyMoments'), heading: HeadingLevel.HEADING_2, spacing: { before: 150, after: 75 } }),
          ...scorecard.keyMoments.map((moment) => new Paragraph({ text: `• ${moment}`, spacing: { after: 75 } })),
        ]
        : []),
      ...(scorecard.improvementAreas.length > 0
        ? [
          new Paragraph({ text: t('export.sparringImprovementAreas'), heading: HeadingLevel.HEADING_2, spacing: { before: 150, after: 75 } }),
          ...scorecard.improvementAreas.map((area) => new Paragraph({ text: `• ${area}`, spacing: { after: 75 } })),
        ]
        : []),
    ]
    : [
      new Paragraph({ text: t('export.sparringScorecardUnavailable'), spacing: { before: 300, after: 150 } }),
    ];

  const transcriptContent = session.speeches.length > 0
    ? session.speeches.flatMap((speech, index) => [
      new Paragraph({
        children: [new TextRun({ text: `${index + 1}. ${t(`sparring.turns.${speech.turnId}`, { defaultValue: speech.role })}`, bold: true })],
        spacing: { before: 200, after: 75 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `${t('export.side')}: `, bold: true }),
          new TextRun(sparringSideLabel(t, speech.side)),
          new TextRun({ text: `   ${t('export.sparringTimeUsed')}: `, bold: true }),
          new TextRun(`${sparringDuration(speech.timeUsedSeconds)} / ${sparringDuration(speech.timeLimitSeconds)}`),
        ],
        spacing: { after: 75 },
      }),
      new Paragraph({ text: speech.content, spacing: { after: 150 } }),
    ])
    : [new Paragraph({ text: t('export.sparringNoTranscript'), spacing: { after: 150 } })];

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: t('export.sparringTranscript'),
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 250 },
        }),
        ...metadata,
        ...scorecardContent,
        new Paragraph({ text: t('export.sparringTranscript').toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } }),
        ...transcriptContent,
      ],
    }],
  });

  return { doc, fileName: `SparringTranscript_${new Date(session.updatedAt).toISOString().slice(0, 10)}.docx` };
}
