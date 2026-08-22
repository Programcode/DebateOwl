// Shared research pipeline for AI features: deterministic Exa search,
// AI follow-up queries, source ranking, quality floors, and provenance.
// Model calls are injected via ResearchDeps so this module stays testable
// and free of provider-specific code.

import {
  buildSearchQueries,
  formatRankedSearchResults,
  rankSearchResults,
  sourceTitleFromUrl,
  type ExaResult,
  type RankedSearchResult,
  type ResearchSource,
} from "./source-quality.ts";

export type { ExaResult, RankedSearchResult, ResearchSource };

export type Provider = "openai" | "anthropic" | "google";

export type Source = {
  title: string;
  content: string;
  origin?: string;
  type: string;
};

export interface ResearchContext {
  searches: Array<{ query: string; results: string }>;
  rankedResults: RankedSearchResult[];
  readContent: Array<{ url: string; title: string; content: string; result?: RankedSearchResult }>;
  verifiedUrls: Set<string>;
}

export interface ResearchOptions {
  maxFollowUpQueries: number; // 0 = skip AI follow-up entirely
  maxUrlsToRead: number;      // How many pages to read in full
  maxSeedQueries: number;     // How many deterministic searches before AI follow-up
  overallTimeoutMs: number;   // Hard timeout for entire research
  preferredSourceType?: string;
  timeframe?: string;
}

export const DEEP_RESEARCH: ResearchOptions = {
  maxFollowUpQueries: 2,
  maxUrlsToRead: 5,
  maxSeedQueries: 4,
  overallTimeoutMs: 35000,
};

export const ASK_RESEARCH: ResearchOptions = {
  maxFollowUpQueries: 2,
  maxUrlsToRead: 4,
  maxSeedQueries: 4,
  overallTimeoutMs: 30000,
};

export interface ResearchDeps {
  provider: Provider;
  model: string;
  /** Injected model caller; returns the parsed JSON output of a provider call. */
  callModel: (args: {
    provider: Provider;
    model: string;
    systemPrompt: string;
    messages: Array<{ role: string; content: string }>;
    temperature: number;
  }) => Promise<{ output: unknown }>;
}

export function emptyResearchContext(): ResearchContext {
  return { searches: [], rankedResults: [], readContent: [], verifiedUrls: new Set() };
}

export async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============== EXA FUNCTIONS ==============

// exaSearch: web search using Exa's neural search (type "auto" = balanced relevance & speed)
export async function exaSearch(query: string): Promise<ExaResult[]> {
  const apiKey = Deno.env.get("EXA_API_KEY");
  if (!apiKey) {
    console.warn("[EXA] EXA_API_KEY not configured");
    return [];
  }
  try {
    const response = await fetchWithTimeout("https://api.exa.ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        query,
        type: "auto",
        num_results: 10,
        contents: { text: { max_characters: 10000 } },
      }),
    }, 30000);
    if (!response.ok) {
      console.warn(`[EXA] Search failed (${response.status}) for: ${query}`);
      return [];
    }
    const data = await response.json();
    if (!data?.results || !Array.isArray(data.results)) return [];
    return data.results.map((r: { title?: string; url?: string; text?: string; publishedDate?: string }) => ({
      title: r.title,
      url: r.url,
      content: r.text,
      publishedDate: r.publishedDate,
    }));
  } catch {
    console.warn(`[EXA] Search failed for: ${query}`);
    return [];
  }
}

// exaGetContents: extract full text from a specific URL using Exa's /contents endpoint
export async function exaGetContents(url: string): Promise<string> {
  const apiKey = Deno.env.get("EXA_API_KEY");
  if (!apiKey) {
    console.warn("[EXA] EXA_API_KEY not configured");
    return "";
  }
  try {
    const response = await fetchWithTimeout("https://api.exa.ai/contents", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ urls: [url], text: { max_characters: 8000 } }),
    }, 30000);
    if (!response.ok) {
      console.warn(`[EXA] Contents fetch failed (${response.status}) for: ${url}`);
      return "";
    }
    const data = await response.json();
    if (!data?.results || !Array.isArray(data.results) || data.results.length === 0) return "";
    return (data.results[0]?.text || "").slice(0, 8000);
  } catch {
    console.warn(`[EXA] Contents fetch failed for: ${url}`);
    return "";
  }
}

