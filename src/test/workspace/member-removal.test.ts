import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/workspace/collaboration-config", () => ({
  COLLABORATION_URL: "ws://127.0.0.1:12345",
}));

import { removeWorkspaceMember } from "@/lib/workspace/client";

describe("workspace member removal", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reuses one operation ID when the committed response is lost", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("connection closed"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ revision: 4 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(removeWorkspaceMember({
      expectedRevision: 3,
      targetUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      token: "signed-token",
      workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    })).resolves.toBe(4);

    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodies[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(bodies[1]).toEqual(bodies[0]);
  });
});
