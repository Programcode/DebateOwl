/**
 * DebateLab colours for the app. Light values come from the approved mocks
 * (plans/2026-10-08-native-ios-app), dark values from the website's `.dark`
 * palette in src/index.css.
 */
export const palette = {
  light: {
    background: '#eef4fa',
    card: '#f8fafc',
    foreground: '#0f172a',
    secondary: '#475569',
    faint: '#64748b',
    border: '#cbd5e1',
    line: '#e2e8f0',
    primary: '#0284c7',
    onPrimary: '#ffffff',
    tile: '#e0f2fe',
    tileForeground: '#0284c7',
    chipSelectedBorder: '#7dd3fc',
    chipSelectedForeground: '#075985',
    segmentTrack: '#e2e8f0',
    segmentSelected: '#ffffff',
    input: '#ffffff',
    tabInactive: '#94a3b8',
    tabBar: 'rgba(248,250,252,0.84)',
    destructive: '#dc2626',
    success: '#16a34a',
    warning: '#d97706',
    tileBorder: '#bae6fd',
    tileText: '#0c4a6e',
  },
  dark: {
    background: '#0f172a',
    card: '#1e293b',
    foreground: '#f8fafc',
    secondary: '#cbd5e1',
    faint: '#94a3b8',
    border: '#475569',
    line: '#334155',
    primary: '#38bdf8',
    onPrimary: '#082f49',
    tile: '#15304a',
    tileForeground: '#7dd3fc',
    chipSelectedBorder: '#0369a1',
    chipSelectedForeground: '#bae6fd',
    segmentTrack: '#1e293b',
    segmentSelected: '#334155',
    input: '#0f172a',
    tabInactive: '#64748b',
    tabBar: 'rgba(15,23,42,0.84)',
    destructive: '#f87171',
    success: '#4ade80',
    warning: '#fbbf24',
    tileBorder: '#1e4a6b',
    tileText: '#e0f2fe',
  },
} as const;

export type Palette = { [K in keyof typeof palette.light]: string };

/** The website's Start Trial gradient. It marks the one main action on a screen. */
export const mainActionGradient = {
  colors: ['#0284c7', '#0ea5e9', '#14b8a6'],
  locations: [0, 0.45, 1],
  // 115deg in CSS, as start and end points for expo-linear-gradient.
  start: { x: 0, y: 0.3 },
  end: { x: 1, y: 0.7 },
} as const;

export const radius = { tile: 11, field: 12, card: 16, pill: 999 } as const;
