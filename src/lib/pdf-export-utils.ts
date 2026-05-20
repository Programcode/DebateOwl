// src/lib/pdf-export-utils.ts
// Professional PDF export for all debate features using jsPDF
import i18n from '@/i18n';
import type { GenerateOutput } from './ai/schemas/generate';
import type { AttackOutput } from './ai/schemas/attack';
import type { BrainstormOutput } from './ai/schemas/brainstorm';
import type { FactoidsOutput } from './ai/schemas/factoids';
import { formatEuropeanDate } from './date-format';

// Color constants for consistent branding
const COLORS = {
    primary: [59, 130, 246] as [number, number, number], // Blue
    secondary: [100, 116, 139] as [number, number, number], // Slate
    success: [34, 197, 94] as [number, number, number], // Green
    warning: [245, 158, 11] as [number, number, number], // Amber
    danger: [239, 68, 68] as [number, number, number], // Red
    dark: [15, 23, 42] as [number, number, number], // Dark slate
    light: [248, 250, 252] as [number, number, number], // Light
};

interface PDFHelpers {
    doc: import('jspdf').jsPDF;
    y: number;
    pageHeight: number;
    margin: number;
    contentWidth: number;
    checkPageBreak: (neededHeight: number) => void;
    addHeader: (title: string, subtitle?: string) => void;
    addSectionTitle: (title: string, color?: [number, number, number]) => void;
    addParagraph: (text: string, indent?: number) => void;
    addBulletList: (items: string[], indent?: number) => void;
    addTable: (headers: string[], rows: string[][], options?: { headerColor?: [number, number, number] }) => void;
    addFooter: () => void;
}

async function createPDFDocument(): Promise<PDFHelpers> {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });

    const margin = 22;
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const contentWidth = pageWidth - margin * 2;
    const state = { y: margin };

    const checkPageBreak = (neededHeight: number) => {
        if (state.y + neededHeight > pageHeight - margin - 15) {
            doc.addPage();
            state.y = margin;
        }
    };

    const addHeader = (title: string, subtitle?: string) => {
        // Gradient-style header with primary color bar
        doc.setFillColor(...COLORS.primary);
        doc.rect(0, 0, pageWidth, 40, 'F');

        // Subtle darker accent strip at bottom of header
        doc.setFillColor(37, 99, 235);
        doc.rect(0, 37, pageWidth, 3, 'F');

        // Title - large and bold
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        const titleLines = doc.splitTextToSize(title, contentWidth - 40);
        doc.text(titleLines, margin, 18);

        if (subtitle) {
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(219, 234, 254);
            doc.text(subtitle, margin, titleLines.length > 1 ? 28 : 26);
        }

        // DebateLab branding - right aligned
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('DebateLab', pageWidth - margin, 10, { align: 'right' });

        state.y = 50;
        doc.setTextColor(...COLORS.dark);
    };

    const addSectionTitle = (title: string, color: [number, number, number] = COLORS.primary) => {
        checkPageBreak(18);
        state.y += 6; // Extra space before section

        // Section title text - 14pt bold
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.dark);
        doc.text(title, margin, state.y);

        // Colored underline beneath the title
        const titleWidth = doc.getTextWidth(title);
        state.y += 2;
        doc.setDrawColor(...color);
        doc.setLineWidth(0.8);
        doc.line(margin, state.y, margin + titleWidth + 4, state.y);

        state.y += 8;
    };

    const addParagraph = (text: string, indent = 0) => {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.dark);
        const lines = doc.splitTextToSize(text, contentWidth - indent);
        checkPageBreak(lines.length * 4.8 + 2);
        doc.text(lines, margin + indent, state.y);
        state.y += lines.length * 4.8 + 4;
    };

    const addBulletList = (items: string[], indent = 0) => {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.dark);
        items.forEach((item) => {
            const lines = doc.splitTextToSize(`• ${item}`, contentWidth - indent - 5);
            checkPageBreak(lines.length * 4.8 + 2);
            doc.text(lines, margin + indent, state.y);
            state.y += lines.length * 4.8 + 3;
        });
        state.y += 3;
    };

    const addTable = (headers: string[], rows: string[][], options?: { headerColor?: [number, number, number] }) => {
        const headerColor = options?.headerColor || COLORS.primary;
        checkPageBreak(30);

        autoTable(doc, {
            startY: state.y,
            head: [headers],
            body: rows,
            margin: { left: margin, right: margin },
            styles: {
                fontSize: 8,
                cellPadding: 6,
                minCellHeight: 14,
                textColor: COLORS.dark,
                overflow: 'linebreak',
                valign: 'top',
                lineWidth: 0.1,
                lineColor: [226, 232, 240],
            },
            headStyles: {
                fillColor: headerColor,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                cellPadding: 5,
            },
            alternateRowStyles: {
                fillColor: COLORS.light,
            },
            rowPageBreak: 'avoid',
            pageBreak: 'auto',
            columnStyles: {
                0: { cellWidth: 22 },
            },
        });

        state.y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    };

    const addFooter = () => {
        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            // Subtle footer line
            doc.setDrawColor(...COLORS.secondary);
            doc.setLineWidth(0.3);
            doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
            // Footer text
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...COLORS.secondary);
            doc.text(
                `Generated by DebateLab • ${formatEuropeanDate(new Date())} • Page ${i} of ${pageCount}`,
                pageWidth / 2,
                pageHeight - 10,
                { align: 'center' }
            );
        }
    };

    return { doc, get y() { return state.y; }, set y(v: number) { state.y = v; }, pageHeight, margin, contentWidth, checkPageBreak, addHeader, addSectionTitle, addParagraph, addBulletList, addTable, addFooter };
}

