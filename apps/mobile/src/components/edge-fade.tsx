import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * A fade over the trailing edge of a sideways-scrolling row, so a row that
 * continues off screen reads as scrollable rather than cut off.
 */
export function EdgeFade({ color, width = 36, id }: { color: string; width?: number; id: string }) {
  return (
    <View pointerEvents="none" style={[styles.fade, { width }]}>
      <Svg width={width} height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="1" stopColor={color} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', top: 0, bottom: 0, right: 0 },
});
