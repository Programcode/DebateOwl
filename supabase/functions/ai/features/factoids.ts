import { logUsage } from "../../_shared/entitlements.ts";
import { mergeNormalizedUsage } from "../../_shared/cost.ts";
import { callAI } from "../provider.ts";
import { cleanGeneratedText } from "../text.ts";
import { buildUserPrompt } from "../prompt-builder.ts";
import {
  applyFactoidsVerification,
  buildDiscoveredSources,
  buildResearchContext,
  DEEP_RESEARCH,
  deepResearch,
  withResearchPreferences,
} from "../../_shared/research.ts";
import type { FeatureContext } from "./types.ts";

// FACTOIDS: Use deep research with multiple searches
export async function handleFactoids(ctx: FeatureContext): Promise<Response> {
  const feature = "factoids" as const;
  const { userId, provider, model, temperature, reasoningEffort, workSignal, researchDeps, startTime, researchUsageForLog, recordMainResult, buildSystemPromptFor, input: sanitizedInput } = ctx;
  const claim = String(sanitizedInput.claim || "");
  const region = String(sanitizedInput.region || "Global");
  const preferredSourceType = String(sanitizedInput.sourceType || "any");
  const timeframe = String(sanitizedInput.timeframe || "");
  const sourceCount = Math.min(15, Math.max(3, Number(sanitizedInput.sourceCount || 5)));

  // Perform deep research with multiple search rounds
  const research = await deepResearch(claim, region, researchDeps, withResearchPreferences(DEEP_RESEARCH, {
    preferredSourceType,
    timeframe,
  }));
  const searchContext = buildResearchContext(research);

  const systemPrompt = await buildSystemPromptFor(feature, research);
  const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
  const messages = [{ role: "user", content: userPrompt }];

  const aiResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, temperature, reasoningEffort, workSignal));
  const output = cleanGeneratedText(aiResult.output);

  // Post-process: quality floor. Only citations whose URL matches fetched,
  // non-weak research content may stay "verified"; everything else is
  // downgraded and filtered out below. Weak sources can appear only as
  // fallback context via discoveredSources, never as verified evidence.
  const factoidsOutput = output as { factoids?: unknown; verificationStatus?: string } | null;
  if (factoidsOutput && typeof factoidsOutput === "object" && Array.isArray(factoidsOutput.factoids)) {
    applyFactoidsVerification(output, research);
    factoidsOutput.factoids = (factoidsOutput.factoids as Array<{ citation?: { verified?: string } }>)
      .filter((f) => f && typeof f === "object" && !Array.isArray(f) && f.citation?.verified === "verified")
      .slice(0, sourceCount);
    factoidsOutput.verificationStatus = "complete";
  }

  const discoveredSources = buildDiscoveredSources(research);

  const latencyMs = Date.now() - startTime;
  if (output && typeof output === "object") {
    const askOutput = output as {
      model?: string;
      provider?: string;
      durationMs?: number;
      generatedAt?: string;
    };
    askOutput.model = model;
    askOutput.provider = provider;
    askOutput.durationMs = latencyMs;
    askOutput.generatedAt = new Date().toISOString();
  }

  // Log usage and return
  await logUsage(userId, feature, provider, model, mergeNormalizedUsage([aiResult.usage, ...researchUsageForLog()]), latencyMs);
  return await ctx.respond({ output, discoveredSources });
}