export function verifyUrl(url: string): boolean {
  // Do not fetch model-provided citation URLs from the Edge Function. A URL
  // that is syntactically public can still resolve to a private service after
  // validation, and the deployed runtime cannot safely pin DNS resolution.
  // Citations remain visible but are explicitly marked unverified.
  void url;
  return false;
}

// ============== DEEP RESEARCH ==============

const QUERY_GENERATION_PROMPT = `You are a research assistant. Based on the initial claim and search results so far, generate 2-3 follow-up search queries to find more specific evidence.

Return JSON: { "queries": ["query1", "query2", "query3"] }

Keep queries specific, factual, and focused on statistics, studies, or official sources.`;

const ASK_SEARCH_DECISION_PROMPT = `You decide whether a debate coaching answer needs live web research.

Return strict JSON:
{
  "shouldSearch": boolean,
  "query": "string"
}

Set shouldSearch=true when the user asks for current events, recent stats, real-world examples, laws/policies, or anything time-sensitive.
Set shouldSearch=false for timeless coaching (strategy, structure, delivery, framing).
When shouldSearch=true, provide one concise search query.
Do not add any fields.`;

function likelyNeedsFreshWebData(text: string): boolean {
  return /\b(latest|today|current|recent|new|newest|update|updated|news|202[0-9]|law|policy|gdp|inflation|ceo|president|prime minister|market|stock|price|war|conflict)\b/i.test(text);
}

export async function decideAskSearch(
  message: string,
  history: Array<{ role: string; content: string }>,
  deps: ResearchDeps
): Promise<{ shouldSearch: boolean; query: string }> {
  const context = history.slice(-4).map((m) => `${m.role}: ${m.content}`).join("\n");
  const prompt = `${context ? `Recent conversation:\n${context}\n\n` : ""}User message:\n${message}`;

  try {
    const decisionResult = await deps.callModel({
      provider: deps.provider,
      model: deps.model,
      systemPrompt: ASK_SEARCH_DECISION_PROMPT,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });
    const decision = decisionResult.output;
    if (decision && typeof decision === "object") {
      const parsed = decision as { shouldSearch?: unknown; query?: unknown };
      const shouldSearch = Boolean(parsed.shouldSearch);
      const query = typeof parsed.query === "string" ? parsed.query.trim().slice(0, 240) : "";
      if (shouldSearch) {
        return { shouldSearch: true, query: query || message.slice(0, 240) };
      }
      return { shouldSearch: false, query: "" };
    }
  } catch (err) {
    console.warn("[ASK] Search decision failed:", err);
  }

  const fallbackShouldSearch = likelyNeedsFreshWebData(message);
  return {
    shouldSearch: fallbackShouldSearch,
    query: fallbackShouldSearch ? message.slice(0, 240) : "",
  };
}

async function generateFollowUpQueries(
  claim: string,
  currentResults: string,
  deps: ResearchDeps
): Promise<string[]> {
  const prompt = `Claim: "${claim}"\n\nCurrent search results:\n${currentResults.slice(0, 3000)}\n\nGenerate 2-3 specific follow-up queries to find more evidence.`;
  try {
    const result = await deps.callModel({
      provider: deps.provider,
      model: deps.model,
      systemPrompt: QUERY_GENERATION_PROMPT,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });
    const parsed = typeof result.output === "object" && result.output !== null ? result.output : {};
    if (Array.isArray((parsed as { queries?: string[] }).queries)) {
      return (parsed as { queries: string[] }).queries.slice(0, 3);
    }
    return [];
  } catch (err) {
    console.warn("[DEEP RESEARCH] Failed to generate follow-up queries:", err);
    return [];
  }
}

