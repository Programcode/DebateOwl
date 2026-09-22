type CollaborationEnvironment = {
  VITE_COLLABORATION_URL?: string;
  VITE_LOCAL_PREVIEW?: string;
};

export function resolveCollaborationUrl(environment: CollaborationEnvironment) {
  const value = environment.VITE_COLLABORATION_URL?.trim();
  if (!value) {
    if (environment.VITE_LOCAL_PREVIEW === "true") {
      throw new Error("Local collaboration configuration is incomplete");
    }
    return null;
  }

  const url = new URL(value);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (environment.VITE_LOCAL_PREVIEW === "true" && url.protocol !== "wss:" && !(loopback && url.protocol === "ws:")) {
    throw new Error("Local collaboration URL must use WSS outside loopback");
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("Collaboration URL must use WebSocket transport");
  }
  return url.href.replace(/\/$/, "");
}

export const COLLABORATION_URL = resolveCollaborationUrl(import.meta.env);
