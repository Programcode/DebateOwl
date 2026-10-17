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
import { enforceAttackControls } from "../../_shared/control-enforcement.ts";
import type { FeatureContext } from "./types.ts";

// ATTACK: Use deep research for evidence-based critique
export async function handleAttack(ctx: FeatureContext): Promise<Response> {
  const feature = "attack" as const;
  const { userId, provider, model, reasoningEffort, workSignal, researchDeps, startTime, researchUsageForLog, recordMainResult, buildSystemPromptFor, input: sanitizedInput } = ctx;
  const caseText = String(sanitizedInput.caseText || "");
  const detectFallacies = typeof sanitizedInput.detectFallacies === "boolean" ? sanitizedInput.detectFallacies : true;
  const analyzeWeighing = typeof sanitizedInput.analyzeWeighing === "boolean" ? sanitizedInput.analyzeWeighing : true;

  // Research the topic to find counter-evidence
  console.log("[ATTACK] Starting deep research for case analysis");
  ctx.stream?.phase("research");
  const research = await deepResearch(caseText.slice(0, 500), "", researchDeps, DEEP_RESEARCH);
  const searchContext = buildResearchContext(research);

  const systemPrompt = await buildSystemPromptFor(feature, research);
  const userPrompt = buildUserPrompt(feature, sanitizedInput, searchContext);
  const messages = [{ role: "user", content: userPrompt }];
  const aiResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, reasoningEffort, workSignal, ctx.stream));
  const output = cleanGeneratedText(aiResult.output);
  enforceAttackControls(output, detectFallacies, analyzeWeighing);

  const discoveredSources = buildDiscoveredSources(research);
  console.log(`[ATTACK] Found ${discoveredSources.length} sources`);

  const latencyMs = Date.now() - startTime;
  await logUsage(userId, feature, provider, model, mergeNormalizedUsage([aiResult.usage, ...researchUsageForLog()]), latencyMs);
  return await ctx.respond({ output, discoveredSources });
}
