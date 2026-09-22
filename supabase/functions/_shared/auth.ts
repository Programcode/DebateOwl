import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

const supabaseUrl = requiredEnv("SUPABASE_URL");
const supabaseServiceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");

export type AuthContext = {
  token: string;
  user: User;
  userClient: SupabaseClient;
  adminClient: SupabaseClient;
};

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function createAdminClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createUserClient(authHeader: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getBearerToken(req: Request) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HttpError(401, "Authentication required");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    throw new HttpError(401, "Authentication required");
  }

  return { authHeader, token };
}

export async function requireUser(req: Request, adminKey = supabaseServiceRoleKey): Promise<AuthContext> {
  const { authHeader, token } = getBearerToken(req);
  const adminClient = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await adminClient.auth.getUser(token);

  if (error || !user) {
    throw new HttpError(401, "Invalid authentication token");
  }

  return {
    token,
    user,
    userClient: createUserClient(authHeader),
    adminClient,
  };
}

export function jsonError(error: unknown, corsHeaders: Record<string, string>) {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Internal server error";
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
