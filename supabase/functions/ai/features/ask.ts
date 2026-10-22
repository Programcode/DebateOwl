import { logUsage } from "../../_shared/entitlements.ts";
import { mergeNormalizedUsage } from "../../_shared/cost.ts";
import { callAI } from "../provider.ts";
import { cleanGeneratedText, extractUrls, truncateTextToBudget } from "../text.ts";
import { buildAskBasePrompt } from "../prompt-builder.ts";
import {
  ASK_RESEARCH,
  buildResearchContext,
  deepResearch,
  decideAskSearch,
  exaGetContents,
  getResearchSources,
  verifyUrl,
  type ResearchContext,
  type ResearchSource,
} from "../../_shared/research.ts";
import { enforceAskControls } from "../../_shared/control-enforcement.ts";
import { hasResearch, type FeatureContext } from "./types.ts";

const MAX_ASK_CONTEXT_LENGTH = 32000;

// ASK: Optionally run web search and include URL context from chat
export async function handleAsk(ctx: FeatureContext): Promise<Response> {
  const feature = "ask" as const;
  const { userId, provider, model, reasoningEffort, workSignal, researchDeps, startTime, researchUsageForLog, recordMainResult, buildSystemPromptFor, input: sanitizedInput } = ctx;
  const history = (sanitizedInput.history as Array<{ role: string; content: string }>) || [];
  const message = String(sanitizedInput.message || "");
  const mode = String(sanitizedInput.mode || "general");
  const citationMode = Boolean(sanitizedInput.citationMode);
  const webSearchEnabled = Boolean(sanitizedInput.webSearch);
  const prosConsMode = Boolean(sanitizedInput.prosConsMode);
  const argumentMapMode = Boolean(sanitizedInput.argumentMapMode);
  const shouldUseResearch = webSearchEnabled || citationMode;
  let askResearch: ResearchContext | null = null;
  let askSearchQuery = "";

  // 1) Read URLs already shared in chat to ground the response in user-provided material
  const urls = new Set<string>();
  extractUrls(message).forEach((u) => urls.add(u));
  history.slice(-3).forEach((m) => extractUrls(m.content).forEach((u) => urls.add(u)));

  let urlContext = "";
  if (urls.size > 0) {
    const contents = await Promise.all(Array.from(urls).slice(0, 3).map(async (u) => {
      const content = await exaGetContents(u, workSignal);
      return content.trim()
        ? `--- Content from ${u} ---\n${content.slice(0, 8000)}\n--- End of ${u} ---`
        : "";
    }));
    const usableContents = contents.filter(Boolean);
    if (usableContents.length > 0) {
      urlContext = "\n\nWEB PAGE CONTEXT:\n" + usableContents.join("\n");
    }
  }

  // 2) Optional web search in Ask mode. When the user explicitly enables
  // web search or citations, perform research instead of leaving it to the model.
  let webSearchContext = "";
  if (shouldUseResearch) {
    ctx.stream?.phase("research");
    const searchDecision = await decideAskSearch(message, history, researchDeps);
    askSearchQuery = searchDecision.query || message.slice(0, 240);
    if (askSearchQuery) {
      askResearch = await deepResearch(askSearchQuery, "", researchDeps, ASK_RESEARCH);
      const renderedResearch = hasResearch(askResearch) ? buildResearchContext(askResearch) : "";
      if (renderedResearch) {
        webSearchContext = `\n\n${renderedResearch}`;
      }
    }
  }

  const askPromptInput = {
    message,
    mode,
    citationMode,
    webSearchEnabled,
    prosConsMode,
    argumentMapMode,
    researchAvailable: Boolean(webSearchContext || urlContext),
  };
  const initialBasePrompt = buildAskBasePrompt(askPromptInput);
  const contextBudget = Math.max(0, MAX_ASK_CONTEXT_LENGTH - initialBasePrompt.length);
  const webSearchBudget = Math.max(0, contextBudget - urlContext.length);
  const trimmedWebSearch = truncateTextToBudget(webSearchContext, webSearchBudget);
  webSearchContext = trimmedWebSearch.text;
  if (trimmedWebSearch.truncated) ctx.markTruncated();

  const urlBudget = Math.max(0, contextBudget - webSearchContext.length);
  const trimmedUrlContext = truncateTextToBudget(urlContext, urlBudget);
  urlContext = trimmedUrlContext.text;
  if (trimmedUrlContext.truncated) ctx.markTruncated();

  const researchAvailable = Boolean(webSearchContext || urlContext);
  const basePrompt = researchAvailable === askPromptInput.researchAvailable
    ? initialBasePrompt
    : buildAskBasePrompt({ ...askPromptInput, researchAvailable });
  const effectiveResearch = webSearchContext && askResearch ? askResearch : null;
  const systemPrompt = await buildSystemPromptFor(feature, effectiveResearch);
  const prompt = `${basePrompt}${urlContext}${webSearchContext}`;
  const messages = [...history, { role: "user", content: prompt }];
  const aiResult = recordMainResult(await callAI(provider, model, systemPrompt, messages, reasoningEffort, "ask", workSignal, ctx.stream));
  const output = cleanGeneratedText(aiResult.output);

  if (output && typeof output === "object") {
    const typedOutput = output as {
      citations?: Array<{ claim: string; source?: string; verified?: boolean; note?: string }>;
      searchInfo?: { webSearchUsed: boolean; queries: string[]; sources: ResearchSource[] };
      uncertainties?: string[];
    };
    const citations = typedOutput.citations;
    if (Array.isArray(citations)) {
      await Promise.all(citations.map(async (citation) => {
        const source = typeof citation.source === "string" ? citation.source : "";
        const url = extractUrls(source)[0];
        if (!url) return;
        citation.verified = await verifyUrl(url);
      }));
    }

    const researchSources = effectiveResearch
      ? getResearchSources(effectiveResearch).filter((source) => webSearchContext.includes(source.url))
      : [];
    if (shouldUseResearch) {
      typedOutput.searchInfo = {
        webSearchUsed: researchSources.length > 0,
        queries: askResearch?.searches.map((search) => search.query) || (askSearchQuery ? [askSearchQuery] : []),
        sources: researchSources,
      };
    } else {
      delete typedOutput.searchInfo;
    }

    const citationFallbackSources = researchSources.filter((source) => source.qualityLabel !== "weak");
    if (citationMode && citationFallbackSources.length > 0 && (!Array.isArray(typedOutput.citations) || typedOutput.citations.length === 0)) {
      typedOutput.citations = citationFallbackSources.slice(0, 3).map((source) => ({
        claim: "Research source used for this answer",
        source: source.url,
        verified: source.verified,
        note: `${source.title} (${source.qualityLabel} ${source.sourceType})`,
      }));
      typedOutput.uncertainties = Array.isArray(typedOutput.uncertainties)
        ? typedOutput.uncertainties
        : [];
    } else if (citationMode && researchSources.length > 0 && citationFallbackSources.length === 0) {
      typedOutput.citations = [];
      typedOutput.uncertainties = [
        ...(Array.isArray(typedOutput.uncertainties) ? typedOutput.uncertainties : []),
        "Search ran, but the available sources were too weak for citation fallback.",
      ];
    }
    // Deterministic control enforcement runs last so fallback citations
    // respect the toggles too, and clarify mode always surfaces its note.
    enforceAskControls(typedOutput, { mode, citationMode, prosConsMode, argumentMapMode });
  }

  // Log usage and return
  const latencyMs = Date.now() - startTime;
  await logUsage(userId, feature, provider, model, mergeNormalizedUsage([aiResult.usage, ...researchUsageForLog()]), latencyMs);
  return await ctx.respond({ output });
}
