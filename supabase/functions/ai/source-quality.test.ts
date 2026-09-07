import { buildSearchRequests, rankSearchResults } from "../_shared/source-quality.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("source ranking prefers official tab results over broad fallback pages", () => {
  const ranked = rankSearchResults([
    {
      title: "Best debating countries",
      url: "https://en.wikipedia.org/wiki/World_Schools_Debating_Championships",
      content: "World Schools Debating Championships overview",
      query: "best country debate 2026",
    },
    {
      title: "WSDC 2026 Tabbycat Results",
      url: "https://wsdc2026.calicotab.com/wsdc2026/results/",
      content: "Official tournament tab, final, teams, standings, speakers and results for WSDC 2026",
      query: "best country debate 2026",
    },
    {
      title: "Final debate video",
      url: "https://www.youtube.com/watch?v=abc",
      content: "Debate final recording",
      query: "best country debate 2026",
    },
  ], "best country in debate WSDC 2026");

  assert(ranked[0].url === "https://wsdc2026.calicotab.com/wsdc2026/results/", `Expected tab results first, got ${ranked[0].url}`);
  assert(ranked[0].qualityLabel === "strong", `Expected strong source, got ${ranked[0].qualityLabel}`);
  const videoScore = ranked.find((result) => result.url?.includes("youtube.com"))?.qualityScore;
  assert(typeof videoScore === "number" && videoScore < ranked[0].qualityScore, "Expected video fallback to score lower");
});

Deno.test("source ranking respects requested government source type", () => {
  const ranked = rankSearchResults([
    {
      title: "Think tank commentary",
      url: "https://example.org/report",
      content: "Commentary about energy prices",
      query: "solar cheaper than coal",
    },
    {
      title: "Energy cost data",
      url: "https://www.energy.gov/eere/solar/solar-energy-cost-data",
      content: "Official government data about solar energy costs and electricity generation",
      query: "solar cheaper than coal site:gov",
    },
  ], "solar cheaper than coal United States", "government");

  assert(ranked[0].sourceType === "government", `Expected government source first, got ${ranked[0].sourceType}`);
});

Deno.test("search query builder adds debate tab queries for tournament claims", () => {
  const requests = buildSearchRequests("best country in WSDC debate 2026");
  const queries = requests.map((request) => request.query);
  assert(queries.some((query) => /tabbycat|calicotab/i.test(query)), `Expected tab search query, got ${queries.join("; ")}`);
  assert(queries.some((query) => /official/i.test(query)), `Expected official search query, got ${queries.join("; ")}`);
  assert(
    requests.some((request) => request.includeDomains?.includes("*.tabbycat.com")),
    "Expected first-class debate result domain filters",
  );
});

Deno.test("search query builder adds policy and statistics source queries", () => {
  const queries = buildSearchRequests("solar energy costs and inflation policy", "United States", "any", "2024 2025").map((request) => request.query);
  assert(queries.some((query) => /World Bank|OECD|IMF|UN/i.test(query)), `Expected intergovernmental source query, got ${queries.join("; ")}`);
  assert(queries.some((query) => /government statistics/i.test(query)), `Expected government statistics query, got ${queries.join("; ")}`);
});

Deno.test("search query builder adds legal primary-source queries", () => {
  const queries = buildSearchRequests("new court ruling on social media regulation", "European Union").map((request) => request.query);
  assert(queries.some((query) => /official law court/i.test(query)), `Expected official legal source query, got ${queries.join("; ")}`);
  assert(queries.some((query) => /primary source/i.test(query)), `Expected primary source query, got ${queries.join("; ")}`);
});

Deno.test("preferred source filters use Exa fields instead of site operators", () => {
  const government = buildSearchRequests("solar costs", "United States", "government", "2024-2026");
  assert(government.every((request) => !request.query.includes("site:")), "site operators must not remain in query text");
  assert(government.some((request) => request.includeDomains?.includes("energy.gov")), "government domains must use includeDomains");
  assert(
    government.some((request) => request.startPublishedDate === "2024-01-01T00:00:00.000Z"),
    "timeframe must use startPublishedDate",
  );
  assert(
    government.some((request) => request.endPublishedDate === "2026-12-31T23:59:59.999Z"),
    "timeframe must use endPublishedDate",
  );

  const academic = buildSearchRequests("carbon pricing", "", "academic", "2023");
  assert(academic.some((request) => request.category === "publication"), "academic search must use publication category");

  const news = buildSearchRequests("election policy", "", "news", "2025-2026");
  assert(news.some((request) => request.category === "news"), "news search must use news category");
});

Deno.test("intergovernmental domains satisfy the government source preference", () => {
  const ranked = rankSearchResults([{
    title: "World development indicators",
    url: "https://data.worldbank.org/indicator/NY.GDP.MKTP.CD",
    content: "World Bank official indicator data with methodology and country statistics.",
  }], "GDP statistics", "government");
  assert(ranked[0]?.sourceType === "government", `Expected World Bank to classify as government, got ${ranked[0]?.sourceType}`);
});
