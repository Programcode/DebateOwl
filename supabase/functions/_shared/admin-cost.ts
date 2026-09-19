export const IMPORT_SOURCE_FEATURE = "import_source";

export type AdminCostRow = {
  feature?: string | null;
  status?: string | null;
  cost_usd?: number | string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
};

export function isNonAiActivity(row: Pick<AdminCostRow, "feature">): boolean {
  return row.feature === IMPORT_SOURCE_FEATURE;
}

export function isCostableAiRequest(row: Pick<AdminCostRow, "feature" | "status">): boolean {
  return (row.status === "success" || row.status === "error" || row.status === "cancelled") && !isNonAiActivity(row);
}

function isKnownCostValue(value: AdminCostRow["cost_usd"]): value is number | string {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return false;
  const cost = Number(value);
  return Number.isFinite(cost) && cost >= 0;
}

export function hasUnknownCost(row: AdminCostRow): boolean {
  return isCostableAiRequest(row) && !isKnownCostValue(row.cost_usd);
}

export function getKnownCost(row: AdminCostRow): number {
  if (!isCostableAiRequest(row) || hasUnknownCost(row)) return 0;
  if (!isKnownCostValue(row.cost_usd)) return 0;
  const cost = Number(row.cost_usd);
  return Number.isFinite(cost) ? cost : 0;
}

export async function collectAdminUsagePages<T>(
  loadPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0;; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