// ============================================================
// GENERATE CASE EXPORT
// ============================================================
export async function exportCaseToPdf(result: GenerateOutput): Promise<boolean> {
    try {
        const pdf = await createPDFDocument();
        const { doc, addHeader, addSectionTitle, addParagraph, addBulletList, addFooter } = pdf;

        const side = result.metadata?.side === 'pro' ? i18n.t('export.proposition') : i18n.t('export.opposition');
        const format = result.metadata?.format?.toUpperCase() || 'Standard';
        const motion = (result.metadata as Record<string, unknown>)?.motion as string | undefined;
        const margin = pdf.margin;
        const contentWidth = pdf.contentWidth;
        const pageWidth = doc.internal.pageSize.width;

        addHeader(motion || i18n.t('export.debateCase'), `${side} • ${format} Format`);

        // Helper: colored separator line between major sections
        const addSeparator = (color: [number, number, number] = COLORS.secondary) => {
            pdf.checkPageBreak(8);
            pdf.y += 4;
            doc.setDrawColor(...color);
            doc.setLineWidth(0.3);
            doc.line(margin, pdf.y, pageWidth - margin, pdf.y);
            pdf.y += 6;
        };

        // Helper: subsection label (12pt bold)
        const addSubsectionLabel = (label: string, indent = 0) => {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...COLORS.dark);
            pdf.checkPageBreak(8);
            doc.text(label, margin + indent, pdf.y);
            pdf.y += 6;
        };

        // Helper: contention block with colored left accent bar
        const addContentionBlock = (
            index: number,
            claim: string,
            details: { label: string; text: string }[],
            accentColor: [number, number, number]
        ) => {
            const blockIndent = 6;
            const textIndent = blockIndent + 4;

            // Estimate block height for page break check
            const estimatedHeight = 12 + details.length * 14;
            pdf.checkPageBreak(estimatedHeight);

            const blockStartY = pdf.y;

            // Contention title
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...COLORS.dark);
            doc.text(`Contention #${index + 1}`, margin + textIndent, pdf.y);
            pdf.y += 5;

            // Claim text
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...accentColor);
            const claimLines = doc.splitTextToSize(claim, contentWidth - textIndent - 2);
            doc.text(claimLines, margin + textIndent, pdf.y);
            pdf.y += claimLines.length * 4.8 + 4;

            // Detail fields
            details.forEach(({ label, text }) => {
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...COLORS.secondary);
                pdf.checkPageBreak(10);
                doc.text(label, margin + textIndent, pdf.y);
                pdf.y += 4.5;

                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...COLORS.dark);
                const lines = doc.splitTextToSize(text, contentWidth - textIndent - 2);
                pdf.checkPageBreak(lines.length * 4.8);
                doc.text(lines, margin + textIndent, pdf.y);
                pdf.y += lines.length * 4.8 + 3;
            });

            // Draw the accent bar on the left side spanning the full block
            const blockEndY = pdf.y;
            doc.setFillColor(...accentColor);
            doc.roundedRect(margin, blockStartY - 3, 3, blockEndY - blockStartY + 3, 1, 1, 'F');

            pdf.y += 6;
        };

        // Exordio (if present)
        if (result.exordio) {
            addSectionTitle(i18n.t('export.exordio'), COLORS.primary);
            if (result.exordio.hook) {
                addSubsectionLabel(i18n.t('export.hook'));
                addParagraph(result.exordio.hook, 2);
            }
            if (result.exordio.transition) {
                addSubsectionLabel(i18n.t('export.transition'));
                addParagraph(result.exordio.transition, 2);
            }
            addSeparator(COLORS.primary);
        }

        // Case Structure
        addSectionTitle(`${i18n.t('export.thesis')} & ${i18n.t('export.framework')}`);
        addParagraph(result.caseStructure?.thesis || 'No thesis provided');
        if (result.caseStructure?.framework) {
            addSubsectionLabel(i18n.t('export.framework'));
            addParagraph(result.caseStructure.framework, 2);
        }
        if (result.caseStructure?.burdenOfProof) {
            addSubsectionLabel(i18n.t('export.burdenOfProof'));
            addParagraph(result.caseStructure.burdenOfProof, 2);
        }
        addSeparator(COLORS.success);

        // Arguments with accent bars
        if (result.contentions?.length) {
            addSectionTitle(i18n.t('export.arguments'), COLORS.success);

            // Cycle through accent colors for visual variety
            const accentColors: [number, number, number][] = [
                COLORS.primary,
                COLORS.success,
                COLORS.warning,
                [139, 92, 246], // Purple
            ];

            result.contentions.forEach((c, i) => {
                const details: { label: string; text: string }[] = [];
                if (c.reasoning) details.push({ label: i18n.t('export.reasoning'), text: c.reasoning });
                if (c.evidence) details.push({ label: i18n.t('export.evidence'), text: c.evidence });
                if (c.impact) details.push({ label: i18n.t('export.impact'), text: c.impact });

                addContentionBlock(i, c.claim || '', details, accentColors[i % accentColors.length]);
            });
            addSeparator(COLORS.warning);
        }

        // Predicted Opponent Case
        if (result.predictedOpponentCase?.likelyArguments?.length) {
            addSectionTitle(i18n.t('export.predictedOpponent'), COLORS.warning);
            addBulletList(result.predictedOpponentCase.likelyArguments);
            addSeparator(COLORS.danger);
        }

        // Counters
        if (result.counters?.length) {
            addSectionTitle(i18n.t('export.counters'), COLORS.danger);
            result.counters.forEach((c) => {
                addSubsectionLabel(`${i18n.t('export.target')}: ${c.targetArgument || ''}`);
                if (c.counterpoint) addParagraph(`${i18n.t('export.counter')}: ${c.counterpoint}`, 4);
                if (c.rebuttal) addParagraph(`${i18n.t('export.rebuttal')}: ${c.rebuttal}`, 4);
                pdf.y += 3;
            });
        }

        addFooter();
        doc.save(`DebateCase_${side}.pdf`);
        return true;
    } catch (error) {
        console.error('Failed to export case to PDF:', error);
        return false;
    }
}

