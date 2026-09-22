const STORAGE_KEY = "debate-workspace-invite-handoff";
const INVITE_PATH = "/app/workspaces/invite";
const TOKEN = /^wi_[A-Za-z0-9_-]{32}$/;

type Storage = Pick<StorageManager, never> & {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
};

export function stashWorkspaceInvite(
  location: { pathname: string; search: string },
  storage: Storage = sessionStorage,
) {
  const token = location.pathname === INVITE_PATH
    ? new URLSearchParams(location.search).get("token")
    : null;
  if (!token || !TOKEN.test(token)) return false;
  storage.setItem(STORAGE_KEY, token);
  return true;
}

export function consumeWorkspaceInvite(storage: Storage = sessionStorage) {
  const token = storage.getItem(STORAGE_KEY);
  storage.removeItem(STORAGE_KEY);
  return token && TOKEN.test(token)
    ? `${INVITE_PATH}?${new URLSearchParams({ token })}`
    : null;
}
