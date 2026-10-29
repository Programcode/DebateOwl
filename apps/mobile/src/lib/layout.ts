import { createContext, useContext } from 'react';
import { Dimensions, Platform, useWindowDimensions } from 'react-native';
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

/**
 * The app's own iPad sidebar (components/app-sidebar.tsx), which lists every
 * tool. It shows in a full-screen iPad window from the regular width; Split
 * View, Slide Over and narrower windows keep the tab bar.
 */
export const SIDEBAR_WIDTH = { regular: 260, wide: 300 } as const;
/** The sidebar is fixed chrome: it grows with Dynamic Type up to this much. */
export const SIDEBAR_MAX_FONT_SCALE = 1.35;

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

/**
 * The sidebar's width for a window, or 0 when the window keeps the tab bar.
 * On iPad the window must fill the screen: in Split View, Slide Over or a
 * Stage Manager window the system's width class is compact or the room is
 * shared, so the tab bar stays. The web preview has no Split View.
 */
export function sidebarWidthFor(window: { width: number; fontScale: number }, isPad: boolean, screenWidth: number): number {
  if (Platform.OS === 'ios' && (!isPad || window.width < screenWidth - 1)) return 0;
  if (Platform.OS !== 'ios' && Platform.OS !== 'web') return 0;
  const layout = layoutClassFor(window.width, isPad);
  if (layout === 'phone') return 0;
  const scale = Math.min(Math.max(window.fontScale, 1), SIDEBAR_MAX_FONT_SCALE);
  return Math.round(SIDEBAR_WIDTH[layout] * scale);
}

/** The width the sidebar takes from the window right now; 0 when it is hidden. */
export function useSidebarWidth(): number {
  const window = useWindowDimensions();
  return sidebarWidthFor(window, Platform.OS === 'ios' && Platform.isPad, Dimensions.get('screen').width);
}

/**
 * How much of the window's width the root layout gives to the sidebar.
 * Screens beside it lay out for the rest; sheets and full-screen modals, which
 * cover the sidebar, provide 0 again.
 */
export const ReservedWidth = createContext(0);

/** The width a screen lays out in: the window, less the sidebar beside it. */
export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  return width - useContext(ReservedWidth);
}

/** The layout class for the room a screen has; it changes with rotation, Split View and the sidebar. */
export function useLayoutClass(): LayoutClass {
  return layoutClassFor(useContentWidth(), Platform.OS === 'ios' && Platform.isPad);
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
