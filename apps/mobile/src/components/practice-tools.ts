import type { IconName } from './icon-paths';

/**
 * The Practice tools, in the website's order, then its free tools.
 * All of them are in the app. The free tools name themselves from the
 * website's `tools` catalog.
 */
export const PRACTICE_TOOLS = [
  { key: 'attack', icon: 'shield' },
  { key: 'ask', icon: 'chat' },
  { key: 'crossfire', icon: 'help' },
  { key: 'sparring', icon: 'swords' },
  { key: 'timer', icon: 'timer' },
  { key: 'speech-time', icon: 'quote', title: 'calc.region', description: 'mobile.practice.speechTimeDesc' },
  { key: 'flow-sheet', icon: 'file', title: 'flow.region', description: 'mobile.practice.flowSheetDesc' },
  { key: 'motions', icon: 'sparkles', title: 'motions.region', description: 'mobile.practice.motionsDesc' },
] as const satisfies readonly { key: string; icon: IconName; title?: string; description?: string }[];

export type PracticeTool = (typeof PRACTICE_TOOLS)[number]['key'];
