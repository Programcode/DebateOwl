import { buildSearchRequests, rankSearchResults, researchCountryForLanguage } from "../_shared/source-quality.ts";

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

Deno.test("a Hungarian or Spanish request searches that country's sources first and keeps the international ones", () => {
  const motion = "Ez a ház eltörölné a házi feladatot az általános iskolákban";
  const international = buildSearchRequests(motion);
  const hungarian = buildSearchRequests(motion, "", "any", "", { language: "hu", country: "HU" });
  // First, so the seed-query limit (four) can never drop it.
  assert(hungarian[0].includeDomains?.includes("ksh.hu") === true, "the first Hungarian search must target Hungarian sources");
  assert(hungarian[0].query.includes("Magyarország"), `expected a Hungarian search, got ${hungarian[0].query}`);
  assert(JSON.stringify(hungarian.slice(1, 1 + 3)) === JSON.stringify(international.slice(0, 3)), "international fallback searches must follow unchanged");

  const spanish = buildSearchRequests("Esta casa prohibiría los deberes", "", "any", "", { language: "es" });
  assert(spanish[0].includeDomains?.includes("ine.es") === true, "the language alone must pick Spain's sources");
  assert(researchCountryForLanguage("hu") === "HU" && researchCountryForLanguage("es") === "ES", "language to country mapping changed");

  // English, an unknown country, or no locale at all: the requests are exactly as before.
  const before = JSON.stringify(buildSearchRequests("school phone ban", "United States", "government", "2024-2026"));
  for (const locale of [undefined, {}, { language: "en" }, { country: "ZZ" }]) {
    assert(JSON.stringify(buildSearchRequests("school phone ban", "United States", "government", "2024-2026", locale)) === before,
      `locale ${JSON.stringify(locale)} must not change the requests`);
  }
});

Deno.test("a Hungarian request ranks Hungarian pages above equally good foreign ones", () => {
  const content = "Official statistics report on homework time in primary schools, with survey data from 2025 and detailed methodology for each school year.";
  const results = [
    { title: "Homework report", url: "https://example.org/homework-report", content, publishedDate: "2025-03-01" },
    { title: "Homework report", url: "https://www.ksh.hu/homework-report", content, publishedDate: "2025-03-01" },
    { title: "Homework report", url: "https://news.example.hu/homework-report", content, publishedDate: "2025-03-01" },
  ];
  const plain = rankSearchResults(results, "homework primary schools");
  const hungarian = rankSearchResults(results, "homework primary schools", "any", { language: "hu" });
  const score = (ranked: typeof plain, host: string) => ranked.find((item) => item.url?.includes(host))!.qualityScore;
  assert(score(plain, "ksh.hu") === score(plain, "example.org"), "without a locale the pages must score the same");
  assert(score(hungarian, "ksh.hu") > score(hungarian, "example.org"), "a Hungarian statistics page must outrank a foreign one");
  assert(score(hungarian, "example.hu") > score(hungarian, "example.org"), "any .hu page must outrank a foreign one");
  assert(score(hungarian, "example.org") === score(plain, "example.org"), "foreign pages keep their score");
});