async function deepResearchInner(
  claim: string,
  region: string,
  deps: ResearchDeps,
  options: ResearchOptions,
  context: ResearchContext = emptyResearchContext()
): Promise<ResearchContext> {
  console.log(`[RESEARCH] Starting (mode: ${options.maxFollowUpQueries > 0 ? "deep" : "light"}) for: ${claim}`);

  const preferredSourceType = options.preferredSourceType || "any";
  const seedQueries = buildSearchQueries(claim, region, preferredSourceType, options.timeframe).slice(0, options.maxSeedQueries);
  const allResults: Array<ExaResult & { query: string }> = [];
  const matchesPreferredSourceType = (result: RankedSearchResult) => (
    preferredSourceType === "any" ||
    result.sourceType === preferredSourceType
  );

  const seedResults = await Promise.all(seedQueries.map(async (query) => {
    const results = await exaSearch(query);
    const ranked = rankSearchResults(results.map((result) => ({ ...result, query })), claim, preferredSourceType);
    const visibleRanked = preferredSourceType === "any" ? ranked : ranked.filter(matchesPreferredSourceType);
    context.searches.push({ query, results: formatRankedSearchResults(visibleRanked) });
    console.log(`[RESEARCH] Seed query "${query}": ${results.length} results`);
    return results.map((result) => ({ ...result, query }));
  }));
  seedResults.forEach((results) => allResults.push(...results));

  const initialRanked = rankSearchResults(allResults, claim, preferredSourceType);
  const initialText = formatRankedSearchResults(initialRanked.slice(0, 12));

  // Round 2: AI generates follow-up queries (skipped in light mode)
  if (options.maxFollowUpQueries > 0) {
    const followUpQueries = await generateFollowUpQueries(claim, initialText, deps);
    console.log(`[RESEARCH] Follow-up queries: ${followUpQueries.join(", ")}`);

    const followUpPromises = followUpQueries.slice(0, options.maxFollowUpQueries).map(async (query) => {
      const results = await exaSearch(query);
      const ranked = rankSearchResults(results.map((result) => ({ ...result, query })), claim, preferredSourceType);
      const visibleRanked = preferredSourceType === "any" ? ranked : ranked.filter(matchesPreferredSourceType);
      context.searches.push({ query, results: formatRankedSearchResults(visibleRanked) });
      allResults.push(...results.map((result) => ({ ...result, query })));
      return results.length;
    });
    await Promise.all(followUpPromises);
    console.log(`[RESEARCH] Round 2 complete, ${context.searches.length} total searches`);
  }

  context.rankedResults = rankSearchResults(allResults, claim, preferredSourceType);
  const readCandidates = preferredSourceType === "any"
    ? context.rankedResults
    : context.rankedResults.filter(matchesPreferredSourceType);
  const urlsToRead = readCandidates
    .filter((result) => result.qualityLabel !== "weak" || context.rankedResults.filter((r) => r.qualityLabel !== "weak").length < 2)
    .slice(0, options.maxUrlsToRead);

  const readPromises = urlsToRead.map(async (result) => {
    const url = result.url || "";
    const content = await exaGetContents(url);
    if (content) {
      context.readContent.push({ url, title: result.title || sourceTitleFromUrl(url), content, result });
      context.verifiedUrls.add(url);
    }
    return content.length > 0;
  });
  await Promise.all(readPromises);
  console.log(`[RESEARCH] Read ${context.readContent.length} pages`);

  return context;
}

