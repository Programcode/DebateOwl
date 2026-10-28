import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/use-theme';

const STROKE = 9;

/**
 * The live round's ring from mock 05: a faint track and a gradient arc for the
 * time left, drawn from the top. `warning` turns the arc red for the last seconds.
 */
export function TimerRing({ size, fraction, warning, children }: { size: number; fraction: number; warning?: boolean; children: ReactNode }) {
  const { colors, scheme } = useTheme();
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const left = Math.min(1, Math.max(0, fraction));
  // Plume, from the button face to its lighter tint: the website has no gradient, so the ring stays in one hue.
  const [from, to] = scheme === 'dark' ? ['#4CA6FD', '#7CC0FE'] : ['#0A6FF0', '#4CA6FD'];
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={styles.rotated}>
        <Defs>
          <LinearGradient id="timer-ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={warning ? colors.destructive : from} />
            <Stop offset="1" stopColor={warning ? colors.destructive : to} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={scheme === 'dark' ? 'rgba(148,163,184,0.18)' : colors.line}
          strokeWidth={STROKE}
        />
        {left > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#timer-ring)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - left)}
          />
        ) : null}
      </Svg>
      <View style={styles.center}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  rotated: { transform: [{ rotate: '-90deg' }] },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
