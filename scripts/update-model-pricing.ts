// Refresh the model pricing snapshot from official provider pricing pages.
//
// Usage: npx tsx scripts/update-model-pricing.ts
//
// What it does:
//   1. Downloads the official pricing pages into docs/pricing-snapshots/.
//   2. Records retrieval timestamp, source URL, and sha256 per file.
//   3. Verifies every model id listed below appears in its provider page.
//   4. Reports which models were found, missing, or renamed.
//
// What it deliberately does NOT do: auto-rewrite
// supabase/functions/_shared/model-pricing.ts. Provider pages change layout
// often and silent mis-parsing would fabricate prices, which the cost
// calculator must never do. When verification reports a change, update the
// MODEL_PRICING entries by hand from the fresh snapshot and bump
// PRICING_SNAPSHOT_ID.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_DIR = join(ROOT, "docs", "pricing-snapshots");

const SOURCES = [
  { provider: "openai", url: "https://platform.openai.com/docs/pricing.md", file: "openai.md" },
  { provider: "anthropic", url: "https://platform.claude.com/docs/en/about-claude/pricing.md", file: "anthropic.md" },
  // Google serves HTML only; no official .md endpoint.
  { provider: "google", url: "https://ai.google.dev/gemini-api/docs/pricing", file: "google-gemini.html" },
];

const TRACKED_MODELS: Record<string, string[]> = {
  openai: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-4o", "gpt-4o-mini"],
  anthropic: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  // gemini-3.1-flash-lite-preview has no entry on the official page; it stays
  // listed here so each refresh run reports it MISSING instead of forgetting it.
  google: ["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-3.5-flash", "gemini-3.1-flash-lite-preview"],
};

// "claude-opus-4-7" -> "Claude Opus 4.7", "gemini-3.1-pro-preview" -> "Gemini 3.1 Pro Preview".
function displayLabel(model: string): string {
  const base = model.replace(/-\d{8}$/, ""); // drop date suffixes like -20251001
  const out: string[] = [];
  let digits: string[] = [];
  for (const token of base.split("-")) {
    if (/^\d+$/.test(token)) {
      digits.push(token);
      continue;
    }
    if (digits.length) {
      out.push(digits.join("."));
      digits = [];
    }
    out.push(token.charAt(0).toUpperCase() + token.slice(1));
  }
  if (digits.length) out.push(digits.join("."));
  return out.join(" ");
}

async function main() {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const retrievedAt = new Date().toISOString();
  const findings: Record<string, string> = {};
  const sources = [];

  for (const source of SOURCES) {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`${source.provider}: HTTP ${response.status} from ${source.url}`);
    const body = await response.text();
    const file = join(SNAPSHOT_DIR, source.file);
    writeFileSync(file, body);
    const sha256 = createHash("sha256").update(body).digest("hex");
    sources.push({ ...source, url: source.url.replace(/\.md$/, ""), format: source.url.endsWith(".md") ? "markdown (official .md endpoint)" : "html", sha256 });

    // Strip docs-navigation links so a model id appearing only as a URL is not
    // mistaken for a pricing entry.
    const pricingBody = body.replace(/\/gemini-api\/docs\/models\/[a-z0-9.-]+/g, "");

    for (const model of TRACKED_MODELS[source.provider] ?? []) {
      // Match either the raw id or its human label (e.g. "Claude Opus 4.7").
      findings[model] = pricingBody.includes(model) || pricingBody.includes(displayLabel(model))
        ? "found in current page"
        : "NOT FOUND in current page; treat as unknown-priced until verified";
    }
  }

  const metadataPath = join(SNAPSHOT_DIR, "metadata.json");
  let previousModelFindings: Record<string, string> = {};
  try {
    previousModelFindings = JSON.parse(readFileSync(metadataPath, "utf8")).modelFindings ?? {};
  } catch { /* first run */ }

  const metadata = {
    snapshotId: `official-docs-${retrievedAt.slice(0, 10)}`,
    retrievedAt,
    currency: "USD",
    sources,
    modelFindings: findings,
    billingNotes: {
      openai: "reasoning tokens are billed as output tokens and are included in completion_tokens; cached input is a subset of prompt_tokens",
      anthropic: "input_tokens excludes cache_creation_input_tokens and cache_read_input_tokens; output_tokens includes thinking",
      google: "output price includes thinking tokens; candidatesTokenCount excludes thoughtsTokenCount, so billable output = candidates + thoughts",
    },
  };
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n");

  console.log(`Snapshot refreshed at ${retrievedAt}`);
  for (const [model, status] of Object.entries(findings)) {
    const marker = status.startsWith("found") ? "OK     " : "MISSING";
    console.log(`  ${marker} ${model} (${status})`);
  }
  const changed = Object.entries(findings).filter(([m, s]) => previousModelFindings[m] !== s);
  if (changed.length > 0) {
    console.log("\nModel findings changed since last run. Review docs/pricing-snapshots/, then update");
    console.log("supabase/functions/_shared/model-pricing.ts by hand and bump PRICING_SNAPSHOT_ID.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
