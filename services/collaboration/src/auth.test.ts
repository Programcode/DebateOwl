// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createWorkspaceAuthenticator } from "./auth";

describe("collaboration authentication", () => {
  it("binds the verified user to a current document membership", async () => {
    const verifyToken = vi.fn().mockResolvedValue({
      email: "member@example.com",
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "Ada Member",
    });
    const isAuthorized = vi.fn().mockResolvedValue(true);
    const authenticate = createWorkspaceAuthenticator({ isAuthorized, verifyToken });

    await expect(authenticate({
      documentName: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@3",
      token: "signed-token",
    })).resolves.toEqual({
      authorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      displayName: "Ada Member",
      documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      epoch: 3,
    });
    expect(isAuthorized).toHaveBeenCalledWith({
      authorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      epoch: 3,
    });
  });

  it("rejects a valid but stale token after membership removal", async () => {
    const authenticate = createWorkspaceAuthenticator({
      verifyToken: vi.fn().mockResolvedValue({
        email: "removed@example.com",
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      }),
      isAuthorized: vi.fn().mockResolvedValue(false),
    });

    await expect(authenticate({
      documentName: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa@3",
      token: "still-valid-token",
    })).rejects.toThrow("Workspace unavailable");
  });
});
