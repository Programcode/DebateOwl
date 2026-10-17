// Supabase Edge Function: Export to Google Docs
// Creates a Google Doc from debate data using the user's OAuth token.
// Supports multiple modes: generate, attack, brainstorm, factoids

import { HttpError, requireUser } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";




type ExportMode = 'generate' | 'attack' | 'brainstorm' | 'factoids';

interface GoogleDocsInsertRequest {
    insertText: {
        location: { index: number };
        text: string;
    };
}

interface GoogleDocsParagraphStyleRequest {
    updateParagraphStyle: {
        range: { startIndex: number; endIndex: number };
        paragraphStyle: {
            namedStyleType?: string;
            alignment?: string;
            spaceAbove?: { magnitude: number; unit: string };
            spaceBelow?: { magnitude: number; unit: string };
            lineSpacing?: number;
            indentStart?: { magnitude: number; unit: string };
            borderTop?: { color: { color: { rgbColor: { red: number; green: number; blue: number } } }; width: { magnitude: number; unit: string }; padding: { magnitude: number; unit: string }; dashStyle: string };
            borderBottom?: { color: { color: { rgbColor: { red: number; green: number; blue: number } } }; width: { magnitude: number; unit: string }; padding: { magnitude: number; unit: string }; dashStyle: string };
        };
        fields: string;
    };
}

interface GoogleDocsTextStyleRequest {
    updateTextStyle: {
        range: { startIndex: number; endIndex: number };
        textStyle: {
            bold?: boolean;
            italic?: boolean;
            fontSize?: { magnitude: number; unit: string };
            weightedFontFamily?: { fontFamily: string };
            foregroundColor?: { color: { rgbColor: { red: number; green: number; blue: number } } };
            backgroundColor?: { color: { rgbColor: { red: number; green: number; blue: number } } };
        };
        fields: string;
    };
}

type GoogleDocsUpdateRequest = GoogleDocsInsertRequest | GoogleDocsParagraphStyleRequest | GoogleDocsTextStyleRequest;

// Modern color palette
const COLORS = {
    primary: { red: 0.29, green: 0.47, blue: 0.82 },      // Professional blue #4A78D1
    secondary: { red: 0.4, green: 0.4, blue: 0.45 },       // Slate gray #666673
    accent: { red: 0.18, green: 0.55, blue: 0.34 },        // Forest green #2D8C57
    muted: { red: 0.45, green: 0.45, blue: 0.5 },          // Muted gray #737380
    dark: { red: 0.12, green: 0.12, blue: 0.15 },          // Near black #1F1F26
};

