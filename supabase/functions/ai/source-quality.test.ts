import { buildSearchQueries, rankSearchResults } from "./source-quality.ts";

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
  const queries = buildSearchQueries("best country in WSDC debate 2026");
  assert(queries.some((query) => /tabbycat|calicotab/i.test(query)), `Expected tab search query, got ${queries.join("; ")}`);
  assert(queries.some((query) => /official/i.test(query)), `Expected official search query, got ${queries.join("; ")}`);
});

Deno.test("search query builder adds policy and statistics source queries", () => {
  const queries = buildSearchQueries("solar energy costs and inflation policy", "United States", "any", "2024 2025");
  assert(queries.some((query) => /World Bank|OECD|IMF|UN/i.test(query)), `Expected intergovernmental source query, got ${queries.join("; ")}`);
  assert(queries.some((query) => /government agency statistics/i.test(query)), `Expected government statistics query, got ${queries.join("; ")}`);
});

Deno.test("search query builder adds legal primary-source queries", () => {
  const queries = buildSearchQueries("new court ruling on social media regulation", "European Union");
  assert(queries.some((query) => /official law court agency/i.test(query)), `Expected official legal source query, got ${queries.join("; ")}`);
  assert(queries.some((query) => /primary source statute ruling regulation/i.test(query)), `Expected primary source query, got ${queries.join("; ")}`);
});
