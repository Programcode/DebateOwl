import { describe, expect, it } from "vitest";
import { consumeWorkspaceInvite, stashWorkspaceInvite } from "@/lib/workspace/invite-handoff";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("signed-out workspace invitation handoff", () => {
  it("stores only a valid invite token and consumes it once after authentication", () => {
    const storage = memoryStorage();
    const token = `wi_${"a".repeat(32)}`;

    expect(stashWorkspaceInvite({
      pathname: "/app/workspaces/invite",
      search: `?token=${token}`,
    }, storage)).toBe(true);
    expect(consumeWorkspaceInvite(storage)).toBe(`/app/workspaces/invite?token=${token}`);
    expect(consumeWorkspaceInvite(storage)).toBeNull();
  });

  it("does not retain unrelated or malformed URLs", () => {
    const storage = memoryStorage();
    expect(stashWorkspaceInvite({ pathname: "/app", search: "?token=secret" }, storage)).toBe(false);
    expect(stashWorkspaceInvite({ pathname: "/app/workspaces/invite", search: "?token=secret" }, storage)).toBe(false);
    expect(consumeWorkspaceInvite(storage)).toBeNull();
  });
});