// ============================================================
// ATTACK ANALYSIS EXPORT
// ============================================================
export async function exportAttackToPdf(result: AttackOutput): Promise<boolean> {
    try {
        const pdf = await createPDFDocument();
        const { doc, addHeader, addSectionTitle, addParagraph, addBulletList, addTable, addFooter } = pdf;

        const score = result.overallAssessment?.score || 0;
        addHeader(i18n.t('export.caseAttack'), `${i18n.t('export.overallScore')}: ${score}/100`);

        // Summary
        addSectionTitle('Assessment Summary');
        addParagraph(result.overallAssessment?.summary || 'No summary provided');

        if (result.overallAssessment?.strengthAreas?.length) {
            addSectionTitle('Strength Areas', COLORS.success);
            addBulletList(result.overallAssessment.strengthAreas);
        }

        // Weaknesses Table
        if (result.weaknesses?.length) {
            addSectionTitle(i18n.t('export.weaknesses'), COLORS.danger);
            const rows = result.weaknesses.map((w) => [
                w.severity?.toUpperCase() || '',
                w.type || '',
                w.description || '',
                w.howOpponentAttacks || '',
            ]);
            addTable(['Severity', 'Type', 'Description', 'Attack Vector'], rows, { headerColor: COLORS.danger });
        }

        // Fallacies
        if (result.fallaciesDetected?.length) {
            addSectionTitle(i18n.t('export.fallacies'), COLORS.warning);
            const fallacyRows = result.fallaciesDetected.map((f) => [
                f.name || '',
                f.location || '',
                f.explanation || '',
            ]);
            addTable(['Fallacy', 'Location', 'Explanation'], fallacyRows, { headerColor: COLORS.warning });
        }

        // Cross-Ex Questions
        if (result.crossExQuestions?.length) {
            addSectionTitle(i18n.t('export.crossExQuestions'), COLORS.primary);
            const qRows = result.crossExQuestions.map((q) => [
                q.question || '',
                q.purpose || '',
                q.expectedTrap || '',
            ]);
            addTable(['Question', 'Purpose', 'Expected Trap'], qRows);
        }

        // Weighing Analysis
        if (result.weighingAnalysis) {
            addSectionTitle('Weighing Analysis');
            addParagraph(result.weighingAnalysis.currentWeighing || 'No current weighing analysis');
            if (result.weighingAnalysis.missingComparisons?.length) {
                addParagraph('Missing Comparisons:');
                addBulletList(result.weighingAnalysis.missingComparisons);
            }
            if (result.weighingAnalysis.improvementSuggestions?.length) {
                addParagraph('Improvement Suggestions:');
                addBulletList(result.weighingAnalysis.improvementSuggestions);
            }
        }

        addFooter();
        doc.save(`AttackAnalysis_${score}.pdf`);
        return true;
    } catch (error) {
        console.error('Failed to export attack to PDF:', error);
        return false;
    }
}

