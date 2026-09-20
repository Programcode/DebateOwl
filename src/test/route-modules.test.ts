import { beforeEach, describe, expect, it, vi } from "vitest";
import { preloadRoute, routeLoaders } from "@/lib/route-modules";

const rejectionState = vi.hoisted(() => ({
  failure: new Error("route import failed"),
  attempts: 0,
}));

describe("route module preloading", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("invokes a known route loader once", async () => {
    const loader = vi.spyOn(routeLoaders, "/app/generate");

    await preloadRoute("/app/generate");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("returns the same promise for repeated calls", async () => {
    const first = preloadRoute("/app/attack");
    const second = preloadRoute("/app/attack");

    expect(second).toBe(first);
    expect(routeLoaders["/app/attack"]()).toBe(first);
    await first;
  });

  it("shares the preload promise when preload runs before the App loader", async () => {
    const preload = preloadRoute("/app/flowchart");
    const lazyLoad = routeLoaders["/app/flowchart"]();

    expect(lazyLoad).toBe(preload);
    await preload;
  });

  it("shares the preload promise when the App loader runs first", async () => {
    const lazyLoad = routeLoaders["/app/settings"]();
    const preload = preloadRoute("/app/settings");

    expect(preload).toBe(lazyLoad);
    await lazyLoad;
  });

  it("evicts a rejected shared import so the next call retries", async () => {
    rejectionState.attempts = 0;
    vi.doMock("@/pages/AdminPage", () => {
      rejectionState.attempts += 1;
      if (rejectionState.attempts === 1) throw rejectionState.failure;
      return { default: (): null => null };
    });
    vi.resetModules();

    try {
      const isolated = await import("@/lib/route-modules");
      const first = isolated.routeLoaders["/app/admin"]();
      await expect(first).rejects.toThrow();

      const second = isolated.preloadRoute("/app/admin");
      expect(second).not.toBe(first);
      await expect(second).resolves.toBeDefined();
      expect(rejectionState.attempts).toBe(2);
    } finally {
      vi.doUnmock("@/pages/AdminPage");
      vi.resetModules();
    }
  });

  it("returns undefined for unknown paths", () => {
    expect(preloadRoute("/app/unknown")).toBeUndefined();
    expect(preloadRoute("toString")).toBeUndefined();
  });
});
