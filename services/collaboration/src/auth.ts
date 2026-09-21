import { z } from "zod";

const roomSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@[0-9]+$/i,
);
const userSchema = z.object({
  email: z.string().email().nullable().optional(),
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
});

type AccessContext = {
  authorId: string;
  documentId: string;
  epoch: number;
};

export function createWorkspaceAuthenticator({
  isAuthorized,
  verifyToken,
}: {
  isAuthorized: (context: AccessContext) => Promise<boolean>;
  verifyToken: (token: string) => Promise<unknown>;
}) {
  return async ({ documentName, token }: { documentName: string; token: string }) => {
    const room = roomSchema.safeParse(documentName);
    if (!room.success || !token) throw new Error("Workspace unavailable");
    const separator = room.data.lastIndexOf("@");
    const user = userSchema.parse(await verifyToken(token));
    const context = {
      authorId: user.id,
      documentId: room.data.slice(0, separator),
      epoch: Number(room.data.slice(separator + 1)),
    };
    if (!await isAuthorized(context)) throw new Error("Workspace unavailable");

    return {
      ...context,
      displayName: user.name ?? user.email?.split("@")[0] ?? `Member ${user.id.slice(0, 4)}`,
    };
  };
}
