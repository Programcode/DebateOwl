export type ExaResult = {
  title?: string;
  url?: string;
  content?: string;
  description?: string;
  publishedDate?: string;
};

export type SourceType = "official" | "results" | "academic" | "government" | "news" | "encyclopedia" | "video" | "social" | "generic";

export type RankedSearchResult = ExaResult & {
  query: string;
  sourceType: SourceType;
  qualityScore: number;
  qualityLabel: "strong" | "moderate" | "weak";
  qualityReasons: string[];
};

export type ResearchSource = {
  title: string;
  url: string;
  verified: boolean;
  sourceType: SourceType;
  qualityScore: number;
  qualityLabel: "strong" | "moderate" | "weak";
};

export type ExaSearchCategory = "news" | "publication";

export type ExaSearchRequest = {
  query: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  category?: ExaSearchCategory;
};

const WEAK_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "wikipedia.org",
  "reddit.com",
  "quora.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "medium.com",
];

const DEBATE_RESULT_DOMAINS = [
  "tabbycat.com",
  "*.tabbycat.com",
  "calicotab.com",
  "*.calicotab.com",
  "tabroom.com",
  "debatekeeper.com",
];

export const GOVERNMENT_SEARCH_DOMAINS = [
  "usa.gov",
  "congress.gov",
  "census.gov",
  "bls.gov",
  "bea.gov",
  "energy.gov",
  "epa.gov",
  "cdc.gov",
  "nih.gov",
  "justice.gov",
  "federalregister.gov",
  "supremecourt.gov",
  "gov.uk",
  "supremecourt.uk",
  "canada.ca",
  "gc.ca",
  "gov.au",
  "abs.gov.au",
  "europa.eu",
  "ec.europa.eu",
  "eurostat.ec.europa.eu",
  "worldbank.org",
  "oecd.org",
  "imf.org",
  "un.org",
  "who.int",
];

const LEGAL_PRIMARY_DOMAINS = [
  ...GOVERNMENT_SEARCH_DOMAINS,
  "curia.europa.eu",
];

const RESULTS_PATTERNS = [
  /\btab\b/i,
  /\btabs\b/i,
  /\bresults?\b/i,
  /\bstandings?\b/i,
  /\brankings?\b/i,
  /\btournament\b/i,
  /\bballot\b/i,
  /\bfinals?\b/i,
];

const OFFICIAL_DEBATE_PATTERNS = [
  /\bwsdc\b/i,
  /\bwudc\b/i,
  /\bworld schools debating championships?\b/i,
  /\bworld universities debating championships?\b/i,
  /\bdebating championship\b/i,
  /\bdebate tournament\b/i,
  /\btabbycat\b/i,
  /\bcalicotab\b/i,
];

const POLICY_STAT_PATTERNS = [
  /\b(policy|statistics?|data|poverty|income|education|health|energy|climate|inflation|gdp|employment|crime)\b/i,
];

const LEGAL_CURRENT_PATTERNS = [
  /\b(law|legal|court|supreme court|regulation|agency|statute|ruling|judgment|jurisprudence|legislation)\b/i,
];

function hostMatchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function hostFromUrl(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function tokenize(text: string): string[] {
  return Array.from(new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) || []));
}

function inferSourceType(result: ExaResult): SourceType {
  const url = result.url || "";
  const host = hostFromUrl(url);
  const haystack = `${result.title || ""} ${url} ${result.content || result.description || ""}`;

  if (
    /(^|\.)gov(\.|$)|\.gov\//i.test(host) || /\.europa\.eu$/i.test(host) ||
    GOVERNMENT_SEARCH_DOMAINS.some((domain) => hostMatchesDomain(host, domain))
  ) return "government";
  if (/\.edu$/i.test(host) || /\.ac\.[a-z]{2}$/i.test(host) || /\b(arxiv|jstor|ssrn|pubmed|springer|sciencedirect|nature|science\.org)\b/i.test(host)) return "academic";
  if (/\b(youtube\.com|youtu\.be)\b/i.test(host)) return "video";
  if (/\b(wikipedia\.org)\b/i.test(host)) return "encyclopedia";
  if (/\b(reddit\.com|quora\.com|facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com)\b/i.test(host)) return "social";
  if (RESULTS_PATTERNS.some((pattern) => pattern.test(haystack))) return "results";
  if (/\b(official|federation|association|championship|tournament|league|society|committee)\b/i.test(haystack)) return "official";
  if (/\b(reuters|apnews|bbc|guardian|nytimes|economist|financialtimes|ft\.com|bloomberg|aljazeera|politico)\b/i.test(host)) return "news";
  return "generic";
}

function recencyScore(result: ExaResult, claim: string): number {
  const requestedYears = tokenize(claim).filter((token) => /^202[0-9]$/.test(token));
  const dateText = `${result.publishedDate || ""} ${result.title || ""} ${result.url || ""} ${result.content || ""}`;
  if (requestedYears.some((year) => dateText.includes(year))) return 12;
  if (/\b2026\b/.test(dateText)) return 10;
  if (/\b2025\b/.test(dateText)) return 8;
  if (/\b2024\b/.test(dateText)) return 4;
  return 0;
}

