import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

/**
 * The no-login mini round on /ai-debate. It shows only when the build sets
 * VITE_DEMO_ENABLED=true and a Turnstile site key; otherwise the page keeps its
 * static sample round. The demo-rebuttal Edge Function has its own switch
 * (DEMO_ENABLED) and answers 503 while that is off, which also falls back.
 */
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";
export const DEMO_CLIENT_ENABLED = import.meta.env.VITE_DEMO_ENABLED === "true" && TURNSTILE_SITE_KEY !== "";

export const MOTION_MAX = 200;
export const ARGUMENT_MAX = 600;

export const PRESET_MOTIONS = [
  "This House would ban smartphones in schools",
  "This House believes that social media has done more harm than good",
  "This House would make voting compulsory",
  "This House would introduce a four-day school week",
  "This House believes that AI tutors should replace homework help from parents",
] as const;

export type DemoSide = "for" | "against";

export interface DemoTurnRequest {
  turnstileToken?: string;
  sessionId?: string;
  /** The signed token the first turn returned; sent back with the follow-up. */
  sessionToken?: string;
  motion: string;
  side: DemoSide;
  argument: string;
  previous?: { argument: string; rebuttal: string };
}

export interface DemoTurnReply {
  sessionId: string;
  /** Only on the first turn. */
  sessionToken?: string;
  turn: number;
  turnsLeft: number;
  rebuttal: string;
  judgeNote: string;
  /** The function's signature on this turn; a publish sends it back. */
  signature: string;
}

/** Why a turn did not come back: the function's error code, or "network". */
export class DemoTurnError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function callDemo(body: object, signal?: AbortSignal): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/demo-rebuttal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new DemoTurnError("network");
  }
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new DemoTurnError(typeof data.error === "string" ? data.error : "unavailable");
  return data;
}

export async function requestDemoTurn(body: DemoTurnRequest, signal?: AbortSignal): Promise<DemoTurnReply> {
  const data = await callDemo(body, signal);
  if (typeof data.rebuttal !== "string" || typeof data.sessionId !== "string") throw new DemoTurnError("unavailable");
  return data as unknown as DemoTurnReply;
}

export interface PublishDemoRequest {
  sessionId: string;
  sessionToken: string;
  motion: string;
  side: DemoSide;
  turns: Array<{ argument: string; rebuttal: string; judgeNote: string; signature: string }>;
}

export interface PublishDemoReply {
  slug: string;
  deleteToken: string;
  /** False when search engines are asked not to list the page. */
  indexable: boolean;
  /** How many personal details were removed. */
  redactions: number;
}

/** Publishes a finished round as a public page. Only on the visitor's explicit opt-in. */
export async function publishDemoRound(body: PublishDemoRequest): Promise<PublishDemoReply> {
  const data = await callDemo({ action: "publish", ...body });
  if (typeof data.slug !== "string" || typeof data.deleteToken !== "string") throw new DemoTurnError("unavailable");
  rememberDeleteToken(data.slug, data.deleteToken);
  return data as unknown as PublishDemoReply;
}

export async function unpublishDemoRound(slug: string, deleteToken: string): Promise<void> {
  try {
    await callDemo({ action: "unpublish", slug, deleteToken });
  } catch (error) {
    // Already gone counts as done.
    if (!(error instanceof DemoTurnError && error.code === "not_found")) throw error;
  }
  forgetDeleteToken(slug);
}

// The delete token lives only in the publishing browser; the server keeps its hash.
const DELETE_TOKENS_KEY = "debateowl-published-rounds";

function readDeleteTokens(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(DELETE_TOKENS_KEY) ?? "{}") as unknown;
    return value && typeof value === "object" ? value as Record<string, string> : {};
  } catch {
    return {};
  }
}

function writeDeleteTokens(tokens: Record<string, string>) {
  try {
    localStorage.setItem(DELETE_TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    // Private mode: the round can still be unpublished from the page that published it.
  }
}

const rememberDeleteToken = (slug: string, token: string) => writeDeleteTokens({ ...readDeleteTokens(), [slug]: token });
const forgetDeleteToken = (slug: string) => {
  const { [slug]: _removed, ...rest } = readDeleteTokens();
  writeDeleteTokens(rest);
};

/** The delete token for a round this browser published, if it still has it. */
export const deleteTokenFor = (slug: string): string | undefined => readDeleteTokens()[slug];

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScript: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's Turnstile script once, on the page that needs it. */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  turnstileScript ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    script.onerror = () => {
      turnstileScript = null;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return turnstileScript;
}
