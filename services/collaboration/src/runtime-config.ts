import { z } from "zod";

const runtimeEnvironmentSchema = z.object({
  COLLABORATION_ALLOWED_ORIGINS: z.string().min(1),
  COLLABORATION_DATABASE_URL: z.string().url(),
  COLLABORATION_PORT: z.coerce.number().int().min(1).max(65_535),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url(),
});

export function parseRuntimeConfig(environment: Record<string, string | undefined>) {
  const parsed = runtimeEnvironmentSchema.parse(environment);
  const allowedOrigins = parsed.COLLABORATION_ALLOWED_ORIGINS
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const url = new URL(value);
      if (url.origin !== value) throw new Error("COLLABORATION_ALLOWED_ORIGINS must contain exact origins");
      return url.origin;
    });
  if (allowedOrigins.length === 0) throw new Error("COLLABORATION_ALLOWED_ORIGINS is required");

  return {
    address: "127.0.0.1",
    allowedOrigins,
    databaseUrl: parsed.COLLABORATION_DATABASE_URL,
    port: parsed.COLLABORATION_PORT,
    supabaseAnonKey: parsed.SUPABASE_ANON_KEY,
    supabaseUrl: parsed.SUPABASE_URL,
  };
}
