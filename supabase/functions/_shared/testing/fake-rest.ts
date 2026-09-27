// Test support: a tiny in-memory stand-in for PostgREST reads. It applies
// `eq.` and `in.()` filters, `order`, and `limit` the way supabase-js sends
// them, and records every query so tests can assert on the filters used.

export type Row = Record<string, unknown>;

export interface RecordedQuery {
  table: string;
  params: URLSearchParams;
}

function parseIn(value: string): string[] {
  const inner = value.slice("in.(".length, -1);
  return inner ? inner.split(",").map((item) => item.replace(/^"|"$/g, "")) : [];
}

function matches(row: Row, params: URLSearchParams): boolean {
  for (const [key, value] of params) {
    if (key === "select" || key === "order" || key === "limit" || key === "offset") continue;
    const actual = row[key] === null || row[key] === undefined ? "null" : String(row[key]);
    if (value.startsWith("eq.")) {
      if (actual !== value.slice(3)) return false;
    } else if (value.startsWith("in.(")) {
      if (!parseIn(value).includes(actual)) return false;
    } else {
      throw new Error(`fake-rest does not support filter ${key}=${value}`);
    }
  }
  return true;
}

export function createFakeRest(tables: Record<string, Row[]>) {
  const queries: RecordedQuery[] = [];
  const handle = (url: URL, init?: RequestInit): Response | undefined => {
    const match = url.pathname.match(/\/rest\/v1\/([a-z_]+)$/);
    if (!match || !(match[1] in tables)) return undefined;
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") return undefined;
    const table = match[1];
    queries.push({ table, params: new URLSearchParams(url.searchParams) });
    let rows = tables[table].filter((row) => matches(row, url.searchParams));
    const order = url.searchParams.get("order");
    if (order) {
      const [column, direction] = order.split(".");
      rows = [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (direction === "desc" ? -1 : 1));
    }
    const limit = Number(url.searchParams.get("limit") ?? Number.NaN);
    if (Number.isFinite(limit)) rows = rows.slice(0, limit);
    const headers = new Headers(init?.headers);
    if ((headers.get("accept") ?? "").includes("vnd.pgrst.object")) {
      if (rows.length !== 1) {
        return new Response(JSON.stringify({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }), {
          status: 406,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(rows[0]), { headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(rows), { headers: { "Content-Type": "application/json" } });
  };
  return { handle, queries };
}
