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
    const { container } = render(<RouteSkeleton variant={variant} label={variant} />);
    const status = screen.getByRole("status", { name: `Opening ${variant}` });
    const busyRegions = container.querySelectorAll("[data-route-skeleton]");
    const busyRegion = busyRegions[0];

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveClass("sr-only");
    expect(status).toHaveTextContent(`Opening ${variant}`);
    expect(status).not.toHaveAttribute("aria-busy");
    expect(status.closest('[aria-busy="true"]')).toBeNull();
    expect(busyRegions).toHaveLength(1);
    expect(busyRegion).toHaveAttribute("aria-busy", "true");
    expect(busyRegion).toHaveAttribute("data-route-skeleton", variant);
    expect(busyRegion).not.toHaveAttribute("role", "status");
    expect(busyRegion).toHaveClass("min-h-[60vh]");
    expect(busyRegion).toHaveTextContent(/^$/);
    expect(container.querySelectorAll("[data-route-skeleton-shape]").length).toBeGreaterThan(0);
  });

  it.each(variants)("keeps %s decorative shapes hidden and inert", (variant) => {
    const { container } = render(<RouteSkeleton variant={variant} label={variant} />);

    expect(container.querySelectorAll("a, button, input, select, textarea")).toHaveLength(0);
    expect(container.querySelectorAll('[tabindex]:not([tabindex="-1"])')).toHaveLength(0);

    for (const shape of container.querySelectorAll("[data-route-skeleton-shape]")) {
      expect(shape).toHaveAttribute("aria-hidden", "true");
      expect(shape).not.toHaveAttribute("tabindex");
    }
  });

  it.each(variants)("keeps %s static without animation hooks", (variant) => {
    const { container } = render(<RouteSkeleton variant={variant} label={variant} />);

    expect(container.querySelector('[class*="animate-"]')).toBeNull();
    expect(container.querySelector('[class*="motion-"]')).toBeNull();
    expect(container.querySelector("[style*='animation']")).toBeNull();
  });

  it("includes a destination label without adding visible fake text", () => {
    const { container } = render(<RouteSkeleton variant="tool-form" label="Attack" />);

    const status = screen.getByRole("status", { name: "Opening Attack" });
    expect(status).toHaveTextContent("Opening Attack");
    expect(container.querySelector('[data-route-skeleton="tool-form"]')).toHaveTextContent(/^$/);
  });

  it.each([
    ["es", "Atacar", "Abriendo Atacar"],
    ["hu", "Támadás", "Támadás megnyitása"],
  ])("accepts the %s localized route announcement", (_locale, label, statusText) => {
    render(<RouteSkeleton variant="tool-form" label={label} statusText={statusText} />);

    const status = screen.getByRole("status", { name: statusText });
    expect(status).toHaveTextContent(statusText);
    expect(status).not.toHaveTextContent("Opening");
    expect(status).not.toHaveTextContent("Attack");
  });
});
