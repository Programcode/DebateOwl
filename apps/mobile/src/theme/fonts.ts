import { Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';

/**
 * DebateOwl's fonts, as on the website (src/index.css): Nunito for body text,
 * Fredoka for headings and buttons. Nunito reads thin below 600, so body text
 * starts there and every step moves up one notch, as the website's
 * --font-weight-* tokens do.
 */
export const appFonts = {
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
};

/** Custom fonts on iOS need one family per weight; `fontWeight` alone falls back to the system font. */
export const fontFamily = {
  regular: 'Nunito_600SemiBold',
  medium: 'Nunito_700Bold',
  semibold: 'Nunito_700Bold',
  bold: 'Nunito_800ExtraBold',
  /** Headings and button labels. */
  display: 'Fredoka_600SemiBold',
  displayMedium: 'Fredoka_500Medium',
  displayBold: 'Fredoka_700Bold',
} as const;

export type FontWeight = keyof typeof fontFamily;
