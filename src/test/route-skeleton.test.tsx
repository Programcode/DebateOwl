import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RouteSkeleton, type RouteSkeletonVariant } from "@/components/loading/RouteSkeleton";

const variants: RouteSkeletonVariant[] = [
  "public",
  "home-grid",
  "tool-form",
  "chat",
  "settings/list",
  "admin/table",
];

describe("RouteSkeleton", () => {
  it.each(variants)("renders the %s route shape as one polite busy region", (variant) => {
    const { container } = render(<RouteSkeleton variant={variant} />);
    const status = screen.getByRole("status", { name: "Loading" });

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveAttribute("data-route-skeleton", variant);
    expect(status).toHaveClass("min-h-[60vh]");
    expect(status).toHaveTextContent(/^$/);
    expect(container.querySelectorAll("[data-route-skeleton-shape]").length).toBeGreaterThan(0);
  });

  it.each(variants)("keeps %s decorative shapes hidden and inert", (variant) => {
    const { container } = render(<RouteSkeleton variant={variant} />);

    expect(container.querySelectorAll("a, button, input, select, textarea")).toHaveLength(0);
    expect(container.querySelectorAll('[tabindex]:not([tabindex="-1"])')).toHaveLength(0);

    for (const shape of container.querySelectorAll("[data-route-skeleton-shape]")) {
      expect(shape).toHaveAttribute("aria-hidden", "true");
      expect(shape).not.toHaveAttribute("tabindex");
    }
  });

  it.each(variants)("keeps %s static without animation hooks", (variant) => {
    const { container } = render(<RouteSkeleton variant={variant} />);

    expect(container.querySelector('[class*="animate-"]')).toBeNull();
    expect(container.querySelector('[class*="motion-"]')).toBeNull();
    expect(container.querySelector("[style*='animation']")).toBeNull();
  });

  it("includes a destination label without adding visible fake text", () => {
    const { container } = render(<RouteSkeleton variant="tool-form" label="Attack" />);

    expect(screen.getByRole("status", { name: "Loading Attack" })).toBeInTheDocument();
    expect(container.textContent).toBe("");
  });
});
