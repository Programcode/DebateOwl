import { z } from "zod";

const preferenceSchema = z.object({
  documentId: z.string().uuid().nullable(),
  side: z.enum(["pro", "con"]),
});

export type WorkspacePreference = z.infer<typeof preferenceSchema>;

function key(userId: string, workspaceId: string) {
  return `debatelab:workspace:${userId}:${workspaceId}`;
}

export function loadWorkspacePreference(userId: string, workspaceId: string): WorkspacePreference | null {
  try {
    return preferenceSchema.parse(JSON.parse(localStorage.getItem(key(userId, workspaceId)) ?? "null"));
  } catch {
    return null;
  }
}

export function saveWorkspacePreference(userId: string, workspaceId: string, preference: WorkspacePreference) {
  try {
    localStorage.setItem(key(userId, workspaceId), JSON.stringify(preference));
  } catch {
    // Non-critical preference; document recovery reports its own storage failures.
  }
}
