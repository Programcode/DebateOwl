export type WorkspaceDraft = {
  documentId: string;
  epoch: number;
  pendingMutationIds: string[];
  snapshot: Uint8Array;
  updatedAt: number;
  userId: string;
  workspaceId: string;
};

const DATABASE = "debatelab-workspace";
const STORE = "drafts";

export function workspaceDraftKey(draft: Pick<WorkspaceDraft, "documentId" | "epoch" | "userId" | "workspaceId">) {
  return `${draft.userId}:${draft.workspaceId}:${draft.documentId}:${draft.epoch}`;
}

function openDraftDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Draft storage unavailable"));
  });
}

export async function loadWorkspaceDraft(
  identity: Pick<WorkspaceDraft, "documentId" | "epoch" | "userId" | "workspaceId">,
) {
  const database = await openDraftDatabase();
  try {
    return await new Promise<WorkspaceDraft | undefined>((resolve, reject) => {
      const request = database.transaction(STORE).objectStore(STORE).get(workspaceDraftKey(identity));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Draft storage unavailable"));
    });
  } finally {
    database.close();
  }
}

export async function saveWorkspaceDraft(draft: WorkspaceDraft) {
  const database = await openDraftDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(draft, workspaceDraftKey(draft));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Draft storage unavailable"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Draft storage unavailable"));
    });
  } finally {
    database.close();
  }
}

export async function deleteWorkspaceDraft(
  identity: Pick<WorkspaceDraft, "documentId" | "epoch" | "userId" | "workspaceId">,
) {
  const database = await openDraftDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(workspaceDraftKey(identity));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Draft storage unavailable"));
    });
  } finally {
    database.close();
  }
}
