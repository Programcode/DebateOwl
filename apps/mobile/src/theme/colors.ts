/**
 * DebateOwl colours for the app, from the website's design tokens
 * (src/styles/tokens.css and the roles in src/index.css): plume blue, ink
 * neutrals, beak gold, mint for success (always with a check mark) and coral.
 * Text tints and fills are separate, as on the website: `primary` is the blue
 * that passes AA as text, `primaryFill` is the button face with white text.
 */
export const palette = {
  light: {
    background: '#F7FAFE',
    card: '#FFFFFF',
    foreground: '#1F2B40',
    /** Page and card headings: navy, the colour of the owl's outline. */
    heading: '#0B2A6E',
    secondary: '#526380',
    faint: '#5F708A',
    border: '#E2E9F2',
    line: '#E2E9F2',
    primary: '#0556D6',
    primaryFill: '#0A6FF0',
    primaryLedge: '#0342A8',
    onPrimary: '#FFFFFF',
    tile: '#EEF7FF',
    tileForeground: '#0556D6',
    chipSelectedBorder: '#7CC0FE',
    chipSelectedForeground: '#0342A8',
    segmentTrack: '#EFF4FA',
    segmentSelected: '#FFFFFF',
    input: '#FFFFFF',
    inputBorder: '#8494AB',
    borderStrong: '#CDD7E4',
    tabInactive: '#8494AB',
    tabBar: 'rgba(247,250,254,0.88)',
    destructive: '#D23239',
    destructiveLedge: '#7E1B20',
    success: '#0A8058',
    successFill: '#14B37D',
    successTint: '#E6FBF3',
    warning: '#9A5806',
    accent: '#FFC414',
    accentLedge: '#C9740A',
    onAccent: '#0B2A6E',
    tileBorder: '#B3D8FC',
    tileText: '#0B2A6E',
    neutralLedge: '#CDD7E4',
    disabledFace: '#E2E9F2',
    disabledText: '#8494AB',
  },
  dark: {
    background: '#0B1426',
    card: '#131E33',
    foreground: '#EEF4FF',
    heading: '#FFFFFF',
    secondary: '#A9B7C9',
    faint: '#8E9FB6',
    border: '#24324D',
    line: '#24324D',
    primary: '#4CA6FD',
    primaryFill: '#0A6FF0',
    primaryLedge: '#02307E',
    onPrimary: '#FFFFFF',
    tile: '#0E2350',
    tileForeground: '#7CC0FE',
    chipSelectedBorder: '#1D4691',
    chipSelectedForeground: '#B3D8FC',
    segmentTrack: '#08101F',
    segmentSelected: '#1C2A44',
    input: '#0B1426',
    inputBorder: '#5F708A',
    borderStrong: '#2F4062',
    tabInactive: '#7486A0',
    tabBar: 'rgba(11,20,38,0.88)',
    destructive: '#FF6B70',
    destructiveLedge: '#B32A30',
    success: '#55DBAB',
    successFill: '#2FD39A',
    successTint: '#0A2A20',
    warning: '#FFD95A',
    accent: '#FFC414',
    accentLedge: '#9A5806',
    onAccent: '#061442',
    tileBorder: '#1D4691',
    tileText: '#EEF4FF',
    neutralLedge: '#060C18',
    disabledFace: '#24324D',
    disabledText: '#7486A0',
  },
} as const;

export type Palette = { [K in keyof typeof palette.light]: string };

/** The ledge under a tactile button, as the website's `.btn` draws it (4px, 3px for small ones). */
export const LEDGE = 4;

export const radius = { tile: 14, field: 14, card: 18, pill: 999 } as const;
