// Process-wide runtime for the ai Edge Function: environment, service-role
// clients, the sparring integrity secret, logging, and admin prompt lookup.
// Every module-load environment read lives here so tests can set the
// environment before importing index.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import {
  deriveSparringIntegritySecret,
  type SparringDatabase,
  type SparringDatabaseSchema,
} from "./sparring-persistence.ts";
import { loadAuthorizedWorkspaceContext } from "../_shared/workspace-context.ts";
import { deliverPush, expoAccessToken, type PushNotification, supabasePushStore } from "../_shared/push.ts";

// Generate unique request ID for tracing
export function generateRequestId(): string {
  return `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Structured logger for consistent log format
export function log(requestId: string, level: "INFO" | "WARN" | "ERROR", message: string, data?: Record<string, unknown>) {
  const logObj = { requestId, level, message, ...data, timestamp: new Date().toISOString() };
  if (level === "ERROR") {
    console.error(JSON.stringify(logObj));
  } else if (level === "WARN") {
    console.warn(JSON.stringify(logObj));
  } else {
    console.log(JSON.stringify(logObj));
  }
}

export const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
export const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const supabase = createClient(supabaseUrl, supabaseServiceKey);
export const workspaceDatabase = supabase as unknown as Parameters<typeof loadAuthorizedWorkspaceContext>[0];
export const sparringSupabase = createClient<SparringDatabaseSchema>(supabaseUrl, supabaseServiceKey);
export const sparringIntegritySecret = Deno.env.get("SPARRING_INTEGRITY_SECRET")?.trim()
  || await deriveSparringIntegritySecret(supabaseServiceKey);

const pushStore = supabasePushStore(supabase);

/**
 * Sends push notifications without holding the response: the Edge Runtime
 * keeps the worker alive for it through waitUntil. Where there is no Edge
 * Runtime (Deno tests), the caller waits instead. Never rejects.
 */
export function sendPushAfterResponse(notifications: PushNotification[]): Promise<void> {
  const delivery = deliverPush(pushStore, notifications, { accessToken: expoAccessToken() });
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (typeof runtime?.waitUntil === "function") {
    runtime.waitUntil(delivery);
    return Promise.resolve();
  }
  return delivery;
}

export function narrowSparringDatabase(database: object): SparringDatabase {
  return database as SparringDatabase;
}

export async function getGlobalPrompt(feature: string): Promise<string | null> {
  // First try feature-specific prompt
  const { data: featurePrompt } = await supabase
    .from("global_prompts")
    .select("prompt_text")
    .eq("feature", feature)
    .eq("is_active", true)
    .maybeSingle();

  if (featurePrompt?.prompt_text) {
    return featurePrompt.prompt_text;
  }

  // Fall back to 'all' prompt
  const { data: allPrompt } = await supabase
    .from("global_prompts")
    .select("prompt_text")
    .eq("feature", "all")
    .eq("is_active", true)
    .maybeSingle();

  return allPrompt?.prompt_text || null;
}


export function badRequest(message: string, corsHeaders: Record<string, string>, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
