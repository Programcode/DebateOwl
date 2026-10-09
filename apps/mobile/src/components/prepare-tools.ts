import type { Href } from 'expo-router';

import type { IconName } from './icon-paths';

/** The Prepare tools, in the website's order. Flowchart follows in a later update. */
export const PREPARE_TOOLS = [
  { key: 'generate', icon: 'sparkles' },
  { key: 'brainstorm', icon: 'bulb' },
  { key: 'factoids', icon: 'book' },
  { key: 'flowchart', icon: 'branch' },
] as const satisfies readonly { key: string; icon: IconName }[];

export type PrepareTool = (typeof PREPARE_TOOLS)[number]['key'];

/** Where a Prepare tool opens, remembering the tab it was opened from for the back button. */
export function prepareToolHref(tool: PrepareTool, from: 'debate' | 'prepare'): Href {
  switch (tool) {
    case 'generate':
      return { pathname: '/generate', params: { from } };
    case 'brainstorm':
      return { pathname: '/brainstorm', params: { from } };
    case 'factoids':
      return { pathname: '/factoids', params: { from } };
    default:
      return { pathname: '/coming/[tool]', params: { tool } };
  }
}
