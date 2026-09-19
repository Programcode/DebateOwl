import { lazy, Suspense, useEffect, useState } from "react";

const Analytics = lazy(() => import("@vercel/analytics/react").then(({ Analytics: Component }) => ({ default: Component })));
const SpeedInsights = lazy(() => import("@vercel/speed-insights/react").then(({ SpeedInsights: Component }) => ({ default: Component })));

export function WebTelemetry() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const reveal = (): void => {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => setReady(true));
      } else {
        window.setTimeout(() => setReady(true), 0);
      }
    };
    if (document.readyState === "complete") reveal();
    else window.addEventListener("load", reveal, { once: true });
    return () => window.removeEventListener("load", reveal);
  }, []);

  if (!ready) return null;

  return (
    <Suspense fallback={null}>
      <Analytics />
      <SpeedInsights />
    </Suspense>
  );
}
