import type { SupportedStorage } from '@supabase/supabase-js';

// The web build exists for screenshots on the VPS. SecureStore has no web
// implementation, so this uses localStorage, like the website does. Static
// rendering runs in Node, where there is no localStorage.
function store(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export const sessionStorage: SupportedStorage = {
  getItem: (key) => store()?.getItem(key) ?? null,
  setItem: (key, value) => store()?.setItem(key, value),
  removeItem: (key) => store()?.removeItem(key),
};

const INSTALL_ID_KEY = 'debatelab.install-id';

export async function getInstallId(): Promise<string> {
  const storage = store();
  const existing = storage?.getItem(INSTALL_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  storage?.setItem(INSTALL_ID_KEY, id);
  return id;
}
