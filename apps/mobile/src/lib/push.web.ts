import type { AppLanguage } from '@debatelab/core/languages';

import type { PushState } from './push';

export type { PushState } from './push';

/**
 * The web preview cannot receive push. It acts as a phone that has not been
 * asked yet and turns on without registering anything, so the screenshot
 * script can show both states of the switch. The phone app uses push.ts.
 */
let enabledFor: string | null = null;

export function readPushState(userId: string): Promise<PushState> {
  return Promise.resolve(enabledFor === userId ? 'on' : 'off');
}

export function enablePush(userId: string, _language: AppLanguage): Promise<PushState> {
  enabledFor = userId;
  return Promise.resolve('on');
}

export function disablePush(_userId: string): Promise<void> {
  enabledFor = null;
  return Promise.resolve();
}

export function refreshPush(_userId: string, _language: AppLanguage): Promise<void> {
  return Promise.resolve();
}

export function forgetPushOnSignOut(_userId: string): Promise<void> {
  enabledFor = null;
  return Promise.resolve();
}
