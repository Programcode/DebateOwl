import { logUsage } from "../../_shared/entitlements.ts";
import { mergeNormalizedUsage } from "../../_shared/cost.ts";
import { callAI } from "../provider.ts";
import { cleanGeneratedText } from "../text.ts";
import { buildUserPrompt } from "../prompt-builder.ts";
import {
  buildDiscoveredSources,
  buildResearchContext,
  DEEP_RESEARCH,
  deepResearch,
} from "../../_shared/research.ts";
import { enforceBrainstormControls } from "../../_shared/control-enforcement.ts";
import type { FeatureContext } from "./types.ts";

// BRAINSTORM: Use research to inform argument angles
export async function handleBrainstorm(ctx: FeatureContext): Promise<Response> {
  const feature = "brainstorm" as const;
  const { userId, provider, model, reasoningEffort, workSignal, researchDeps, startTime, researchUsageForLog, recordMainResult, buildSystemPromptFor, input: sanitizedInput } = ctx;
  const motion = String(sanitizedInput.motion || sanitizedInput.topic || "");
  const side = String(sanitizedInput.side || "both");
  const outputMode = String(sanitizedInput.outputMode || "topfive");

  // Perform deep research to find relevant context
  console.log("[BRAINSTORM] Starting deep research for motion:", motion);
  const research = await deepResearch(motion, "", researchDeps, DEEP_RESEARCH);
  const searchContext = buildResearchContext(research);

  // Build prompt with research context
  const systemPrompt = await buildSystemPromptFor(feature, research);
  const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
  const messages = [{ role: "user", content: userPrompt }];
  const aiResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, reasoningEffort, workSignal));
  const output = cleanGeneratedText(aiResult.output);
  enforceBrainstormControls(output, side, outputMode);

  // Build discovered sources from research
  const discoveredSources = buildDiscoveredSources(research);
  console.log(`[BRAINSTORM] Found ${discoveredSources.length} sources`);

  // Log usage and return with sources
  const latencyMs = Date.now() - startTime;
  await logUsage(userId, feature, provider, model, mergeNormalizedUsage([aiResult.usage, ...researchUsageForLog()]), latencyMs);
  return await ctx.respond({ output, discoveredSources });
}
