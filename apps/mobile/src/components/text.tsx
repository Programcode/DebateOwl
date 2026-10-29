import { Text as NativeText, StyleSheet, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { fontFamily, type FontWeight } from '@/theme/fonts';
import { webFontScale } from '@/theme/font-scale';
import { useTheme } from '@/theme/use-theme';

type Props = TextProps & { weight?: FontWeight; tone?: 'foreground' | 'heading' | 'secondary' | 'faint' };

/**
 * Sizes for a text size the web preview draws (font-scale.web.ts); on iOS the
 * system scales text and this returns the style unchanged. A cap set with
 * maxFontSizeMultiplier applies, as on iOS.
 */
export function scaledForPreview<T extends TextStyle>(style: StyleProp<T>, maxFontSizeMultiplier?: number | null): StyleProp<T> {
  const scale = webFontScale();
  if (scale === 1) return style;
  const factor = maxFontSizeMultiplier && maxFontSizeMultiplier >= 1 ? Math.min(scale, maxFontSizeMultiplier) : scale;
  const flat = StyleSheet.flatten(style) as T | undefined;
  const fontSize = flat?.fontSize ?? 14;
  return [style, { fontSize: fontSize * factor, ...(flat?.lineHeight ? { lineHeight: flat.lineHeight * factor } : {}) } as T];
}

/** Body text in Nunito; a display weight (Fredoka) is a heading and takes the heading navy unless a tone is given. */
export function Text({ weight = 'regular', tone, style, ...props }: Props) {
  const { colors } = useTheme();
  const color = colors[tone ?? (weight.startsWith('display') ? 'heading' : 'foreground')];
  return <NativeText {...props} style={scaledForPreview([{ color, fontFamily: fontFamily[weight] }, style], props.maxFontSizeMultiplier)} />;
}
