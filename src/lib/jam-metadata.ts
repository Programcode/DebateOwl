import { jam } from "@jam.dev/sdk";

let currentUserId: string | undefined;

jam.metadata(() => ({ userId: currentUserId }));

export function setJamUserId(userId: string | undefined): void {
  currentUserId = userId;
}
