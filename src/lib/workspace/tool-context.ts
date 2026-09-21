import { z } from "zod";
import { saveWorkspaceArtifact, type WorkspaceArtifact } from "./practice-client";

const contextSchema = z.object({
  documentEpoch: z.number().int().nonnegative(),
  documentId: z.string().uuid(),
  documentIds: z.array(z.string().uuid()).min(1).max(12),
  documentText: z.string().max(100000),
  documentTitle: z.string(),
  motion: z.string(),
  requestId: z.string().uuid(),
  returnUrl: z.string().regex(/^\/app\/workspaces\/[0-9a-f-]+$/),
  side: z.enum(["pro", "con"]),
  sourceIds: z.array(z.string().uuid()).max(20),
  threadRequest: z.object({
    assistantMessageId: z.string().uuid(),
    userMessageId: z.string().uuid(),
  }).nullable(),
  threadId: z.string().uuid().nullable(),
  workspaceId: z.string().uuid(),
});

export type WorkspaceToolContext = z.infer<typeof contextSchema>;
export type WorkspaceTool = WorkspaceArtifact["tool"];

export function parseWorkspaceToolContext(value: unknown) {
  return contextSchema.safeParse(value).data ?? null;
}

export function workspaceRouteState(context: WorkspaceToolContext) {
  return { workspaceContext: context, workspaceLaunch: true };
}

export async function attachWorkspaceResult(
  context: WorkspaceToolContext | null,
  tool: WorkspaceTool,
  input: unknown,
  output: unknown,
) {
  if (!context) return;
  await saveWorkspaceArtifact({
    documentEpoch: context.documentEpoch,
    documentId: context.documentId,
    inputSnapshot: input,
    outputSnapshot: output,
    requestId: context.requestId,
    status: "complete",
    tool,
    workspaceId: context.workspaceId,
  });
}
