import { logUsage } from "../../_shared/entitlements.ts";
import { mergeNormalizedUsage } from "../../_shared/cost.ts";
import { callAI } from "../provider.ts";
import { isRecord } from "../request.ts";
import { cleanGeneratedText } from "../text.ts";
import { buildUserPrompt } from "../prompt-builder.ts";
import {
  buildDiscoveredSources,
  buildResearchContext,
  DEEP_RESEARCH,
  deepResearch,
  getResearchSources,
  withResearchPreferences,
} from "../../_shared/research.ts";
import { enforceGenerateControls, enforceGenerateSources } from "../../_shared/control-enforcement.ts";
import { boundPromptSources } from "../../_shared/prompts.ts";
import { JEV_MODEL } from "../../_shared/jev.ts";
import {
  identifyCaseSourceUsage,
  rankSourcesForRequest,
  type SourceAssessment,
  type SourceDecisionCandidate,
} from "../../_shared/source-decisions.ts";
import type { FeatureContext } from "./types.ts";

// GENERATE: Use deep research for evidence-backed arguments
export async function handleGenerate(ctx: FeatureContext): Promise<Response> {
  const feature = "generate" as const;
  const { req, userId, provider, model, reasoningEffort, workSignal, sources, sourceAssessments, sourceDecisionCandidates, researchDeps, startTime, researchUsageForLog, recordMainResult, buildSystemPromptFor, input: sanitizedInput } = ctx;
  const motion = String(sanitizedInput.motion || sanitizedInput.topic || "");
  const side = String(sanitizedInput.side || "pro");
  const format = String(sanitizedInput.format || "custom");
  const length = String(sanitizedInput.length || "standard");
  const role = String(sanitizedInput.role || "intro");

  // Perform deep research to find supporting evidence
  console.log("[GENERATE] Starting deep research for motion:", motion);
  ctx.stream?.phase("research");
  const research = await deepResearch(motion, "", researchDeps, withResearchPreferences(DEEP_RESEARCH, {
    preferredSourceType: "any",
  }));
  const discoveredSources = buildDiscoveredSources(research);
  const discoveredCandidates: SourceDecisionCandidate[] = discoveredSources.map((source) => ({
    key: source.url,
    title: source.title,
    content: source.content,
    origin: source.url,
    type: source.sourceType ?? "url",
    qualityScore: source.qualityScore,
    qualityLabel: source.qualityLabel,
  }));
  const discoveredRanking = await rankSourcesForRequest({
    feature,
    requestText: JSON.stringify(sanitizedInput),
    sources: discoveredCandidates,
    signal: workSignal,
  });
  const discoveredRankingUsage = discoveredRanking.jev?.usage ?? discoveredRanking.jevUsage;
  if (discoveredRankingUsage) await logUsage(userId, "jev_source_ranking", provider, JEV_MODEL, discoveredRankingUsage, undefined, discoveredRanking.jevUsage ? "error" : "success", discoveredRanking.jevUsage ? "jev_incomplete" : undefined);
  const discoveredAssessmentByKey = new Map(discoveredRanking.assessments.map((assessment) => [assessment.key, assessment]));
  const rankedDiscoveredSources = discoveredRanking.sources.map((candidate) => {
    const source = discoveredSources.find((item) => item.url === candidate.key)!;
    const assessment = discoveredAssessmentByKey.get(candidate.key);
    if (!assessment) return source;
    const semantic: {
      relevance: number;
      importance: 0 | 1 | 2 | 3;
      strength: 0 | 1 | 2 | 3;
      evaluatedAt: string;
      useCount: number;
      caseUseCount: number;
      lastUsedInCase?: boolean;
      lastUsedAt?: string;
    } = { relevance: assessment.relevance, importance: assessment.importance, strength: assessment.strength, evaluatedAt: assessment.evaluatedAt, useCount: 1, caseUseCount: 0 };
    return { ...source, semantic };
  });
  const discoveredOrder = new Map(discoveredRanking.sources.map((source, index) => [source.key, index]));
  research.readContent.sort((a, b) => (discoveredOrder.get(a.url) ?? Number.MAX_SAFE_INTEGER) - (discoveredOrder.get(b.url) ?? Number.MAX_SAFE_INTEGER));
  const searchContext = buildResearchContext(research);

  // Build prompt with research context
  const systemPrompt = await buildSystemPromptFor(feature, research);
  const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
  const messages = [{ role: "user", content: userPrompt }];
  const aiResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, reasoningEffort, "generate", workSignal, ctx.stream));
  const output = cleanGeneratedText(aiResult.output);

  // Preserve model evidence warnings when research exists. If research
  // returned no usable material, every contention still needs a source.
  if (output && typeof output === "object" && "contentions" in output) {
    const contentions = (output as { contentions?: unknown }).contentions;
    const hasUsableSources = getResearchSources(research).length > 0 || boundPromptSources(sources).length > 0;
    if (Array.isArray(contentions) && !hasUsableSources) {
      for (const contention of contentions) {
        if (contention && typeof contention === "object") {
          Object.assign(contention, { needsSource: true });
        }
      }
    }
  }

  // Post-process: fix timestamp
  if (output && typeof output === "object" && "metadata" in output) {
    const metadata = (output as { metadata: { generatedAt?: string; model?: string; provider?: string; durationMs?: number } }).metadata;
    if (!metadata.generatedAt ||
      metadata.generatedAt === "CURRENT_ISO_TIMESTAMP" ||
      metadata.generatedAt.includes("CURRENT") ||
      isNaN(new Date(metadata.generatedAt).getTime())) {
      metadata.generatedAt = new Date().toISOString();
    }
    metadata.model = model;
    metadata.provider = provider;
  }
  enforceGenerateControls(output, side, format, length, role);
  // Links the model saw in this request: research pages, search results, Library origins.
  enforceGenerateSources(output, [
    ...research.readContent.map((page) => page.url),
    ...research.searches.flatMap((search) => search.results.map((result) => result.url)),
    ...research.rankedResults.map((result) => result.url),
    ...boundPromptSources(sources).flatMap((source) => source.origin ? [source.origin] : []),
  ].filter((url): url is string => typeof url === "string" && url.length > 0));

  // Build discovered sources from research
  const activeAssessmentByKey = new Map(sourceAssessments.map((assessment) => [assessment.key, assessment]));
  const usageCandidates = [
    ...sourceDecisionCandidates.filter((source) => activeAssessmentByKey.get(source.key)?.retained).map((source) => ({
      ...source,
      importance: activeAssessmentByKey.get(source.key)?.importance ?? 0,
      strength: activeAssessmentByKey.get(source.key)?.strength ?? 0,
    })),
    ...discoveredRanking.sources.filter((source) => discoveredAssessmentByKey.get(source.key)?.retained).map((source) => ({
      ...source,
      importance: discoveredAssessmentByKey.get(source.key)?.importance ?? 0,
      strength: discoveredAssessmentByKey.get(source.key)?.strength ?? 0,
    })),
  ].slice(0, 10);
  // The case is already complete, so this optional check must not inherit
  // an almost spent request budget and turn a finished case into a 500.
  ctx.stream?.phase("checking");
  const caseUsage = await identifyCaseSourceUsage({
    caseText: JSON.stringify(output),
    sources: usageCandidates,
    signal: req.signal,
  });
  const caseUsageCost = caseUsage.jev?.usage ?? caseUsage.jevUsage;
  if (caseUsageCost) await logUsage(userId, "jev_source_usage", provider, JEV_MODEL, caseUsageCost, undefined, caseUsage.jevUsage ? "error" : "success", caseUsage.jevUsage ? "jev_incomplete" : undefined);
  const usedByKey = new Map(caseUsage.sourceUsage.map((usage) => [usage.key, usage]));
  for (const assessment of sourceAssessments) {
    (assessment as SourceAssessment & { usedInCase?: boolean }).usedInCase = usedByKey.get(assessment.key)?.judgment === "used";
  }
  for (const source of rankedDiscoveredSources) {
    const semantic = "semantic" in source ? source.semantic : undefined;
    if (semantic) {
      const used = usedByKey.get(source.url)?.judgment === "used";
      semantic.lastUsedInCase = used;
      semantic.caseUseCount = used ? 1 : 0;
      if (used) semantic.lastUsedAt = new Date().toISOString();
    }
  }
  if (output && typeof output === "object" && "metadata" in output && isRecord((output as { metadata?: unknown }).metadata)) {
    (output as { metadata: Record<string, unknown> }).metadata.sourceUsage = caseUsage.sourceUsage;
  }
  console.log(`[GENERATE] Found ${discoveredSources.length} sources`);

  // Log usage and return with sources
  const latencyMs = Date.now() - startTime;
  if (output && typeof output === "object" && "metadata" in output) {
    const metadata = (output as { metadata: { durationMs?: number } }).metadata;
    metadata.durationMs = latencyMs;
  }
  await logUsage(userId, feature, provider, model, mergeNormalizedUsage([aiResult.usage, ...researchUsageForLog()]), latencyMs);
  return await ctx.respond({ output, discoveredSources: rankedDiscoveredSources, sourceAssessments });
}