function typeScore(sourceType: SourceType, preferredSourceType?: string): number {
  if (preferredSourceType && preferredSourceType !== "any") {
    if (preferredSourceType === "government" && sourceType === "government") return 28;
    if (preferredSourceType === "academic" && sourceType === "academic") return 28;
    if (preferredSourceType === "news" && sourceType === "news") return 22;
  }

  switch (sourceType) {
    case "official": return 24;
    case "results": return 24;
    case "government": return 22;
    case "academic": return 20;
    case "news": return 10;
    case "generic": return 0;
    case "encyclopedia": return -18;
    case "video": return -24;
    case "social": return -28;
  }
}

function specificityScore(result: ExaResult, claim: string): number {
  const claimTokens = tokenize(claim).filter((token) => !["best", "should", "would", "with", "that", "from", "this", "have"].includes(token));
  if (claimTokens.length === 0) return 0;

  const haystack = `${result.title || ""} ${result.url || ""} ${result.content || result.description || ""}`.toLowerCase();
  const matches = claimTokens.filter((token) => haystack.includes(token)).length;
  return Math.min(22, Math.round((matches / Math.min(claimTokens.length, 8)) * 22));
}

function domainBonus(result: ExaResult, claim: string): number {
  const url = result.url || "";
  const host = hostFromUrl(url);
  const haystack = `${result.title || ""} ${url} ${result.content || ""}`;
  let score = 0;

  if (WEAK_DOMAINS.some((domain) => hostMatchesDomain(host, domain))) score -= 30;
  if (/\b(tabbycat|calicotab|tabroom|debatekeeper)\b/i.test(haystack)) score += 18;
  if (OFFICIAL_DEBATE_PATTERNS.some((pattern) => pattern.test(`${claim} ${haystack}`)) && /(org|edu|ac\.)/i.test(host)) score += 10;
  if (/\/(results?|tabs?|standings?|rankings?|tournament|participants|draw)\b/i.test(url)) score += 10;
  if (/\.(pdf)$/i.test(url)) score += 4;
  if (/\/search[/?]|[?&]q=/.test(url)) score -= 14;
  if ((result.content || result.description || "").length < 240) score -= 8;

  return score;
}

