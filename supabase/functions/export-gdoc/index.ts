// Supabase Edge Function: Export to Google Docs
// Creates a Google Doc from debate data using the user's OAuth token.
// Supports multiple modes: generate, attack, brainstorm, factoids

const ALLOWED_ORIGINS = [
    "https://debate.pi-stack.org",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:54321"
];

function getCorsHeaders(origin: string | null) {
    // Allow any localhost/127.0.0.1 origin for development
    // Also allow local network IPs (192.168.x.x) for mobile/device testing
    const isDevOrigin = origin && (
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1') ||
        origin.startsWith('http://192.168.')
    );
    const allowedOrigin = isDevOrigin || (origin && ALLOWED_ORIGINS.includes(origin))
        ? origin
        : ALLOWED_ORIGINS[0];
    return {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
}

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
        };
        fields: string;
    };
}

type GoogleDocsUpdateRequest = GoogleDocsInsertRequest | GoogleDocsParagraphStyleRequest | GoogleDocsTextStyleRequest;

// Helpers for building document content
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

    const applyHeading = (range: { startIndex: number; endIndex: number }, level: 1 | 2) => {
        requests.push({
            updateParagraphStyle: {
                range: { startIndex: range.startIndex, endIndex: range.endIndex },
                paragraphStyle: { namedStyleType: level === 1 ? "HEADING_1" : "HEADING_2" },
                fields: "namedStyleType"
            }
        });
    };

    const applyBold = (range: { startIndex: number; endIndex: number }) => {
        requests.push({
            updateTextStyle: {
                range: { startIndex: range.startIndex, endIndex: range.endIndex },
                textStyle: { bold: true },
                fields: "bold"
            }
        });
    };

    const applyBodyStyle = (range: { startIndex: number; endIndex: number }) => {
        requests.push({
            updateTextStyle: {
                range: { startIndex: range.startIndex, endIndex: range.endIndex },
                textStyle: {
                    fontSize: { magnitude: 12, unit: "PT" },
                    weightedFontFamily: { fontFamily: "Times New Roman" }
                },
                fields: "fontSize,weightedFontFamily"
            }
        });
    };

    return { requests, insertText, applyHeading, applyBold, applyBodyStyle };
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
}

