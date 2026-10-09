import type { IconName } from './icon-paths';

/** The Prepare tools, in the website's order. Generate is in the app; the others follow in later updates. */
export const PREPARE_TOOLS = [
  { key: 'generate', icon: 'sparkles' },
  { key: 'brainstorm', icon: 'bulb' },
  { key: 'factoids', icon: 'book' },
  { key: 'flowchart', icon: 'branch' },
] as const satisfies readonly { key: string; icon: IconName }[];

export type PrepareTool = (typeof PREPARE_TOOLS)[number]['key'];
