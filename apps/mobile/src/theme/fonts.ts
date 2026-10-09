import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

export const interFonts = { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold };

/** Custom fonts on iOS need one family per weight; `fontWeight` alone falls back to the system font. */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export type FontWeight = keyof typeof fontFamily;
