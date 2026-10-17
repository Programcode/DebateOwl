import type { Response } from "@playwright/test";

export type AIResponseBody = { output: Record<string, unknown>; discoveredSources?: unknown[]; [key: string]: unknown };

/**
 * The status and body of an `ai` Edge Function answer. Pages ask for live
 * generation, which answers with Server-Sent Events whose last `result`
 * event carries the status and JSON body a plain request returns; a plain
 * request (or a server from before live generation) answers with JSON.
 */
export async function readAIResponse(response: Response): Promise<{ status: number; body: AIResponseBody }> {
  const contentType = response.headers()["content-type"] ?? "";
  if (!contentType.includes("text/event-stream")) {
    return { status: response.status(), body: await response.json() as AIResponseBody };
  }
  const text = await response.text();
  const result = text.split(/\n\n/).reverse().find((block) => /^event: result$/m.test(block));
  const data = result && /^data: (.*)$/m.exec(result)?.[1];
  if (!data) throw new Error("The ai event stream ended without a result event");
  const parsed = JSON.parse(data) as { status: number; body: AIResponseBody };
  return { status: parsed.status, body: parsed.body };
}