// Professional document builder with modern styling
function createDocumentBuilder() {
    const requests: GoogleDocsUpdateRequest[] = [];
    let currentIndex = 1;

    const insertText = (text: string) => {
        requests.push({
            insertText: { location: { index: currentIndex }, text }
        });
        const startIndex = currentIndex;
        currentIndex += text.length;
        return { startIndex, endIndex: currentIndex };
    };

    // Title style - Large, bold, centered
    const applyTitle = (range: { startIndex: number; endIndex: number }) => {
        requests.push({
            updateTextStyle: {
                range,
                textStyle: {
                    bold: true,
                    fontSize: { magnitude: 28, unit: "PT" },
                    weightedFontFamily: { fontFamily: "Lexend" },
                    foregroundColor: { color: { rgbColor: COLORS.dark } }
                },
                fields: "bold,fontSize,weightedFontFamily,foregroundColor"
            }
        });
        requests.push({
            updateParagraphStyle: {
                range,
                paragraphStyle: {
                    alignment: "CENTER",
                    spaceBelow: { magnitude: 6, unit: "PT" }
                },
                fields: "alignment,spaceBelow"
            }
        });
    };

    // Subtitle/metadata style
    const applySubtitle = (range: { startIndex: number; endIndex: number }) => {
        requests.push({
            updateTextStyle: {
                range,
                textStyle: {
                    fontSize: { magnitude: 11, unit: "PT" },
                    weightedFontFamily: { fontFamily: "Lexend" },
                    foregroundColor: { color: { rgbColor: COLORS.muted } }
                },
                fields: "fontSize,weightedFontFamily,foregroundColor"
            }
        });
        requests.push({
            updateParagraphStyle: {
                range,
                paragraphStyle: {
                    alignment: "CENTER",
                    spaceBelow: { magnitude: 24, unit: "PT" }
                },
                fields: "alignment,spaceBelow"
            }
        });
    };

    // Section header - Bold, colored, with spacing
    const applySectionHeader = (range: { startIndex: number; endIndex: number }) => {
        requests.push({
            updateTextStyle: {
                range,
                textStyle: {
                    bold: true,
                    fontSize: { magnitude: 16, unit: "PT" },
                    weightedFontFamily: { fontFamily: "Lexend" },
                    foregroundColor: { color: { rgbColor: COLORS.primary } }
                },
                fields: "bold,fontSize,weightedFontFamily,foregroundColor"
            }
        });
        requests.push({
            updateParagraphStyle: {
                range,
                paragraphStyle: {
                    spaceAbove: { magnitude: 20, unit: "PT" },
                    spaceBelow: { magnitude: 8, unit: "PT" },
                    borderBottom: {
                        color: { color: { rgbColor: { red: 0.85, green: 0.85, blue: 0.88 } } },
                        width: { magnitude: 1, unit: "PT" },
                        padding: { magnitude: 4, unit: "PT" },
                        dashStyle: "SOLID"
                    }
                },
                fields: "spaceAbove,spaceBelow,borderBottom"
            }
        });
    };

    // Sub-header for arguments, counters
    const applySubHeader = (range: { startIndex: number; endIndex: number }) => {
        requests.push({
            updateTextStyle: {
                range,
                textStyle: {
                    bold: true,
                    fontSize: { magnitude: 13, unit: "PT" },
                    weightedFontFamily: { fontFamily: "Lexend" },
                    foregroundColor: { color: { rgbColor: COLORS.accent } }
                },
                fields: "bold,fontSize,weightedFontFamily,foregroundColor"
            }
        });
        requests.push({
            updateParagraphStyle: {
                range,
                paragraphStyle: {
                    spaceAbove: { magnitude: 14, unit: "PT" },
                    spaceBelow: { magnitude: 4, unit: "PT" }
                },
                fields: "spaceAbove,spaceBelow"
            }
        });
    };

    // Label text (Reasoning:, Evidence:, etc.)
    const applyLabel = (range: { startIndex: number; endIndex: number }) => {
        requests.push({
            updateTextStyle: {
                range,
                textStyle: {
                    bold: true,
                    fontSize: { magnitude: 11, unit: "PT" },
                    weightedFontFamily: { fontFamily: "Lexend" },
                    foregroundColor: { color: { rgbColor: COLORS.secondary } }
                },
                fields: "bold,fontSize,weightedFontFamily,foregroundColor"
            }
        });
    };

    // Body text
    const applyBody = (range: { startIndex: number; endIndex: number }) => {
        requests.push({
            updateTextStyle: {
                range,
                textStyle: {
                    fontSize: { magnitude: 11, unit: "PT" },
                    weightedFontFamily: { fontFamily: "Lexend" },
                    foregroundColor: { color: { rgbColor: COLORS.dark } }
                },
                fields: "fontSize,weightedFontFamily,foregroundColor"
            }
        });
        requests.push({
            updateParagraphStyle: {
                range,
                paragraphStyle: {
                    lineSpacing: 130,
                    spaceBelow: { magnitude: 4, unit: "PT" }
                },
                fields: "lineSpacing,spaceBelow"
            }
        });
    };

    // Bullet point text
    const applyBullet = (range: { startIndex: number; endIndex: number }) => {
        requests.push({
            updateTextStyle: {
                range,
                textStyle: {
                    fontSize: { magnitude: 11, unit: "PT" },
                    weightedFontFamily: { fontFamily: "Lexend" },
                    foregroundColor: { color: { rgbColor: COLORS.dark } }
                },
                fields: "fontSize,weightedFontFamily,foregroundColor"
            }
        });
        requests.push({
            updateParagraphStyle: {
                range,
                paragraphStyle: {
                    indentStart: { magnitude: 18, unit: "PT" },
                    spaceBelow: { magnitude: 3, unit: "PT" }
                },
                fields: "indentStart,spaceBelow"
            }
        });
    };

    // Emphasized body text (thesis, key points)
    const applyEmphasis = (range: { startIndex: number; endIndex: number }) => {
        requests.push({
            updateTextStyle: {
                range,
                textStyle: {
                    fontSize: { magnitude: 12, unit: "PT" },
                    weightedFontFamily: { fontFamily: "Lexend" },
                    foregroundColor: { color: { rgbColor: COLORS.dark } },
                    italic: true
                },
                fields: "fontSize,weightedFontFamily,foregroundColor,italic"
            }
        });
        requests.push({
            updateParagraphStyle: {
                range,
                paragraphStyle: {
                    lineSpacing: 140,
                    spaceBelow: { magnitude: 12, unit: "PT" },
                    indentStart: { magnitude: 12, unit: "PT" }
                },
                fields: "lineSpacing,spaceBelow,indentStart"
            }
        });
    };

    return {
        requests,
        insertText,
        applyTitle,
        applySubtitle,
        applySectionHeader,
        applySubHeader,
        applyLabel,
        applyBody,
        applyBullet,
        applyEmphasis
    };
}

