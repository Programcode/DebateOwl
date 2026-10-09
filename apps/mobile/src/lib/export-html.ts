import type { AttackOutput } from '@debatelab/core/ai/schemas/attack';
import type { BrainstormOutput } from '@debatelab/core/ai/schemas/brainstorm';
import type { FactoidsOutput } from '@debatelab/core/ai/schemas/factoids';
import type { GenerateOutput } from '@debatelab/core/ai/schemas/generate';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * The PDF pages for expo-print, as HTML. They carry the same sections and
 * labels as the website's PDF export (src/lib/pdf-export-utils.ts) and keep
 * its file names, in DebateLab's colours.
 */

function escape(value: string | undefined | null): string {
  return (value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

const STYLE = `
  @page { margin: 18mm 16mm; }
  body { font-family: -apple-system, 'Inter', 'Helvetica Neue', Arial, sans-serif; color: #0f172a; font-size: 11pt; line-height: 1.5; margin: 0; }
  header { border-bottom: 3px solid #0284c7; padding-bottom: 10px; margin-bottom: 18px; }
  h1 { font-size: 20pt; line-height: 1.2; margin: 0 0 4px; letter-spacing: -0.02em; }
  .meta { color: #64748b; font-size: 10pt; }
  h2 { font-size: 13pt; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; color: #0f172a; }
  h3 { font-size: 11pt; margin: 12px 0 4px; }
  p { margin: 0 0 8px; }
  .label { font-weight: 700; color: #475569; }
  .framing { background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; color: #0c4a6e; }
  .framing .label { color: #075985; }
  .block { border-left: 3px solid #0284c7; padding: 2px 0 2px 12px; margin: 0 0 14px; break-inside: avoid; }
  .block h3 { margin-top: 0; }
  .number { color: #0284c7; margin-right: 6px; }
  ul { margin: 0 0 8px 18px; padding: 0; }
  li { margin-bottom: 3px; }
  .tag { display: inline-block; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0 6px; font-size: 9pt; font-weight: 700; margin-right: 4px; }
  .critical { color: #dc2626; border-color: #dc2626; }
  .major { color: #d97706; border-color: #d97706; }
  .minor { color: #0284c7; border-color: #0284c7; }
  footer { margin-top: 26px; color: #94a3b8; font-size: 9pt; text-align: center; }
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

  parts.push(`<div class="framing"><p><span class="label">${escape(t('export.thesis'))}:</span> ${escape(result.caseStructure?.thesis || t('export.noThesis'))}</p>${
    result.caseStructure?.framework ? `<p><span class="label">${escape(t('export.framework'))}:</span> ${escape(result.caseStructure.framework)}</p>` : ''
  }</div>`);
  if (result.exordio && (result.exordio.hook || result.exordio.transition)) {
    parts.push(`<h2>${escape(t('export.exordio'))}</h2>`);
    if (result.exordio.hook) parts.push(paragraph(t('export.hook'), result.exordio.hook));
    if (result.exordio.transition) parts.push(paragraph(t('export.transition'), result.exordio.transition));
  }
  if (result.caseStructure?.burdenOfProof) parts.push(paragraph(t('export.burdenOfProof'), result.caseStructure.burdenOfProof));
  if (result.caseStructure?.keyDefinitions?.length) parts.push(`<h3>${escape(t('export.keyDefinitions'))}</h3>${bullets(result.caseStructure.keyDefinitions)}`);

  parts.push(`<h2>${escape(t('export.arguments'))}</h2>`);
  if (!result.contentions?.length) parts.push(`<p>${escape(t('export.noArguments'))}</p>`);
  result.contentions?.forEach((c, i) => {
    parts.push(`<div class="block"><h3><span class="number">${escape(t('export.contentionNumber', { number: i + 1 }))}</span>${escape(c.claim)}</h3>${
      c.reasoning ? paragraph(t('export.reasoning'), c.reasoning) : ''
    }${c.evidence ? paragraph(t('export.evidence'), c.evidence) : ''}${c.impact ? paragraph(t('export.impact'), c.impact) : ''}</div>`);
  });

  parts.push(`<h2>${escape(t('export.predictedOpponent'))}</h2>`);
  parts.push(result.predictedOpponentCase?.likelyArguments?.length ? bullets(result.predictedOpponentCase.likelyArguments) : `<p>${escape(t('export.noOpponentArgs'))}</p>`);

  parts.push(`<h2>${escape(t('export.counters'))}</h2>`);
  if (!result.counters?.length) parts.push(`<p>${escape(t('export.noCounters'))}</p>`);
  result.counters?.forEach((c) => {
    parts.push(`<div class="block"><h3>${escape(t('export.target'))}: ${escape(c.targetArgument)}</h3>${
      c.counterpoint ? paragraph(t('export.counter'), c.counterpoint) : ''
    }${c.rebuttal ? paragraph(t('export.rebuttal'), c.rebuttal) : ''}</div>`);
  });

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
  th { background: #0284c7; color: #fff; text-align: left; padding: 6px 8px; font-weight: 700; }
  td { border-bottom: 1px solid #e2e8f0; padding: 6px 8px; vertical-align: top; }
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
