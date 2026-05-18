// src/lib/pdf-export-utils.ts
// Professional PDF export for all debate features using jsPDF
import i18n from '@/i18n';
import type { GenerateOutput } from './ai/schemas/generate';
import type { AttackOutput } from './ai/schemas/attack';
import type { BrainstormOutput } from './ai/schemas/brainstorm';
import type { FactoidsOutput } from './ai/schemas/factoids';

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

    const margin = 20;
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const checkPageBreak = (neededHeight: number) => {
        if (y + neededHeight > pageHeight - margin - 15) {
            doc.addPage();
            y = margin;
        }
    };

    const addHeader = (title: string, subtitle?: string) => {
        // Logo area (colored bar)
        doc.setFillColor(...COLORS.primary);
        doc.rect(0, 0, pageWidth, 35, 'F');

        // Title
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text(title, margin, 20);

        if (subtitle) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            doc.text(subtitle, margin, 28);
        }

        // DebateLab branding
        doc.setFontSize(10);
        doc.text('DebateLab', pageWidth - margin - 20, 20);

        y = 45;
        doc.setTextColor(...COLORS.dark);
    };

    const addSectionTitle = (title: string, color: [number, number, number] = COLORS.primary) => {
        checkPageBreak(15);
        doc.setFillColor(...color);
        doc.rect(margin, y, 4, 8, 'F');
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.dark);
        doc.text(title, margin + 8, y + 6);
        y += 12;
    };

    const addParagraph = (text: string, indent = 0) => {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.dark);
        const lines = doc.splitTextToSize(text, contentWidth - indent);
        checkPageBreak(lines.length * 5);
        doc.text(lines, margin + indent, y);
        y += lines.length * 5 + 3;
    };

    const addBulletList = (items: string[], indent = 0) => {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        items.forEach((item) => {
            const lines = doc.splitTextToSize(`• ${item}`, contentWidth - indent - 5);
            checkPageBreak(lines.length * 5);
            doc.text(lines, margin + indent, y);
            y += lines.length * 5 + 2;
        });
        y += 2;
    };

    const addTable = (headers: string[], rows: string[][], options?: { headerColor?: [number, number, number] }) => {
        const headerColor = options?.headerColor || COLORS.primary;
        checkPageBreak(30);

        autoTable(doc, {
            startY: y,
            head: [headers],
            body: rows,
            margin: { left: margin, right: margin },
            styles: {
                fontSize: 9,
                cellPadding: 3,
                textColor: COLORS.dark,
            },
            headStyles: {
                fillColor: headerColor,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
            },
            alternateRowStyles: {
                fillColor: COLORS.light,
            },
            columnStyles: {
                0: { cellWidth: 'auto' },
            },
        });

        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    };

    const addFooter = () => {
        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(...COLORS.secondary);
            doc.text(
                `Generated by DebateLab • ${new Date().toLocaleDateString()} • Page ${i} of ${pageCount}`,
                pageWidth / 2,
                pageHeight - 10,
                { align: 'center' }
            );
        }
    };

    return { doc, y, pageHeight, margin, contentWidth, checkPageBreak, addHeader, addSectionTitle, addParagraph, addBulletList, addTable, addFooter };
}

// ============================================================
// GENERATE CASE EXPORT
// ============================================================
export async function exportCaseToPdf(result: GenerateOutput): Promise<boolean> {
    try {
        const pdf = await createPDFDocument();
        const { doc, addHeader, addSectionTitle, addParagraph, addBulletList, addTable, addFooter } = pdf;

        const side = result.metadata?.side === 'pro' ? i18n.t('export.proposition') : i18n.t('export.opposition');
        const format = result.metadata?.format?.toUpperCase() || 'Standard';

        addHeader(i18n.t('export.debateCase'), `${side} • ${format} Format`);

        // Exordio (if present)
        if (result.exordio) {
            addSectionTitle(i18n.t('export.exordio'), COLORS.primary);
            if (result.exordio.hook) {
                addParagraph(`${i18n.t('export.hook')}: ${result.exordio.hook}`);
            }
            if (result.exordio.transition) {
                addParagraph(`${i18n.t('export.transition')}: ${result.exordio.transition}`);
            }
        }

        // Case Structure
        addSectionTitle(`${i18n.t('export.thesis')} & ${i18n.t('export.framework')}`);
        addParagraph(result.caseStructure?.thesis || 'No thesis provided');
        if (result.caseStructure?.framework) {
            addParagraph(`${i18n.t('export.framework')}: ${result.caseStructure.framework}`);
        }
        if (result.caseStructure?.burdenOfProof) {
            addParagraph(`${i18n.t('export.burdenOfProof')}: ${result.caseStructure.burdenOfProof}`);
        }

        // Arguments Table
        if (result.contentions?.length) {
            addSectionTitle(i18n.t('export.arguments'), COLORS.success);
            const rows = result.contentions.map((c, i) => [
                `#${i + 1}`,
                c.claim || '',
                c.reasoning || '',
                c.evidence || '',
                c.impact || '',
            ]);
            addTable(['#', 'Claim', i18n.t('export.reasoning'), i18n.t('export.evidence'), i18n.t('export.impact')], rows, { headerColor: COLORS.success });
        }

        // Predicted Opponent Case
        if (result.predictedOpponentCase?.likelyArguments?.length) {
            addSectionTitle(i18n.t('export.predictedOpponent'), COLORS.warning);
            addBulletList(result.predictedOpponentCase.likelyArguments);
        }

        // Counters
        if (result.counters?.length) {
            addSectionTitle(i18n.t('export.counters'), COLORS.danger);
            const counterRows = result.counters.map((c) => [
                c.targetArgument || '',
                c.counterpoint || '',
                c.rebuttal || '',
            ]);
            addTable([i18n.t('export.target'), i18n.t('export.counter'), i18n.t('export.rebuttal')], counterRows, { headerColor: COLORS.danger });
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
