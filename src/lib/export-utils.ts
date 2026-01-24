import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import type { GenerateOutput } from './ai/schemas/generate';

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
            children: [new TextRun({ text: "Reasoning: ", italic: true }), new TextRun(reasoning)],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: "Evidence: ", italic: true }), new TextRun(evidence)],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: "Impact: ", italic: true }), new TextRun(impact)],
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
            children: [new TextRun({ text: "Counter: ", italic: true }), new TextRun(counterpoint)],
          }),
          new Paragraph({
            children: [new TextRun({ text: "Rebuttal: ", italic: true }), new TextRun(rebuttal)],
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