// ============================================================
// BRAINSTORM EXPORT
// ============================================================
export async function exportBrainstormToPdf(result: BrainstormOutput): Promise<boolean> {
    try {
        const pdf = await createPDFDocument();
        const { doc, addHeader, addSectionTitle, addParagraph, addBulletList, addTable, addFooter } = pdf;

        addHeader(i18n.t('export.brainstormResults'), `${result.topFive?.length || 0} Top Ideas`);

        // Top 5
        if (result.topFive?.length) {
            addSectionTitle('Top 5 Argument Angles', COLORS.success);
            const rows = result.topFive.map((item) => [
                `#${item.rank}`,
                item.idea?.title || '',
                item.idea?.description || '',
                item.idea?.side?.toUpperCase() || '',
                item.whyTop || '',
            ]);
            addTable(['Rank', 'Title', 'Description', 'Side', i18n.t('export.whyTop')], rows, { headerColor: COLORS.success });
        }

        // Mind Map Categories
        if (result.mindmap?.length) {
            addSectionTitle('Argument Categories');
            result.mindmap.forEach((category) => {
                addParagraph(`📁 ${category.category}`);
                if (category.items?.length) {
                    const items = category.items.map((i) => `${i.title}: ${i.description}`);
                    addBulletList(items);
                }
            });
        }

        // Buckets
        if (result.buckets?.length) {
            addSectionTitle('Strategic Buckets', COLORS.primary);
            result.buckets.forEach((bucket) => {
                addParagraph(`${bucket.name}: ${bucket.keyInsight || ''}`);
            });
        }

        // Next Steps
        if (result.nextSteps?.length) {
            addSectionTitle('Recommended Next Steps', COLORS.warning);
            addBulletList(result.nextSteps);
        }

        // Warnings
        if (result.warningsAndTradeoffs?.length) {
            addSectionTitle('Warnings & Tradeoffs', COLORS.danger);
            addBulletList(result.warningsAndTradeoffs);
        }

        addFooter();
        doc.save('BrainstormResults.pdf');
        return true;
    } catch (error) {
        console.error('Failed to export brainstorm to PDF:', error);
        return false;
    }
}

