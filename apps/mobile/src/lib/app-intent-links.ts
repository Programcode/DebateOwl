import { appPathForUrl, isShareCode } from './deep-links';

/**
 * Where a screen of the app continues on another device (Handoff), and which
 * handed-over screens the app opens. Like deep-links.ts, this file has no React
 * Native or Expo imports, so it is unit-tested in Node.
 *
 * Siri and Shortcuts (plugins/app-intents/DebateOwlAppIntents.swift) need nothing
 * here: they open the app's own debatelab:// links (timer, ask?q=, new-debate,
 * generate?motion=, library, sparring), which Expo Router routes as it does any
 * other.
 */

export const WEBSITE_ORIGIN = 'https://debateowl.com';

export type HandoffTarget = {
  /** A path on debateowl.com: a page of the website's src/App.tsx. */
  webPath: string;
  /** The i18n key of the activity's title. */
  titleKey: string;
};

const target = (webPath: string, titleKey: string): HandoffTarget => ({ webPath, titleKey });

const DEBATE = target('/app', 'nav.currentDebate');
const LIBRARY = target('/app/library', 'nav.library');
const SETTINGS = target('/app/settings', 'nav.settings');
const FLOWCHART = target('/app/flowchart', 'nav.flowchart');
const TIMER = target('/tools/debate-timer', 'timer.title');

/**
 * Expo Router pathnames (route groups left out) and their website page. The
 * timer, speech time calculator and motion generator are the website's free
 * tools, which the app mirrors, not its signed-in TimerPage. A sheet continues
 * on the page it belongs to.
 */
const SCREENS: Record<string, HandoffTarget> = {
  '/': DEBATE,
  '/prepare': target('/app', 'home.prepare'),
  '/practice': target('/app', 'home.practice'),
  '/debates': DEBATE,
  '/new-debate': DEBATE,
  '/edit-debate': DEBATE,
  '/debate-check': DEBATE,
  '/context-review': DEBATE,
  '/welcome': DEBATE,
  '/library': LIBRARY,
  '/add-link': LIBRARY,
  '/new-note': LIBRARY,
  '/add-file': LIBRARY,
  '/you': SETTINGS,
  '/delete-account': SETTINGS,
  '/delete-data': SETTINGS,
  '/limit': SETTINGS,
  '/history': target('/app/history', 'nav.history'),
  '/save-case': target('/app/history?tab=cases', 'nav.history'),
  '/ask': target('/app/ask', 'nav.ask'),
  '/generate': target('/app/generate', 'nav.generate'),
  '/attack': target('/app/attack', 'nav.attack'),
  '/brainstorm': target('/app/brainstorm', 'nav.brainstorm'),
  '/factoids': target('/app/factoids', 'nav.factoids'),
  '/crossfire': target('/app/crossfire', 'nav.crossfire'),
  '/sparring': target('/app/sparring', 'nav.sparring'),
  '/flowchart': FLOWCHART,
  '/flowchart/card': FLOWCHART,
  '/flowchart/claim': FLOWCHART,
  '/flowchart/maps': FLOWCHART,
  '/timer': TIMER,
  '/timer-format': TIMER,
  '/speech-time': target('/tools/speech-time-calculator', 'guideHub.links.tools/speech-time-calculator'),
  '/motions': target('/tools/debate-motion-generator', 'guideHub.links.tools/debate-motion-generator'),
};

/**
 * Saved documents by id. The website cannot open one from its address, so they
 * continue on History, on the tab that lists them (HistoryPage's `tab`).
 */
const DOCUMENTS: Record<string, string> = {
  case: 'cases',
  attack: 'attacks',
  brainstorm: 'brainstorms',
  factoids: 'factoids',
  sparring: 'sparring',
  'crossfire-round': 'crossfire',
};

const SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_PATH_LENGTH = 512;

/**
 * The website page that continues `pathname`, or null when nothing should be
 * offered: sign-in, and any screen this table does not know.
 */
export function handoffTarget(pathname: string): HandoffTarget | null {
  if (pathname.length > MAX_PATH_LENGTH) return null;
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (Object.prototype.hasOwnProperty.call(SCREENS, path)) return SCREENS[path];

  const segments = path.split('/').slice(1);
  if (segments.length !== 2 || !SEGMENT.test(segments[1])) return null;
  const [first, id] = segments;
  if (Object.prototype.hasOwnProperty.call(DOCUMENTS, first)) {
    return target(`/app/history?tab=${DOCUMENTS[first]}`, 'nav.history');
  }
  if (first === 'source') return LIBRARY;
  if (first === 'soon') return target('/app', 'home.practice');
  if (first === 'share' && isShareCode(id)) return target(`/share/${id}`, 'sharedPage.title');
  return null;
}

/**
 * The route to open for a screen another device handed over (its activity's
 * app route, or its web address when it had none). Only a route Handoff would
 * offer, or a website link the app already opens, is accepted.
 */
export function continuedRoute(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_PATH_LENGTH) return null;
  if (/^https:/i.test(value)) return appPathForUrl(value);
  if (!value.startsWith('/') || value.includes('//')) return null;
  if (!handoffTarget(value)) return null;
  // A result kept only on the device that made it (open-results.ts's local- keys) is not here; its History is.
  const [, first, id] = value.split('/');
  if (Object.prototype.hasOwnProperty.call(DOCUMENTS, first) && id?.startsWith('local-')) return '/history';
  return value;
}
