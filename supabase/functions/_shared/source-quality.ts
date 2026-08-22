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

  if (/(^|\.)gov(\.|$)|\.gov\//i.test(host) || /\.europa\.eu$/i.test(host)) return "government";
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

  if (WEAK_DOMAINS.some((domain) => host.endsWith(domain))) score -= 30;
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
      const score =
        35 +
        typeScore(sourceType, preferredSourceType) +
        specificityScore(result, claim) +
        recencyScore(result, claim) +
        domainBonus(result, claim);

      if (["official", "results", "government", "academic"].includes(sourceType)) qualityReasons.push(`${sourceType} source`);
      if (["encyclopedia", "video", "social"].includes(sourceType)) qualityReasons.push(`${sourceType} fallback`);
      if (recencyScore(result, claim) > 0) qualityReasons.push("recent or year-matched");
      if (specificityScore(result, claim) >= 12) qualityReasons.push("specific to query");

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

export function buildSearchQueries(claim: string, region = "", preferredSourceType = "any", timeframe = ""): string[] {
  const base = `${claim} ${region}`.trim().replace(/\s+/g, " ");
  const years = timeframe || (/\b202[0-9]\b/.test(base) ? "" : "2025 2026");
  const queries: string[] = [];

  // Topic-specific queries first (highest priority)
  if (OFFICIAL_DEBATE_PATTERNS.some((pattern) => pattern.test(base)) || /\bdebate|debating\b/i.test(base)) {
    queries.push(`${base} tab results official`.trim());
    queries.push(`${base} Tabbycat Calicotab results`.trim());
  }

  if (POLICY_STAT_PATTERNS.some((pattern) => pattern.test(base))) {
    queries.push(`${base} World Bank OECD IMF UN data ${years}`.trim());
    queries.push(`${base} government statistics report ${years}`.trim());
  }

  if (LEGAL_CURRENT_PATTERNS.some((pattern) => pattern.test(base))) {
    queries.push(`${base} official law court ruling ${years}`.trim());
    queries.push(`${base} primary source legislation regulation ${years}`.trim());
  }

  // Preferred source type queries
  if (preferredSourceType === "government") queries.push(`${base} site:gov ${years}`.trim());
  if (preferredSourceType === "academic") queries.push(`${base} study journal university ${years}`.trim());
  if (preferredSourceType === "news") queries.push(`${base} Reuters AP BBC report ${years}`.trim());

  // General fallback queries
  queries.push(`${base} official data evidence ${years}`.trim());
  queries.push(`${base} statistics report study ${years}`.trim());

  // Deduplicate by checking token overlap (>80% overlap = skip)
  const deduplicated: string[] = [];
  for (const q of queries) {
    const qTokens = new Set(q.toLowerCase().split(/\s+/));
    const isDuplicate = deduplicated.some((existing) => {
      const existingTokens = new Set(existing.toLowerCase().split(/\s+/));
      const intersection = [...qTokens].filter((t) => existingTokens.has(t)).length;
      const smaller = Math.min(qTokens.size, existingTokens.size);
      return smaller > 0 && intersection / smaller > 0.85;
    });
    if (!isDuplicate) deduplicated.push(q);
  }

  return deduplicated.slice(0, 6);
}

export function formatRankedSearchResults(results: RankedSearchResult[]): string {
  return results.map((r) => [
    `Title: ${r.title || "Untitled"}`,
    `URL: ${r.url}`,
    `Source type: ${r.sourceType}`,
    `Quality: ${r.qualityLabel} (${r.qualityScore})`,
    `Why selected: ${r.qualityReasons.join(", ") || "general relevance"}`,
    `Content: ${r.content || r.description || ""}`,
    "---",
  ].join("\n")).join("\n");
}

export function sourceTitleFromUrl(url: string): string {
  return hostFromUrl(url) || url;
}
