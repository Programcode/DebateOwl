// Shared research pipeline for AI features: deterministic Exa search,
// AI follow-up queries, source ranking, quality floors, and provenance.
// Model calls are injected via ResearchDeps so this module stays testable
// and free of provider-specific code.

import {
  buildSearchRequests,
  formatRankedSearchResults,
  GOVERNMENT_SEARCH_DOMAINS,
  rankSearchResults,
  sourceTitleFromUrl,
  type ExaResult,
  type ExaSearchCategory,
  type RankedSearchResult,
  type ResearchSource,
  type SearchRequest,
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
  /** Request-scoped cancellation signal, if the caller has one. */
  signal?: AbortSignal;
  /** Called synchronously when the overall research timeout fires. */
  onTimeout?: () => void;
  /** Injected model caller; returns the parsed JSON output of a provider call. */
  callModel: (args: {
    provider: Provider;
    model: string;
    systemPrompt: string;
    messages: Array<{ role: string; content: string }>;
    temperature: number;
    signal?: AbortSignal;
  }) => Promise<{ output: unknown }>;
}

export function emptyResearchContext(): ResearchContext {
  return { searches: [], rankedResults: [], readContent: [], verifiedUrls: new Set() };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("The operation was aborted", "AbortError");
  }
}

function linkAbortSignals(signals: Array<AbortSignal | null | undefined>) {
  const controller = new AbortController();
  const cleanup: Array<() => void> = [];
  const abort = (reason?: unknown) => {
    if (!controller.signal.aborted) controller.abort(reason);
  };

  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      abort(signal.reason);
      break;
    }
    const onAbort = () => abort(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    cleanup.push(() => signal.removeEventListener("abort", onAbort));
  }

  return {
    signal: controller.signal,
    abort,
    cleanup: () => cleanup.forEach((remove) => remove()),
  };
}

async function fetchWithTimeoutAndConsume<T>(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const linked = linkAbortSignals([options.signal, signal]);
  const onLinkedAbort = () => controller.abort(linked.signal.reason);
  if (linked.signal.aborted) onLinkedAbort();
  else linked.signal.addEventListener("abort", onLinkedAbort, { once: true });
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return await consume(response);
  } finally {
    clearTimeout(timeoutId);
    linked.signal.removeEventListener("abort", onLinkedAbort);
    linked.cleanup();
  }
}

export async function fetchJsonWithTimeout<T = unknown>(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ response: Response; data?: T; errorBody?: string }> {
  return fetchWithTimeoutAndConsume(url, options, timeoutMs, signal, async (response) => ({
    response,
    data: response.ok ? await response.json() as T : undefined,
    errorBody: !response.ok ? await response.text() : undefined,
  }));
}

// ============== EXA FUNCTIONS ==============

type ExaSearchOptions = {
  includeDomains?: string[];
  category?: ExaSearchCategory;
};

// Exa's current API exposes includeDomains/category as first-class fields.
// Keep query text about the topic itself instead of embedding site: operators.
export async function exaSearch(
  query: string,
  signal?: AbortSignal,
  options: ExaSearchOptions = {},
): Promise<ExaResult[]> {
  const apiKey = Deno.env.get("EXA_API_KEY");
  if (!apiKey) {
    console.warn("[EXA] EXA_API_KEY not configured");
    return [];
  }
  try {
    throwIfAborted(signal);
    const { response, data } = await fetchJsonWithTimeout<{ results?: unknown }>("https://api.exa.ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults: 10,
        ...(options.includeDomains?.length ? { includeDomains: options.includeDomains } : {}),
        ...(options.category ? { category: options.category } : {}),
        contents: { text: { maxCharacters: 10000 } },
      }),
    }, 30000, signal);
    throwIfAborted(signal);
    if (!response.ok) {
      console.warn(`[EXA] Search failed (${response.status}) for: ${query}`);
      return [];
    }
    if (!data?.results || !Array.isArray(data.results)) return [];
    return data.results.map((r: { title?: string; url?: string; text?: string; publishedDate?: string }) => ({
      title: r.title,
      url: r.url,
      content: r.text,
      publishedDate: r.publishedDate,
    }));
  } catch (err) {
    if (signal?.aborted) throw err;
    console.warn(`[EXA] Search failed for: ${query}`);
    return [];
  }
}