// Wrapper with overall timeout - returns whatever completed if the limit hits,
// so a slow search round does not throw away finished rounds.
export async function deepResearch(
  claim: string,
  region: string,
  deps: ResearchDeps,
  options: ResearchOptions = DEEP_RESEARCH
): Promise<ResearchContext> {
  const partial = emptyResearchContext();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      deepResearchInner(claim, region, deps, options, partial),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Research timeout")), options.overallTimeoutMs);
      }),
    ]);
    return result;
  } catch (err) {
    console.warn(`[RESEARCH] Timed out or failed after ${options.overallTimeoutMs}ms:`, err);
    return partial;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export function buildResearchContext(research: ResearchContext): string {
  let ctx = "=== WEB RESEARCH RESULTS ===\n\n";
  ctx += "IMPORTANT: Only cite sources marked 'strong' or 'moderate'. Sources marked 'weak' are fallback context only, do NOT cite them as evidence. If only weak sources are available, state that evidence is limited.\n\n";

  // Add search results
  for (const search of research.searches) {
    ctx += `--- Search: "${search.query}" ---\n${search.results}\n\n`;
  }

  // Add full page content
  if (research.readContent.length > 0) {
    ctx += "\n=== FULL PAGE CONTENT (verified sources) ===\n\n";
    for (const page of research.readContent) {
      const quality = page.result ? `${page.result.sourceType}, ${page.result.qualityLabel}, ${page.result.qualityScore}/100` : "verified";
      const warning = page.result?.qualityLabel === "weak" ? " [WEAK, do not cite as evidence]" : "";
      ctx += `--- From: ${page.title} (${page.url}) ---\nSource quality: ${quality}${warning}\n${page.content.slice(0, 4000)}\n\n`;
    }
  }

  return ctx;
}

export function getResearchSources(research: ResearchContext): ResearchSource[] {
  const seen = new Set<string>();
  const sources: ResearchSource[] = [];

  for (const page of research.readContent) {
    if (!page.url || seen.has(page.url)) continue;
    if (page.result?.qualityLabel === "weak") continue; // Quality floor: weak sources can't be cited
    seen.add(page.url);
    const result = page.result;
    sources.push({
      title: page.title || result?.title || sourceTitleFromUrl(page.url),
      url: page.url,
      verified: research.verifiedUrls.has(page.url),
      sourceType: result?.sourceType ?? "generic",
      qualityScore: result?.qualityScore ?? 50,
      qualityLabel: result?.qualityLabel ?? "moderate",
    });
  }

  if (sources.length > 0) return sources.slice(0, 5);

  // Fallback: if no strong/moderate read content, use ranked results (excluding weak)
  for (const result of research.rankedResults) {
    const url = result.url || "";
    if (!url || seen.has(url)) continue;
    if (result.qualityLabel === "weak") continue;
    seen.add(url);
    sources.push({
      title: result.title || sourceTitleFromUrl(url),
      url,
      verified: false,
      sourceType: result.sourceType,
      qualityScore: result.qualityScore,
      qualityLabel: result.qualityLabel,
    });
    if (sources.length >= 5) return sources;
  }

  return sources;
}

export function withResearchPreferences(base: ResearchOptions, preferences: Partial<ResearchOptions>): ResearchOptions {
  return { ...base, ...preferences };
}

export function buildDiscoveredSources(research: ResearchContext) {
  return research.readContent.map((item) => ({
    title: item.title || sourceTitleFromUrl(item.url),
    url: item.url,
    content: item.content.slice(0, 1000),
    qualityScore: item.result?.qualityScore,
    sourceType: item.result?.sourceType,
    qualityLabel: item.result?.qualityLabel,
    // Provenance: which research query surfaced this source.
    query: item.result?.query,
  }));
}

/**
 * Source-quality floor for factoids: a citation may only be marked "verified"
 * when its URL matches research content that was actually fetched AND that
 * content is not a weak source. Weak sources may appear as fallback context,
 * never as verified evidence. Unknown URLs stay unverified.
 */
export function applyFactoidsVerification(
  output: unknown,
  research: ResearchContext
): void {
  if (!output || typeof output !== "object" || !("factoids" in output)) return;
  const factoids = (output as { factoids: Array<{ citation?: { url?: string; verified?: string } }> }).factoids;
  if (!Array.isArray(factoids)) return;

  for (const factoid of factoids) {
    const citation = factoid.citation;
    if (!citation) continue;
    const url = citation.url;
    if (!url) {
      citation.verified = "unverified";
      continue;
    }
    const fetched = research.readContent.find((page) => page.url === url);
    citation.verified = fetched && fetched.result?.qualityLabel !== "weak" ? "verified" : "unverified";
  }
}
