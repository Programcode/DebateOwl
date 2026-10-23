import type { Route } from '@playwright/test';

/**
 * Answers the read-only quota check Crossfire and Sparring send to the `ai`
 * function before a round starts (`quotaCheck: true`, no `input`): a round
 * that fits. Returns true when the request was one; mocks call it first.
 */
export async function fulfillQuotaCheck(route: Route, headers: Record<string, string>): Promise<boolean> {
  let body: { quotaCheck?: unknown } | null = null;
  try {
    body = route.request().postDataJSON() as { quotaCheck?: unknown } | null;
  } catch {
    return false;
  }
  if (body?.quotaCheck !== true) return false;
  await route.fulfill({
    status: 200,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ quota: { allowed: true, limit: 50, current: 0, units: 1 } }),
  });
  return true;
}