function buildGenerateContent(data: GenerateData) {
    const { requests, insertText, applyHeading, applyBold, applyBodyStyle } = createDocumentBuilder();

    const thesis = data.caseStructure?.thesis?.trim() || 'Untitled Thesis';
    const thesisTitle = thesis.split('.')[0] || thesis;

    // Title
    const titleRange = insertText(`Debate Case: ${thesisTitle}\n\n`);
    applyHeading(titleRange, 1);

    // Metadata
    const side = data.metadata?.side === 'pro' ? 'Proposition' : data.metadata?.side === 'con' ? 'Opposition' : 'Unknown';
    const format = data.metadata?.format?.toUpperCase() || 'UNKNOWN';
    const date = data.metadata?.generatedAt ? new Date(data.metadata.generatedAt).toLocaleDateString() : 'Unknown';
    const metaRange = insertText(`Side: ${side} | Format: ${format} | Date: ${date}\n\n`);
    applyBodyStyle(metaRange);

    // Thesis
    const thesisSectionRange = insertText('THESIS\n');
    applyHeading(thesisSectionRange, 2);
    const thesisBodyRange = insertText(`${thesis}\n\n`);
    applyBodyStyle(thesisBodyRange);

    // Framework
    const framework = data.caseStructure?.framework?.trim() || 'No framework provided.';
    const frameworkSectionRange = insertText('FRAMEWORK\n');
    applyHeading(frameworkSectionRange, 2);
    applyBodyStyle(insertText(`${framework}\n\n`));

    // Burden of Proof
    const burden = data.caseStructure?.burdenOfProof?.trim() || 'No burden of proof provided.';
    const burdenSectionRange = insertText('BURDEN OF PROOF\n');
    applyHeading(burdenSectionRange, 2);
    applyBodyStyle(insertText(`${burden}\n\n`));

    // Contentions
    const contentionsSectionRange = insertText('CONTENTIONS\n');
    applyHeading(contentionsSectionRange, 2);
    const contentions = data.contentions || [];
    if (contentions.length === 0) {
        applyBodyStyle(insertText('No contentions provided.\n\n'));
    } else {
        contentions.forEach((c, i) => {
            const claimRange = insertText(`Contention ${i + 1}: ${c?.claim || 'Untitled'}\n`);
            applyBold(claimRange);
            applyBodyStyle(claimRange);
            applyBodyStyle(insertText(`Reasoning: ${c?.reasoning || 'N/A'}\n`));
            applyBodyStyle(insertText(`Evidence: ${c?.evidence || 'N/A'}\n`));
            applyBodyStyle(insertText(`Impact: ${c?.impact || 'N/A'}\n\n`));
        });
    }

    // Predicted Opponent Case
    const predictedSectionRange = insertText('PREDICTED OPPONENT CASE\n');
    applyHeading(predictedSectionRange, 2);
    const likelyArgs = data.predictedOpponentCase?.likelyArguments || [];
    if (likelyArgs.length === 0) {
        applyBodyStyle(insertText('No predicted arguments.\n\n'));
    } else {
        likelyArgs.forEach(arg => applyBodyStyle(insertText(`• ${arg}\n`)));
        insertText('\n');
    }

    // Counters
    const countersSectionRange = insertText('PREPARED COUNTERS\n');
    applyHeading(countersSectionRange, 2);
    const counters = data.counters || [];
    if (counters.length === 0) {
        applyBodyStyle(insertText('No counters provided.\n\n'));
    } else {
        counters.forEach(c => {
            const targetRange = insertText(`Target: ${c?.targetArgument || 'Unknown'}\n`);
            applyBold(targetRange);
            applyBodyStyle(targetRange);
            applyBodyStyle(insertText(`Counter: ${c?.counterpoint || 'N/A'}\n`));
            applyBodyStyle(insertText(`Rebuttal: ${c?.rebuttal || 'N/A'}\n\n`));
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
    const { requests, insertText, applyHeading, applyBold, applyBodyStyle } = createDocumentBuilder();

    // Title
    const titleRange = insertText('Case Attack Analysis\n\n');
    applyHeading(titleRange, 1);

    // Score
    const score = data.overallAssessment?.score ?? 0;
    const scoreRange = insertText(`Overall Score: ${score}/100\n\n`);
    applyBold(scoreRange);
    applyBodyStyle(scoreRange);

    // Summary
    applyBodyStyle(insertText(`${data.overallAssessment?.summary || 'No summary provided.'}\n\n`));

    // Weaknesses
    const weaknessesSectionRange = insertText('WEAKNESSES IDENTIFIED\n');
    applyHeading(weaknessesSectionRange, 2);
    const weaknesses = data.weaknesses || [];
    if (weaknesses.length === 0) {
        applyBodyStyle(insertText('No weaknesses identified.\n\n'));
    } else {
        weaknesses.forEach((w, i) => {
            const titleRange = insertText(`${i + 1}. [${w.severity?.toUpperCase() || 'UNKNOWN'}] ${w.description || 'No description'}\n`);
            applyBold(titleRange);
            applyBodyStyle(titleRange);
            applyBodyStyle(insertText(`Why Weak: ${w.whyWeak || 'N/A'}\n`));
            applyBodyStyle(insertText(`How Opponent Attacks: ${w.howOpponentAttacks || 'N/A'}\n`));
            applyBodyStyle(insertText(`Improved Version: ${w.improvedVersion || 'N/A'}\n\n`));
        });
    }

    // Fallacies
    const fallaciesSectionRange = insertText('FALLACIES DETECTED\n');
    applyHeading(fallaciesSectionRange, 2);
    const fallacies = data.fallaciesDetected || [];
    if (fallacies.length === 0) {
        applyBodyStyle(insertText('No fallacies detected.\n\n'));
    } else {
        fallacies.forEach(f => {
            const nameRange = insertText(`${f.name || 'Unknown Fallacy'}\n`);
            applyBold(nameRange);
            applyBodyStyle(nameRange);
            applyBodyStyle(insertText(`Location: ${f.location || 'N/A'}\n`));
            applyBodyStyle(insertText(`${f.explanation || 'N/A'}\n\n`));
        });
    }

    // Cross-Ex Questions
    const crossExSectionRange = insertText('CROSS-EXAMINATION QUESTIONS\n');
    applyHeading(crossExSectionRange, 2);
    const crossEx = data.crossExQuestions || [];
    if (crossEx.length === 0) {
        applyBodyStyle(insertText('No questions provided.\n\n'));
    } else {
        crossEx.forEach((q, i) => {
            const qRange = insertText(`Q${i + 1}: ${q.question || 'No question'}\n`);
            applyBold(qRange);
            applyBodyStyle(qRange);
            applyBodyStyle(insertText(`Purpose: ${q.purpose || 'N/A'}\n`));
            applyBodyStyle(insertText(`Expected Trap: ${q.expectedTrap || 'N/A'}\n\n`));
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
    const { requests, insertText, applyHeading, applyBold, applyBodyStyle } = createDocumentBuilder();

    // Title
    const titleRange = insertText('Brainstorm Results\n\n');
    applyHeading(titleRange, 1);

    // Top Five
    const topFive = data.topFive || [];
    if (topFive.length > 0) {
        const sectionRange = insertText('TOP 5 ARGUMENT ANGLES\n');
        applyHeading(sectionRange, 2);
        topFive.forEach(item => {
            const itemRange = insertText(`#${item.rank || '?'}: ${item.idea?.title || 'Untitled'}\n`);
            applyBold(itemRange);
            applyBodyStyle(itemRange);
            applyBodyStyle(insertText(`${item.idea?.description || 'No description'}\n`));
            applyBodyStyle(insertText(`Why Top: ${item.whyTop || 'N/A'}\n\n`));
        });
    }

    // Mind Map
    const mindmap = data.mindmap || [];
    if (mindmap.length > 0) {
        const sectionRange = insertText('ARGUMENT MAP\n');
        applyHeading(sectionRange, 2);
        mindmap.forEach(category => {
            const catRange = insertText(`${category.category || 'Category'}\n`);
            applyBold(catRange);
            applyBodyStyle(catRange);
            category.items?.forEach(idea => {
                applyBodyStyle(insertText(`• ${idea.title || 'Untitled'}: ${idea.description || ''}\n`));
            });
            insertText('\n');
        });
    }

    // Buckets
    const buckets = data.buckets || [];
    if (buckets.length > 0) {
        const sectionRange = insertText('ARGUMENT BUCKETS\n');
        applyHeading(sectionRange, 2);
        buckets.forEach(bucket => {
            const bucketRange = insertText(`${bucket.name || 'Bucket'}\n`);
            applyBold(bucketRange);
            applyBodyStyle(bucketRange);
            applyBodyStyle(insertText(`${bucket.keyInsight || 'No insight'}\n`));
            bucket.ideas?.forEach(idea => {
                applyBodyStyle(insertText(`• ${idea.title || 'Untitled'}\n`));
            });
            insertText('\n');
        });
    }

    // Next Steps
    const nextSteps = data.nextSteps || [];
    if (nextSteps.length > 0) {
        const sectionRange = insertText('NEXT STEPS\n');
        applyHeading(sectionRange, 2);
        nextSteps.forEach((step, i) => {
            applyBodyStyle(insertText(`${i + 1}. ${step}\n`));
        });
        insertText('\n');
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
    const { requests, insertText, applyHeading, applyBold, applyBodyStyle } = createDocumentBuilder();

    // Title
    const titleRange = insertText('Research Factoids\n\n');
    applyHeading(titleRange, 1);

    // Factoids
    const factoidsSectionRange = insertText('FACTS & EVIDENCE\n');
    applyHeading(factoidsSectionRange, 2);
    const factoids = data.factoids || [];
    if (factoids.length === 0) {
        applyBodyStyle(insertText('No factoids found.\n\n'));
    } else {
        factoids.forEach((f, i) => {
            const claimRange = insertText(`${i + 1}. ${f.shortClaim || 'No claim'}\n`);
            applyBold(claimRange);
            applyBodyStyle(claimRange);
            applyBodyStyle(insertText(`Key Figure: ${f.keyFigure || 'N/A'}\n`));
            applyBodyStyle(insertText(`Context: ${f.context || 'N/A'}\n`));
            applyBodyStyle(insertText(`How to Use: ${f.howToUse || 'N/A'}\n`));
            applyBodyStyle(insertText(`Source: ${f.citation?.title || 'Unknown'} - ${f.citation?.publisher || 'Unknown'}\n\n`));
        });
    }

    // Warnings
    const warnings = data.warnings || [];
    if (warnings.length > 0) {
        const warningsSectionRange = insertText('WARNINGS\n');
        applyHeading(warningsSectionRange, 2);
        warnings.forEach(w => {
            applyBodyStyle(insertText(`⚠ ${w}\n`));
        });
        insertText('\n');
    }

    return { requests, title: 'Research Factoids' };
}

// ============================================================
// MAIN HANDLER
// ============================================================
Deno.serve(async (req: Request) => {
    const origin = req.headers.get("origin");
    const corsHeaders = getCorsHeaders(origin);

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const mode = (body.mode || 'generate') as ExportMode;
        const data = body.data || body.caseData; // Support both new and legacy format
        let accessToken = body.accessToken as string | undefined;
        const refreshToken = body.refreshToken as string | undefined;

        if (!data) {
            return new Response(JSON.stringify({ error: "Missing data" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        if (!accessToken && !refreshToken) {
            return new Response(JSON.stringify({
                error: "Missing Google access token. Please sign out and sign back in to grant Drive access.",
                code: "NO_TOKEN"
            }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // Helper function to refresh the access token using the refresh token
        async function refreshAccessToken(): Promise<string | null> {
            if (!refreshToken) return null;

            const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
            const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

            if (!clientId || !clientSecret) {
                console.error("[GDOC] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in secrets");
                return null;
            }

            console.log("[GDOC] Attempting to refresh access token...");

            const response = await fetch("https://oauth2.googleapis.com/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: "refresh_token",
                    refresh_token: refreshToken,
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                console.error("[GDOC] Token refresh failed:", error);
                return null;
            }

            const tokenData = await response.json();
            console.log("[GDOC] Token refresh successful");
            return tokenData.access_token;
        }

        // If no access token but we have refresh token, try to refresh first
        let newAccessToken: string | null = null;
        if (!accessToken && refreshToken) {
            newAccessToken = await refreshAccessToken();
            if (!newAccessToken) {
                return new Response(JSON.stringify({
                    error: "Failed to refresh Google token. Please sign out and sign back in.",
                    code: "REFRESH_FAILED"
                }), {
                    status: 401,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }
            accessToken = newAccessToken;
        }

        // Log token info for debugging (just first/last chars for security)
        console.log(`[GDOC] Mode: ${mode}, Token: ${accessToken!.substring(0, 8)}...${accessToken!.substring(accessToken!.length - 4)}`);

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

        // Helper to make Google API call with potential token refresh retry
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

        // Create Google Doc with retry on 401
        let createDocResponse = await createGoogleDoc(accessToken!);

        // If 401 and we have a refresh token, try refreshing and retry once
        if (createDocResponse.status === 401 && refreshToken && !newAccessToken) {
            console.log("[GDOC] Got 401, attempting token refresh...");
            newAccessToken = await refreshAccessToken();
            if (newAccessToken) {
                accessToken = newAccessToken;
                createDocResponse = await createGoogleDoc(accessToken);
            }
        }

        if (!createDocResponse.ok) {
            const errorText = await createDocResponse.text();
            console.error("[GDOC] Failed to create document:", errorText);

            if (createDocResponse.status === 401) {
                return new Response(JSON.stringify({
                    error: "Google authorization expired. Please sign out and sign back in.",
                    code: "AUTH_EXPIRED"
                }), {
                    status: 401,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            return new Response(JSON.stringify({ error: "Failed to create Google Doc" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const docData = await createDocResponse.json();
        const documentId = docData.documentId;
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
                console.error("[GDOC] Failed to update document:", errorText);
            }
        }

        console.log(`[GDOC] Document ready: ${documentUrl}`);

        return new Response(JSON.stringify({
            success: true,
            documentUrl,
            documentId,
            // Return new access token if we refreshed it, so frontend can store it
            ...(newAccessToken && { newAccessToken })
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
});