// ============================================================
// GENERATE MODE
// ============================================================
interface GenerateData {
    caseStructure?: { thesis?: string; framework?: string; burdenOfProof?: string };
    contentions?: { claim?: string; reasoning?: string; evidence?: string; impact?: string }[];
    predictedOpponentCase?: { likelyArguments?: string[] };
    counters?: { targetArgument?: string; counterpoint?: string; rebuttal?: string }[];
    metadata?: { side?: string; format?: string; generatedAt?: string };
    exordio?: { hook?: string; transition?: string };
}

function buildGenerateContent(data: GenerateData) {
    const {
        requests, insertText, applyTitle, applySubtitle,
        applySectionHeader, applySubHeader, applyLabel, applyBody, applyBullet, applyEmphasis
    } = createDocumentBuilder();

    const thesis = data.caseStructure?.thesis?.trim() || 'Untitled Thesis';
    const motion = (data.metadata as Record<string, unknown>)?.motion as string | undefined;
    const thesisTitle = motion || (thesis.length > 200 ? thesis.substring(0, 197) + '...' : thesis);

    // Title - Centered, large, bold
    const titleRange = insertText(`${thesisTitle}\n`);
    applyTitle(titleRange);

    // Metadata - Centered subtitle
    const side = data.metadata?.side === 'pro' ? 'Proposition' : data.metadata?.side === 'con' ? 'Opposition' : 'Unknown';
    const format = data.metadata?.format?.toUpperCase() || 'Unknown Format';
    const date = data.metadata?.generatedAt ? new Date(data.metadata.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Unknown Date';
    const metaRange = insertText(`${side} • ${format} • ${date}\n`);
    applySubtitle(metaRange);

    // Exordio Section (if present)
    if (data.exordio && (data.exordio.hook || data.exordio.transition)) {
        const exordioSectionRange = insertText('Exordio\n');
        applySectionHeader(exordioSectionRange);
        if (data.exordio.hook) {
            const hookLabel = insertText('Hook: ');
            applyLabel(hookLabel);
            applyBody(insertText(`${data.exordio.hook}\n`));
        }
        if (data.exordio.transition) {
            const transitionLabel = insertText('Transition: ');
            applyLabel(transitionLabel);
            applyBody(insertText(`${data.exordio.transition}\n`));
        }
    }

    // Thesis Section
    const thesisSectionRange = insertText('Thesis\n');
    applySectionHeader(thesisSectionRange);
    const thesisBodyRange = insertText(`${thesis}\n`);
    applyEmphasis(thesisBodyRange);

    // Framework Section
    const framework = data.caseStructure?.framework?.trim() || 'No framework provided.';
    const frameworkSectionRange = insertText('Framework\n');
    applySectionHeader(frameworkSectionRange);
    applyBody(insertText(`${framework}\n`));

    // Burden of Proof Section
    const burden = data.caseStructure?.burdenOfProof?.trim() || 'No burden of proof provided.';
    const burdenSectionRange = insertText('Burden of Proof\n');
    applySectionHeader(burdenSectionRange);
    applyBody(insertText(`${burden}\n`));

    // Contentions Section
    const contentionsSectionRange = insertText('Arguments\n');
    applySectionHeader(contentionsSectionRange);
    const contentions = data.contentions || [];
    if (contentions.length === 0) {
        applyBody(insertText('No arguments provided.\n'));
    } else {
        contentions.forEach((c, i) => {
            // Contention header with number
            const claimRange = insertText(`Argument ${i + 1}: ${c?.claim || 'Untitled'}\n`);
            applySubHeader(claimRange);

            // Labeled body content
            if (c?.reasoning) {
                const reasonLabel = insertText('Reasoning: ');
                applyLabel(reasonLabel);
                applyBody(insertText(`${c.reasoning}\n`));
            }
            if (c?.evidence) {
                const evidenceLabel = insertText('Evidence: ');
                applyLabel(evidenceLabel);
                applyBody(insertText(`${c.evidence}\n`));
            }
            if (c?.impact) {
                const impactLabel = insertText('Impact: ');
                applyLabel(impactLabel);
                applyBody(insertText(`${c.impact}\n`));
            }
        });
    }

    // Predicted Opponent Case Section
    const predictedSectionRange = insertText('Predicted Opponent Case\n');
    applySectionHeader(predictedSectionRange);
    const likelyArgs = data.predictedOpponentCase?.likelyArguments || [];
    if (likelyArgs.length === 0) {
        applyBody(insertText('No predicted arguments.\n'));
    } else {
        likelyArgs.forEach(arg => {
            const bulletRange = insertText(`• ${arg}\n`);
            applyBullet(bulletRange);
        });
    }

    // Prepared Counters Section
    const countersSectionRange = insertText('Prepared Counters\n');
    applySectionHeader(countersSectionRange);
    const counters = data.counters || [];
    if (counters.length === 0) {
        applyBody(insertText('No counters provided.\n'));
    } else {
        counters.forEach((c, i) => {
            const targetRange = insertText(`Counter ${i + 1}: ${c?.targetArgument || 'Unknown Target'}\n`);
            applySubHeader(targetRange);

            if (c?.counterpoint) {
                const counterLabel = insertText('Counterpoint: ');
                applyLabel(counterLabel);
                applyBody(insertText(`${c.counterpoint}\n`));
            }
            if (c?.rebuttal) {
                const rebuttalLabel = insertText('Rebuttal: ');
                applyLabel(rebuttalLabel);
                applyBody(insertText(`${c.rebuttal}\n`));
            }
        });
    }

    return { requests, title: `Debate Case: ${thesisTitle}` };
}

// ============================================================
// ATTACK MODE
// ============================================================
interface AttackData {
    overallAssessment?: { score?: number; summary?: string; strengthAreas?: string[] };
    weaknesses?: { severity?: string; description?: string; whyWeak?: string; howOpponentAttacks?: string; improvedVersion?: string }[];
    fallaciesDetected?: { name?: string; location?: string; explanation?: string }[];
    crossExQuestions?: { question?: string; purpose?: string; expectedTrap?: string }[];
}

function buildAttackContent(data: AttackData) {
    const {
        requests, insertText, applyTitle, applySubtitle,
        applySectionHeader, applySubHeader, applyLabel, applyBody, applyBullet
    } = createDocumentBuilder();

    // Title
    const titleRange = insertText('Case Attack Analysis\n');
    applyTitle(titleRange);

    // Score as subtitle
    const score = data.overallAssessment?.score ?? 0;
    const scoreColor = score >= 70 ? '💪 Strong' : score >= 40 ? '⚠️ Needs Work' : '🚨 Weak';
    const scoreRange = insertText(`Score: ${score}/100 ${scoreColor}\n`);
    applySubtitle(scoreRange);

    // Summary
    if (data.overallAssessment?.summary) {
        const summaryLabel = insertText('Assessment: ');
        applyLabel(summaryLabel);
        applyBody(insertText(`${data.overallAssessment.summary}\n`));
    }

    // Strength Areas
    const strengths = data.overallAssessment?.strengthAreas || [];
    if (strengths.length > 0) {
        const sectionRange = insertText('Strength Areas\n');
        applySectionHeader(sectionRange);
        strengths.forEach(s => {
            const bulletRange = insertText(`✓ ${s}\n`);
            applyBullet(bulletRange);
        });
    }

    // Weaknesses
    const weaknessesSectionRange = insertText('Weaknesses Identified\n');
    applySectionHeader(weaknessesSectionRange);
    const weaknesses = data.weaknesses || [];
    if (weaknesses.length === 0) {
        applyBody(insertText('No weaknesses identified.\n'));
    } else {
        weaknesses.forEach((w, i) => {
            const severityIcon = w.severity === 'critical' ? '🔴' : w.severity === 'major' ? '🟠' : '🟡';
            const titleRange = insertText(`${i + 1}. ${severityIcon} ${w.description || 'No description'}\n`);
            applySubHeader(titleRange);

            if (w.whyWeak) {
                const label = insertText('Why Weak: ');
                applyLabel(label);
                applyBody(insertText(`${w.whyWeak}\n`));
            }
            if (w.howOpponentAttacks) {
                const label = insertText('Attack Vector: ');
                applyLabel(label);
                applyBody(insertText(`${w.howOpponentAttacks}\n`));
            }
            if (w.improvedVersion) {
                const label = insertText('Suggested Fix: ');
                applyLabel(label);
                applyBody(insertText(`${w.improvedVersion}\n`));
            }
        });
    }

    // Fallacies
    const fallaciesSectionRange = insertText('Fallacies Detected\n');
    applySectionHeader(fallaciesSectionRange);
    const fallacies = data.fallaciesDetected || [];
    if (fallacies.length === 0) {
        applyBody(insertText('No fallacies detected. ✓\n'));
    } else {
        fallacies.forEach(f => {
            const nameRange = insertText(`⚠ ${f.name || 'Unknown Fallacy'}\n`);
            applySubHeader(nameRange);
            if (f.location) {
                const label = insertText('Location: ');
                applyLabel(label);
                applyBody(insertText(`${f.location}\n`));
            }
            if (f.explanation) {
                applyBody(insertText(`${f.explanation}\n`));
            }
        });
    }

    // Cross-Ex Questions
    const crossExSectionRange = insertText('Cross-Examination Questions\n');
    applySectionHeader(crossExSectionRange);
    const crossEx = data.crossExQuestions || [];
    if (crossEx.length === 0) {
        applyBody(insertText('No questions provided.\n'));
    } else {
        crossEx.forEach((q, i) => {
            const qRange = insertText(`Q${i + 1}: ${q.question || 'No question'}\n`);
            applySubHeader(qRange);
            if (q.purpose) {
                const label = insertText('Purpose: ');
                applyLabel(label);
                applyBody(insertText(`${q.purpose}\n`));
            }
            if (q.expectedTrap) {
                const label = insertText('Expected Trap: ');
                applyLabel(label);
                applyBody(insertText(`${q.expectedTrap}\n`));
            }
        });
    }

    return { requests, title: 'Case Attack Analysis' };
}

// ============================================================
// BRAINSTORM MODE
// ============================================================
interface BrainstormData {
    topFive?: { rank?: number; idea?: { title?: string; description?: string }; whyTop?: string }[];
    mindmap?: { category?: string; items?: { title?: string; description?: string }[] }[];
    buckets?: { name?: string; keyInsight?: string; ideas?: { title?: string }[] }[];
    nextSteps?: string[];
}

function buildBrainstormContent(data: BrainstormData) {
    const {
        requests, insertText, applyTitle, applySubtitle,
        applySectionHeader, applySubHeader, applyLabel, applyBody, applyBullet
    } = createDocumentBuilder();

    // Title
    const titleRange = insertText('Brainstorm Results\n');
    applyTitle(titleRange);

    // Subtitle with count
    const totalIdeas = (data.topFive?.length || 0) +
        (data.mindmap?.reduce((acc, cat) => acc + (cat.items?.length || 0), 0) || 0);
    const subtitleRange = insertText(`${totalIdeas} Ideas Generated\n`);
    applySubtitle(subtitleRange);

    // Top Five
    const topFive = data.topFive || [];
    if (topFive.length > 0) {
        const sectionRange = insertText('Top 5 Argument Angles\n');
        applySectionHeader(sectionRange);
        topFive.forEach(item => {
            const medal = item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : `#${item.rank}`;
            const itemRange = insertText(`${medal} ${item.idea?.title || 'Untitled'}\n`);
            applySubHeader(itemRange);
            if (item.idea?.description) {
                applyBody(insertText(`${item.idea.description}\n`));
            }
            if (item.whyTop) {
                const label = insertText('Why Top: ');
                applyLabel(label);
                applyBody(insertText(`${item.whyTop}\n`));
            }
        });
    }

    // Mind Map
    const mindmap = data.mindmap || [];
    if (mindmap.length > 0) {
        const sectionRange = insertText('Argument Map\n');
        applySectionHeader(sectionRange);
        mindmap.forEach(category => {
            const catRange = insertText(`📁 ${category.category || 'Category'}\n`);
            applySubHeader(catRange);
            category.items?.forEach(idea => {
                const bulletRange = insertText(`• ${idea.title || 'Untitled'}${idea.description ? ': ' + idea.description : ''}\n`);
                applyBullet(bulletRange);
            });
        });
    }

    // Buckets
    const buckets = data.buckets || [];
    if (buckets.length > 0) {
        const sectionRange = insertText('Argument Buckets\n');
        applySectionHeader(sectionRange);
        buckets.forEach(bucket => {
            const bucketRange = insertText(`🗂 ${bucket.name || 'Bucket'}\n`);
            applySubHeader(bucketRange);
            if (bucket.keyInsight) {
                const label = insertText('Key Insight: ');
                applyLabel(label);
                applyBody(insertText(`${bucket.keyInsight}\n`));
            }
            bucket.ideas?.forEach(idea => {
                const bulletRange = insertText(`• ${idea.title || 'Untitled'}\n`);
                applyBullet(bulletRange);
            });
        });
    }

    // Next Steps
    const nextSteps = data.nextSteps || [];
    if (nextSteps.length > 0) {
        const sectionRange = insertText('Next Steps\n');
        applySectionHeader(sectionRange);
        nextSteps.forEach((step, i) => {
            const stepRange = insertText(`${i + 1}. ${step}\n`);
            applyBody(stepRange);
        });
    }

    return { requests, title: 'Brainstorm Results' };
}

// ============================================================
// FACTOIDS MODE
// ============================================================
interface FactoidsData {
    factoids?: {
        shortClaim?: string;
        keyFigure?: string;
        context?: string;
        howToUse?: string;
        citation?: { title?: string; publisher?: string; url?: string };
    }[];
    warnings?: string[];
}

function buildFactoidsContent(data: FactoidsData) {
    const {
        requests, insertText, applyTitle, applySubtitle,
        applySectionHeader, applySubHeader, applyLabel, applyBody, applyBullet
    } = createDocumentBuilder();

    // Title
    const titleRange = insertText('Research Factoids\n');
    applyTitle(titleRange);

    // Subtitle with count
    const count = data.factoids?.length || 0;
    const subtitleRange = insertText(`${count} Facts & Evidence Found\n`);
    applySubtitle(subtitleRange);

    // Factoids
    const factoidsSectionRange = insertText('Facts & Evidence\n');
    applySectionHeader(factoidsSectionRange);
    const factoids = data.factoids || [];
    if (factoids.length === 0) {
        applyBody(insertText('No factoids found.\n'));
    } else {
        factoids.forEach((f, i) => {
            const claimRange = insertText(`${i + 1}. ${f.shortClaim || 'No claim'}\n`);
            applySubHeader(claimRange);

            if (f.keyFigure) {
                const label = insertText('📊 Key Figure: ');
                applyLabel(label);
                applyBody(insertText(`${f.keyFigure}\n`));
            }
            if (f.context) {
                const label = insertText('Context: ');
                applyLabel(label);
                applyBody(insertText(`${f.context}\n`));
            }
            if (f.howToUse) {
                const label = insertText('💡 How to Use: ');
                applyLabel(label);
                applyBody(insertText(`${f.howToUse}\n`));
            }
            if (f.citation?.title || f.citation?.publisher) {
                const label = insertText('📚 Source: ');
                applyLabel(label);
                const sourceText = [f.citation?.title, f.citation?.publisher].filter(Boolean).join(' — ');
                applyBody(insertText(`${sourceText}\n`));
            }
        });
    }

    // Warnings
    const warnings = data.warnings || [];
    if (warnings.length > 0) {
        const warningsSectionRange = insertText('Warnings\n');
        applySectionHeader(warningsSectionRange);
        warnings.forEach(w => {
            const warnRange = insertText(`⚠️ ${w}\n`);
            applyBullet(warnRange);
        });
    }

    return { requests, title: 'Research Factoids' };
}

// ============================================================
// MAIN HANDLER
// ============================================================
export async function handleRequest(req: Request): Promise<Response> {
    // IMMEDIATE log to verify function is being called
    console.log("[GDOC] Function invoked, method:", req.method);

    const origin = req.headers.get("origin");
    const corsHeaders = getCorsHeaders(origin);

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    // Gateway JWT verification is disabled for this function, so the handler
    // checks the Supabase session itself. The browser reads `error` and treats
    // any 401 as "sign in again", so the response keeps this shape.
    let userId: string;
    try {
        userId = (await requireUser(req)).user.id;
    } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        console.warn("[GDOC] Authentication rejected:", error.message);
        return new Response(JSON.stringify({
            error: "Unauthorized",
            details: error.message
        }), {
            status: error.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
    console.log("[GDOC] JWT validated successfully, userId:", userId);

    try {
        console.log("[GDOC] Parsing request body...");
        const body = await req.json();
        const rawMode = typeof body.mode === "string" ? body.mode : "generate";
        const validModes: ExportMode[] = ["generate", "attack", "brainstorm", "factoids"];
        if (!validModes.includes(rawMode as ExportMode)) {
            return new Response(JSON.stringify({ error: "Invalid export mode" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }
        const mode = rawMode as ExportMode;
        const data = body.data || body.caseData; // Support both new and legacy format
        const accessToken = body.accessToken as string | undefined;

        // Refresh tokens are long-lived credentials and must never transit
        // through this endpoint from a browser. Re-authentication obtains a
        // new short-lived provider token when it expires.
        if ('refreshToken' in body) {
            return new Response(JSON.stringify({ error: "Refresh tokens are not accepted" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        if (!data) {
            return new Response(JSON.stringify({ error: "Missing data" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // Early debug logging
        console.log(`[GDOC] Request received: mode=${mode}, hasToken=${!!accessToken}`);

        if (!accessToken) {
            return new Response(JSON.stringify({
                error: "Missing Google access token. Please sign out and sign back in to grant Drive access.",
                code: "NO_TOKEN"
            }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        console.log(`[GDOC] Export authorized: mode=${mode}`);

        // Build content based on mode
        let result: { requests: GoogleDocsUpdateRequest[]; title: string };
        switch (mode) {
            case 'attack':
                result = buildAttackContent(data as AttackData);
                break;
            case 'brainstorm':
                result = buildBrainstormContent(data as BrainstormData);
                break;
            case 'factoids':
                result = buildFactoidsContent(data as FactoidsData);
                break;
            case 'generate':
            default:
                result = buildGenerateContent(data as GenerateData);
                break;
        }

        // Use only the short-lived provider token supplied by the authenticated
        // client. An expired token requires an explicit OAuth re-authentication.
        async function createGoogleDoc(token: string): Promise<Response> {
            return fetch("https://docs.googleapis.com/v1/documents", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ title: result.title })
            });
        }

        // Create Google Doc.
        const createDocResponse = await createGoogleDoc(accessToken);

        if (!createDocResponse.ok) {
            const errorText = await createDocResponse.text();
            console.error("[GDOC] Failed to create document:", errorText.slice(0, 2000));

            // Parse Google's error for more details
            let googleReason = "";
            try {
                const parsed = JSON.parse(errorText);
                googleReason = parsed.error?.errors?.[0]?.reason || parsed.error?.status || "";
            } catch {
                // Non-JSON errors still use the fixed client message.
            }

            if (createDocResponse.status === 401 || createDocResponse.status === 403) {
                return new Response(JSON.stringify({
                    error: createDocResponse.status === 403
                        ? "Google Drive permission is missing or insufficient. Connect Google Drive and try again."
                        : "Google authentication expired. Re-authenticate with Google and try again.",
                    code: createDocResponse.status === 403 ? "DRIVE_SCOPE_REQUIRED" : "AUTH_EXPIRED",
                    googleStatus: createDocResponse.status,
                    googleReason,
                }), {
                    status: createDocResponse.status,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            return new Response(JSON.stringify({
                error: "Failed to create Google Doc",
                code: "GOOGLE_DOC_CREATE_FAILED",
                googleStatus: createDocResponse.status,
                googleReason,
            }), {
                status: 502,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const docData = await createDocResponse.json();
        const documentId = docData.documentId;
        if (typeof documentId !== "string" || documentId.length === 0) {
            console.error("[GDOC] Create document response missing documentId:", JSON.stringify(docData));
            return new Response(JSON.stringify({
                error: "Google did not return a document ID. Re-authenticate with Google and try again.",
                code: "MISSING_DOCUMENT_ID"
            }), {
                status: 502,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }
        const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;

        console.log(`[GDOC] Created document: ${documentId} for mode: ${mode}`);

        // Apply content
        if (result.requests.length > 0) {
            const batchUpdateResponse = await fetch(
                `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${accessToken}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ requests: result.requests })
                }
            );

            if (!batchUpdateResponse.ok) {
                const errorText = await batchUpdateResponse.text();
                console.error("[GDOC] Failed to update document:", errorText.slice(0, 2000));
            }
        }

        console.log(`[GDOC] Document ready: ${documentUrl}`);

        return new Response(JSON.stringify({
            success: true,
            documentUrl,
            documentId,
        }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("[GDOC] Error:", error);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