// ============================================================
// FACTOIDS/RESEARCH EXPORT
// ============================================================
export async function exportFactoidsToPdf(result: FactoidsOutput): Promise<boolean> {
    try {
        const pdf = await createPDFDocument();
        const { doc, addHeader, addSectionTitle, addBulletList, addTable, addFooter } = pdf;

        const verifiedCount = result.factoids?.filter((f) => f.citation?.verified === 'verified').length || 0;
        addHeader(i18n.t('export.researchFactoids'), `${result.factoids?.length || 0} Facts • ${verifiedCount} Verified`);

        // Factoids Table
        if (result.factoids?.length) {
            addSectionTitle('Key Facts & Evidence', COLORS.primary);
            const rows = result.factoids.map((f) => [
                f.shortClaim || '',
                f.keyFigure || '',
                f.citation?.title || '',
                f.citation?.verified?.toUpperCase() || 'PENDING',
                `${f.relevanceScore || 0}%`,
            ]);
            addTable(['Claim', i18n.t('export.keyFigure'), i18n.t('export.source'), 'Status', 'Relevance'], rows);
        }

        // Detailed factoids
        if (result.factoids?.length) {
            addSectionTitle('Detailed Analysis');
            result.factoids.forEach((f, i) => {
                const pdf2 = pdf; // Access outer scope
                pdf2.addParagraph(`${i + 1}. ${f.shortClaim}`);
                pdf2.addParagraph(`   ${i18n.t('export.context')}: ${f.context || 'N/A'}`, 5);
                pdf2.addParagraph(`   Limitations: ${f.limitations || 'N/A'}`, 5);
                pdf2.addParagraph(`   ${i18n.t('export.howToUse')}: ${f.howToUse || 'N/A'}`, 5);
                if (f.citation?.url) {
                    pdf2.addParagraph(`   ${i18n.t('export.source')}: ${f.citation.url}`, 5);
                }
            });
        }

        // Search Suggestions
        if (result.searchSuggestions?.length) {
            addSectionTitle('Further Research Suggestions', COLORS.success);
            addBulletList(result.searchSuggestions);
        }

        // Warnings
        if (result.warnings?.length) {
            addSectionTitle('Warnings', COLORS.warning);
            addBulletList(result.warnings);
        }

        addFooter();
        doc.save('ResearchFactoids.pdf');
        return true;
    } catch (error) {
        console.error('Failed to export factoids to PDF:', error);
        return false;
    }
}
