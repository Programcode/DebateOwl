import { beforeEach, describe, expect, it, vi } from "vitest";
import { preloadRoute, routeLoaders } from "@/lib/route-modules";

type RoutePath = keyof typeof routeLoaders;

function replaceLoader(pathname: RoutePath, loader: () => Promise<unknown>) {
  const original = routeLoaders[pathname];
  Object.defineProperty(routeLoaders, pathname, { configurable: true, value: loader });
  return () => Object.defineProperty(routeLoaders, pathname, { configurable: true, value: original });
}

describe("route module preloading", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("invokes a known route loader once", async () => {
    const loader = vi.fn(() => Promise.resolve({ default: (): null => null }));
    const restore = replaceLoader("/app/generate", loader);

    try {
      await preloadRoute("/app/generate");
      expect(loader).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });

  it("returns the same promise for repeated calls", async () => {
    const loader = vi.fn(() => Promise.resolve({ default: (): null => null }));
    const restore = replaceLoader("/app/attack", loader);

    try {
      const first = preloadRoute("/app/attack");
      const second = preloadRoute("/app/attack");

      expect(second).toBe(first);
      expect(loader).toHaveBeenCalledTimes(1);
      await first;
    } finally {
      restore();
    }
  });

  it("removes a rejected promise so the next call retries", async () => {
    const failure = new Error("route import failed");
    let attempts = 0;
    const loader = vi.fn(() => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(failure)
        : Promise.resolve({ default: (): null => null });
    });
    const restore = replaceLoader("/app/admin", loader);

    try {
      const first = preloadRoute("/app/admin");
      await expect(first).rejects.toBe(failure);

      const second = preloadRoute("/app/admin");
      expect(second).not.toBe(first);
      await expect(second).resolves.toBeDefined();
      expect(loader).toHaveBeenCalledTimes(2);
    } finally {
      restore();
    }
  });

  it("returns undefined for unknown paths", () => {
    expect(preloadRoute("/app/unknown")).toBeUndefined();
  });
});
