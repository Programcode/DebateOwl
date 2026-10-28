import { Text as NativeText, type TextProps } from 'react-native';

import { fontFamily, type FontWeight } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

type Props = TextProps & { weight?: FontWeight; tone?: 'foreground' | 'heading' | 'secondary' | 'faint' };

/** Body text in Nunito; a display weight (Fredoka) is a heading and takes the heading navy unless a tone is given. */
export function Text({ weight = 'regular', tone, style, ...props }: Props) {
  const { colors } = useTheme();
  const color = colors[tone ?? (weight.startsWith('display') ? 'heading' : 'foreground')];
  return <NativeText {...props} style={[{ color, fontFamily: fontFamily[weight] }, style]} />;
}
