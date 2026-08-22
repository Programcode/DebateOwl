import {
  applyFactoidsVerification,
  buildDiscoveredSources,
  emptyResearchContext,
  getResearchSources,
  type ResearchContext,
} from "./research.ts";

function ctxWith(overrides: Partial<ResearchContext>): ResearchContext {
  return { ...emptyResearchContext(), ...overrides };
}

Deno.test("factoid citations backed by strong or moderate fetched sources stay verified", () => {
  const research = ctxWith({
    readContent: [
      { url: "https://data.gov/report", title: "Report", content: "x", result: { query: "q", sourceType: "government", qualityScore: 80, qualityLabel: "strong", qualityReasons: [] } },
    ],
    verifiedUrls: new Set(["https://data.gov/report"]),
  });
  const output = {
    factoids: [{ citation: { url: "https://data.gov/report", verified: "pending" } }],
  };
  applyFactoidsVerification(output, research);
  if (output.factoids[0].citation.verified !== "verified") throw new Error("strong source should stay citable");
});

Deno.test("factoid citations pointing at weak fetched sources are downgraded to unverified", () => {
  const research = ctxWith({
    readContent: [
      { url: "https://reddit.com/r/thread", title: "Thread", content: "x", result: { query: "q", sourceType: "social", qualityScore: 10, qualityLabel: "weak", qualityReasons: [] } },
    ],
    verifiedUrls: new Set(["https://reddit.com/r/thread"]),
  });
  const output = {
    factoids: [{ citation: { url: "https://reddit.com/r/thread", verified: "pending" } }],
  };
  applyFactoidsVerification(output, research);
  if (output.factoids[0].citation.verified !== "unverified") throw new Error("quality floor violated: weak source kept verified");
});

Deno.test("factoid citations to unknown urls become unverified", () => {
  const output = { factoids: [{ citation: { url: "https://example.com/made-up", verified: "pending" } }] };
  applyFactoidsVerification(output, emptyResearchContext());
  if (output.factoids[0].citation.verified !== "unverified") throw new Error("unknown url must not be verified");
});

Deno.test("citable sources exclude weak results even when nothing else was fetched", () => {
  const research = ctxWith({
    rankedResults: [
      { title: "Weak", url: "https://forum.example/a", query: "", sourceType: "social", qualityScore: 5, qualityLabel: "weak", qualityReasons: [] },
      { title: "Solid", url: "https://gov.example/data", query: "", sourceType: "government", qualityScore: 75, qualityLabel: "strong", qualityReasons: ["government source"] },
    ],
  });
  const sources = getResearchSources(research);
  if (sources.length !== 1 || sources[0].url !== "https://gov.example/data") {
    throw new Error(`expected only the non-weak source, got ${JSON.stringify(sources.map((s) => s.url))}`);
  }
});

Deno.test("discovered sources keep ranking provenance including the originating query", () => {
  const research = ctxWith({
    readContent: [
      { url: "https://gov.example/data", title: "Data", content: "long content", result: { query: "policy statistics 2026", sourceType: "government", qualityScore: 82, qualityLabel: "strong", qualityReasons: ["government source"] } },
    ],
  });
  const discovered = buildDiscoveredSources(research);
  if (discovered.length !== 1) throw new Error("expected one discovered source");
  const item = discovered[0];
  if (item.qualityLabel !== "strong" || item.sourceType !== "government" || item.qualityScore !== 82) {
    throw new Error(`quality metadata missing: ${JSON.stringify(item)}`);
  }
  if (item.query !== "policy statistics 2026") throw new Error("originating query missing from provenance");
});
