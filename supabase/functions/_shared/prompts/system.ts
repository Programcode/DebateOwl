// Composes the layered system prompt and dispatches per-feature user prompts.
//
// Layers, in composition order:
//   1. PRODUCT_IDENTITY  who the assistant is (includes humanizer rules)
//   2. feature task      what this feature produces (per-feature schema)
//   3. OUTPUT RULES      JSON-only contract, single-sourced
//   4. admin/custom      operator overrides
//   5. knowledge base    user's saved sources
//   6. RESEARCH_RULES    citation honesty, present only when research ran

import {
  boundPromptSources,
  type Feature,
  JSON_RULES,
  PRODUCT_IDENTITY,
  RESEARCH_RULES,
} from "./common.ts";
import { ASK_PROMPT, buildAskUserPrompt } from "./ask.ts";
import { ATTACK_PROMPT, buildAttackUserPrompt } from "./attack.ts";
import { BRAINSTORM_PROMPT, buildBrainstormUserPrompt } from "./brainstorm.ts";
import { buildCrossfireUserPrompt, CROSSFIRE_PROMPT } from "./crossfire.ts";
import { buildFactoidsUserPrompt, FACTOIDS_PROMPT } from "./factoids.ts";
import { buildGenerateUserPrompt, GENERATE_PROMPT } from "./generate.ts";
import { buildSparringUserPrompt, SPARRING_PROMPT } from "./sparring.ts";

export const FEATURE_PROMPTS: Record<Feature, string> = {
  generate: GENERATE_PROMPT,
  attack: ATTACK_PROMPT,
  brainstorm: BRAINSTORM_PROMPT,
  factoids: FACTOIDS_PROMPT,
  ask: ASK_PROMPT,
  sparring: SPARRING_PROMPT,
  crossfire: CROSSFIRE_PROMPT,
};

export interface SystemPromptOptions {
  feature: Feature;
  /** Rendered current-date line replacing [DATE_CONTEXT]. */
  dateContext?: string;
  /** Admin-configured instruction from global_prompts. */
  globalPrompt?: string | null;
  /** User's custom system prompt. */
  customPrompt?: string | null;
  /** Saved local sources acting as primary knowledge base. */
  sources?: Array<{ title: string; content: string; origin?: string; type: string }>;
  /** Marker that web research accompanies this request; adds RESEARCH_RULES. */
  researchContext?: string;
}

export function buildSystemPrompt(options: SystemPromptOptions): string {
  const taskTemplate = FEATURE_PROMPTS[options.feature];
  if (!taskTemplate) throw new Error(`Unsupported feature: ${options.feature}`);
  // Always resolve the placeholder so it never reaches the model verbatim.
  const task = taskTemplate.replace("[DATE_CONTEXT]", options.dateContext ?? "").replace(/\n{3,}/g, "\n\n");

  const sections: string[] = [PRODUCT_IDENTITY, task, JSON_RULES];

  if (options.globalPrompt) {
    sections.push(`ADMIN-CONFIGURED INSTRUCTIONS:\n${options.globalPrompt}`);
  }
  if (options.customPrompt) {
    sections.push(`CUSTOM SYSTEM PROMPT:\n${options.customPrompt}`);
  }
  if (options.sources && options.sources.length > 0) {
    const boundedSources = boundPromptSources(options.sources);
    sections.push(`LOCAL KNOWLEDGE BASE (use as primary factual source):\n${
      boundedSources.map((s) => `--- ${s.title} (${s.origin || s.type}) ---\n${s.content}\n`).join("\n")
    }`);
  }
  if (options.researchContext) {
    sections.push(`${options.researchContext}\n\n${RESEARCH_RULES}`);
  }

  return sections.join("\n\n");
}

export function buildUserPrompt(feature: Feature, input: Record<string, unknown>, searchContext: string): string {
  switch (feature) {
    case "generate":
      return buildGenerateUserPrompt(input, searchContext);
    case "attack":
      return buildAttackUserPrompt(input, searchContext);
    case "brainstorm":
      return buildBrainstormUserPrompt(input, searchContext);
    case "factoids":
      return buildFactoidsUserPrompt(input, searchContext);
    case "sparring":
      return buildSparringUserPrompt(input);
    case "crossfire":
      return buildCrossfireUserPrompt(input);
    default:
      return buildAskUserPrompt(input);
  }
}
