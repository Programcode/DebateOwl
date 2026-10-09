import { SvgXml } from 'react-native-svg';

import { iconSvg, type IconName } from './icon-paths';

export function Icon({ name, color, size = 22 }: { name: IconName; color: string; size?: number }) {
  return <SvgXml xml={iconSvg(name, color, size)} width={size} height={size} />;
}