export function rankSearchResults(
  results: Array<ExaResult & { query?: string }>,
  claim: string,
  preferredSourceType = "any",
): RankedSearchResult[] {
  const seen = new Set<string>();

  return results
    .filter((result) => result.url)
    .map((result) => {
      const sourceType = inferSourceType(result);
      const qualityReasons: string[] = [];
      const specificity = specificityScore(result, claim);
      const recency = recencyScore(result, claim);
      const score =
        35 +
        typeScore(sourceType, preferredSourceType) +
        specificity +
        recency +
        domainBonus(result, claim);

      if (["official", "results", "government", "academic"].includes(sourceType)) qualityReasons.push(`${sourceType} source`);
      if (["encyclopedia", "video", "social"].includes(sourceType)) qualityReasons.push(`${sourceType} fallback`);
      if (recency > 0) qualityReasons.push("recent or year-matched");
      if (specificity >= 12) qualityReasons.push("specific to query");

      const qualityScore = Math.max(0, Math.min(100, score));
      const qualityLabel: RankedSearchResult["qualityLabel"] = qualityScore >= 70 ? "strong" : qualityScore >= 45 ? "moderate" : "weak";

      return {
        ...result,
        query: result.query || "",
        sourceType,
        qualityScore,
        qualityLabel,
        qualityReasons,
      };
    })
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .filter((result) => {
      const url = result.url || "";
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

function publishedDateRangeFromTimeframe(timeframe: string): Pick<ExaSearchRequest, "startPublishedDate" | "endPublishedDate"> {
  const years = timeframe.match(/\b(?:19|20)\d{2}\b/g)?.map(Number) ?? [];
  if (years.length === 0) return {};
  return {
    startPublishedDate: `${Math.min(...years)}-01-01T00:00:00.000Z`,
    endPublishedDate: `${Math.max(...years)}-12-31T23:59:59.999Z`,
  };
}

function filtersForSourceType(preferredSourceType: string, timeframe: string): Omit<ExaSearchRequest, "query"> {
  const publishedDateRange = publishedDateRangeFromTimeframe(timeframe);
  if (preferredSourceType === "government") {
    return {
      includeDomains: GOVERNMENT_SEARCH_DOMAINS,
      excludeDomains: WEAK_DOMAINS,
      ...publishedDateRange,
    };
  }
  if (preferredSourceType === "academic") {
    return {
      category: "publication",
      excludeDomains: WEAK_DOMAINS,
      ...publishedDateRange,
    };
  }
  if (preferredSourceType === "news") {
    return {
      category: "news",
      excludeDomains: WEAK_DOMAINS,
      ...publishedDateRange,
    };
  }
  return {
    excludeDomains: WEAK_DOMAINS,
    ...publishedDateRange,
  };
}

export function buildFollowUpSearchRequest(
  query: string,
  preferredSourceType = "any",
  timeframe = "",
): ExaSearchRequest {
  return { query, ...filtersForSourceType(preferredSourceType, timeframe) };
}

export function buildSearchRequests(claim: string, region = "", preferredSourceType = "any", timeframe = ""): ExaSearchRequest[] {
  const base = `${claim} ${region}`.trim().replace(/\s+/g, " ");
  const years = timeframe || (/\b202[0-9]\b/.test(base) ? "" : "2025 2026");
  const requests: ExaSearchRequest[] = [];
  const add = (query: string, filters: Omit<ExaSearchRequest, "query"> = {}) => {
    requests.push({ query: query.trim(), excludeDomains: WEAK_DOMAINS, ...filters });
  };
  const publishedDateRange = publishedDateRangeFromTimeframe(timeframe);

  // Topic-specific queries first (highest priority)
  if (OFFICIAL_DEBATE_PATTERNS.some((pattern) => pattern.test(base)) || /\bdebate|debating\b/i.test(base)) {
    add(`${base} official tournament results`, { includeDomains: DEBATE_RESULT_DOMAINS });
    add(`${base} Tabbycat Calicotab results`, { includeDomains: DEBATE_RESULT_DOMAINS });
  }

  if (POLICY_STAT_PATTERNS.some((pattern) => pattern.test(base))) {
    add(`${base} World Bank OECD IMF UN data ${years}`, {
      includeDomains: GOVERNMENT_SEARCH_DOMAINS,
      ...publishedDateRange,
    });
    add(`${base} government statistics report ${years}`, {
      includeDomains: GOVERNMENT_SEARCH_DOMAINS,
      ...publishedDateRange,
    });
  }

  if (LEGAL_CURRENT_PATTERNS.some((pattern) => pattern.test(base))) {
    add(`${base} official law court ruling ${years}`, {
      includeDomains: LEGAL_PRIMARY_DOMAINS,
      ...publishedDateRange,
    });
    add(`${base} primary source legislation regulation ${years}`, {
      includeDomains: LEGAL_PRIMARY_DOMAINS,
      ...publishedDateRange,
    });
  }

  // Preferred source type queries
  if (preferredSourceType === "government") add(`${base} government evidence ${years}`, filtersForSourceType("government", timeframe));
  if (preferredSourceType === "academic") add(`${base} study journal research ${years}`, filtersForSourceType("academic", timeframe));
  if (preferredSourceType === "news") add(`${base} current reporting ${years}`, filtersForSourceType("news", timeframe));

  // General fallback queries
  add(`${base} official data evidence ${years}`, filtersForSourceType(preferredSourceType, timeframe));
  add(`${base} statistics report study ${years}`, filtersForSourceType(preferredSourceType, timeframe));

  // Deduplicate by token overlap: skip when more than 85% of the smaller query's tokens already appear in an accepted query
  const deduplicated: ExaSearchRequest[] = [];
  for (const request of requests) {
    const qTokens = new Set(request.query.toLowerCase().split(/\s+/));
    const isDuplicate = deduplicated.some((existing) => {
      const existingTokens = new Set(existing.query.toLowerCase().split(/\s+/));
      const intersection = [...qTokens].filter((t) => existingTokens.has(t)).length;
      const smaller = Math.min(qTokens.size, existingTokens.size);
      const sameFilters = JSON.stringify({
        includeDomains: existing.includeDomains ?? [],
        excludeDomains: existing.excludeDomains ?? [],
        category: existing.category ?? null,
        startPublishedDate: existing.startPublishedDate ?? null,
        endPublishedDate: existing.endPublishedDate ?? null,
      }) === JSON.stringify({
        includeDomains: request.includeDomains ?? [],
        excludeDomains: request.excludeDomains ?? [],
        category: request.category ?? null,
        startPublishedDate: request.startPublishedDate ?? null,
        endPublishedDate: request.endPublishedDate ?? null,
      });
      return sameFilters && smaller > 0 && intersection / smaller > 0.85;
    });
    if (!isDuplicate) deduplicated.push(request);
  }

  return deduplicated.slice(0, 6);
}

export function buildSearchQueries(claim: string, region = "", preferredSourceType = "any", timeframe = ""): string[] {
  return buildSearchRequests(claim, region, preferredSourceType, timeframe).map((request) => request.query);
}

// Bounded per-result snippet: Exa may return up to 10k characters per result,
// which would bloat prompts when several results are included.
const MAX_RESULT_SNIPPET_CHARS = 1200;

export function formatRankedSearchResults(results: RankedSearchResult[]): string {
  return results.map((r) => [
    `Title: ${r.title || "Untitled"}`,
    `URL: ${r.url}`,
    `Source type: ${r.sourceType}`,
    `Quality: ${r.qualityLabel} (${r.qualityScore})`,
    `Why selected: ${r.qualityReasons.join(", ") || "general relevance"}`,
    `Content: ${(r.content || r.description || "").slice(0, MAX_RESULT_SNIPPET_CHARS)}`,
    "---",
  ].join("\n")).join("\n");
}

export function sourceTitleFromUrl(url: string): string {
  return hostFromUrl(url) || url;
}
