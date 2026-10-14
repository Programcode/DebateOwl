import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The iPad layouts (plans: iPad mock A, with mock C's docked claim inspector).
 * Every width the layouts depend on lives here, so screens ask for a layout
 * class instead of checking widths themselves.
 *
 * - phone: iPhones at any width, and iPad windows under 700 points (Split View,
 *   Slide Over, small Stage Manager windows). Today's phone layout, unchanged.
 * - regular: iPad windows from 700 to 1100 points (portrait, two-thirds Split View).
 * - wide: iPad windows from 1100 points (landscape full screen).
 */
export type LayoutClass = 'phone' | 'regular' | 'wide';

export const BREAKPOINTS = { regular: 700, wide: 1100 } as const;

/** A docked pane beside the main content, such as the Flowchart's claim inspector. */
export const PANE_WIDTH = { regular: 360, wide: 400 } as const;

/** The list beside a detail pane: the Library's sources and Ask's conversations. */
export const LIST_WIDTH = { library: 340, libraryRoomy: 380, ask: 320 } as const;
/** The Library list widens once the window has this much room. */
export const LIBRARY_ROOMY_WIDTH = 960;

/** The sidebar the web preview draws in the wide layout; iPadOS draws its own. */
export const SIDEBAR_WIDTH = 300;

/** The Debate home splits into two columns from this content width. */
export const HOME_COLUMNS_WIDTH = 760;
export const HOME_MAX_WIDTH = 1120;

/** Documents show the outline rail from this window width. */
export const RAIL_MIN_WIDTH = 900;
export const RAIL_WIDTH = 250;

export function layoutClassFor(width: number, isPad: boolean): LayoutClass {
  // An iPhone in landscape can be wider than 700 points; it keeps the phone layout.
  if (Platform.OS === 'ios' && !isPad) return 'phone';
  if (width >= BREAKPOINTS.wide) return 'wide';
  if (width >= BREAKPOINTS.regular) return 'regular';
  return 'phone';
}

/** The layout class for the current window; it changes with rotation and Split View. */
export function useLayoutClass(): LayoutClass {
  const { width } = useWindowDimensions();
  return layoutClassFor(width, Platform.OS === 'ios' && Platform.isPad);
}

/** The height of iOS's navigation bar under the status bar. */
const NAV_BAR_HEIGHT = 52;

/**
 * How much of a screen's top a translucent native header covers, for docked
 * panes that sit beside a scroll view instead of in it. The web preview draws
 * its bar above the content, so nothing is covered there.
 */
export function useHeaderCover(): number {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'ios' ? insets.top + NAV_BAR_HEIGHT : 0;
}
