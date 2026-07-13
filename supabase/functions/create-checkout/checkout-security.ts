type StripeCustomerLike = {
  id: string;
  deleted?: boolean;
  metadata?: Record<string, string> | null;
};

const ALLOWED_CHECKOUT_CALLBACKS = new Set([
  "https://debate.pi-stack.org",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:54321",
  "capacitor://localhost",
]);

function callbackOrigin(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

export function isAllowedCheckoutRedirectUrl(value: string): boolean {
  try {
    return ALLOWED_CHECKOUT_CALLBACKS.has(callbackOrigin(new URL(value)));
  } catch {
    return false;
  }
}

export function findCustomerOwnedByUser(
  customers: StripeCustomerLike[],
  userId: string,
): string | null {
  return customers.find((customer) => !customer.deleted && customer.metadata?.user_id === userId)?.id ?? null;
}
