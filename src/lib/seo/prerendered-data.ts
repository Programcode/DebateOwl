/**
 * Data a prerendered page was built from. scripts/prerender.mjs writes a
 * page's `data` into the head as <script type="application/json"
 * id="prerendered-data">, so the browser can render the same page at once
 * instead of fetching it first. Each payload names its route: after a
 * client-side navigation the script still describes the first page loaded.
 */
export function readPrerenderedData<T extends { route: string }>(route: string): T | undefined {
  if (typeof document === 'undefined') return undefined;
  try {
    const data = JSON.parse(document.getElementById('prerendered-data')?.textContent ?? 'null') as T | null;
    return data?.route === route ? data : undefined;
  } catch {
    return undefined;
  }
}
