import { Text as NativeText, type TextProps } from 'react-native';

import { fontFamily, type FontWeight } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

type Props = TextProps & { weight?: FontWeight; tone?: 'foreground' | 'secondary' | 'faint' };

export function Text({ weight = 'regular', tone = 'foreground', style, ...props }: Props) {
  const { colors } = useTheme();
  return <NativeText {...props} style={[{ color: colors[tone], fontFamily: fontFamily[weight] }, style]} />;
}
