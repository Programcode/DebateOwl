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
  motion: string;
  side: DemoSide;
  argument: string;
  previous?: { argument: string; rebuttal: string };
}

export interface DemoTurnReply {
  sessionId: string;
  turn: number;
  turnsLeft: number;
  rebuttal: string;
  judgeNote: string;
}

/** Why a turn did not come back: the function's error code, or "network". */
export class DemoTurnError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export async function requestDemoTurn(body: DemoTurnRequest, signal?: AbortSignal): Promise<DemoTurnReply> {
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
  const data = await response.json().catch(() => ({})) as Partial<DemoTurnReply> & { error?: string };
  if (!response.ok || typeof data.rebuttal !== "string" || typeof data.sessionId !== "string") {
    throw new DemoTurnError(data.error ?? "unavailable");
  }
  return data as DemoTurnReply;
}

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
