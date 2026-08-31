import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RouteErrorBoundary, ToolRouteAnalytics } from "@/App";

const observability = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureProductEvent: vi.fn(),
}));

vi.mock("@/lib/observability", () => observability);

const toolRoutes = [
  ["/app/generate", "generate"],
  ["/app/attack", "attack"],
  ["/app/brainstorm", "brainstorm"],
  ["/app/factoids", "factoids"],
  ["/app/ask", "ask"],
  ["/app/crossfire", "crossfire"],
  ["/app/history", "history"],
  ["/app/library", "library"],
  ["/app/timer", "timer"],
  ["/app/sparring", "sparring"],
  ["/app/flowchart", "flowchart"],
  ["/app/settings", "settings"],
  ["/app/admin", "admin"],
] as const;

describe("App route observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(toolRoutes)("tracks %s as the safe tool enum", (pathname, tool) => {
    render(
      <MemoryRouter initialEntries={[pathname]}>
        <ToolRouteAnalytics />
      </MemoryRouter>,
    );

    expect(observability.captureProductEvent).toHaveBeenCalledWith("tool_opened", { tool });
  });

  it.each(["/app", "/app/unknown", "/app/generate/private-case"])(
    "does not track %s as a tool",
    (pathname) => {
      render(
        <MemoryRouter initialEntries={[pathname]}>
          <ToolRouteAnalytics />
        </MemoryRouter>,
      );

      expect(observability.captureProductEvent).not.toHaveBeenCalled();
    },
  );

  it("tracks tool openings from location changes without path data", () => {
    function Navigation() {
      const navigate = useNavigate();

      return (
        <>
          <ToolRouteAnalytics />
          <button onClick={() => navigate("/app/generate")}>Open generate</button>
          <button onClick={() => navigate("/app/ask")}>Open ask</button>
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route path="*" element={<Navigation />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(observability.captureProductEvent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Open generate" }));
    expect(observability.captureProductEvent).toHaveBeenLastCalledWith("tool_opened", { tool: "generate" });

    fireEvent.click(screen.getByRole("button", { name: "Open ask" }));
    expect(observability.captureProductEvent).toHaveBeenLastCalledWith("tool_opened", { tool: "ask" });
    expect(observability.captureProductEvent.mock.calls).toEqual([
      ["tool_opened", { tool: "generate" }],
      ["tool_opened", { tool: "ask" }],
    ]);
  });

  it("captures route errors with a fixed, non-sensitive boundary context", () => {
    const error = new Error("route failed");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const suppressWindowError = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener("error", suppressWindowError);

    function ExplodingRoute(): ReactNode {
      throw error;
    }

    try {
      render(
        <RouteErrorBoundary>
          <ExplodingRoute />
        </RouteErrorBoundary>,
      );

      expect(screen.getByRole("heading", { name: "Unable to load this page" })).toBeInTheDocument();
      expect(observability.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Error", message: "Route rendering failed" }),
        { boundary: "route" },
      );
      expect(JSON.stringify(observability.captureException.mock.calls)).not.toContain(error.message);
      expect(observability.captureException.mock.calls[0][1]).not.toHaveProperty("componentStack");
    } finally {
      window.removeEventListener("error", suppressWindowError);
      consoleError.mockRestore();
    }
  });
});
