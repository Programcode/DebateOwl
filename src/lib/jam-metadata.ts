/**
 * Publishes the current user id to the Jam recorder, which reads
 * `window.__jam__.exports.metadata`. The recorder itself loads as a script
 * tag from jam-loader.ts, so the npm SDK is not installed; it only wrote
 * this same global.
 */
interface JamWindow extends Window {
  __jam__?: { exports?: { metadata?: () => { userId: string | undefined } } };
}

let currentUserId: string | undefined;

const jamWindow = window as JamWindow;
jamWindow.__jam__ ??= {};
jamWindow.__jam__.exports ??= {};
jamWindow.__jam__.exports.metadata = () => ({ userId: currentUserId });

export function setJamUserId(userId: string | undefined): void {
  currentUserId = userId;
}