async function exaSearchWithFallback(request: SearchRequest, signal?: AbortSignal): Promise<ExaResult[]> {
  const hasFilter = Boolean(request.category || request.includeDomains?.length);
  const filtered = await exaSearch(request.query, signal, {
    includeDomains: request.includeDomains,
    category: request.category,
  });
  if (filtered.length > 0 || !hasFilter) return filtered;

  console.warn(`[EXA] Filtered search returned no results; retrying without filters: ${request.query}`);
  return exaSearch(request.query, signal);
}

function preferredFollowUpRequest(query: string, preferredSourceType: string): SearchRequest {
  if (preferredSourceType === "government") {
    return { query, includeDomains: GOVERNMENT_SEARCH_DOMAINS };
  }
  if (preferredSourceType === "academic") return { query, category: "research paper" };
  if (preferredSourceType === "news") return { query, category: "news" };
  return { query };
}

// exaGetContents: extract full text from a specific URL using Exa's /contents endpoint
export async function exaGetContents(url: string, signal?: AbortSignal): Promise<string> {
  const apiKey = Deno.env.get("EXA_API_KEY");
  if (!apiKey) {
    console.warn("[EXA] EXA_API_KEY not configured");
    return "";
  }
  try {
    throwIfAborted(signal);
    const { response, data } = await fetchJsonWithTimeout<{ results?: unknown }>("https://api.exa.ai/contents", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ urls: [url], text: { maxCharacters: 8000 } }),
    }, 30000, signal);
    throwIfAborted(signal);
    if (!response.ok) {
      console.warn(`[EXA] Contents fetch failed (${response.status}) for: ${url}`);
      return "";
    }
    if (!data?.results || !Array.isArray(data.results) || data.results.length === 0) return "";
    return (data.results[0]?.text || "").slice(0, 8000);
  } catch (err) {
    if (signal?.aborted) throw err;
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
  throwIfAborted(deps.signal);
  const context = history.slice(-4).map((m) => `${m.role}: ${m.content}`).join("\n");
  const prompt = `${context ? `Recent conversation:\n${context}\n\n` : ""}User message:\n${message}`;

  try {
    const decisionResult = await deps.callModel({
      provider: deps.provider,
      model: deps.model,
      systemPrompt: ASK_SEARCH_DECISION_PROMPT,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      signal: deps.signal,
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
    if (deps.signal?.aborted) throw err;
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
  throwIfAborted(deps.signal);
  const prompt = `Claim: "${claim}"\n\nCurrent search results:\n${currentResults.slice(0, 3000)}\n\nGenerate 2-3 specific follow-up queries to find more evidence.`;
  try {
    const result = await deps.callModel({
      provider: deps.provider,
      model: deps.model,
      systemPrompt: QUERY_GENERATION_PROMPT,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      signal: deps.signal,
    });
    const parsed = typeof result.output === "object" && result.output !== null ? result.output : {};
    if (Array.isArray((parsed as { queries?: string[] }).queries)) {
      return (parsed as { queries: string[] }).queries.slice(0, 3);
    }
    return [];
  } catch (err) {
    if (deps.signal?.aborted) throw err;
    console.warn("[DEEP RESEARCH] Failed to generate follow-up queries:", err);
    return [];
  }
}

async function deepResearchInner(
  claim: string,
  region: string,
  deps: ResearchDeps,
  options: ResearchOptions,
  context: ResearchContext = emptyResearchContext(),
  signal?: AbortSignal
): Promise<ResearchContext> {
  throwIfAborted(signal);
  console.log(`[RESEARCH] Starting (mode: ${options.maxFollowUpQueries > 0 ? "deep" : "light"}) for: ${claim}`);

  const preferredSourceType = options.preferredSourceType || "any";
  const seedRequests = buildSearchRequests(claim, region, preferredSourceType, options.timeframe).slice(0, options.maxSeedQueries);
  const allResults: Array<ExaResult & { query: string }> = [];
  const matchesPreferredSourceType = (result: RankedSearchResult) => (
    preferredSourceType === "any" ||
    result.sourceType === preferredSourceType
  );

  const seedResults = await Promise.all(seedRequests.map(async (request) => {
    const results = await exaSearchWithFallback(request, signal);
    throwIfAborted(signal);
    const ranked = rankSearchResults(results.map((result) => ({ ...result, query: request.query })), claim, preferredSourceType);
    const visibleRanked = preferredSourceType === "any" ? ranked : ranked.filter(matchesPreferredSourceType);
    context.searches.push({ query: request.query, results: formatRankedSearchResults(visibleRanked) });
    console.log(`[RESEARCH] Seed query "${request.query}": ${results.length} results`);
    return results.map((result) => ({ ...result, query: request.query }));
  }));
  seedResults.forEach((results) => allResults.push(...results));

  const initialRanked = rankSearchResults(allResults, claim, preferredSourceType);
  const initialText = formatRankedSearchResults(initialRanked.slice(0, 12));

  // Round 2: AI generates follow-up queries (skipped in light mode)
  if (options.maxFollowUpQueries > 0) {
    const followUpQueries = await generateFollowUpQueries(claim, initialText, deps);
    throwIfAborted(signal);
    console.log(`[RESEARCH] Follow-up queries: ${followUpQueries.join(", ")}`);

    const followUpPromises = followUpQueries.slice(0, options.maxFollowUpQueries).map(async (query) => {
      const request = preferredFollowUpRequest(query, preferredSourceType);
      const results = await exaSearchWithFallback(request, signal);
      throwIfAborted(signal);
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
  const nonWeakCount = context.rankedResults.filter((r) => r.qualityLabel !== "weak").length;
  const urlsToRead = readCandidates
    .filter((result) => result.qualityLabel !== "weak" || nonWeakCount < 2)
    .slice(0, options.maxUrlsToRead);

  const readPromises = urlsToRead.map(async (result) => {
    const url = result.url || "";
    const content = await exaGetContents(url, signal);
    throwIfAborted(signal);
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
  const linked = linkAbortSignals([deps.signal]);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const work = deepResearchInner(
    claim,
    region,
    { ...deps, signal: linked.signal },
    options,
    partial,
    linked.signal,
  );
  try {
    const result = await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          try {
            deps.onTimeout?.();
          } catch (callbackError) {
            console.warn("[RESEARCH] Timeout accounting callback failed:", callbackError);
          }
          linked.abort(new Error("Research timeout"));
          reject(new Error("Research timeout"));
        }, options.overallTimeoutMs);
      }),
    ]);
    return result;
  } catch (err) {
    console.warn(`[RESEARCH] Timed out or failed after ${options.overallTimeoutMs}ms:`, err);
    // Return promptly after aborting. Production providers honor the signal;
    // any non-cooperative late work is detached and must not affect usage.
    return {
      searches: [...partial.searches],
      rankedResults: [...partial.rankedResults],
      readContent: [...partial.readContent],
      verifiedUrls: new Set(partial.verifiedUrls),
    };
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    linked.cleanup();
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
    if (!page.result) continue; // Fail closed: unranked pages stay fallback context
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
 * content carries an explicit strong or moderate label. Anything else,
 * including fetched pages without ranking metadata, fails closed to
 * unverified. Weak sources may appear as fallback context, never as evidence.
 */
export function applyFactoidsVerification(
  output: unknown,
  research: ResearchContext
): void {
  if (!output || typeof output !== "object" || !("factoids" in output)) return;
  const factoids = (output as { factoids: Array<{ citation?: { url?: string; verified?: string } }> }).factoids;
  if (!Array.isArray(factoids)) return;

  for (const factoid of factoids) {
    if (!factoid || typeof factoid !== "object" || Array.isArray(factoid)) continue;
    const citation = (factoid as { citation?: unknown }).citation;
    if (!citation || typeof citation !== "object" || Array.isArray(citation)) continue;
    const typedCitation = citation as { url?: unknown; verified?: string };
    const url = typeof typedCitation.url === "string" ? typedCitation.url : "";
    const fetched = url && research.verifiedUrls.has(url)
      ? research.readContent.find((page) => page.url === url)
      : undefined;
    const quality = fetched?.result?.qualityLabel;
    typedCitation.verified = quality === "strong" || quality === "moderate" ? "verified" : "unverified";
  }
}
