import { readCase, sourceLine } from '@debatelab/core/ai/case-view';
import type { AttackOutput } from '@debatelab/core/ai/schemas/attack';
import type { BrainstormOutput } from '@debatelab/core/ai/schemas/brainstorm';
import type { FactoidsOutput } from '@debatelab/core/ai/schemas/factoids';
import type { GenerateOutput } from '@debatelab/core/ai/schemas/generate';
import { questioningSegments, speakingSegments, type RoundFormat } from '@debatelab/core/free-tools/formats';
import { mapRows, type FlowchartDocument, type FlowNodeType } from '@debatelab/core/flowchart';
import { formatRoundTime } from '@debatelab/core/sparring/formats';
import type { SparringSession } from '@debatelab/core/sparring/session';
import { LONG_PAUSE_SECONDS } from '@debatelab/core/voice/delivery';

import { mapMeta, typeLabel, viaLabel } from './flowchart-text';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * The PDF pages for expo-print, as HTML. They carry the same sections and
 * labels as the website's PDF export (src/lib/pdf-export-utils.ts) and keep
 * its file names, in DebateOwl's colours.
 */

function escape(value: string | undefined | null): string {
  return (value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

const STYLE = `
  @page { margin: 18mm 16mm; }
  body { font-family: 'Nunito', -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #1F2B40; font-size: 11pt; line-height: 1.5; margin: 0; }
  header { border-bottom: 3px solid #0556D6; padding-bottom: 10px; margin-bottom: 18px; }
  h1 { font-size: 20pt; line-height: 1.2; margin: 0 0 4px; letter-spacing: -0.02em; }
  .meta { color: #5F708A; font-size: 10pt; }
  h2 { font-size: 13pt; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #E2E9F2; color: #1F2B40; }
  h3 { font-size: 11pt; margin: 12px 0 4px; }
  p { margin: 0 0 8px; }
  .label { font-weight: 700; color: #46566F; }
  .framing { background: #EEF7FF; border: 1px solid #B3D8FC; border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; color: #0B2A6E; }
  .framing .label { color: #0342A8; }
  .block { border-left: 3px solid #0556D6; padding: 2px 0 2px 12px; margin: 0 0 14px; break-inside: avoid; }
  .block h3 { margin-top: 0; }
  .number { color: #0556D6; margin-right: 6px; }
  ul { margin: 0 0 8px 18px; padding: 0; }
  li { margin-bottom: 3px; }
  .tag { display: inline-block; border: 1px solid #CDD7E4; border-radius: 6px; padding: 0 6px; font-size: 9pt; font-weight: 700; margin-right: 4px; }
  .critical { color: #D23239; border-color: #D23239; }
  .hook { font-style: italic; }
  .closing { font-weight: 600; }
  .major { color: #A15C06; border-color: #A15C06; }
  .minor { color: #0556D6; border-color: #0556D6; }
  footer { margin-top: 26px; color: #8494AB; font-size: 9pt; text-align: center; }
`;

function page(title: string, meta: string, body: string, t: Translate): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>${STYLE}</style></head><body><header><h1>${escape(title)}</h1><div class="meta">${escape(meta)}</div></header>${body}<footer>${escape(t('export.generatedBy'))}</footer></body></html>`;
}

const paragraph = (label: string, text: string) => `<p><span class="label">${escape(label)}:</span> ${escape(text)}</p>`;
const bullets = (items: string[]) => (items.length ? `<ul>${items.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>` : '');

export function caseExportFileName(result: GenerateOutput): string {
  const side = result.metadata?.side === 'pro' ? 'pro' : result.metadata?.side === 'con' ? 'con' : 'unknown';
  return `DebateCase_${side}.pdf`;
}

export function attackExportFileName(result: AttackOutput): string {
  return `AttackAnalysis_${result.overallAssessment?.score || 0}.pdf`;
}

export function caseExportHtml(result: GenerateOutput, t: Translate): string {
  const side = result.metadata?.side === 'pro' ? t('export.proposition') : result.metadata?.side === 'con' ? t('export.opposition') : t('export.unknown');
  const format = result.metadata?.format?.toUpperCase() || t('export.standard');
  const title = result.metadata?.motion || t('export.debateCase');
  const parts: string[] = [];

  const view = readCase(result);
  const label = (key: string) => escape(t(key));

  // Opening: hook, an unclear term when there is one, and the roadmap; older cases add their framework, burden and definitions.
  parts.push(`<h2>${label('export.opening')}</h2>`);
  if (view.opening.hook) parts.push(`<p class="hook">${escape(view.opening.hook)}</p>`);
  if (view.opening.definition) parts.push(paragraph(t('export.definition'), view.opening.definition));
  parts.push(paragraph(t('export.roadmap'), view.opening.roadmap || t('export.untitledCase')));
  if (view.legacy.framework) parts.push(paragraph(t('export.legacyJudgeBy'), view.legacy.framework));
  if (view.legacy.burdenOfProof) parts.push(paragraph(t('export.legacyMustShow'), view.legacy.burdenOfProof));
  if (view.legacy.definitions.length) parts.push(`<h3>${label('export.legacyDefinitions')}</h3>${bullets(view.legacy.definitions)}`);

  if (view.arguments.length) {
    parts.push(`<h2>${label('export.arguments')}</h2>`);
    view.arguments.forEach((argument, i) => {
      parts.push(`<div class="block"><h3><span class="number">${escape(t('export.argumentNumber', { number: i + 1 }))}</span>${escape(argument.title ?? argument.point)}</h3>${
        argument.title && argument.point ? paragraph(t('export.point'), argument.point) : ''
      }${argument.explanation ? paragraph(t('export.explanation'), argument.explanation) : ''}${
        argument.evidence ? paragraph(t('export.evidence'), argument.evidence) : ''
      }${argument.whyItMatters ? paragraph(t('export.whyItMatters'), argument.whyItMatters) : ''}</div>`);
    });
  }

  // R2: the team's earlier arguments, backed up, instead of new ones.
  if (view.reinforce.length) {
    parts.push(`<h2>${label('export.reinforce')}</h2>`);
    view.reinforce.forEach((item) => parts.push(`<div class="block">${item.argument ? `<h3>${escape(item.argument)}</h3>` : ''}<p>${escape(item.text)}</p></div>`));
  }

  // Conclusor: the reasons we win replace new arguments.
  if (view.whyWeWin.length) {
    parts.push(`<h2>${label('export.whyWeWin')}</h2><ol>${view.whyWeWin.map((reason) => `<li>${escape(reason)}</li>`).join('')}</ol>`);
  }

  if (view.ifTheySay.length || view.legacy.likelyArguments.length) {
    parts.push(`<h2>${label('export.ifTheySay')}</h2>`);
    view.ifTheySay.forEach((answer) => {
      parts.push(`<div class="block"><h3>${label('export.theySay')}: ${escape(answer.theySay)}</h3>${
        answer.weAnswer ? paragraph(t('export.weAnswer'), answer.weAnswer) : ''
      }${answer.inRound ? paragraph(t('export.legacySayItLike'), answer.inRound) : ''}${answer.source ? paragraph(t('export.source'), answer.source) : ''}</div>`);
    });
    if (view.legacy.likelyArguments.length) parts.push(`<h3>${label('export.legacyAlsoSay')}</h3>${bullets(view.legacy.likelyArguments)}`);
  }

  if (view.closingLine) parts.push(`<h2>${label('export.closingLine')}</h2><p class="closing">${escape(view.closingLine)}</p>`);
  if (view.sources.length) parts.push(`<h2>${label('export.sources')}</h2>${bullets(view.sources.map(sourceLine))}`);

  return page(title, `${side} • ${format} ${t('export.format')}`, parts.join(''), t);
}

export function attackExportHtml(result: AttackOutput, t: Translate): string {
  const score = result.overallAssessment?.score || 0;
  const parts: string[] = [];
  parts.push(`<h2>${escape(t('export.assessmentSummary'))}</h2><p>${escape(result.overallAssessment?.summary || t('export.noSummary'))}</p>`);
  if (result.overallAssessment?.strengthAreas?.length) {
    parts.push(`<h3>${escape(t('export.strengthAreas'))}</h3>${bullets(result.overallAssessment.strengthAreas)}`);
  }
  parts.push(`<h2>${escape(t('export.weaknesses'))}</h2>`);
  if (!result.weaknesses?.length) parts.push(`<p>${escape(t('export.noWeaknesses'))}</p>`);
  result.weaknesses?.forEach((w, i) => {
    const severity = ['critical', 'major', 'minor'].includes(w.severity) ? w.severity : 'minor';
    parts.push(`<div class="block"><h3><span class="number">${i + 1}.</span><span class="tag ${severity}">${escape(w.severity?.toUpperCase())}</span><span class="tag">${escape(w.type)}</span> ${escape(w.description)}</h3>${
      w.affectedQuote ? `<p><em>"${escape(w.affectedQuote)}"</em></p>` : ''
    }${paragraph(t('export.whyWeak'), w.whyWeak || '')}${paragraph(t('export.howOpponentAttacks'), w.howOpponentAttacks || '')}${paragraph(t('export.improvedVersion'), w.improvedVersion || '')}</div>`);
  });
  parts.push(`<h2>${escape(t('export.fallacies'))}</h2>`);
  if (!result.fallaciesDetected?.length) parts.push(`<p>${escape(t('export.noFallacies'))}</p>`);
  result.fallaciesDetected?.forEach((f) => {
    parts.push(`<div class="block"><h3>${escape(f.name)}</h3>${paragraph(t('export.location'), f.location)}<p>${escape(f.explanation)}</p></div>`);
  });
  parts.push(`<h2>${escape(t('export.crossExQuestions'))}</h2>`);
  if (!result.crossExQuestions?.length) parts.push(`<p>${escape(t('export.noCrossEx'))}</p>`);
  result.crossExQuestions?.forEach((q, i) => {
    parts.push(`<div class="block"><h3>Q${i + 1}: ${escape(q.question)}</h3>${paragraph(t('export.purpose'), q.purpose)}${paragraph(t('export.expectedTrap'), q.expectedTrap)}</div>`);
  });
  if (result.weighingAnalysis) {
    parts.push(`<h2>${escape(t('export.weighingAnalysis'))}</h2><p>${escape(result.weighingAnalysis.currentWeighing || t('export.noWeighingAnalysis'))}</p>`);
    if (result.weighingAnalysis.missingComparisons?.length) parts.push(`<h3>${escape(t('export.missingComparisons'))}</h3>${bullets(result.weighingAnalysis.missingComparisons)}`);
    if (result.weighingAnalysis.improvementSuggestions?.length) parts.push(`<h3>${escape(t('export.improvementSuggestions'))}</h3>${bullets(result.weighingAnalysis.improvementSuggestions)}`);
  }
  return page(t('export.caseAttack'), `${t('export.overallScore')}: ${score}/100`, parts.join(''), t);
}

// The website's Brainstorm and Factoids PDFs open with a table; these pages draw it the same way.
const TABLE_STYLE = `<style>
  table { width: 100%; border-collapse: collapse; margin: 0 0 14px; font-size: 9.5pt; break-inside: auto; }
  th { background: #0556D6; color: #fff; text-align: left; padding: 6px 8px; font-weight: 700; }
  td { border-bottom: 1px solid #E2E9F2; padding: 6px 8px; vertical-align: top; }
  tr { break-inside: avoid; }
</style>`;

function table(headers: string[], rows: string[][]): string {
  return `<table><thead><tr>${headers.map((header) => `<th>${escape(header)}</th>`).join('')}</tr></thead><tbody>${
    rows.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')
  }</tbody></table>`;
}

/** The website's PDF file name (exportBrainstormToPdf). */
export const BRAINSTORM_EXPORT_FILE_NAME = 'BrainstormResults.pdf';
/** The website's PDF file name (exportFactoidsToPdf). */
export const FACTOIDS_EXPORT_FILE_NAME = 'ResearchFactoids.pdf';

export function brainstormExportHtml(result: BrainstormOutput, t: Translate): string {
  const parts: string[] = [TABLE_STYLE];
  if (result.topFive?.length) {
    parts.push(`<h2>${escape(t('export.topArgumentAngles'))}</h2>`);
    parts.push(table(
      [t('export.rank'), t('export.title'), t('export.description'), t('export.side'), t('export.whyTop')],
      result.topFive.map((item) => [`#${item.rank}`, item.idea?.title || '', item.idea?.description || '', item.idea?.side?.toUpperCase() || '', item.whyTop || '']),
    ));
  }
  if (result.mindmap?.length) {
    parts.push(`<h2>${escape(t('export.argumentCategories'))}</h2>`);
    result.mindmap.forEach((category) => {
      parts.push(`<h3>${escape(category.category)}</h3>`);
      parts.push(bullets((category.items ?? []).map((idea) => `${idea.title}: ${idea.description}`)));
    });
  }
  if (result.buckets?.length) {
    parts.push(`<h2>${escape(t('export.strategicBuckets'))}</h2>`);
    result.buckets.forEach((bucket) => parts.push(`<p><span class="label">${escape(bucket.name)}:</span> ${escape(bucket.keyInsight)}</p>`));
  }
  if (result.nextSteps?.length) parts.push(`<h2>${escape(t('export.recommendedNextSteps'))}</h2>${bullets(result.nextSteps)}`);
  if (result.warningsAndTradeoffs?.length) parts.push(`<h2>${escape(t('export.warningsAndTradeoffs'))}</h2>${bullets(result.warningsAndTradeoffs)}`);
  return page(t('export.brainstormResults'), t('export.topIdeasCount', { count: result.topFive?.length || 0 }), parts.join(''), t);
}

export function factoidsExportHtml(result: FactoidsOutput, t: Translate): string {
  const factoids = result.factoids ?? [];
  const verified = factoids.filter((f) => f.citation?.verified === 'verified').length;
  const parts: string[] = [TABLE_STYLE];
  if (factoids.length) {
    parts.push(`<h2>${escape(t('export.keyFactsAndEvidence'))}</h2>`);
    parts.push(table(
      [t('export.claim'), t('export.keyFigure'), t('export.source'), t('export.statusLabel'), t('export.relevance')],
      factoids.map((f) => [f.shortClaim || '', f.keyFigure || '', f.citation?.title || '', t(`export.status.${f.citation?.verified || 'pending'}`), `${f.relevanceScore || 0}%`]),
    ));
    parts.push(`<h2>${escape(t('export.detailedAnalysis'))}</h2>`);
    factoids.forEach((f, i) => {
      parts.push(`<div class="block"><h3><span class="number">${i + 1}.</span>${escape(f.shortClaim)}</h3>${
        paragraph(t('export.context'), f.context || 'N/A')}${paragraph(t('export.limitations'), f.limitations || 'N/A')}${paragraph(t('export.howToUse'), f.howToUse || 'N/A')}${
        f.citation?.url ? paragraph(t('export.source'), f.citation.url) : ''}</div>`);
    });
  }
  if (result.searchSuggestions?.length) parts.push(`<h2>${escape(t('export.furtherResearchSuggestions'))}</h2>${bullets(result.searchSuggestions)}`);
  if (result.warnings?.length) parts.push(`<h2>${escape(t('export.warnings'))}</h2>${bullets(result.warnings)}`);
  return page(t('export.researchFactoids'), t('export.factoidsSummary', { count: factoids.length, verified }), parts.join(''), t);
}

/** The website's export file name (exportToPng's debate-flowchart.png), as a PDF. */
export const FLOWCHART_EXPORT_FILE_NAME = 'debate-flowchart.pdf';

/** The website's node colours (nodeColors). */
const FLOW_COLORS: Record<FlowNodeType, string> = { thesis: '#0556D6', contention: '#14B37D', attack: '#F0454B', rebuttal: '#1E8DFB', dropped: '#F39A00' };

const FLOW_STYLE = `<style>
  .card { border: 1px solid #CDD7E4; border-left-width: 4px; border-radius: 10px; padding: 7px 11px; margin: 0 0 10px; break-inside: avoid; }
  .card .kind { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
  .card .text { font-weight: 600; }
  .card .description { color: #46566F; font-size: 10pt; margin: 2px 0 0; }
  .card .meta { color: #5F708A; font-size: 9pt; margin-top: 2px; }
  .via { color: #5F708A; font-size: 9pt; font-weight: 600; margin: 0 0 3px; }
</style>`;

/** The Map tab's tree as a PDF page: every card under the one it answers, with its link. */
export function flowchartExportHtml(title: string, meta: string, doc: FlowchartDocument, t: Translate): string {
  const rows = mapRows(doc).map(({ node, depth, via }) => {
    const color = FLOW_COLORS[node.data.type];
    const note = mapMeta(t, doc, node);
    return `<div style="margin-left: ${Math.min(depth, 6) * 18}px">${via ? `<div class="via">\u21b3 ${escape(viaLabel(t, via))}</div>` : ''}<div class="card" style="border-left-color: ${color}"><div class="kind" style="color: ${color}">${escape(typeLabel(t, node.data.type))}</div><div class="text">${escape(node.data.label)}</div>${
      node.data.description ? `<p class="description">${escape(node.data.description)}</p>` : ''}${note && note !== typeLabel(t, node.data.type) ? `<div class="meta">${escape(note)}</div>` : ''}</div></div>`;
  });
  return page(title, meta, FLOW_STYLE + rows.join(''), t);
}

/** The website's file name (exportSparringToPdf): the day the round was last updated. */
export function sparringExportFileName(session: SparringSession): string {
  return `SparringTranscript_${new Date(session.updatedAt).toISOString().slice(0, 10)}.pdf`;
}

const sparringSide = (side: SparringSession['userSide'], t: Translate) => (side === 'pro' ? t('export.proposition') : t('export.opposition'));

/**
 * The website's Sparring PDF (exportSparringToPdf): the round's set-up, the
 * totals, every category with its feedback, the judge's verdict, key
 * moments and what to work on, and the transcript. A speech the student
 * spoke aloud also lists its measured delivery, as the scorecard does.
 */
export function sparringExportHtml(session: SparringSession, t: Translate): string {
  const scorecard = session.scorecard;
  const format = t(`sparring.format.${session.format}`, { defaultValue: session.format.toUpperCase() });
  const difficulty = t(`sparring.difficulty.${session.difficulty}`, { defaultValue: session.difficulty });
  const used = session.speeches.reduce((total, speech) => total + speech.timeUsedSeconds, 0);
  const limit = session.speeches.reduce((total, speech) => total + speech.timeLimitSeconds, 0);
  const winner = scorecard?.winner === 'user' ? t('export.sparringUser') : scorecard?.winner === 'ai' ? t('export.sparringOpponent') : t('export.sparringTie');
  const parts: string[] = [TABLE_STYLE];
  parts.push(`<h2>${escape(t('export.sparringConfiguration'))}</h2>`);
  parts.push(paragraph(t('export.motion'), session.motion));
  parts.push(paragraph(t('export.sparringFormat'), format));
  parts.push(paragraph(t('export.side'), sparringSide(session.userSide, t)));
  parts.push(paragraph(t('export.sparringDifficulty'), difficulty));

  parts.push(`<h2>${escape(t('export.sparringTotals'))}</h2>`);
  parts.push(scorecard
    ? table(
      [t('export.sparringUser'), t('export.sparringScore'), t('export.sparringOpponent'), t('export.sparringScore'), t('export.sparringResult')],
      [[t('export.sparringUser'), `${scorecard.userScore}/100`, t('export.sparringOpponent'), `${scorecard.aiScore}/100`, `${t('export.sparringWinner')}: ${winner}`]],
    )
    : `<p>${escape(t('export.sparringScorecardUnavailable'))}</p>`);
  parts.push(paragraph(t('export.sparringSpeeches'), String(session.speeches.length)));
  parts.push(paragraph(t('export.sparringTimeUsed'), `${formatRoundTime(used)} / ${formatRoundTime(limit)}`));

  if (scorecard) {
    parts.push(`<h2>${escape(t('export.sparringCategories'))}</h2>`);
    parts.push(table(
      [t('export.sparringCategory'), t('export.sparringUser'), t('export.sparringOpponent'), t('export.sparringFeedback')],
      scorecard.categories.map((category) => [t(`sparring.category.${category.name}`, { defaultValue: category.name }), `${category.userScore}/25`, `${category.aiScore}/25`, category.feedback]),
    ));
    parts.push(`<h2>${escape(t('export.sparringFeedback'))}</h2><p>${escape(scorecard.verdict)}</p><p>${escape(scorecard.overallFeedback)}</p>`);
    if (scorecard.keyMoments.length) parts.push(`<h2>${escape(t('export.sparringKeyMoments'))}</h2>${bullets(scorecard.keyMoments)}`);
    if (scorecard.improvementAreas.length) parts.push(`<h2>${escape(t('export.sparringImprovementAreas'))}</h2>${bullets(scorecard.improvementAreas)}`);
  }

  parts.push(`<h2>${escape(t('export.sparringTranscript'))}</h2>`);
  if (session.speeches.length === 0) parts.push(`<p>${escape(t('export.sparringNoTranscript'))}</p>`);
  session.speeches.forEach((speech, index) => {
    const delivery = speech.delivery
      ? paragraph(t('voiceRound.delivery.title'), [
        `${t('voiceRound.delivery.pace')}: ${t('voiceRound.delivery.wordsPerMinute', { count: speech.delivery.wordsPerMinute })}`,
        `${t('voiceRound.delivery.fillers')}: ${speech.delivery.fillerCount}`,
        `${t('voiceRound.delivery.longPauses', { seconds: LONG_PAUSE_SECONDS })}: ${speech.delivery.longPauses}`,
      ].join(' · '))
      : '';
    parts.push(`<div class="block"><h3><span class="number">${index + 1}.</span>${escape(t(`sparring.turns.${speech.turnId}`, { defaultValue: speech.role }))}</h3>${
      paragraph(t('export.side'), sparringSide(speech.side, t))}${
      paragraph(t('export.sparringTimeUsed'), `${formatRoundTime(speech.timeUsedSeconds)} / ${formatRoundTime(speech.timeLimitSeconds)}`)}${
      delivery}${speech.content.split(/\n{2,}/).map((block) => `<p>${escape(block)}</p>`).join('')}</div>`);
  });
  return page(t('export.sparringTranscript'), `${sparringSide(session.userSide, t)} | ${format} | ${difficulty}`, parts.join(''), t);
}

/** The website's printable flow sheet, sized for expo-print's chosen paper. */
export function flowSheetExportHtml(options: {
  format: RoundFormat;
  paper: 'letter' | 'a4';
  orientation: 'landscape' | 'portrait';
  strip: boolean;
  motion: string;
  round: string;
  judge: string;
}, t: Translate): string {
  const { format, paper, orientation, strip } = options;
  const columns = speakingSegments(format);
  const questions = questioningSegments(format);
  const size = paper === 'a4' ? { long: 277, short: 190 } : { long: 259, short: 196 };
  const width = orientation === 'landscape' ? size.long : size.short;
  const height = orientation === 'landscape' ? size.short : size.long;
  const notesHeight = height * 0.18;
  const speechHeight = height - 22 - (strip ? notesHeight + 2 : 0);
  const field = (key: 'motion' | 'round' | 'judge') => `<span class="field"><b>${escape(t(`flow.${key}Short`))}</b> ${escape(options[key])}</span>`;
  const headings = columns.map((segment) => `<th style="border-top-color:${{ a: '#0284c7', b: '#e11d48', both: '#64748b' }[segment.side]}">
    ${escape(segment.short)}<small>${segment.side === 'both' ? '' : escape(format.sideNames[segment.side === 'a' ? 0 : 1])} ${segment.seconds / 60} min</small></th>`).join('');
  const notes = strip ? `<table class="notes"><tr>${questions.length
    ? questions.map((segment) => `<td><b>${escape(segment.short)}: ${escape(segment.label)}</b></td>`).join('')
    : `<td><b>${escape(t('flow.notesBox'))}</b></td>`}</tr></table>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${paper === 'a4' ? 'A4' : 'letter'} ${orientation}; margin: 10mm; }
    * { box-sizing: border-box; } body { margin: 0; color: #0f172a; font: 10px Arial, sans-serif; }
    .sheet { width: ${width}mm; height: ${height - 1}mm; padding: 3mm; overflow: hidden; }
    header { height: 13mm; border-bottom: 2px solid #1e293b; line-height: 6mm; }
    .headline { display: flex; gap: 4mm; min-width: 0; } .headline > b { flex-shrink: 0; }
    .field { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-bottom: 1px solid #94a3b8; }
    .motion .field { display: block; }
    .motion { display: block; margin-left: 0; white-space: nowrap; overflow: hidden; }
    table { table-layout: fixed; width: 100%; border-collapse: collapse; }
    .speeches { height: ${speechHeight}mm; margin-top: 2mm; }
    th { height: 12mm; vertical-align: top; text-align: left; padding: 1mm; border-top: 4px solid; border-left: 1px solid #cbd5e1; overflow-wrap: anywhere; }
    small { display: block; font-size: 8px; font-weight: normal; color: #475569; }
    .lines td { border-left: 1px solid #cbd5e1; background: repeating-linear-gradient(to bottom, transparent 0, transparent 19px, #e2e8f0 19px, #e2e8f0 20px); }
    .notes { height: ${notesHeight}mm; margin-top: 2mm; } .notes td { border: 1px solid #94a3b8; vertical-align: top; padding: 1mm; }
  </style></head><body><div class="sheet"><header><div class="headline"><b>${escape(format.name)}</b>${field('round')}${field('judge')}</div><span class="motion">${field('motion')}</span></header>
    <table class="speeches"><thead><tr>${headings}</tr></thead><tbody><tr class="lines">${columns.map(() => '<td></td>').join('')}</tr></tbody></table>${notes}
  </div></body></html>`;
}
