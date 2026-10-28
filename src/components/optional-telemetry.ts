import type { ComponentType } from "react";

function HiddenTelemetry(): null {
  return null;
}

/**
 * Analytics chunks are optional. Vite resolves a prevented preload error to
 * undefined, and destructuring that argument throws
 * "(destructured parameter) is undefined" in Firefox, which takes down /login.
 */
export function componentFromModule(
  module: Record<string, unknown> | null | undefined,
  exportName: string,
): ComponentType {
  const component = module?.[exportName];
  return typeof component === "function" ? component as ComponentType : HiddenTelemetry;
}

export function loadOptionalComponent(
  load: () => Promise<Record<string, unknown> | null | undefined>,
  exportName: string,
): Promise<{ default: ComponentType }> {
  return Promise.resolve()
    .then(load)
    .then((module) => ({ default: componentFromModule(module, exportName) }))
    .catch(() => ({ default: HiddenTelemetry }));
}
