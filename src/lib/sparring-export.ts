import type { SparringSession } from '@/lib/ai/schemas/sparring';

function filenameBase(session: SparringSession) {
  const safe = session.setup.motion
    .replace(/[^a-z0-9\s-]/gi, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'sparring-round';
  return `DebateLab-Sparring-${safe}`;
}

function transcriptLines(session: SparringSession) {
  return session.turns.flatMap((turn, index) => [
    `${index + 1}. ${turn.role === 'user' ? 'You' : 'AI opponent'} — ${turn.phase}`,
    turn.content,
    '',
  ]);
}

export async function exportSparringToDocx(session: SparringSession): Promise<boolean> {
  try {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
    const { saveAs } = await import('file-saver');

    const scorecard = session.scorecard;
    const children = [
      new Paragraph({ text: 'DebateLab Sparring Round', heading: HeadingLevel.TITLE }),
      new Paragraph({ children: [new TextRun({ text: 'Motion: ', bold: true }), new TextRun(session.setup.motion)] }),
      new Paragraph({ children: [new TextRun({ text: 'Side: ', bold: true }), new TextRun(session.setup.side.toUpperCase())] }),
      new Paragraph({ children: [new TextRun({ text: 'Difficulty: ', bold: true }), new TextRun(session.setup.difficulty)] }),
      new Paragraph({ text: 'Transcript', heading: HeadingLevel.HEADING_1 }),
      ...session.turns.flatMap((turn, index) => [
        new Paragraph({
          children: [new TextRun({ text: `${index + 1}. ${turn.role === 'user' ? 'You' : 'AI opponent'} — ${turn.phase}`, bold: true })],
          spacing: { before: 180, after: 80 },
        }),
        new Paragraph({ text: turn.content, spacing: { after: 160 } }),
      ]),
      ...(scorecard ? [
        new Paragraph({ text: 'Scorecard', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun({ text: 'Verdict: ', bold: true }), new TextRun(scorecard.verdict.replace('-', ' '))] }),
        new Paragraph({ text: scorecard.summary, spacing: { after: 160 } }),
        new Paragraph({ children: [new TextRun({ text: 'Biggest improvement: ', bold: true }), new TextRun(scorecard.biggestImprovement)] }),
        new Paragraph({ children: [new TextRun({ text: 'Next drill: ', bold: true }), new TextRun(scorecard.nextDrill)], spacing: { after: 180 } }),
        ...scorecard.categories.flatMap((category) => [
          new Paragraph({
            children: [new TextRun({ text: `${category.category.replace(/-/g, ' ')} — ${category.rating.replace('-', ' ')}`, bold: true })],
            spacing: { before: 140, after: 60 },
          }),
          new Paragraph({ children: [new TextRun({ text: 'Evidence: ', italics: true }), new TextRun(category.evidence)] }),
          new Paragraph({ children: [new TextRun({ text: 'Adjustment: ', italics: true }), new TextRun(category.advice)] }),
        ]),
      ] : []),
    ];

    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${filenameBase(session)}.docx`);
    return true;
  } catch (error) {
    console.error('[SparringExport] DOCX export failed', error);
    return false;
  }
}

export async function exportSparringToPdf(session: SparringSession): Promise<boolean> {
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 48;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    const addText = (text: string, size = 10, gap = 8, bold = false) => {
      doc.setFontSize(size);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(text, maxWidth) as string[];
      const lineHeight = size * 1.35;
      for (const line of lines) {
        if (y + lineHeight > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += lineHeight;
      }
      y += gap;
    };

    addText('DebateLab Sparring Round', 18, 12, true);
    addText(`Motion: ${session.setup.motion}`, 11, 6, true);
    addText(`Side: ${session.setup.side.toUpperCase()}    Difficulty: ${session.setup.difficulty}`, 10, 14);
    addText('Transcript', 14, 8, true);
    transcriptLines(session).forEach((line) => addText(line || ' ', 10, line ? 5 : 3, /^\d+\./.test(line)));

    if (session.scorecard) {
      const scorecard = session.scorecard;
      addText('Scorecard', 14, 8, true);
      addText(`Verdict: ${scorecard.verdict.replace('-', ' ')}`, 11, 5, true);
      addText(scorecard.summary, 10, 8);
      addText(`Biggest improvement: ${scorecard.biggestImprovement}`, 10, 8, true);
      for (const category of scorecard.categories) {
        addText(`${category.category.replace(/-/g, ' ')} — ${category.rating.replace('-', ' ')}`, 10, 4, true);
        addText(`Evidence: ${category.evidence}`, 9, 3);
        addText(`Adjustment: ${category.advice}`, 9, 7);
      }
      addText(`Next drill: ${scorecard.nextDrill}`, 10, 6, true);
    }

    doc.save(`${filenameBase(session)}.pdf`);
    return true;
  } catch (error) {
    console.error('[SparringExport] PDF export failed', error);
    return false;
  }
}
