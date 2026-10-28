import type { IconName } from './icon-paths';

/** Where a sidebar row goes: one of the five tabs, or a screen pushed above them. */
export type SidebarTarget =
  | { kind: 'tab'; href: '/' | '/library' | '/you' }
  | { kind: 'screen'; pathname: string; params?: Record<string, string> }
  /** Import file: the Files picker opens first, as the Library's Add menu does. */
  | { kind: 'pickFile' };

export interface SidebarItem {
  key: string;
  /** A catalog key. */
  label: string;
  icon: IconName;
  target: SidebarTarget;
  /** Paths that count as this row, so it stays highlighted on the documents it opens. */
  matches: (pathname: string) => boolean;
}

export interface SidebarSection {
  key: 'debate' | 'prepare' | 'practice' | 'library' | 'you';
  label: string;
  items: SidebarItem[];
}

const under = (...prefixes: string[]) => (pathname: string) =>
  prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

/**
 * Every place in the app, grouped the way Adam asked for the iPad sidebar:
 * Debate, Prepare, Practice, Library and You. A tool's documents count as the
 * tool, so a saved case keeps Generate highlighted. Practice tools from round 3
 * go at the end of their section once they exist.
 */
export const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    key: 'debate',
    label: 'mobile.tabs.debate',
    items: [
      { key: 'dashboard', label: 'mobile.sidebar.dashboard', icon: 'target', target: { kind: 'tab', href: '/' }, matches: (pathname) => pathname === '/' },
      { key: 'history', label: 'nav.history', icon: 'history', target: { kind: 'screen', pathname: '/history' }, matches: under('/history') },
    ],
  },
  {
    key: 'prepare',
    label: 'mobile.tabs.prepare',
    items: [
      { key: 'generate', label: 'nav.generate', icon: 'sparkles', target: { kind: 'screen', pathname: '/generate' }, matches: under('/generate', '/case', '/save-case') },
      { key: 'attack', label: 'nav.attack', icon: 'shield', target: { kind: 'screen', pathname: '/attack' }, matches: under('/attack') },
      { key: 'brainstorm', label: 'nav.brainstorm', icon: 'bulb', target: { kind: 'screen', pathname: '/brainstorm' }, matches: under('/brainstorm') },
      { key: 'factoids', label: 'nav.factoids', icon: 'book', target: { kind: 'screen', pathname: '/factoids' }, matches: under('/factoids') },
      { key: 'ask', label: 'nav.ask', icon: 'chat', target: { kind: 'screen', pathname: '/ask' }, matches: under('/ask') },
    ],
  },
  {
    key: 'practice',
    label: 'mobile.tabs.practice',
    items: [
      { key: 'sparring', label: 'nav.sparring', icon: 'swords', target: { kind: 'screen', pathname: '/sparring' }, matches: under('/sparring') },
      { key: 'crossfire', label: 'nav.crossfire', icon: 'help', target: { kind: 'screen', pathname: '/crossfire' }, matches: under('/crossfire') },
      { key: 'flowchart', label: 'nav.flowchart', icon: 'branch', target: { kind: 'screen', pathname: '/flowchart' }, matches: under('/flowchart') },
      { key: 'timer', label: 'nav.timer', icon: 'timer', target: { kind: 'screen', pathname: '/timer' }, matches: under('/timer') },
    ],
  },
  {
    key: 'library',
    label: 'mobile.tabs.library',
    items: [
      { key: 'sources', label: 'mobile.sidebar.sources', icon: 'library', target: { kind: 'tab', href: '/library' }, matches: under('/library', '/source') },
      { key: 'add-link', label: 'mobile.library.pasteLink', icon: 'link', target: { kind: 'screen', pathname: '/add-link' }, matches: under('/add-link') },
      { key: 'new-note', label: 'mobile.library.writeNote', icon: 'note', target: { kind: 'screen', pathname: '/new-note' }, matches: under('/new-note') },
      { key: 'add-file', label: 'mobile.library.importFile', icon: 'upload', target: { kind: 'pickFile' }, matches: under('/add-file') },
    ],
  },
  {
    key: 'you',
    label: 'mobile.tabs.you',
    items: [
      { key: 'account', label: 'mobile.sidebar.account', icon: 'user', target: { kind: 'tab', href: '/you' }, matches: under('/you', '/delete-account', '/delete-data') },
    ],
  },
];

/** The row the current path belongs to, if any. Sheets like the switcher belong to none and keep the last one. */
export function activeSidebarItem(pathname: string): string | null {
  for (const section of SIDEBAR_SECTIONS) {
    for (const item of section.items) if (item.matches(pathname)) return item.key;
  }
  return null;
}
