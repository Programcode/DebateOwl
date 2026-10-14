import type { IconName } from './icon-paths';

/** The Practice tools, in the website's order. All of them are in the app. */
export const PRACTICE_TOOLS = [
  { key: 'attack', icon: 'shield' },
  { key: 'ask', icon: 'chat' },
  { key: 'crossfire', icon: 'help' },
  { key: 'sparring', icon: 'swords' },
  { key: 'timer', icon: 'timer' },
] as const satisfies readonly { key: string; icon: IconName }[];

export type PracticeTool = (typeof PRACTICE_TOOLS)[number]['key'];
