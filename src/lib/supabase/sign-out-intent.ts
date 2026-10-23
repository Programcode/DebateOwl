// Set while the user signs out on purpose (Settings > Sign out). RequireAuth
// then sends them to /login without the page they left, so the next sign-in
// opens /app instead of Settings. A session that ends by itself (expiry,
// revocation) leaves it unset, and the same account returns to its page.
let signingOutOnPurpose = false;

export function markSignOutIntent(): void {
  signingOutOnPurpose = true;
}

export function clearSignOutIntent(): void {
  signingOutOnPurpose = false;
}

export function hasSignOutIntent(): boolean {
  return signingOutOnPurpose;
}
