import { z } from "zod";
import { supabase } from "@/lib/supabase/client";

const codeInviteSchema = z.object({
  code: z.string(),
  expiresAt: z.string(),
  inviteId: z.string().uuid(),
  maxUses: z.number().int().nullable(),
});

const redemptionSchema = z.object({
  alreadyMember: z.boolean(),
  member: z.literal(true),
  workspaceId: z.string().uuid(),
});

async function invoke<T>(body: Record<string, unknown>, schema: z.ZodType<T>) {
  const { data, error } = await supabase.functions.invoke("workspace-invites", { body });
  if (error) throw error;
  return schema.parse(data);
}

export function createCodeInvite(workspaceId: string, inviteId?: string) {
  return invoke({
    action: inviteId ? "rotate_code" : "create_code",
    ...(inviteId ? { inviteId } : {}),
    requestId: crypto.randomUUID(),
    workspaceId,
  }, codeInviteSchema);
}

export async function revokeInvite(workspaceId: string, inviteId: string) {
  await invoke({
    action: "revoke",
    inviteId,
    requestId: crypto.randomUUID(),
    workspaceId,
  }, z.object({ revoked: z.literal(true) }));
}

export async function sendEmailInvite(workspaceId: string, email: string, requestId: string) {
  await invoke({ action: "create_email", email, requestId, workspaceId }, z.object({ accepted: z.literal(true) }));
}

export function redeemInvite(input: { code?: string; token?: string; requestId: string }) {
  return invoke({ action: "redeem", ...input }, redemptionSchema);
}
