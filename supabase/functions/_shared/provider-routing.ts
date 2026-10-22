// OpenRouter provider preferences per model family, and the Claude BYOK guard.
//
// Claude must run only on DebateLab's own Anthropic key, which is set up as
// BYOK in OpenRouter. `only: ["anthropic"]` keeps Bedrock and Vertex out, and
// `allow_fallbacks: false` stops OpenRouter from trying any other provider.
// OpenRouter tries a BYOK key before its own capacity for the same provider,
// but only the key's "Never use shared capacity" setting in OpenRouter stops it
// from spending OpenRouter credits on Anthropic when the key fails. The usage
// warning below is how a leak would show up.

export function isClaudeModel(model: string): boolean {
  return model.startsWith("anthropic/");
}

export function openRouterProviderOptions(model: string): Record<string, unknown> {
  if (isClaudeModel(model)) return { only: ["anthropic"], allow_fallbacks: false, require_parameters: true };
  // Omitting sort and order keeps OpenRouter's balanced provider load balancing.
  return { require_parameters: true };
}

/**
 * A Claude call OpenRouter refused or failed. With fallbacks off this usually
 * means the Anthropic key is out of credit or erroring, so the request is not
 * retried elsewhere, the student sees a provider outage, and the reserved
 * daily request is given back.
 */
export class ClaudeProviderUnavailableError extends Error {
  readonly status: number | null;

  constructor(status: number | null) {
    super("AI provider request failed");
    this.name = "ClaudeProviderUnavailableError";
    this.status = status;
  }
}

/** Throws the Claude-specific error for Claude models, the generic one otherwise. */
export function providerRequestError(model: string, status: number | null): Error {
  return isClaudeModel(model) ? new ClaudeProviderUnavailableError(status) : new Error("AI provider request failed");
}

export const CLAUDE_UNAVAILABLE_CODE = "provider_unavailable";
export const CLAUDE_UNAVAILABLE_STATUS = 503;
// The client maps a provider error naming Anthropic and "temporarily
// unavailable" to its translated outage message.
export const CLAUDE_UNAVAILABLE_MESSAGE = "Anthropic Claude is temporarily unavailable. Please try again later.";

/**
 * Warns when a Claude response did not run on the BYOK key (`is_byok` false)
 * or OpenRouter charged for it (`cost` above zero). Past the monthly BYOK
 * allowance, OpenRouter's BYOK fee also shows up as cost.
 */
export function warnIfClaudeNotByok(model: string, rawUsage: Record<string, unknown> | undefined, source: string): boolean {
  if (!isClaudeModel(model) || !rawUsage) return false;
  const cost = typeof rawUsage.cost === "number" ? rawUsage.cost : undefined;
  if (rawUsage.is_byok !== false && !(cost !== undefined && cost > 0)) return false;
  const costDetails = rawUsage.cost_details && typeof rawUsage.cost_details === "object"
    ? rawUsage.cost_details as Record<string, unknown>
    : undefined;
  console.warn(JSON.stringify({
    event: "claude_not_byok",
    source,
    model,
    is_byok: rawUsage.is_byok ?? null,
    cost: cost ?? null,
    upstream_inference_cost: costDetails?.upstream_inference_cost ?? null,
  }));
  return true;
}
